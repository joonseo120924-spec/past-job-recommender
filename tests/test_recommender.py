from __future__ import annotations

import math
import re
from datetime import date

import pytest

from app.schemas.request import RecommendRequest

HANGUL = re.compile(r"[가-힣]")


def _request(**overrides):
    payload = {
        "past_roles": [
            {
                "title": "알파 분석가",
                "industry": "IT 서비스",
                "start_date": "2021-01-01",
                "end_date": None,
                "skills": ["SQL", "Python", "데이터 시각화"],
                "achievements": "지표를 정의하고 대시보드를 만들었습니다.",
            }
        ],
        "top_k": 3,
    }
    payload.update(overrides)
    return RecommendRequest(**payload)


def test_returns_requested_number_of_results(mini_engine):
    response = mini_engine.recommend(_request(top_k=3), today=date(2026, 1, 1))
    assert len(response.recommendations) == 3


def test_results_are_ranked_descending(mini_engine):
    response = mini_engine.recommend(_request(top_k=5), today=date(2026, 1, 1))
    scores = [rec.score for rec in response.recommendations]
    assert scores == sorted(scores, reverse=True)
    assert [rec.rank for rec in response.recommendations] == [1, 2, 3, 4, 5]


def test_repeated_calls_are_identical(mini_engine):
    today = date(2026, 1, 1)
    first = mini_engine.recommend(_request(), today=today)
    second = mini_engine.recommend(_request(), today=today)
    assert [r.model_dump() for r in first.recommendations] == [
        r.model_dump() for r in second.recommendations
    ]


def test_current_role_is_excluded_by_default(mini_engine):
    response = mini_engine.recommend(_request(top_k=5), today=date(2026, 1, 1))
    assert "alpha-analyst" not in {rec.role_id for rec in response.recommendations}


def test_current_role_can_be_included(mini_engine):
    response = mini_engine.recommend(
        _request(top_k=5, include_current_role=True), today=date(2026, 1, 1)
    )
    assert "alpha-analyst" in {rec.role_id for rec in response.recommendations}


def test_unrecognized_skills_are_reported_not_silently_dropped(mini_engine):
    response = mini_engine.recommend(
        _request(
            past_roles=[
                {
                    "title": "알파 분석가",
                    "start_date": "2021-01-01",
                    "skills": ["SQL", "존재하지않는스킬"],
                }
            ]
        ),
        today=date(2026, 1, 1),
    )
    assert response.profile.unresolved_inputs == ["존재하지않는스킬"]
    assert response.profile.recognized_skills == ["SQL"]


def test_all_inputs_unrecognized_still_returns_finite_scores(mini_engine):
    """A zero profile vector must not produce NaN scores or an empty response."""
    response = mini_engine.recommend(
        _request(
            past_roles=[
                {
                    "title": "무의미한직함zzz",
                    "start_date": "2021-01-01",
                    "skills": ["asdfqwer", "zxcvbnm"],
                }
            ],
            top_k=3,
        ),
        today=date(2026, 1, 1),
    )
    assert len(response.recommendations) == 3
    for rec in response.recommendations:
        assert not math.isnan(rec.score)
        assert 0.0 <= rec.score <= 100.0


def test_very_short_single_role_does_not_crash(mini_engine):
    response = mini_engine.recommend(
        _request(
            past_roles=[
                {
                    "title": "알파 분석가",
                    "start_date": "2025-11-01",
                    "end_date": "2025-12-01",
                    "skills": ["SQL"],
                }
            ]
        ),
        today=date(2026, 1, 1),
    )
    assert response.recommendations


def test_breakdown_contributions_sum_to_score(mini_engine):
    response = mini_engine.recommend(_request(), today=date(2026, 1, 1))
    for rec in response.recommendations:
        assert sum(rec.breakdown.contributions.values()) == pytest.approx(
            rec.score / 100, abs=1e-3
        )


def test_explanations_are_korean_and_fully_filled(mini_engine):
    response = mini_engine.recommend(_request(), today=date(2026, 1, 1))
    for rec in response.recommendations:
        assert HANGUL.search(rec.explanation_ko)
        assert "{" not in rec.explanation_ko
        assert rec.explanation_bullets_ko
        assert all("{" not in bullet for bullet in rec.explanation_bullets_ko)


def test_effective_years_discounts_stale_experience(mini_engine):
    response = mini_engine.recommend(
        _request(
            past_roles=[
                {
                    "title": "알파 분석가",
                    "start_date": "2008-01-01",
                    "end_date": "2011-01-01",
                    "skills": ["SQL"],
                }
            ]
        ),
        today=date(2026, 1, 1),
    )
    profile = response.profile
    assert profile.effective_years < profile.total_years


def test_skill_gaps_are_not_already_owned(mini_engine):
    response = mini_engine.recommend(_request(top_k=5), today=date(2026, 1, 1))
    owned = set(response.profile.recognized_skills)
    for rec in response.recommendations:
        assert not owned & {gap.skill for gap in rec.skill_gaps}


def test_career_changer_still_gets_cross_family_options(mini_engine):
    """Industry and transition weights must not fence users into one family."""
    response = mini_engine.recommend(
        _request(
            past_roles=[
                {
                    "title": "감마 백엔드 개발자",
                    "start_date": "2018-01-01",
                    "skills": ["Java", "SQL", "Git"],
                }
            ],
            top_k=5,
        ),
        today=date(2026, 1, 1),
    )
    families = {rec.family for rec in response.recommendations}
    assert len(families) > 1


def test_real_dataset_produces_sensible_analyst_recommendations(real_engine):
    response = real_engine.recommend(
        RecommendRequest(
            past_roles=[
                {
                    "title": "데이터 분석가",
                    "industry": "이커머스",
                    "start_date": date(2020, 3, 1),
                    "skills": ["SQL", "Python", "데이터 시각화", "대시보드 구축"],
                }
            ],
            top_k=5,
        ),
        today=date(2026, 1, 1),
    )
    titles = {rec.role_id for rec in response.recommendations}
    assert titles & {"growth-analyst", "bi-analyst", "data-scientist", "analytics-engineer"}
