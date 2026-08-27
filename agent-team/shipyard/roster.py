"""팀 정의를 API에 반영한다 — 멱등하게.

Managed Agents에서 에이전트는 **버전이 붙은 영속 객체**다. 매 실행마다 새로 만들면
고아 에이전트가 쌓이고 버전 관리의 이점이 사라진다. 그래서 여기서 하는 일은:

1. `agents/*.yaml` 을 읽는다 (이게 진실의 원본이다)
2. 저장된 ID가 없으면 create, 있고 내용이 바뀌었으면 update(버전 증가), 같으면 건너뛴다
3. ID와 버전을 `.shipyard/agent-ids.json` 에 남긴다

로스터 멤버를 매니페스트에서 **이름으로** 참조하는 것은 의도적이다. YAML 안에
`agent_01ABC...` 같은 ID가 박히면 그 파일은 더 이상 이식 가능한 정의가 아니다.
이름 → ID 치환은 apply 시점에 여기서 한다.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .models import resolve_model
from .tools import custom_tool_definitions

#: 코디네이터임을 나타내는 매니페스트 전용 키. API 필드가 아니다.
ROSTER_KEY = "roster"
CUSTOM_TOOLS_KEY = "custom_tools"

#: API로 보내지 않고 우리가 소비하는 키.
_LOCAL_KEYS = {ROSTER_KEY, CUSTOM_TOOLS_KEY}


class RosterError(RuntimeError):
    pass


@dataclass
class AppliedAgent:
    name: str
    agent_id: str
    version: int
    action: str  # created | updated | unchanged


def load_manifests(directory: Path) -> list[dict[str, Any]]:
    manifests: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or "name" not in data:
            raise RosterError(f"{path}: `name` 이 있는 매핑이어야 한다.")
        data["__source__"] = str(path)
        manifests.append(data)

    names = [m["name"] for m in manifests]
    duplicates = {n for n in names if names.count(n) > 1}
    if duplicates:
        raise RosterError(f"에이전트 이름이 중복됐다: {sorted(duplicates)}. 로스터 안에서 이름은 유일해야 한다.")
    if "self" in {n.lower() for n in names}:
        raise RosterError("에이전트 이름을 'self'로 지을 수 없다 — 로스터의 self 항목과 충돌한다.")
    return manifests


def is_coordinator(manifest: dict[str, Any]) -> bool:
    return bool(manifest.get(ROSTER_KEY))


def order_for_apply(manifests: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """워커를 먼저, 코디네이터를 나중에. 코디네이터가 워커 ID를 참조하기 때문이다."""
    return [m for m in manifests if not is_coordinator(m)] + [
        m for m in manifests if is_coordinator(m)
    ]


def build_payload(manifest: dict[str, Any], name_to_id: dict[str, str]) -> dict[str, Any]:
    """매니페스트를 `agents.create` 가 받는 형태로 바꾼다."""
    payload = {
        k: v
        for k, v in manifest.items()
        if k not in _LOCAL_KEYS and not k.startswith("__")
    }
    payload["model"] = resolve_model(payload["model"])

    custom = manifest.get(CUSTOM_TOOLS_KEY)
    if custom:
        payload.setdefault("tools", [])
        payload["tools"] = [*payload["tools"], *custom_tool_definitions(custom)]

    roster = manifest.get(ROSTER_KEY)
    if roster:
        payload["multiagent"] = {
            "type": "coordinator",
            "agents": [_roster_entry(entry, name_to_id, manifest["name"]) for entry in roster],
        }
    return payload


def _roster_entry(entry: str, name_to_id: dict[str, str], coordinator: str) -> Any:
    if entry == "self":
        return {"type": "self"}
    if entry not in name_to_id:
        raise RosterError(
            f"{coordinator} 의 로스터가 '{entry}' 를 참조하는데 그런 에이전트가 없다. "
            f"쓸 수 있는 이름: {sorted(name_to_id)}"
        )
    return name_to_id[entry]


def fingerprint(payload: dict[str, Any]) -> str:
    """내용이 바뀌었는지 판단하는 해시.

    `sort_keys=True` 가 핵심이다 — dict 순서가 흔들리면 매번 '바뀐 것'으로 보여
    쓸데없는 버전이 쌓인다.
    """
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()[:16]


class RosterStore:
    """적용된 에이전트 ID와 버전을 로컬에 기록한다."""

    def __init__(self, path: Path):
        self.path = path
        self._data: dict[str, dict[str, Any]] = {}
        if path.exists():
            self._data = json.loads(path.read_text(encoding="utf-8"))

    def get(self, name: str) -> dict[str, Any] | None:
        return self._data.get(name)

    def put(self, name: str, agent_id: str, version: int, fp: str) -> None:
        self._data[name] = {"id": agent_id, "version": version, "fingerprint": fp}

    def name_to_id(self) -> dict[str, str]:
        return {name: rec["id"] for name, rec in self._data.items()}

    def coordinator_id(self, name: str) -> str:
        rec = self._data.get(name)
        if rec is None:
            raise RosterError(f"'{name}' 이 아직 적용되지 않았다. 먼저 `shipyard apply` 를 실행할 것.")
        return rec["id"]

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(self._data, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )


def apply_roster(client: Any, manifests_dir: Path, store: RosterStore) -> list[AppliedAgent]:
    """매니페스트를 API에 반영하고 결과를 돌려준다."""
    manifests = order_for_apply(load_manifests(manifests_dir))
    applied: list[AppliedAgent] = []

    for manifest in manifests:
        name = manifest["name"]
        payload = build_payload(manifest, store.name_to_id())
        fp = fingerprint(payload)
        existing = store.get(name)

        if existing and existing.get("fingerprint") == fp:
            applied.append(AppliedAgent(name, existing["id"], existing["version"], "unchanged"))
            continue

        if existing:
            agent = client.beta.agents.update(existing["id"], **payload)
            action = "updated"
        else:
            agent = client.beta.agents.create(**payload)
            action = "created"

        store.put(name, agent.id, agent.version, fp)
        store.save()  # 중간에 실패해도 이미 만든 것을 잃지 않는다.
        applied.append(AppliedAgent(name, agent.id, agent.version, action))

    return applied
