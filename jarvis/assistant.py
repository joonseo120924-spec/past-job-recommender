"""INTENT → SKILL → SPOKEN ANSWER 를 한 줄로 잇는 층."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from jarvis.config import DAILY_FLOW
from jarvis.handlers import HANDLERS, Answer
from jarvis.metrics import MetricsLog
from jarvis.skills_registry import Skill, load_skills, route
from jarvis.vault import Vault


class Assistant:
    def __init__(self, vault: Vault, skills_root: Path | None = None) -> None:
        self.vault = vault
        self._skills_root = skills_root

    @property
    def skills(self) -> list[Skill]:
        # 매번 읽습니다. 스킬 파일을 고치고 서버를 재시작하는 건 번거로우니까요.
        return load_skills(self._skills_root)

    def ask(self, text: str, *, now: datetime | None = None) -> dict:
        now = now or datetime.now()
        match = route(text, self.skills)
        if match.skill is None:
            return {
                "intent": text,
                "skill": None,
                "reason": match.reason,
                "spoken": "무엇을 도와드릴까요?",
                "data": {},
                "note_id": None,
            }
        answer = self.run(match.skill.name, text, now=now)
        return {
            "intent": text,
            "skill": match.skill.name,
            "label": match.skill.label,
            "score": match.score,
            "reason": match.reason,
            "spoken": answer.spoken,
            "data": answer.data,
            "note_id": answer.note_id,
        }

    def run(self, skill_name: str, text: str = "", *, now: datetime | None = None) -> Answer:
        handler = HANDLERS.get(skill_name)
        if handler is None:
            return Answer(f"'{skill_name}' 스킬은 아직 없습니다.")
        return handler(self.vault, text, now or datetime.now())

    def schedule(self, *, now: datetime | None = None) -> list[dict]:
        """하루 흐름 + 각 블록이 오늘 이미 실행됐는지 여부."""
        now = now or datetime.now()
        today = now.strftime("%Y-%m-%d")
        outputs = {n.id for n in self.vault.notes("outputs")}
        prefix = {"inbox": "brief", "plan": "plan", "review": "review"}
        # metrics 는 노트를 남기지 않습니다. 오늘 스냅샷이 있으면 확인한 겁니다.
        metrics_today = any(
            row.get("date") == today for row in MetricsLog(self.vault.root).snapshots()
        )
        blocks = []
        for at, skill, description in DAILY_FLOW:
            marker = prefix.get(skill)
            done = (
                metrics_today if skill == "metrics"
                else (f"{marker}-{today}" in outputs if marker else False)
            )
            blocks.append(
                {
                    "at": at,
                    "skill": skill,
                    "description": description,
                    "done": done,
                    "past": now.strftime("%H:%M") >= at,
                }
            )
        return blocks
