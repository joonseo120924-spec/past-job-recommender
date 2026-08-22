from __future__ import annotations

from datetime import datetime, timedelta

from jarvis.assistant import Assistant
from jarvis.metrics import MetricsLog
from jarvis.handlers import run_inbox, run_metrics, run_plan, run_review, run_trends, run_vault
from jarvis.vault import Vault


def test_metrics_reports_delta_direction(vault: Vault):
    answer = run_metrics(vault, "지표", datetime.now())
    assert "+50" in answer.spoken  # 조회수 100 → 150
    assert answer.data["delta"]["followers"] == -1
    assert "팔로워는 줄었습니다" in answer.spoken


def test_metrics_biggest_mover_uses_rate_not_magnitude(tmp_path):
    """조회수 +500 보다 구독자 +2 가 변화율(20% vs 5%)로는 더 큽니다."""
    v = Vault(tmp_path / "v")
    log = MetricsLog(v.root)
    today = datetime.now().date()
    log.record({"views": 10_000, "subscribers": 10, "followers": 50}, on=str(today - timedelta(days=1)))
    log.record({"views": 10_500, "subscribers": 12, "followers": 50}, on=str(today))
    assert "변화율이 가장 큰 건 구독자, +20.0%" in run_metrics(v, "지표", datetime.now()).spoken


def test_metrics_without_data_says_so(tmp_path):
    empty = Vault(tmp_path / "v")
    assert "아직 없습니다" in run_metrics(empty, "지표", datetime.now()).spoken


def test_plan_picks_three_and_saves_note(vault: Vault):
    now = datetime.now()
    answer = run_plan(vault, "오늘 계획", now)
    assert len(answer.data["top3"]) == 3
    assert answer.data["open"] == 4
    saved = vault.get(f"plan-{now:%Y-%m-%d}")
    assert saved is not None and saved.kind == "outputs"


def test_plan_prioritises_urgent_items(vault: Vault):
    top = run_plan(vault, "계획", datetime.now()).data["top3"][0]
    assert "마감" in top["text"]


def test_vault_capture_writes_a_line(vault: Vault):
    now = datetime.now()
    answer = run_vault(vault, "기억해 내일 10시 미팅", now)
    assert answer.data["mode"] == "capture"
    note = vault.get(answer.note_id)
    assert "내일 10시 미팅" in note.body
    assert note.title == f"{now:%Y-%m-%d} 캡처"


def test_vault_capture_appends_to_same_day_note(vault: Vault):
    now = datetime.now()
    first = run_vault(vault, "기억해 첫 번째", now)
    second = run_vault(vault, "메모 두 번째", now)
    assert first.note_id == second.note_id
    assert "첫 번째" in vault.get(second.note_id).body


def test_vault_search_returns_hits(vault: Vault):
    answer = run_vault(vault, "썸네일 찾아줘", datetime.now())
    assert answer.data["mode"] == "search"
    assert answer.data["results"][0]["id"] == "build-note"


def test_vault_search_miss_is_explicit(vault: Vault):
    answer = run_vault(vault, "고래상어 논문 찾아줘", datetime.now())
    assert answer.data["results"] == []
    assert "볼트에 없습니다" in answer.spoken


def test_inbox_brief_is_saved_as_output(vault: Vault):
    now = datetime.now()
    answer = run_inbox(vault, "브리핑", now)
    assert answer.note_id == f"brief-{now:%Y-%m-%d}"
    assert "좋은 아침입니다" in answer.spoken
    assert vault.get(answer.note_id).type == "brief"


def test_trends_compares_two_windows(vault: Vault):
    answer = run_trends(vault, "흐름", datetime.now())
    tags = {row["tag"] for row in answer.data["rising"]}
    assert "jarvis" in tags


def test_trends_without_recent_notes(vault: Vault):
    answer = run_trends(vault, "흐름", datetime.now() + timedelta(days=30))
    assert answer.data["rising"] == []
    assert "표본이 부족" in answer.spoken


def test_review_writes_eod_note(vault: Vault):
    now = datetime.now()
    answer = run_review(vault, "마감", now)
    assert vault.get(f"review-{now:%Y-%m-%d}") is not None
    assert "회고를 저장했습니다" in answer.spoken


def test_assistant_ask_reports_route(assistant: Assistant):
    result = assistant.ask("오늘 지표 알려줘")
    assert result["skill"] == "metrics"
    assert result["spoken"]


def test_schedule_marks_done_blocks(assistant: Assistant):
    before = assistant.schedule()
    assert [b["skill"] for b in before] == ["inbox", "plan", "metrics", "review"]
    assert not any(b["done"] for b in before if b["skill"] != "metrics")
    assistant.run("plan")
    after = {b["skill"]: b["done"] for b in assistant.schedule()}
    assert after["plan"] is True
    assert after["inbox"] is False
    # 오늘 지표 스냅샷이 이미 있으므로(fixture) 14:00 블록은 확인 완료입니다.
    assert after["metrics"] is True


def test_metrics_block_pending_without_today_snapshot(tmp_path):
    from jarvis.assistant import Assistant as A
    empty = Assistant(Vault(tmp_path / "v"))
    assert {b["skill"]: b["done"] for b in empty.schedule()}["metrics"] is False
