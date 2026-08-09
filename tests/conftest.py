from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import DATA_PATH
from app.engine.recommender import Recommender
from app.main import create_app

FIXTURE_DATA = Path(__file__).parent / "fixtures" / "mini_roles.json"

# Every test that touches dates injects this, so the suite does not start
# failing as real time passes.
TODAY = date(2026, 1, 1)


@pytest.fixture(scope="session")
def mini_engine() -> Recommender:
    """Six-role taxonomy with hand-checkable numbers."""
    return Recommender.build(FIXTURE_DATA)


@pytest.fixture(scope="session")
def mini_taxonomy(mini_engine: Recommender):
    return mini_engine.taxonomy


@pytest.fixture(scope="session")
def real_engine() -> Recommender:
    """The shipped dataset, for integrity and smoke checks."""
    return Recommender.build(DATA_PATH)


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(create_app(FIXTURE_DATA)) as test_client:
        yield test_client


def past_role(
    title: str,
    *,
    start: date,
    end: date | None = None,
    skills: list[str] | None = None,
    industry: str | None = None,
    achievements: str = "",
) -> dict:
    return {
        "title": title,
        "industry": industry,
        "start_date": start.isoformat(),
        "end_date": end.isoformat() if end else None,
        "skills": skills or [],
        "achievements": achievements,
    }
