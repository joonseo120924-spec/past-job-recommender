"""에이전트팀 — 노션의 AI 앱 개발팀 상태를 읽고 말로 정리합니다."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from jarvis.vault import Vault

def _sentence(text: str) -> str:
    """문장 끝을 맞춥니다. 소리로 읽을 때 마침표가 없으면 한 문장처럼 들립니다."""
    text = text.strip()
    return text if not text or text[-1] in ".!?" else text + "."


STATE_LABEL = {
    "frozen": "동결",
    "in_progress": "진행 중",
    "done": "완료",
    "blocked": "막힘",
}


@dataclass(frozen=True)
class TeamState:
    data: dict
    path: Path

    @property
    def exists(self) -> bool:
        return bool(self.data)

    @property
    def staleness_days(self) -> int | None:
        observed = self.data.get("observed_at")
        if not observed:
            return None
        try:
            return (date.today() - date.fromisoformat(str(observed))).days
        except ValueError:
            return None

    def active_app(self) -> dict | None:
        apps = self.data.get("apps", [])
        return next((a for a in apps if a.get("state") == "in_progress"), apps[0] if apps else None)

    def headline(self) -> str:
        """한 줄 요약 — 다른 보고에 끼워 넣을 때 씁니다."""
        if not self.exists:
            return "에이전트팀 상태가 볼트에 없습니다."
        cycle = self.data.get("cycle", {})
        app = self.active_app() or {}
        blockers = len(self.data.get("blockers", []))
        parts = [f"사이클 {cycle.get('number', '?')} {cycle.get('day', '?')}일차"]
        if app:
            parts.append(f"{app.get('name')} {cycle.get('stage', '')}".strip())
        if blockers:
            parts.append(f"차단 {blockers}건")
        return ", ".join(parts)

    def report(self) -> str:
        if not self.exists:
            return (
                "에이전트팀 상태가 볼트에 없습니다. NOTION_TOKEN 을 설정하고 동기화하거나, "
                "vault/data/agent-team.json 을 채워 주세요."
            )
        team = self.data.get("team", {})
        cycle = self.data.get("cycle", {})
        audit = self.data.get("audit", {})
        apps = self.data.get("apps", [])
        blockers = self.data.get("blockers", [])
        nexts = self.data.get("next", [])

        lines = [
            f"{team.get('name', '에이전트팀')} 현황입니다. "
            f"{team.get('divisions', '?')}본부 {team.get('members', '?')}명, "
            f"사이클 {cycle.get('number', '?')} {cycle.get('day', '?')}일차, "
            f"{cycle.get('stage', '단계 미상')}에서 {cycle.get('state', '진행 중')}입니다."
        ]
        for app in apps:
            state = STATE_LABEL.get(app.get("state", ""), app.get("state", ""))
            lines.append(_sentence(f"{app.get('name')}는 {state}. {app.get('note', '')}"))
        if audit:
            lines.append(
                f"감사관 판정은 {audit.get('label', '미상')}, "
                f"치명 {audit.get('critical', 0)}건 중대 {audit.get('major', 0)}건입니다."
            )
        if blockers:
            lines.append(
                _sentence(f"사용자 지시가 필요한 차단이 {len(blockers)}건 있습니다. 첫 번째는 {blockers[0]}")
            )
        if nexts:
            lines.append(_sentence(f"다음에 이어받을 것은 {nexts[0]}"))

        stale = self.staleness_days
        if stale is not None and stale > 1:
            lines.append(f"이 상태는 {self.data.get('observed_at')} 기준이라 {stale}일 지났습니다.")
        return " ".join(lines)


def load_team(vault: Vault) -> TeamState:
    path = Path(vault.root) / "data" / "agent-team.json"
    if not path.exists():
        return TeamState({}, path)
    try:
        return TeamState(json.loads(path.read_text(encoding="utf-8")), path)
    except json.JSONDecodeError:
        # 손으로 고치다 깨졌을 때, 자비스가 조용히 "없다"고 하면 안 됩니다.
        return TeamState({"broken": True}, path)
