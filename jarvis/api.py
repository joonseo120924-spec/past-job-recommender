from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from jarvis.config import KINDS
from jarvis.metrics import MetricsLog
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
    return _assistant(request).ask(payload.text)


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
