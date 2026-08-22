from __future__ import annotations

import asyncio
from datetime import datetime

from jarvis.assistant import Assistant
from jarvis.events import EventBus
from jarvis.scheduler import DailyFlow, due_blocks


def at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 8, 22, hour, minute)


NOTHING_DONE = {"inbox": False, "plan": False, "metrics": False, "review": False}


def test_block_fires_at_its_time():
    assert [b[1] for b in due_blocks(at(7, 0), NOTHING_DONE)] == ["inbox"]


def test_block_does_not_fire_early():
    assert due_blocks(at(6, 59), NOTHING_DONE) == []


def test_finished_block_is_skipped():
    done = {**NOTHING_DONE, "inbox": True}
    assert due_blocks(at(7, 5), done) == []


def test_long_past_block_is_not_replayed():
    """오후 3시에 아침 브리핑을 읽어 주는 건 도움이 아니라 소음입니다."""
    assert [b[1] for b in due_blocks(at(15, 0), NOTHING_DONE)] == ["metrics"]


def test_missed_block_still_fires_within_grace():
    assert [b[1] for b in due_blocks(at(7, 45), NOTHING_DONE)] == ["inbox"]


def test_tick_runs_the_block_and_publishes(assistant: Assistant):
    bus = EventBus()
    assistant.bus = bus
    flow = DailyFlow(assistant, bus)
    queue = bus.subscribe()

    fired = flow.tick(now=at(9, 10))
    assert [event["skill"] for event in fired] == ["plan"]
    assert "우선순위" in fired[0]["spoken"]
    assert not queue.empty()
    # 결과물이 남았으니 두 번째 점검에서는 조용합니다.
    assert flow.tick(now=at(9, 20)) == []


def test_bus_replays_recent_events_to_a_late_subscriber():
    bus = EventBus()
    bus.publish("flow", {"spoken": "먼저 한 말"})
    queue = bus.subscribe()
    assert "먼저 한 말" in queue.get_nowait()


def test_bus_drops_a_stalled_listener():
    bus = EventBus()
    queue = bus.subscribe()
    for _ in range(70):  # 큐 상한(64)을 넘겨 밀리게 만듭니다.
        bus.publish("flow", {"spoken": "x"})
    assert bus.listeners == 0
    assert not queue.empty()  # 밀린 화면만 끊기고 이벤트는 계속 발행됨


def test_loop_starts_and_stops(assistant: Assistant):
    """루프는 스스로 돌다가 깨끗이 멈춰야 합니다 (pytest-asyncio 없이 확인)."""

    async def scenario() -> None:
        bus = EventBus()
        flow = DailyFlow(assistant, bus, interval=0.05)
        flow.start()
        await asyncio.sleep(0.15)
        await flow.stop()
        assert flow._task is None

    asyncio.run(scenario())
