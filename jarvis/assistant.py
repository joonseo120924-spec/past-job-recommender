"""INTENT → SKILL → SPOKEN ANSWER 를 한 줄로 잇는 층."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from jarvis import flow
from jarvis.events import EventBus
from jarvis.handlers import HANDLERS, Answer
from jarvis.skills_registry import Skill, load_skills, route
from jarvis.vault import Vault

REPEAT = re.compile(r"^\s*(다시(\s*말해\S*)?|한\s*번\s*더|뭐라고\S*|못\s*들었\S*)\s*[.?!~]*\s*$")
THANKS = re.compile(r"^\s*(고마워\S*|감사\S*|수고\S*|잘했\S*)\s*[.?!~]*\s*$")
GREETING = re.compile(r"^\s*(자비스|안녕\S*|여어|하이)\s*[.?!~]*\s*$")


class Assistant:
    def __init__(
        self,
        vault: Vault,
        skills_root: Path | None = None,
        bus: EventBus | None = None,
    ) -> None:
        self.vault = vault
        self.bus = bus
        self._skills_root = skills_root
        self._last: dict | None = None

    @property
    def skills(self) -> list[Skill]:
        # 매번 읽습니다. 스킬 파일을 고치고 서버를 재시작하는 건 번거로우니까요.
        return load_skills(self._skills_root)

    # ------------------------------------------------------------------ 대화

    def _small_talk(self, text: str) -> dict | None:
        """스킬을 쓸 것도 없는 말들. 라우팅 전에 걸러 냅니다."""
        if REPEAT.match(text):
            if not self._last:
                return self._reply(text, "아직 말씀드린 게 없습니다.", skill=None, label="다시")
            return self._reply(text, self._last["spoken"], skill=self._last.get("skill"), label="다시 읽기")
        if THANKS.match(text):
            return self._reply(text, "천만에요. 계속 듣고 있겠습니다.", skill=None, label="응답")
        if GREETING.match(text):
            return self._reply(text, "네, 듣고 있습니다.", skill=None, label="응답")
        return None

    def _reply(self, text: str, spoken: str, *, skill: str | None, label: str, **extra) -> dict:
        return {
            "intent": text,
            "skill": skill,
            "label": label,
            "score": 0.0,
            "reason": "대화",
            "spoken": spoken,
            "data": {},
            "note_id": None,
            **extra,
        }

    def ask(self, text: str, *, now: datetime | None = None, log: bool = True) -> dict:
        now = now or datetime.now()
        result = self._small_talk(text)
        if result is None:
            match = route(text, self.skills)
            if match.skill is None:
                result = self._reply(text, "무엇을 도와드릴까요?", skill=None, label="응답")
            else:
                answer = self.run(match.skill.name, text, now=now)
                result = {
                    "intent": text,
                    "skill": match.skill.name,
                    "label": match.skill.label,
                    "score": match.score,
                    "reason": match.reason,
                    "spoken": answer.spoken,
                    "data": answer.data,
                    "note_id": answer.note_id,
                }

        self._last = result
        if log:
            self.log_exchange(text, result["spoken"], now=now)
        if self.bus is not None:
            self.bus.publish("answer", {"intent": text, "spoken": result["spoken"], "skill": result["skill"]})
        return result

    def log_exchange(self, question: str, answer: str, *, now: datetime | None = None) -> None:
        """오간 말을 볼트에 남깁니다. 기억은 대화까지 포함해야 이어집니다."""
        now = now or datetime.now()
        self.vault.append(
            f"conversation-{now:%Y-%m-%d}",
            f"**{question}** → {answer}",
            title=f"{now:%Y-%m-%d} 대화 기록",
        )

    # ------------------------------------------------------------------ 실행

    def run(self, skill_name: str, text: str = "", *, now: datetime | None = None) -> Answer:
        handler = HANDLERS.get(skill_name)
        if handler is None:
            return Answer(f"'{skill_name}' 스킬은 아직 없습니다.")
        return handler(self.vault, text, now or datetime.now())

    def schedule(self, *, now: datetime | None = None) -> list[dict]:
        """하루 흐름 + 각 블록이 오늘 이미 실행됐는지 여부."""
        return flow.blocks(self.vault, now)
