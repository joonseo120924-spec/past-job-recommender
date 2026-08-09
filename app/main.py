from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import DATA_PATH, STATIC_DIR
from app.engine.recommender import Recommender


def create_app(data_path: Path | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Built here rather than at import time so the taxonomy is loaded once
        # per process, not once per importing test module.
        app.state.recommender = Recommender.build(data_path or DATA_PATH)
        yield

    app = FastAPI(
        title="past-job-recommender",
        description="과거 경력을 바탕으로 다음 직무를 추천하고 스킬 갭을 알려줍니다.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.include_router(router)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """One error shape for the frontend, whatever the source."""
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
        async def index() -> FileResponse:
            return FileResponse(STATIC_DIR / "index.html")

    return app


app = create_app()
