"""하루의 흐름을 스스로 굴리는 루프.

07:00 브리핑, 09:00 계획, 14:00 지표, 19:00 마감. 사람이 버튼을 누르지 않아도
시간이 되면 실행하고, 결과를 이벤트로 알립니다.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from jarvis.assistant import Assistant
from jarvis.config import DAILY_FLOW
from jarvis.events import EventBus

log = logging.getLogger("jarvis.scheduler")


def due_blocks(now: datetime, done: dict[str, bool], *, grace_minutes: int = 90) -> list[tuple[str, str, str]]:
    """지금 실행해야 할 블록.

    이미 결과물이 있으면 건너뜁니다. 새벽에 켰다고 어제치 브리핑을 다시 읽지
    않도록, 지난 지 `grace_minutes` 넘은 블록도 넘깁니다 — 놓친 아침 브리핑을
    오후 3시에 읽어 주는 건 도움이 아니라 소음입니다.
    """
    minutes_now = now.hour * 60 + now.minute
    pending = []
    for at, skill, description in DAILY_FLOW:
        hour, _, minute = at.partition(":")
        minutes_at = int(hour) * 60 + int(minute)
        if done.get(skill):
            continue
        if minutes_at <= minutes_now <= minutes_at + grace_minutes:
            pending.append((at, skill, description))
    return pending


class DailyFlow:
    def __init__(self, assistant: Assistant, bus: EventBus, *, interval: float = 30.0) -> None:
        self.assistant = assistant
        self.bus = bus
        self.interval = interval
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._loop(), name="jarvis-daily-flow")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    def tick(self, *, now: datetime | None = None) -> list[dict]:
        """한 번 점검하고, 실행한 블록들의 이벤트를 돌려줍니다."""
        now = now or datetime.now()
        done = {block["skill"]: block["done"] for block in self.assistant.schedule(now=now)}
        fired = []
        for at, skill, description in due_blocks(now, done):
            answer = self.assistant.run(skill, now=now)
            self.assistant.log_exchange(f"{at} {description}", answer.spoken, now=now)
            fired.append(
                self.bus.publish(
                    "flow",
                    {
                        "at_time": at,
                        "skill": skill,
                        "description": description,
                        "spoken": answer.spoken,
                        "note_id": answer.note_id,
                    },
                )
            )
        return fired

    async def _loop(self) -> None:
        while True:
            try:
                await asyncio.to_thread(self.tick)
            except asyncio.CancelledError:
                raise
            except Exception:  # 한 번의 실패로 하루 전체가 멈추면 안 됩니다.
                log.exception("하루 흐름 실행 실패")
            await asyncio.sleep(self.interval)
