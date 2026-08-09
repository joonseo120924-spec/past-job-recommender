from __future__ import annotations

from fastapi import Request

from app.engine.recommender import Recommender


def get_recommender(request: Request) -> Recommender:
    """The engine is built once during startup and held on app state."""
    return request.app.state.recommender
