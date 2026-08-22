from __future__ import annotations

import json
from datetime import datetime

from jarvis.agents import load_team
from jarvis.assistant import Assistant
from jarvis.handlers import run_agents, run_status
from jarvis.notion import NotionClient, sync_agent_team
from jarvis.vault import Vault


def test_report_names_cycle_apps_audit_and_blockers(team_vault: Vault):
    spoken = run_agents(team_vault, "에이전트팀", datetime.now()).spoken
    assert "사이클 2 1일차" in spoken
    assert "FocusNoise는 동결" in spoken
    assert "3차 조건부 승인" in spoken
    assert "차단이 2건" in spoken


def test_report_admits_how_old_the_snapshot_is(team_vault: Vault):
    """오래된 상태를 최신인 척하지 않습니다."""
    spoken = run_agents(team_vault, "에이전트팀", datetime.now()).spoken
    assert "2026-08-15 기준" in spoken


def test_missing_snapshot_says_so(vault: Vault):
    answer = run_agents(vault, "에이전트팀", datetime.now())
    assert "볼트에 없습니다" in answer.spoken
    assert "NOTION_TOKEN" in answer.spoken


def test_broken_snapshot_is_not_silently_empty(team_vault: Vault):
    (team_vault.root / "data" / "agent-team.json").write_text("{깨진 json", encoding="utf-8")
    team = load_team(team_vault)
    assert team.data == {"broken": True}


def test_headline_is_one_line_for_other_reports(team_vault: Vault):
    headline = load_team(team_vault).headline()
    assert headline.count("\n") == 0
    assert "사이클 2" in headline and "차단 2건" in headline


def test_status_covers_system_vault_flow_metrics_and_team(team_vault: Vault):
    spoken = run_status(team_vault, "상황 보고", datetime.now()).spoken
    for fragment in ["현재 상황입니다", "시스템은", "볼트에 노트", "오늘 흐름", "열린 할 일", "에이전트팀은"]:
        assert fragment in spoken


def test_status_says_measurement_failed_rather_than_zero(team_vault: Vault, monkeypatch):
    monkeypatch.setattr("jarvis.handlers.snapshot", lambda root: {"cpu": None, "ram": None, "io_ms": -1.0})
    assert "CPU 측정 불가" in run_status(team_vault, "상황", datetime.now()).spoken


def test_assistant_routes_team_question_to_agents(team_vault: Vault):
    result = Assistant(team_vault).ask("에이전트팀 어떻게 돼")
    assert result["skill"] == "agents"


def test_assistant_routes_status_question(team_vault: Vault):
    assert Assistant(team_vault).ask("지금 상황 보고해")["skill"] == "status"


def test_sync_without_token_reports_snapshot_instead_of_failing(team_vault: Vault, monkeypatch):
    monkeypatch.delenv("NOTION_TOKEN", raising=False)
    result = sync_agent_team(team_vault, NotionClient(token=""))
    assert result["synced"] is False
    assert "NOTION_TOKEN" in result["reason"]
    assert result["notes"] == []


def test_sync_with_token_mirrors_pages_into_the_vault(team_vault: Vault):
    class FakeClient(NotionClient):
        def __init__(self):
            super().__init__(token="secret")

        def page_text(self, page_id, *, depth=2):
            return "# 현재 상태\n| 사이클 | 2 · 1일차"

    result = sync_agent_team(team_vault, FakeClient())
    assert result["synced"] is True
    assert result["notes"] == ["notion-team-home"]
    note = team_vault.get("notion-team-home")
    assert "현재 상태" in note.body
    assert "notion" in note.tags
    # 동기화 시각이 스냅샷 파일에 남아야 다음 보고가 신선도를 말할 수 있습니다.
    index = json.loads((team_vault.root / "data" / "agent-team.json").read_text(encoding="utf-8"))
    assert index["synced_at"]
