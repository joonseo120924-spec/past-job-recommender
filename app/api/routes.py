from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_recommender
from app.engine import constants as C
from app.engine.recommender import Recommender
from app.schemas.request import RecommendRequest
from app.schemas.response import (
    HealthResponse,
    ProfileSummary,
    RecommendResponse,
    RoleDetail,
    RoleSummary,
)

router = APIRouter(prefix="/api")

EngineDep = Annotated[Recommender, Depends(get_recommender)]


@router.get("/health", response_model=HealthResponse)
def health(engine: EngineDep) -> HealthResponse:
    taxonomy = engine.taxonomy
    return HealthResponse(
        status="ok",
        roles=len(taxonomy.roles),
        skills=len(taxonomy.skills),
        industries=len(taxonomy.industries),
        engine_version=C.ENGINE_VERSION,
    )


@router.post("/recommend", response_model=RecommendResponse)
def recommend(payload: RecommendRequest, engine: EngineDep) -> RecommendResponse:
    return engine.recommend(payload)


@router.post("/normalize", response_model=ProfileSummary)
def normalize(payload: RecommendRequest, engine: EngineDep) -> ProfileSummary:
    """Preview what the engine recognized, before committing to a recommendation.

    The frontend uses this to surface unrecognized skill inputs while the user
    is still editing, which is the main defence against silent vocabulary
    misses.
    """
    return engine.summarize(engine.build_profile(payload))


@router.get("/roles", response_model=list[RoleSummary])
def list_roles(engine: EngineDep) -> list[RoleSummary]:
    return engine.list_roles()


@router.get("/roles/{role_id}", response_model=RoleDetail)
def get_role(role_id: str, engine: EngineDep) -> RoleDetail:
    role = engine.get_role(role_id)
    if role is None:
        raise HTTPException(status_code=404, detail=f"존재하지 않는 직무입니다: {role_id}")
    return role


@router.get("/skills", response_model=list[str])
def list_skills(
    engine: EngineDep,
    q: str | None = Query(default=None, max_length=60),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[str]:
    return engine.search_skills(q, limit)


@router.get("/industries", response_model=list[str])
def list_industries(engine: EngineDep) -> list[str]:
    return engine.list_industries()
