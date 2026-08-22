from __future__ import annotations


def test_hud_page_is_served(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "J.A.R.V.I.S." in res.text


def test_vitals_shape(client):
    body = client.get("/api/vitals").json()
    assert set(body) == {"system", "vault"}
    assert body["vault"]["total"] == 2
    assert "cpu" in body["system"]


def test_skills_endpoint_lists_every_skill_folder(client):
    names = {s["name"] for s in client.get("/api/skills").json()["skills"]}
    assert names == {"metrics", "inbox", "trends", "plan", "vault", "agents", "status"}


def test_schedule_endpoint(client):
    blocks = client.get("/api/schedule").json()["blocks"]
    assert len(blocks) == 4
    assert blocks[0]["at"] == "07:00"


def test_ask_routes_and_answers(client):
    body = client.post("/api/ask", json={"text": "오늘 할 일 정리해줘"}).json()
    assert body["skill"] == "plan"
    assert body["note_id"].startswith("plan-")


def test_ask_rejects_empty_text(client):
    res = client.post("/api/ask", json={"text": ""})
    assert res.status_code == 422
    assert res.json()["code"] == "invalid_request"


def test_run_skill_directly(client):
    assert client.post("/api/run/metrics").json()["skill"] == "metrics"


def test_run_unknown_skill_is_404(client):
    assert client.post("/api/run/nope").status_code == 404


def test_notes_listing_and_search(client):
    assert len(client.get("/api/vault/notes").json()["notes"]) == 2
    hit = client.get("/api/vault/notes", params={"q": "썸네일"}).json()["notes"]
    assert [n["id"] for n in hit] == ["build-note"]


def test_notes_listing_rejects_bad_kind(client):
    assert client.get("/api/vault/notes", params={"kind": "nowhere"}).status_code == 422


def test_read_note_includes_backlinks(client):
    body = client.get("/api/vault/notes/architecture").json()
    assert body["note"]["body"]
    assert [n["id"] for n in body["backlinks"]] == ["build-note"]


def test_read_missing_note_is_404(client):
    assert client.get("/api/vault/notes/ghost").status_code == 404


def test_create_note(client):
    res = client.post(
        "/api/vault/notes",
        json={"title": "새 노트", "body": "본문", "kind": "wiki", "tags": ["t"]},
    )
    assert res.status_code == 201
    assert res.json()["note"]["kind"] == "wiki"


def test_metrics_read_and_write(client):
    res = client.post("/api/metrics", json={"views": 999, "subscribers": 20, "followers": 30})
    assert res.status_code == 201
    latest = client.get("/api/metrics").json()["latest"]
    assert latest["views"] == 999  # 같은 날짜는 덮어쓴다


def test_conversation_log_is_kept_and_replayed(client):
    client.post("/api/ask", json={"text": "오늘 지표 어때"})
    client.post("/api/ask", json={"text": "고마워"})
    lines = client.get("/api/conversation").json()["lines"]
    assert [line["question"] for line in lines] == ["오늘 지표 어때", "고마워"]
    assert "천만에요" in lines[-1]["answer"]


def test_repeat_reads_the_previous_answer(client):
    first = client.post("/api/ask", json={"text": "오늘 흐름 어때"}).json()
    again = client.post("/api/ask", json={"text": "다시 말해줘"}).json()
    assert again["spoken"] == first["spoken"]
    assert again["label"] == "다시 읽기"


def test_wake_word_alone_gets_an_acknowledgement(client):
    assert client.post("/api/ask", json={"text": "자비스"}).json()["spoken"] == "네, 듣고 있습니다."


def test_stream_is_registered_as_sse(client):
    """SSE 본문은 실서버에서 curl 로 확인합니다 — TestClient 는 스트리밍에서 멈춥니다.

    여기서는 경로가 실제로 붙어 있고 이벤트 버스가 앱에 물려 있는지만 봅니다.
    """
    paths = set(client.jarvis_app.openapi()["paths"])
    assert "/api/stream" in paths
    assert client.jarvis_app.state.bus.listeners == 0


def test_agents_endpoint_returns_team_status(client, vault):
    import json

    (vault.root / "data" / "agent-team.json").write_text(
        json.dumps(
            {
                "observed_at": "2026-08-15",
                "team": {"name": "AI 앱 개발팀", "members": 20, "divisions": 6},
                "cycle": {"number": 2, "day": 1, "stage": "② 프로덕트"},
                "apps": [{"name": "가계부", "state": "in_progress"}],
                "blockers": ["team-org.md:70"],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    body = client.get("/api/agents").json()
    assert body["cycle"]["number"] == 2
    assert body["blockers"] == ["team-org.md:70"]
    assert "사이클 2" in body["headline"]
    assert body["stale_days"] >= 0


def test_agents_endpoint_without_snapshot(client):
    body = client.get("/api/agents").json()
    assert body["apps"] == []
    assert "없습니다" in body["headline"]


def test_notion_sync_without_token_is_not_an_error(client, monkeypatch):
    monkeypatch.delenv("NOTION_TOKEN", raising=False)
    body = client.post("/api/notion/sync").json()
    assert body["synced"] is False
    assert "NOTION_TOKEN" in body["reason"]


def test_ask_reports_status_out_loud(client):
    body = client.post("/api/ask", json={"text": "지금 상황 보고해"}).json()
    assert body["skill"] == "status"
    assert "현재 상황입니다" in body["spoken"]
