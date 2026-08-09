from __future__ import annotations

import math
from datetime import date

import pytest

from app.engine import constants as C
from app.engine.corpus import build_corpus
from app.engine.features import build_profile_vector
from app.engine.models import NormalizedExperience, NormalizedProfile
from app.engine.profile import normalize_profile
from app.engine.scoring import (
    blend,
    experience_fit,
    experience_weights,
    industry_score,
    recency_weight,
    score_roles,
    tenure_weight,
    transition_score,
)
from app.schemas.request import PastRole
from tests.conftest import TODAY


def _profile(*experiences, preferred=()):
    return NormalizedProfile(
        experiences=tuple(experiences),
        total_years=sum(e.years for e in experiences),
        effective_years=sum(
            recency_weight(e.months_since_end) * e.years for e in experiences
        ),
        skills=frozenset(s for e in experiences for s in e.skills),
        unresolved_inputs=(),
        preferred_industries=tuple(preferred),
    )


def _experience(
    *, role_id=None, industry=None, years=3.0, months_since=0.0, skills=()
):
    return NormalizedExperience(
        raw_title="테스트",
        matched_role_id=role_id,
        industry=industry,
        years=years,
        months_since_end=months_since,
        skills=tuple(skills),
        unresolved_skills=(),
        free_text="",
    )


# --- weighting ------------------------------------------------------------


def test_recency_weight_halves_at_half_life():
    assert recency_weight(12 * C.RECENCY_HALF_LIFE_YEARS) == pytest.approx(0.5)


def test_recency_weight_is_one_for_current_role():
    assert recency_weight(0.0) == 1.0


def test_recency_weight_hits_floor_for_ancient_roles():
    assert recency_weight(12 * 40) == C.RECENCY_FLOOR


def test_recency_weight_is_monotonically_decreasing():
    values = [recency_weight(m) for m in range(0, 240, 6)]
    assert all(a >= b for a, b in zip(values, values[1:]))


def test_tenure_weight_saturates_at_configured_years():
    assert tenure_weight(C.TENURE_SATURATION_YEARS) == pytest.approx(1.0)
    assert tenure_weight(20.0) == 1.0
    assert tenure_weight(0.0) == 0.0


def test_tenure_weight_rewards_early_years_more():
    """Diminishing returns: year one must be worth more than year five."""
    first = tenure_weight(1.0) - tenure_weight(0.0)
    fifth = tenure_weight(5.0) - tenure_weight(4.0)
    assert first > fifth


def test_experience_weights_sum_to_one():
    profile = _profile(
        _experience(years=3.0, months_since=0.0),
        _experience(years=2.0, months_since=60.0),
    )
    assert experience_weights(profile).sum() == pytest.approx(1.0)


def test_recent_role_outweighs_equally_long_old_role():
    profile = _profile(
        _experience(years=3.0, months_since=0.0),
        _experience(years=3.0, months_since=120.0),
    )
    weights = experience_weights(profile)
    assert weights[0] > weights[1]


def test_zero_length_roles_do_not_divide_by_zero():
    profile = _profile(_experience(years=0.0), _experience(years=0.0))
    weights = experience_weights(profile)
    assert weights.sum() == pytest.approx(1.0)
    assert not any(math.isnan(w) for w in weights)


# --- experience fit -------------------------------------------------------


def test_experience_fit_is_one_inside_the_band(mini_taxonomy):
    role = mini_taxonomy.role_by_id["alpha-analyst"]  # mid: 3-8 years
    assert experience_fit(5.0, role) == 1.0


def test_experience_fit_penalizes_underqualified(mini_taxonomy):
    role = mini_taxonomy.role_by_id["beta-scientist"]  # senior: 7-20 years
    assert experience_fit(2.0, role) < 1.0


def test_experience_fit_never_drops_below_underqualified_floor(mini_taxonomy):
    role = mini_taxonomy.role_by_id["beta-scientist"]
    assert experience_fit(0.0, role) >= C.UNDERQUALIFIED_FLOOR


def test_overqualified_is_penalized_more_gently_than_underqualified(mini_taxonomy):
    """Suggesting a role below someone's level is dull; above it is absurd."""
    junior = mini_taxonomy.role_by_id["delta-frontend"]  # junior: 0-3 years
    senior = mini_taxonomy.role_by_id["beta-scientist"]  # senior: 7-20 years
    assert experience_fit(15.0, junior) >= C.OVERQUALIFIED_FLOOR
    assert experience_fit(15.0, junior) > experience_fit(0.5, senior)


def test_experience_fit_stays_in_unit_interval(mini_taxonomy):
    for role in mini_taxonomy.roles:
        for years in (0.0, 1.0, 4.0, 9.0, 25.0, 60.0):
            assert 0.0 <= experience_fit(years, role) <= 1.0


# --- transition -----------------------------------------------------------


def test_transition_full_credit_for_declared_adjacency(mini_taxonomy):
    profile = _profile(_experience(role_id="alpha-analyst"))
    weights = experience_weights(profile)
    target = mini_taxonomy.role_by_id["beta-scientist"]
    assert transition_score(profile, weights, target, mini_taxonomy) == pytest.approx(
        C.TRANSITION_ADJACENT
    )


def test_transition_partial_credit_for_same_family(mini_taxonomy):
    profile = _profile(_experience(role_id="gamma-backend"))
    weights = experience_weights(profile)
    target = mini_taxonomy.role_by_id["delta-frontend"]
    # delta is declared adjacent to gamma, so use a same-family non-adjacent pair
    assert target.id in mini_taxonomy.role_by_id["gamma-backend"].adjacent_role_ids
    unrelated = mini_taxonomy.role_by_id["zeta-marketer"]
    assert transition_score(profile, weights, unrelated, mini_taxonomy) == 0.0


def test_transition_zero_when_title_unmatched(mini_taxonomy):
    profile = _profile(_experience(role_id=None))
    weights = experience_weights(profile)
    target = mini_taxonomy.role_by_id["beta-scientist"]
    assert transition_score(profile, weights, target, mini_taxonomy) == 0.0


# --- industry -------------------------------------------------------------


def test_industry_score_is_one_for_same_industry(mini_taxonomy):
    profile = _profile(_experience(industry="IT 서비스"))
    weights = experience_weights(profile)
    role = mini_taxonomy.role_by_id["alpha-analyst"]
    assert industry_score(profile, weights, role, mini_taxonomy) == pytest.approx(1.0)


def test_industry_score_zero_without_industry(mini_taxonomy):
    profile = _profile(_experience(industry=None))
    weights = experience_weights(profile)
    role = mini_taxonomy.role_by_id["alpha-analyst"]
    assert industry_score(profile, weights, role, mini_taxonomy) == 0.0


def test_preferred_industry_bonus_is_capped_at_one(mini_taxonomy):
    profile = _profile(_experience(industry="IT 서비스"), preferred=("IT 서비스",))
    weights = experience_weights(profile)
    role = mini_taxonomy.role_by_id["alpha-analyst"]
    assert industry_score(profile, weights, role, mini_taxonomy) == 1.0


# --- blend and ranking ----------------------------------------------------


def test_weights_sum_to_one():
    assert (
        C.W_SIMILARITY + C.W_EXPERIENCE + C.W_TRANSITION + C.W_INDUSTRY
    ) == pytest.approx(1.0)


def test_blend_matches_weighted_sum():
    assert blend(1.0, 1.0, 1.0, 1.0) == pytest.approx(1.0)
    assert blend(1.0, 0.0, 0.0, 0.0) == pytest.approx(C.W_SIMILARITY)


def test_final_score_equals_recomputed_blend(mini_engine, mini_taxonomy):
    profile = normalize_profile(
        [
            PastRole(
                title="알파 분석가",
                industry="IT 서비스",
                start_date=date(2021, 1, 1),
                end_date=None,
                skills=["SQL", "Python"],
            )
        ],
        [],
        mini_taxonomy,
        TODAY,
    )
    weights = experience_weights(profile)
    corpus = mini_engine.corpus
    vector = build_profile_vector(profile, mini_taxonomy, corpus, weights)
    for score in score_roles(profile, mini_taxonomy, corpus, vector, weights):
        assert score.final == pytest.approx(
            blend(
                score.similarity,
                score.experience_fit,
                score.transition,
                score.industry,
            )
        )


def test_scores_are_sorted_and_bounded(mini_engine, mini_taxonomy):
    profile = normalize_profile(
        [
            PastRole(
                title="감마 백엔드 개발자",
                start_date=date(2019, 1, 1),
                end_date=None,
                skills=["Java", "SQL"],
            )
        ],
        [],
        mini_taxonomy,
        TODAY,
    )
    weights = experience_weights(profile)
    vector = build_profile_vector(profile, mini_taxonomy, mini_engine.corpus, weights)
    scores = score_roles(profile, mini_taxonomy, mini_engine.corpus, vector, weights)
    assert [s.final for s in scores] == sorted((s.final for s in scores), reverse=True)
    assert all(0.0 <= s.final <= 1.0 for s in scores)


def test_ranking_is_deterministic(mini_engine, mini_taxonomy):
    def run():
        profile = normalize_profile(
            [
                PastRole(
                    title="알파 분석가",
                    start_date=date(2020, 1, 1),
                    end_date=None,
                    skills=["SQL"],
                )
            ],
            [],
            mini_taxonomy,
            TODAY,
        )
        weights = experience_weights(profile)
        vector = build_profile_vector(
            profile, mini_taxonomy, mini_engine.corpus, weights
        )
        return [
            s.role_id
            for s in score_roles(
                profile, mini_taxonomy, mini_engine.corpus, vector, weights
            )
        ]

    assert run() == run()
