from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from jarvis import __version__
from jarvis.api import router
from jarvis.assistant import Assistant
from jarvis.config import STATIC_DIR, VAULT_DIR
from jarvis.events import EventBus
from jarvis.scheduler import DailyFlow
from jarvis.vault import Vault


def create_app(
    vault_dir: Path | None = None,
    skills_dir: Path | None = None,
    *,
    autorun: bool = True,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        bus = EventBus()
        assistant = Assistant(Vault(vault_dir or VAULT_DIR), skills_dir, bus=bus)
        flow = DailyFlow(assistant, bus)
        app.state.bus = bus
        app.state.assistant = assistant
        app.state.flow = flow
        if autorun:
            flow.start()
        try:
            yield
        finally:
            await flow.stop()

    app = FastAPI(
        title="J.A.R.V.I.S.",
        description="브레인 · 기억 · 보이스 · HUD — 로컬에서 도는 개인 비서.",
        version=__version__,
        lifespan=lifespan,
    )
    app.include_router(router)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "code": "invalid_request",
                "message_ko": "입력값을 확인해 주세요.",
                "detail": [
                    {"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]}
                    for e in exc.errors()
                ],
            },
        )

    if STATIC_DIR.is_dir():
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

        @app.get("/", include_in_schema=False)
        async def hud() -> FileResponse:
            return FileResponse(STATIC_DIR / "index.html")

        @app.get("/engine", include_in_schema=False)
        async def engine() -> FileResponse:
            return FileResponse(STATIC_DIR / "engine.html")

    return app


app = create_app()
