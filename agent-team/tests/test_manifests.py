"""실제 팀 매니페스트에 대한 검증.

이 스위트가 따로 있는 이유는 레포의 `tests/test_data_integrity.py` 와 같다 —
데이터(여기서는 팀 정의)가 조용히 망가지는 것이 가장 흔한 실패 원인이고,
그건 코드 테스트로는 잡히지 않는다. API를 부르지 않고 잡을 수 있는 것을 전부 잡는다.
"""

from pathlib import Path

import pytest

from shipyard.models import MODEL_ALIASES, resolve_model
from shipyard.pipeline import STAGES
from shipyard.roster import (
    ROSTER_KEY,
    build_payload,
    is_coordinator,
    load_manifests,
    order_for_apply,
)
from shipyard.tools import TOOL_SCHEMAS

AGENTS_DIR = Path(__file__).resolve().parent.parent / "agents"

#: agent_toolset_20260401 이 제공하는 내장 툴 이름.
BUILTIN_TOOLS = {"bash", "read", "write", "edit", "glob", "grep", "web_fetch", "web_search"}

MAX_ROSTER = 20


@pytest.fixture(scope="module")
def manifests():
    return load_manifests(AGENTS_DIR)


def test_manifests_exist(manifests):
    assert len(manifests) >= 2


def test_exactly_one_coordinator(manifests):
    coordinators = [m for m in manifests if is_coordinator(m)]
    assert len(coordinators) == 1, f"코디네이터가 {len(coordinators)}개다"


def test_no_nested_delegation(manifests):
    """위임은 1단계만 허용된다 — 로스터 멤버가 자기 로스터를 가지면 API가 거절한다."""
    coordinator = next(m for m in manifests if is_coordinator(m))
    by_name = {m["name"]: m for m in manifests}
    for entry in coordinator[ROSTER_KEY]:
        if entry == "self":
            continue
        assert not by_name[entry].get(ROSTER_KEY), f"{entry} 가 자기 로스터를 갖고 있다"


def test_roster_within_limits(manifests):
    coordinator = next(m for m in manifests if is_coordinator(m))
    roster = coordinator[ROSTER_KEY]
    assert 1 <= len(roster) <= MAX_ROSTER
    assert sum(1 for e in roster if e == "self") <= 1


def test_every_roster_name_resolves(manifests):
    """이름 오타는 apply 할 때가 아니라 여기서 잡혀야 한다."""
    names = {m["name"] for m in manifests}
    coordinator = next(m for m in manifests if is_coordinator(m))
    for entry in coordinator[ROSTER_KEY]:
        assert entry == "self" or entry in names, f"로스터의 '{entry}' 에 해당하는 매니페스트가 없다"


def test_every_model_is_known(manifests):
    for manifest in manifests:
        resolved = resolve_model(manifest["model"])
        model_id = resolved["id"] if isinstance(resolved, dict) else resolved
        assert model_id.startswith("claude-"), f"{manifest['name']}: 모델 {model_id!r}"
        assert model_id not in MODEL_ALIASES, "별칭이 풀리지 않았다"


def test_every_agent_describes_itself(manifests):
    """코디네이터는 description 을 읽고 누구에게 넘길지 정한다. 빈 설명은 그 선택을 망친다."""
    for manifest in manifests:
        description = (manifest.get("description") or "").strip()
        assert len(description) > 40, f"{manifest['name']}: description 이 너무 짧다"


def test_worker_descriptions_say_what_to_hand_over(manifests):
    for manifest in manifests:
        if is_coordinator(manifest):
            continue
        description = manifest["description"]
        assert "넘길 것" in description and "받을 것" in description, (
            f"{manifest['name']}: 무엇을 주고 무엇을 받는지가 description 에 없다"
        )


def test_every_agent_has_a_system_prompt(manifests):
    for manifest in manifests:
        assert (manifest.get("system") or "").strip(), f"{manifest['name']}: system 프롬프트가 없다"


def test_tool_names_are_real(manifests):
    for manifest in manifests:
        for tool in manifest.get("tools", []):
            for config in tool.get("configs", []):
                assert config["name"] in BUILTIN_TOOLS, (
                    f"{manifest['name']}: 알 수 없는 내장 툴 {config['name']!r}"
                )


def test_reviewer_cannot_write(manifests):
    """리뷰어가 코드를 고칠 수 있으면 그건 리뷰가 아니다."""
    reviewer = next(m for m in manifests if m["name"] == "Code Reviewer")
    enabled = _enabled_tools(reviewer)
    assert not (enabled & {"write", "edit", "bash"}), f"리뷰어가 쓰기 권한을 갖고 있다: {enabled}"


def test_only_the_coordinator_holds_custom_tools(manifests):
    """빌드와 제출은 한 곳에서만 나가야 감사 가능하다."""
    for manifest in manifests:
        if is_coordinator(manifest):
            continue
        assert not manifest.get("custom_tools"), f"{manifest['name']} 이 커스텀 툴을 갖고 있다"


def test_coordinator_holds_every_release_tool(manifests):
    coordinator = next(m for m in manifests if is_coordinator(m))
    assert set(coordinator["custom_tools"]) == set(TOOL_SCHEMAS)


def test_manifests_carry_no_secrets(manifests):
    """비밀은 매니페스트가 아니라 vault 또는 호스트 사이드 툴에 있어야 한다.

    시스템 프롬프트에 넣은 키는 세션 이벤트 기록에 영구히 남는다.
    """
    markers = ("sk-ant-", "service_role", "ghp_", "-----BEGIN", "sb_secret_")
    for manifest in manifests:
        blob = f"{manifest.get('system', '')}{manifest.get('description', '')}"
        for marker in markers:
            assert marker not in blob, f"{manifest['name']} 에 비밀로 보이는 문자열: {marker}"


def test_full_payload_builds_for_every_manifest(manifests):
    """apply 를 실제로 돌리기 전에 페이로드 구성이 되는지 확인한다."""
    ordered = order_for_apply(manifests)
    name_to_id = {}
    for manifest in ordered:
        payload = build_payload(manifest, name_to_id)
        assert payload["name"] == manifest["name"]
        assert "__source__" not in payload
        name_to_id[manifest["name"]] = f"agent_{len(name_to_id):03d}"


def test_every_worker_is_actually_used(manifests):
    """로스터에 없는 에이전트는 만들어져도 아무도 부르지 않는다."""
    coordinator = next(m for m in manifests if is_coordinator(m))
    rostered = set(coordinator[ROSTER_KEY])
    for manifest in manifests:
        if is_coordinator(manifest):
            continue
        assert manifest["name"] in rostered, f"{manifest['name']} 이 로스터에 없다"


def test_stage_briefs_reference_existing_agents(manifests):
    """브리프가 없는 에이전트에게 일을 넘기라고 시키면 Showrunner 가 헤맨다."""
    names = {m["name"] for m in manifests}
    briefs = " ".join(spec.brief for spec in STAGES)
    mentioned = {name for name in names if name in briefs}
    # 코디네이터를 제외한 전원이 어느 단계에선가 호명되어야 한다.
    workers = {m["name"] for m in manifests if not is_coordinator(m)}
    assert workers <= mentioned, f"브리프에서 호명되지 않은 에이전트: {sorted(workers - mentioned)}"


def _enabled_tools(manifest) -> set[str]:
    enabled: set[str] = set()
    for tool in manifest.get("tools", []):
        if tool.get("type") != "agent_toolset_20260401":
            continue
        default_on = tool.get("default_config", {}).get("enabled", True)
        if default_on:
            enabled |= BUILTIN_TOOLS
        for config in tool.get("configs", []):
            if config.get("enabled", True):
                enabled.add(config["name"])
            else:
                enabled.discard(config["name"])
    return enabled
