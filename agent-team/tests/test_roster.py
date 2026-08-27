"""로스터 반영 로직 — API 없이 검증 가능한 부분 전부."""

import json

import pytest
import yaml

from shipyard.roster import (
    RosterError,
    RosterStore,
    apply_roster,
    build_payload,
    fingerprint,
    is_coordinator,
    load_manifests,
    order_for_apply,
)


def write(directory, name, **fields):
    manifest = {"name": name, "model": "sonnet", **fields}
    (directory / f"{name.lower().replace(' ', '-')}.yaml").write_text(
        yaml.safe_dump(manifest, allow_unicode=True), encoding="utf-8"
    )
    return manifest


def test_duplicate_names_rejected(tmp_path):
    (tmp_path / "a.yaml").write_text("name: Twin\nmodel: sonnet\n")
    (tmp_path / "b.yaml").write_text("name: Twin\nmodel: opus\n")
    with pytest.raises(RosterError, match="중복"):
        load_manifests(tmp_path)


def test_agent_named_self_rejected(tmp_path):
    write(tmp_path, "self")
    with pytest.raises(RosterError, match="self"):
        load_manifests(tmp_path)


def test_coordinator_applied_last(tmp_path):
    write(tmp_path, "Worker A")
    write(tmp_path, "Lead", roster=["Worker A", "self"])
    write(tmp_path, "Worker B")
    ordered = order_for_apply(load_manifests(tmp_path))
    assert is_coordinator(ordered[-1])
    assert not any(is_coordinator(m) for m in ordered[:-1])


def test_roster_names_resolve_to_ids(tmp_path):
    manifest = write(tmp_path, "Lead", roster=["Worker A", "self"])
    payload = build_payload(manifest, {"Worker A": "agent_123"})
    assert payload["multiagent"] == {
        "type": "coordinator",
        "agents": ["agent_123", {"type": "self"}],
    }
    # roster 는 매니페스트 전용 키다 — API 페이로드에 남으면 안 된다.
    assert "roster" not in payload


def test_unknown_roster_name_names_the_alternatives(tmp_path):
    manifest = write(tmp_path, "Lead", roster=["Ghost"])
    with pytest.raises(RosterError) as exc:
        build_payload(manifest, {"Worker A": "agent_123"})
    assert "Ghost" in str(exc.value)
    assert "Worker A" in str(exc.value)


def test_model_alias_resolved(tmp_path):
    manifest = write(tmp_path, "Worker")
    assert build_payload(manifest, {})["model"] == "claude-sonnet-5"


def test_custom_tools_expanded_and_key_stripped(tmp_path):
    manifest = write(tmp_path, "Lead", custom_tools=["trigger_build"])
    payload = build_payload(manifest, {})
    assert "custom_tools" not in payload
    assert payload["tools"][0]["type"] == "custom"
    assert payload["tools"][0]["name"] == "trigger_build"


def test_unknown_custom_tool_rejected(tmp_path):
    manifest = write(tmp_path, "Lead", custom_tools=["launch_rocket"])
    with pytest.raises(KeyError, match="launch_rocket"):
        build_payload(manifest, {})


def test_fingerprint_ignores_key_order():
    """키 순서가 흔들려도 같은 지문이어야 한다 — 아니면 매번 헛된 버전이 쌓인다."""
    assert fingerprint({"a": 1, "b": [1, 2]}) == fingerprint({"b": [1, 2], "a": 1})


def test_fingerprint_changes_with_content():
    assert fingerprint({"system": "x"}) != fingerprint({"system": "y"})


# --- apply_roster: 가짜 클라이언트로 create/update/skip 경로 확인 ---


class FakeAgent:
    def __init__(self, agent_id, version):
        self.id = agent_id
        self.version = version


class FakeAgents:
    def __init__(self):
        self.creates = []
        self.updates = []
        self._n = 0

    def create(self, **payload):
        self._n += 1
        self.creates.append(payload)
        return FakeAgent(f"agent_{self._n:03d}", 1)

    def update(self, agent_id, **payload):
        self.updates.append((agent_id, payload))
        return FakeAgent(agent_id, 2)


class FakeClient:
    def __init__(self):
        self.beta = type("Beta", (), {"agents": FakeAgents()})()


def test_apply_creates_then_skips_then_updates(tmp_path):
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    write(agents_dir, "Worker A")
    write(agents_dir, "Lead", roster=["Worker A", "self"])
    store_path = tmp_path / "ids.json"

    client = FakeClient()
    first = apply_roster(client, agents_dir, RosterStore(store_path))
    assert [a.action for a in first] == ["created", "created"]
    # 코디네이터가 워커의 실제 ID를 받았어야 한다.
    assert client.beta.agents.creates[1]["multiagent"]["agents"][0] == "agent_001"

    # 두 번째 apply — 아무것도 안 바뀌었으면 API를 부르지 않는다.
    client2 = FakeClient()
    second = apply_roster(client2, agents_dir, RosterStore(store_path))
    assert [a.action for a in second] == ["unchanged", "unchanged"]
    assert client2.beta.agents.creates == []

    # 프롬프트를 바꾸면 그 에이전트만 update 된다.
    manifest = yaml.safe_load((agents_dir / "worker-a.yaml").read_text())
    manifest["system"] = "새 프롬프트"
    (agents_dir / "worker-a.yaml").write_text(yaml.safe_dump(manifest, allow_unicode=True))

    client3 = FakeClient()
    third = apply_roster(client3, agents_dir, RosterStore(store_path))
    assert third[0].action == "updated"
    assert client3.beta.agents.updates[0][0] == "agent_001"


def test_store_survives_partial_failure(tmp_path):
    """중간에 터져도 이미 만든 에이전트 ID는 남아 있어야 한다."""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    write(agents_dir, "Worker A")
    write(agents_dir, "Lead", roster=["Ghost"])  # 두 번째에서 터진다
    store_path = tmp_path / "ids.json"

    with pytest.raises(RosterError):
        apply_roster(FakeClient(), agents_dir, RosterStore(store_path))

    saved = json.loads(store_path.read_text())
    assert "Worker A" in saved
