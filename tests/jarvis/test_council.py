from __future__ import annotations

import json
from datetime import datetime

from jarvis.council import Council
from jarvis.handlers import run_council
from jarvis.vault import Vault


def _roster(vault: Vault) -> None:
    (vault.root / "data" / "roster.json").write_text(
        json.dumps(
            {
                "divisions": [
                    {"id": "audit", "no": "🎖️", "name": "감사실", "lead": "team-master"},
                    {"id": "strategy", "no": "①", "name": "전략", "lead": "strategy-lead"},
                    {"id": "design", "no": "③", "name": "디자인", "lead": "design-lead"},
                    {"id": "qa", "no": "⑤", "name": "품질", "lead": "qa-lead"},
                    {"id": "gtm", "no": "⑥", "name": "출시운영", "lead": "gtm-lead"},
                ],
                "agents": [
                    {"id": "team-master", "division": "audit", "lead": True},
                    {"id": "strategy-lead", "division": "strategy", "lead": True},
                    {"id": "market-analyst", "division": "strategy"},
                    {"id": "design-lead", "division": "design", "lead": True},
                    {"id": "ui-designer", "division": "design"},
                    {"id": "qa-lead", "division": "qa", "lead": True},
                    {"id": "gtm-lead", "division": "gtm", "lead": True},
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def test_strategy_and_qa_always_sit(vault: Vault):
    """무엇을 할지 정하는 자리와 틀린 곳을 찾는 자리는 안건을 가리지 않습니다."""
    _roster(vault)
    seats = {s.division for s in Council(vault).seats("아무 상관 없는 잡담")}
    assert seats == {"strategy", "qa"}


def test_topic_words_pull_in_the_right_division(vault: Vault):
    _roster(vault)
    seats = {s.division for s in Council(vault).seats("썸네일 톤 정하기")}
    assert "design" in seats


def test_auditor_never_takes_a_seat_but_judges(vault: Vault):
    """감사관은 회의 참석자가 아니라 판정자입니다."""
    _roster(vault)
    topic, seats, note_id = Council(vault).convene("채널 구독자 늘리기")
    assert all(s.division != "audit" for s in seats)
    assert "team-master" in vault.get(note_id).body


def test_convene_saves_a_seating_chart(vault: Vault):
    _roster(vault)
    now = datetime.now()
    topic, _, note_id = Council(vault).convene("팀 소집해서 이사 준비 정리", now=now)
    assert topic == "해서 이사 준비 정리" or "이사" in topic
    note = vault.get(note_id)
    assert note.kind == "outputs" and note.type == "council"
    assert "파트장만 승인권" in note.body


def test_handler_speaks_who_was_called(vault: Vault):
    _roster(vault)
    answer = run_council(vault, "팀 불러서 썸네일 톤 논의", datetime.now())
    assert "소집했습니다" in answer.spoken
    assert any(seat["division"] == "design" for seat in answer.data["seats"])
    assert answer.data["people"] >= 3


def test_council_without_roster_still_answers(vault: Vault):
    answer = run_council(vault, "팀 소집", datetime.now())
    assert "정하지 못했습니다" in answer.spoken


def test_all_hands_seats_every_division(vault: Vault):
    """'전원 소집'이라고 하면 신호어와 무관하게 전부 앉습니다."""
    _roster(vault)
    seats = {s.division for s in Council(vault).seats("전원 소집해서 아무 얘기나")}
    assert seats == {"strategy", "design", "qa", "gtm"}   # 감사실 제외 전부
    assert all(s.reason == "전원 소집 지시" for s in Council(vault).seats("전원 소집"))
