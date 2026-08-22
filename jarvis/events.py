"""이벤트 버스 — 서버가 먼저 말을 걸기 위한 통로.

자비스는 물어볼 때만 답하는 게 아니라, 07시가 되면 먼저 브리핑을 읽습니다.
그러려면 서버 → 화면 방향의 채널이 필요합니다. SSE 하나면 충분합니다.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime


class EventBus:
    def __init__(self, *, backlog: int = 20) -> None:
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._backlog: list[str] = []
        self._backlog_size = backlog

    def subscribe(self) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=64)
        for line in self._backlog[-3:]:  # 방금 놓친 것만 따라잡게.
            queue.put_nowait(line)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        self._subscribers.discard(queue)

    @property
    def listeners(self) -> int:
        return len(self._subscribers)

    def publish(self, kind: str, payload: dict) -> dict:
        event = {"kind": kind, "at": datetime.now().isoformat(timespec="seconds"), **payload}
        line = json.dumps(event, ensure_ascii=False)
        self._backlog.append(line)
        del self._backlog[: -self._backlog_size]
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(line)
            except asyncio.QueueFull:
                # 화면 하나가 밀린다고 나머지를 멈추지 않습니다.
                self._subscribers.discard(queue)
        return event
