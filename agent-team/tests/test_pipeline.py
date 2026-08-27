"""릴리스 상태 머신 — 순서와 게이트."""

import pytest

from shipyard.gates import GateDecision, GateKind
from shipyard.journal import Journal
from shipyard.pipeline import STAGES, ReleasePipeline, Stage, render_brief
from shipyard.session import TurnResult


class FakeDriver:
    def __init__(self):
        self.session_id = "sesn_fake"
        self.briefs = []

    def turn(self, message, timeout_s=None):
        self.briefs.append(message)
        return TurnResult(stop_reason="end_turn", text="ok")


class ScriptedGate:
    """정해둔 답을 순서대로 돌려준다."""

    def __init__(self, *answers: bool):
        self.answers = list(answers)
        self.asked = []

    def ask(self, kind, summary, detail="", free_text=False):
        self.asked.append(kind)
        approved = self.answers.pop(0) if self.answers else True
        return GateDecision(approved=approved, note=None if approved else "거절 사유")


@pytest.fixture
def journal(tmp_path):
    return Journal(tmp_path / "j.sqlite3")


def test_stage_order_is_fixed():
    assert [s.stage for s in STAGES] == [
        Stage.DISCOVERY,
        Stage.SPEC,
        Stage.IMPLEMENT,
        Stage.HARDEN,
        Stage.COMPLIANCE,
        Stage.RELEASE_PREP,
        Stage.BINARY,
        Stage.SUBMIT,
    ]


def test_gates_guard_the_expensive_and_irreversible_stages():
    """돈이 들기 시작하는 지점과 되돌릴 수 없는 지점 앞에 게이트가 있어야 한다."""
    gated = {s.stage: s.gate for s in STAGES if s.gate}
    assert gated[Stage.IMPLEMENT] == GateKind.CONCEPT
    assert gated[Stage.SUBMIT] == GateKind.BUILD


def test_every_gated_stage_explains_itself():
    for spec in STAGES:
        if spec.gate:
            assert spec.gate_summary, f"{spec.stage} 에 게이트가 있는데 설명이 없다"


def test_run_walks_all_stages(journal):
    driver, gate = FakeDriver(), ScriptedGate()
    run_id = journal.start_run("테스트 앱")
    result = ReleasePipeline(driver, gate, journal, run_id).run("메모 앱", "ios")

    assert result.stopped_at is None
    assert len(result.completed) == len(STAGES)
    assert len(driver.briefs) == len(STAGES)


def test_denied_gate_stops_before_running_the_stage(journal):
    driver, gate = FakeDriver(), ScriptedGate(False)
    run_id = journal.start_run("테스트 앱")
    result = ReleasePipeline(driver, gate, journal, run_id).run("메모 앱", "ios")

    assert result.stopped_at == Stage.IMPLEMENT
    assert "거절" in result.reason
    # 게이트 앞의 두 단계만 돌았고, 구현은 시작되지 않았다.
    assert result.completed == [Stage.DISCOVERY, Stage.SPEC]
    assert len(driver.briefs) == 2


def test_denied_gate_is_recorded(journal):
    driver, gate = FakeDriver(), ScriptedGate(False)
    run_id = journal.start_run("테스트 앱")
    ReleasePipeline(driver, gate, journal, run_id).run("메모 앱", "ios")

    history = journal.stage_history(run_id)
    assert history[-1]["stage"] == Stage.IMPLEMENT.value
    assert history[-1]["status"] == "gate_denied"


def test_can_resume_from_a_later_stage(journal):
    driver, gate = FakeDriver(), ScriptedGate()
    run_id = journal.start_run("테스트 앱")
    result = ReleasePipeline(driver, gate, journal, run_id).run(
        "메모 앱", "ios", start=Stage.COMPLIANCE
    )
    assert result.completed == [Stage.COMPLIANCE, Stage.RELEASE_PREP, Stage.BINARY, Stage.SUBMIT]


def test_stop_after_bounds_the_run(journal):
    driver, gate = FakeDriver(), ScriptedGate()
    run_id = journal.start_run("테스트 앱")
    result = ReleasePipeline(driver, gate, journal, run_id).run(
        "메모 앱", "ios", stop_after=Stage.SPEC
    )
    assert result.completed == [Stage.DISCOVERY, Stage.SPEC]


def test_brief_placeholders_filled():
    spec = STAGES[0]
    rendered = render_brief(spec, "달리기 기록 앱", "ios, android")
    assert "달리기 기록 앱" in rendered
    assert "ios, android" in rendered
    assert "{idea}" not in rendered


def test_brief_rendering_survives_literal_braces():
    """브리프에 코드 조각이 들어가도 렌더링이 터지지 않아야 한다."""
    from shipyard.pipeline import StageSpec

    spec = StageSpec(Stage.DISCOVERY, "t", brief='{idea} 를 {"json": true} 로 저장해라')
    assert render_brief(spec, "메모", "ios") == '메모 를 {"json": true} 로 저장해라'


def test_all_briefs_render_without_error():
    for spec in STAGES:
        rendered = render_brief(spec, "테스트 아이디어", "ios")
        assert rendered.strip()
