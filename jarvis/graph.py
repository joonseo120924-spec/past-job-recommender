"""OPTIMAL ENGINE — 지식 코어를 그래프로 폅니다.

노션에서 끌어온 조직(팀원 20명 · 6본부 · 정본 · 상태 파일)과 볼트의 노트를
하나의 노드/엣지 집합으로 만듭니다. 화면은 이걸 방사형과 신경망 두 가지로
그립니다.

레이아웃 계산은 브라우저가 합니다. 서버는 무엇이 무엇과 이어져 있는지만
말합니다 — 좌표를 서버가 정하면 창 크기가 바뀔 때마다 다시 물어야 합니다.
"""

from __future__ import annotations

import json
from pathlib import Path

from jarvis.vault import Vault

# 노드 종류 — 화면의 LEGEND 와 1:1 로 대응합니다.
KIND_HUMAN = "human"
KIND_AGENT = "agent"
KIND_DIVISION = "division"
KIND_TOOL = "tool"
KIND_ARTIFACT = "artifact"   # 산출 파일 (SOP)
KIND_PILLAR = "pillar"       # 정본 문서
KIND_STATE = "state"         # 상태 파일
KIND_APP = "app"
KIND_TASK = "task"           # 🔴 차단 · 다음 할 일
KIND_NOTE = "note"           # 볼트 노트

KIND_LABEL = {
    KIND_HUMAN: "사람",
    KIND_AGENT: "AI 에이전트",
    KIND_DIVISION: "본부",
    KIND_TOOL: "도구",
    KIND_ARTIFACT: "산출물",
    KIND_PILLAR: "정본",
    KIND_STATE: "상태 파일",
    KIND_APP: "앱",
    KIND_TASK: "작업",
    KIND_NOTE: "볼트 노트",
}


def _load(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


class GraphBuilder:
    def __init__(self, vault: Vault) -> None:
        self.vault = vault
        self.roster = _load(vault.root / "data" / "roster.json")
        self.team = _load(vault.root / "data" / "agent-team.json")
        self.nodes: dict[str, dict] = {}
        self.edges: list[dict] = []

    # ------------------------------------------------------------------ 조립

    def node(self, node_id: str, kind: str, label: str, **extra) -> str:
        if node_id not in self.nodes:
            self.nodes[node_id] = {"id": node_id, "kind": kind, "label": label, **extra}
        return node_id

    def edge(self, source: str, target: str, label: str = "", kind: str = "link") -> None:
        if source in self.nodes and target in self.nodes:
            self.edges.append({"source": source, "target": target, "label": label, "kind": kind})

    def build(self) -> dict:
        self._core()
        self._divisions_and_agents()
        self._tools_and_artifacts()
        self._apps_and_tasks()
        self._vault_notes()
        return {
            "nodes": list(self.nodes.values()),
            "edges": self.edges,
            "clusters": self._clusters(),
            "legend": [{"kind": k, "label": v} for k, v in KIND_LABEL.items()],
            "meta": {
                "observed_at": self.team.get("observed_at") or self.roster.get("observed_at"),
                "cycle": self.team.get("cycle", {}),
                "counts": self._counts(),
            },
        }

    # ------------------------------------------------------------------ 구성

    def _core(self) -> None:
        self.node("core", KIND_HUMAN, "KNOWLEDGE CORE", note="자비스가 읽고 쓰는 모든 것", core=True)
        for human in self.roster.get("humans", []):
            hid = self.node(
                f"human:{human['id']}", KIND_HUMAN, human["name"],
                note=human.get("note", ""), role=human.get("role", ""), cluster="people",
            )
            self.edge("core", hid, human.get("role", ""), "owns")

    def _divisions_and_agents(self) -> None:
        agents_by_division: dict[str, list[dict]] = {}
        for agent in self.roster.get("agents", []):
            agents_by_division.setdefault(agent.get("division", ""), []).append(agent)

        for division in self.roster.get("divisions", []):
            did = self.node(
                f"div:{division['id']}", KIND_DIVISION,
                f"{division['no']} {division['name']}",
                note=division.get("does", ""), cluster=division["id"],
            )
            self.edge("core", did, division.get("does", ""), "owns")

            for agent in agents_by_division.get(division["id"], []):
                aid = self.node(
                    f"agent:{agent['id']}", KIND_AGENT, agent["id"],
                    note=agent.get("role", ""), model=agent.get("model", ""),
                    lead=bool(agent.get("lead")), cluster=division["id"],
                )
                self.edge(did, aid, "파트장" if agent.get("lead") else "실무자", "member")

            # 파트장 → 실무자 (승인권은 파트장에게만 있습니다)
            lead = division.get("lead")
            if lead:
                for agent in agents_by_division.get(division["id"], []):
                    if not agent.get("lead"):
                        self.edge(f"agent:{lead}", f"agent:{agent['id']}", "배정·검토·승인", "approve")

        # 파이프라인 ① → ⑥ 과 되돌림
        for source, target, label in self.roster.get("pipeline", []):
            self.edge(f"div:{source}", f"div:{target}", label, "flow")

        # 감사관은 마스터까지 봅니다.
        self.edge("agent:team-master", "human:master", "감사", "audit")

    def _tools_and_artifacts(self) -> None:
        for agent in self.roster.get("agents", []):
            aid = f"agent:{agent['id']}"
            for tool in agent.get("tools", []):
                tid = self.node(f"tool:{tool}", KIND_TOOL, tool, cluster="tools")
                self.edge(aid, tid, "사용", "uses")
            for output in agent.get("outputs", []):
                oid = self.node(
                    f"artifact:{output}", KIND_ARTIFACT, output,
                    cluster=agent.get("division", ""),
                )
                self.edge(aid, oid, "산출", "writes")

        for pillar in self.roster.get("pillars", []):
            pid = self.node(f"pillar:{pillar['id']}", KIND_PILLAR, pillar["name"],
                            note=pillar.get("note", ""), cluster="pillars")
            self.edge("core", pid, "정본", "owns")

        for state in self.roster.get("state_files", []):
            sid = self.node(f"state:{state['id']}", KIND_STATE, state["name"],
                            note=state.get("note", ""), cluster="pillars")
            self.edge("core", sid, "상태", "owns")

    def _apps_and_tasks(self) -> None:
        for app in self.team.get("apps", []):
            app_id = self.node(
                f"app:{app['name']}", KIND_APP, app["name"],
                note=app.get("note", ""), state=app.get("state", ""),
                label_extra=app.get("label", ""), cluster="apps",
            )
            self.edge("core", app_id, f"사이클 {app.get('cycle', '?')}", "owns")
            # 진행 중인 앱은 지금 서 있는 본부에 붙입니다.
            if app.get("state") == "in_progress":
                stage = str(self.team.get("cycle", {}).get("stage", ""))
                for division in self.roster.get("divisions", []):
                    if division["no"] in stage or division["name"] in stage:
                        self.edge(f"div:{division['id']}", app_id, "진행 중", "active")

        # 명세에 사람이 없더라도 작업이 허공에 뜨지 않게 코어에 붙입니다.
        waiting_on = "human:user" if "human:user" in self.nodes else "core"
        owner = "human:master" if "human:master" in self.nodes else "core"

        for index, blocker in enumerate(self.team.get("blockers", []), 1):
            bid = self.node(
                f"task:blocker-{index}", KIND_TASK, f"🔴 차단 {index}",
                note=blocker, blocking=True, cluster="tasks",
            )
            self.edge(waiting_on, bid, "지시 필요", "blocks")

        for index, nxt in enumerate(self.team.get("next", []), 1):
            nid = self.node(f"task:next-{index}", KIND_TASK, f"다음 {index}", note=nxt, cluster="tasks")
            self.edge(owner, nid, "이어받을 지점", "next")

    def _vault_notes(self, limit: int = 12) -> None:
        # 노드를 먼저 전부 만들고 나서 잇습니다. 순서를 섞으면 아직 없는 노트를
        # 가리키는 위키링크가 조용히 사라집니다.
        notes = self.vault.notes()[:limit]
        for note in notes:
            self.node(
                f"note:{note.id}", KIND_NOTE, note.title,
                note=note.excerpt, vault_kind=note.kind, cluster="vault",
            )
        for note in notes:
            self.edge("core", f"note:{note.id}", note.kind, "remembers")
            for link in note.links:
                # 이 화면에 안 올라온 노트를 가리키는 링크는 뺍니다 (끊어진 링크 아님)
                self.edge(f"note:{note.id}", f"note:{link}", "링크", "wikilink")

    # ------------------------------------------------------------------ 요약

    def _clusters(self) -> list[dict]:
        names = {
            "people": "PEOPLE",
            "tools": "TOOLS",
            "pillars": "PILLARS",
            "apps": "APPS",
            "tasks": "TASKS",
            "vault": "VAULT",
        }
        for division in self.roster.get("divisions", []):
            names[division["id"]] = f"{division['no']} {division['name']}".strip()

        clusters = []
        for cluster_id, label in names.items():
            members = [n for n in self.nodes.values() if n.get("cluster") == cluster_id]
            if members:
                clusters.append({"id": cluster_id, "label": label, "count": len(members)})
        return clusters

    def _counts(self) -> dict:
        counts: dict[str, int] = {}
        for node in self.nodes.values():
            counts[node["kind"]] = counts.get(node["kind"], 0) + 1
        counts["edges"] = len(self.edges)
        return counts


def build_graph(vault: Vault) -> dict:
    return GraphBuilder(vault).build()
