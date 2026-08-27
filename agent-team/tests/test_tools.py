"""커스텀 툴 스키마와 디스패치 — 특히 게이트가 실제로 막는지."""

import pytest

from shipyard.gates import Gate, GateDecision, GateKind, IRREVERSIBLE
from shipyard.journal import Journal
from shipyard.tools import TOOL_SCHEMAS, ToolDispatcher, custom_tool_definitions

SUBMIT_ARGS = {
    "platform": "ios",
    "build_id": "eas:00000000-0000-0000-0000-000000000000",
    "track": "production",
    "release_notes": "첫 출시",
    "readiness_evidence": "테스트 초록, BLOCKER 없음",
}


class RecordingGate:
    def __init__(self, approved: bool):
        self.approved = approved
        self.asked: list[GateKind] = []

    def ask(self, kind, summary, detail="", free_text=False):
        self.asked.append(kind)
        return GateDecision(approved=self.approved, note=None if self.approved else "아직 아니다")


@pytest.fixture
def journal(tmp_path):
    return Journal(tmp_path / "j.sqlite3")


# --- 스키마 ---


def test_every_schema_is_wellformed():
    for name, schema in TOOL_SCHEMAS.items():
        assert schema["name"] == name
        assert schema["description"].strip()
        props = schema["input_schema"]["properties"]
        for required in schema["input_schema"]["required"]:
            assert required in props, f"{name}: required '{required}' 가 properties 에 없다"
        assert schema["input_schema"]["additionalProperties"] is False


def test_every_property_is_described():
    """스키마 설명이 곧 에이전트가 읽는 문서다. 빈 설명은 잘못 쓰게 만든다."""
    for name, schema in TOOL_SCHEMAS.items():
        for prop, spec in schema["input_schema"]["properties"].items():
            assert spec.get("description") or spec.get("enum"), f"{name}.{prop} 에 설명이 없다"


def test_definitions_carry_custom_type():
    defs = custom_tool_definitions(["trigger_build", "submit_to_store"])
    assert [d["type"] for d in defs] == ["custom", "custom"]


def test_unknown_tool_name_is_rejected_at_build_time():
    with pytest.raises(KeyError, match="launch_rocket"):
        custom_tool_definitions(["launch_rocket"])


# --- 디스패치 ---


def test_unknown_tool_returns_error_instead_of_raising(settings, journal):
    dispatcher = ToolDispatcher(settings, RecordingGate(True), journal, "run_1")
    result = dispatcher.dispatch("nope", {})
    assert result.is_error


def test_handler_failure_becomes_a_tool_error(settings, journal):
    """툴이 터져도 세션을 죽이지 않는다 — 에이전트가 대응할 수 있어야 한다."""
    dispatcher = ToolDispatcher(settings, RecordingGate(True), journal, "run_1")
    # eas CLI 도 GitHub 설정도 없으니 CIError 가 난다.
    result = dispatcher.dispatch(
        "trigger_build", {"platform": "ios", "profile": "production", "reason": "테스트"}
    )
    assert result.is_error
    assert "trigger_build" in result.text


def test_denied_build_gate_blocks_the_call(settings, journal):
    gate = RecordingGate(False)
    dispatcher = ToolDispatcher(settings, gate, journal, "run_1")
    result = dispatcher.dispatch(
        "trigger_build", {"platform": "ios", "profile": "production", "reason": "테스트"}
    )
    assert result.is_error
    assert gate.asked == [GateKind.BUILD]


def test_denied_submission_gate_blocks_the_upload(settings, journal):
    gate = RecordingGate(False)
    dispatcher = ToolDispatcher(settings, gate, journal, "run_1")
    result = dispatcher.dispatch("submit_to_store", SUBMIT_ARGS)
    assert result.is_error
    assert gate.asked == [GateKind.STORE_SUBMISSION]
    assert "승인하지 않았다" in result.text


def test_tool_calls_are_journaled(settings, journal):
    dispatcher = ToolDispatcher(settings, RecordingGate(False), journal, "run_1")
    dispatcher.dispatch("submit_to_store", SUBMIT_ARGS)

    import sqlite3

    conn = sqlite3.connect(journal.path)
    rows = conn.execute("SELECT tool, is_error FROM tool_calls WHERE run_id = 'run_1'").fetchall()
    assert rows == [("submit_to_store", 1)]


# --- 자동 승인의 경계 ---


def test_auto_approve_covers_reversible_gates(settings):
    settings.auto_approve_gates = True
    decision = Gate(settings).ask(GateKind.BUILD, "빌드")
    assert decision.approved and decision.automatic


def test_auto_approve_never_covers_store_submission(settings):
    """되돌릴 수 없는 행동에는 자동 승인이 적용되지 않는다. 이건 설정으로 끌 수 없다."""
    settings.auto_approve_gates = True
    decision = Gate(settings).ask(GateKind.STORE_SUBMISSION, "제출")
    assert not decision.approved
    assert GateKind.STORE_SUBMISSION in IRREVERSIBLE


def test_non_interactive_denies_rather_than_guesses(settings):
    """물어볼 사람이 없으면 승인이 아니라 거절이다."""
    decision = Gate(settings).ask(GateKind.BUILD, "빌드")
    assert not decision.approved
    assert "비대화형" in decision.note
