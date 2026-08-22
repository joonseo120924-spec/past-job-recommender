from __future__ import annotations

import json

from jarvis.graph import build_graph
from jarvis.vault import Vault


def _roster(vault: Vault) -> None:
    (vault.root / "data" / "roster.json").write_text(
        json.dumps(
            {
                "humans": [{"id": "master", "name": "마스터", "role": "총괄"}],
                "divisions": [
                    {"id": "qa", "no": "⑤", "name": "품질", "does": "가장 무거운 권한", "lead": "qa-lead"},
                    {"id": "dev", "no": "④", "name": "개발", "does": "코드", "lead": "tech-lead"},
                ],
                "pipeline": [["dev", "qa", "인수인계 04"], ["qa", "dev", "되돌림"]],
                "agents": [
                    {"id": "qa-lead", "division": "qa", "lead": True, "model": "opus",
                     "role": "승인", "tools": ["Read"], "outputs": ["docs/QA보고서.md"]},
                    {"id": "functional-tester", "division": "qa", "model": "opus",
                     "role": "20회 사이클", "tools": ["Read"], "outputs": ["docs/QA-기능.md"]},
                    {"id": "tech-lead", "division": "dev", "lead": True, "model": "opus",
                     "role": "분할", "tools": ["Grep"], "outputs": ["src/"]},
                ],
                "pillars": [{"id": "team-org", "name": ".claude/team-org.md", "note": "조직 정본"}],
                "state_files": [{"id": "cycle", "name": "ai-team/cycle.md", "note": "진행표"}],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def test_graph_has_every_agent_and_division(team_vault: Vault):
    _roster(team_vault)
    graph = build_graph(team_vault)
    kinds = graph["meta"]["counts"]
    assert kinds["agent"] == 3
    assert kinds["division"] == 2


def test_agents_hang_off_their_division(team_vault: Vault):
    _roster(team_vault)
    graph = build_graph(team_vault)
    member_edges = {
        (e["source"], e["target"]) for e in graph["edges"] if e["kind"] == "member"
    }
    assert ("div:qa", "agent:qa-lead") in member_edges
    assert ("div:qa", "agent:functional-tester") in member_edges


def test_lead_holds_the_approval_edge(team_vault: Vault):
    """실무자는 승인권이 없습니다 — 그 방향이 그래프에도 나타나야 합니다."""
    _roster(team_vault)
    edges = [e for e in build_graph(team_vault)["edges"] if e["kind"] == "approve"]
    assert ("agent:qa-lead", "agent:functional-tester") in {(e["source"], e["target"]) for e in edges}
    assert all(e["source"] != "agent:functional-tester" for e in edges)


def test_pipeline_keeps_the_return_arrow(team_vault: Vault):
    _roster(team_vault)
    flows = {(e["source"], e["target"]) for e in build_graph(team_vault)["edges"] if e["kind"] == "flow"}
    assert ("div:dev", "div:qa") in flows
    assert ("div:qa", "div:dev") in flows  # 오류 있으면 되돌림


def test_blockers_become_nodes_waiting_on_the_user(team_vault: Vault):
    _roster(team_vault)
    graph = build_graph(team_vault)
    blocking = [n for n in graph["nodes"] if n.get("blocking")]
    assert len(blocking) == 2
    assert any(e["kind"] == "blocks" for e in graph["edges"])


def test_vault_notes_join_the_graph_with_their_links(team_vault: Vault):
    _roster(team_vault)
    graph = build_graph(team_vault)
    notes = {n["id"] for n in graph["nodes"] if n["kind"] == "note"}
    assert "note:build-note" in notes
    assert any(e["kind"] == "wikilink" for e in graph["edges"])


def test_clusters_are_counted_for_the_side_rail(team_vault: Vault):
    _roster(team_vault)
    clusters = {c["id"]: c["count"] for c in build_graph(team_vault)["clusters"]}
    assert clusters["qa"] >= 2
    assert clusters["vault"] >= 1


def test_graph_survives_a_missing_roster(vault: Vault):
    """명세가 없어도 볼트만으로 그래프가 나와야 합니다."""
    graph = build_graph(vault)
    assert graph["nodes"]
    assert graph["meta"]["counts"]["note"] >= 1


def test_graph_endpoint(client):
    body = client.get("/api/graph").json()
    assert "nodes" in body and "edges" in body
    assert body["legend"]


def test_engine_page_is_served(client):
    res = client.get("/engine")
    assert res.status_code == 200
    assert "OPTIMAL ENGINE" in res.text
