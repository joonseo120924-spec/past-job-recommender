from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from jarvis.agents import load_team
from jarvis.config import KINDS
from jarvis.graph import build_graph
from jarvis.metrics import MetricsLog
from jarvis.notion import NotionClient, NotionError, sync_agent_team
from jarvis.vitals import snapshot

router = APIRouter(prefix="/api")


class AskIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=100_000)
    kind: Literal["raw", "wiki", "outputs"] = "raw"
    type: str = Field(default="note", max_length=40)
    tags: list[str] = Field(default_factory=list, max_length=20)


class MetricsIn(BaseModel):
    views: int = Field(ge=0, default=0)
    subscribers: int = Field(ge=0, default=0)
    followers: int = Field(ge=0, default=0)
    date: str | None = None


def _assistant(request: Request):
    return request.app.state.assistant


def _bus(request: Request):
    return request.app.state.bus


@router.get("/vitals")
async def get_vitals(request: Request) -> dict:
    vault = _assistant(request).vault
    return {"system": snapshot(vault.root), "vault": vault.stats()}


@router.get("/skills")
async def get_skills(request: Request) -> dict:
    return {"skills": [s.to_dict() for s in _assistant(request).skills]}


@router.get("/schedule")
async def get_schedule(request: Request) -> dict:
    return {"blocks": _assistant(request).schedule()}


@router.post("/ask")
async def ask(payload: AskIn, request: Request) -> dict:
    # 볼트를 훑는 동기 작업이라 이벤트 루프를 막지 않게 스레드로 넘깁니다.
    return await asyncio.to_thread(_assistant(request).ask, payload.text)


@router.get("/conversation")
async def conversation(request: Request) -> dict:
    """오늘 오간 말. 화면을 새로 고쳐도 대화가 이어지도록."""
    vault = _assistant(request).vault
    note = vault.get(f"conversation-{datetime.now():%Y-%m-%d}")
    lines = []
    if note:
        for raw in note.body.splitlines():
            raw = raw.strip()
            if not raw.startswith("- "):
                continue
            stamp, _, rest = raw[2:].partition(" ")
            question, _, answer = rest.partition(" → ")
            lines.append(
                {"at": stamp, "question": question.strip("*"), "answer": answer}
            )
    return {"lines": lines[-30:]}


@router.get("/stream")
async def stream(request: Request) -> StreamingResponse:
    """서버가 먼저 말을 거는 통로 (하루 흐름 알림)."""
    bus = _bus(request)
    queue = bus.subscribe()

    async def events():
        try:
            yield "retry: 3000\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    line = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"  # 프록시가 끊지 않도록.
                    continue
                yield f"data: {line}\n\n"
        finally:
            bus.unsubscribe(queue)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/run/{skill_name}")
async def run_skill(skill_name: str, request: Request) -> dict:
    assistant = _assistant(request)
    known = {s.name for s in assistant.skills} | {"review"}
    if skill_name not in known:
        raise HTTPException(404, f"'{skill_name}' 스킬을 찾을 수 없습니다.")
    answer = assistant.run(skill_name)
    return {
        "skill": skill_name,
        "spoken": answer.spoken,
        "data": answer.data,
        "note_id": answer.note_id,
    }


@router.get("/vault/notes")
async def list_notes(
    request: Request,
    q: str = "",
    kind: str | None = None,
    limit: int = 20,
) -> dict:
    vault = _assistant(request).vault
    if kind and kind not in KINDS:
        raise HTTPException(422, f"kind는 {KINDS} 중 하나여야 합니다.")
    limit = max(1, min(limit, 100))
    notes = vault.search(q, limit=limit, kind=kind) if q.strip() else vault.notes(kind)[:limit]
    return {"notes": [n.to_dict() for n in notes], "query": q}


@router.get("/vault/notes/{note_id}")
async def read_note(note_id: str, request: Request) -> dict:
    vault = _assistant(request).vault
    note = vault.get(note_id)
    if note is None:
        raise HTTPException(404, f"'{note_id}' 노트가 없습니다.")
    return {
        "note": note.to_dict(with_body=True),
        "backlinks": [n.to_dict() for n in vault.backlinks(note_id)],
    }


@router.post("/vault/notes", status_code=201)
async def create_note(payload: NoteIn, request: Request) -> dict:
    vault = _assistant(request).vault
    note = vault.write(
        title=payload.title,
        body=payload.body,
        kind=payload.kind,
        type=payload.type,
        tags=payload.tags,
    )
    return {"note": note.to_dict(with_body=True)}


@router.get("/metrics")
async def read_metrics(request: Request) -> dict:
    log = MetricsLog(_assistant(request).vault.root)
    latest, previous, delta = log.latest_delta()
    return {
        "latest": latest,
        "previous": previous,
        "delta": delta,
        "snapshots": log.snapshots()[-30:],
    }


@router.post("/metrics", status_code=201)
async def write_metrics(payload: MetricsIn, request: Request) -> dict:
    log = MetricsLog(_assistant(request).vault.root)
    row = log.record(payload.model_dump(exclude={"date"}), on=payload.date)
    return {"recorded": row}


@router.get("/agents")
async def agents(request: Request) -> dict:
    """노션 AI 앱 개발팀 현황 (볼트 스냅샷 기준)."""
    team = load_team(_assistant(request).vault)
    return {
        "team": team.data.get("team", {}),
        "cycle": team.data.get("cycle", {}),
        "apps": team.data.get("apps", []),
        "audit": team.data.get("audit", {}),
        "blockers": team.data.get("blockers", []),
        "next": team.data.get("next", []),
        "divisions": team.data.get("divisions", []),
        "headline": team.headline(),
        "observed_at": team.data.get("observed_at"),
        "stale_days": team.staleness_days,
    }


@router.post("/notion/sync")
async def notion_sync(request: Request) -> dict:
    """노션 정본을 볼트 wiki/ 로 다시 끌어옵니다 (NOTION_TOKEN 필요)."""
    vault = _assistant(request).vault
    client = NotionClient()
    try:
        result = await asyncio.to_thread(sync_agent_team, vault, client)
    except NotionError as exc:
        raise HTTPException(502, str(exc)) from exc
    return result


@router.get("/graph")
async def graph(request: Request) -> dict:
    """OPTIMAL ENGINE — 조직·도구·산출물·볼트를 하나의 그래프로."""
    return await asyncio.to_thread(build_graph, _assistant(request).vault)
