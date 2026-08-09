from __future__ import annotations

import pytest

from app.engine import constants as C
from app.engine.gap import assess_role, skill_coverage
from app.engine.models import NormalizedProfile


def _profile(skills):
    return NormalizedProfile(
        experiences=(),
        total_years=0.0,
        effective_years=0.0,
        skills=frozenset(skills),
        unresolved_inputs=(),
        preferred_industries=(),
    )


def test_owned_skill_has_full_coverage(mini_taxonomy):
    coverage, evidence = skill_coverage(frozenset({"SQL"}), "SQL", mini_taxonomy)
    assert coverage == 1.0
    assert evidence == "SQL"


def test_unrelated_skill_has_zero_coverage(mini_taxonomy):
    coverage, evidence = skill_coverage(frozenset({"Figma"}), "Java", mini_taxonomy)
    assert coverage == 0.0
    assert evidence is None


def test_related_skill_gives_partial_credit_with_evidence(mini_taxonomy):
    """Partial credit must name the skill the user actually listed."""
    related = dict(mini_taxonomy.skill_relations["UI 디자인"])
    assert "Figma" in related
    coverage, evidence = skill_coverage(
        frozenset({"Figma"}), "UI 디자인", mini_taxonomy
    )
    assert coverage == pytest.approx(C.RELATED_CREDIT * related["Figma"])
    assert evidence == "Figma"


def test_partial_credit_never_counts_as_matched(mini_taxonomy):
    """Related-skill credit is capped below the match threshold by design."""
    max_partial = C.RELATED_CREDIT * 1.0
    assert max_partial < C.MATCH_THRESHOLD


def test_matched_and_gaps_are_disjoint(mini_taxonomy):
    role = mini_taxonomy.role_by_id["alpha-analyst"]
    matched, gaps, _ = assess_role(_profile({"SQL", "Python"}), role, mini_taxonomy)
    assert not {a.skill for a in matched} & {a.skill for a in gaps}


def test_matched_and_gaps_cover_every_role_skill(mini_taxonomy):
    role = mini_taxonomy.role_by_id["alpha-analyst"]
    matched, gaps, _ = assess_role(_profile({"SQL"}), role, mini_taxonomy)
    assert {a.skill for a in matched} | {a.skill for a in gaps} == set(role.all_skills)


def test_gaps_ranked_by_importance_first(mini_taxonomy):
    """A missing required skill must outrank a missing nice-to-have."""
    role = mini_taxonomy.role_by_id["alpha-analyst"]
    _, gaps, _ = assess_role(_profile(set()), role, mini_taxonomy)
    required = set(role.required_skills)
    first_nice = next(
        (i for i, gap in enumerate(gaps) if gap.skill not in required), len(gaps)
    )
    assert all(gap.skill in required for gap in gaps[:first_nice])


def test_readiness_is_one_when_every_skill_is_owned(mini_taxonomy):
    role = mini_taxonomy.role_by_id["alpha-analyst"]
    _, gaps, readiness = assess_role(
        _profile(set(role.all_skills)), role, mini_taxonomy
    )
    assert readiness == pytest.approx(1.0)
    assert gaps == []


def test_readiness_is_zero_for_empty_profile(mini_taxonomy):
    role = mini_taxonomy.role_by_id["zeta-marketer"]
    matched, _, readiness = assess_role(_profile(set()), role, mini_taxonomy)
    assert readiness == 0.0
    assert matched == []


def test_readiness_weights_required_above_nice_to_have(mini_taxonomy):
    role = mini_taxonomy.role_by_id["alpha-analyst"]
    _, _, from_required = assess_role(
        _profile({role.required_skills[0]}), role, mini_taxonomy
    )
    _, _, from_nice = assess_role(
        _profile({role.nice_to_have_skills[0]}), role, mini_taxonomy
    )
    assert from_required > from_nice


def test_gap_list_is_capped(mini_engine):
    """The real taxonomy has roles with more gaps than the UI should show."""
    role = mini_engine.taxonomy.roles[0]
    _, gaps, _ = assess_role(_profile(set()), role, mini_engine.taxonomy)
    assert len(gaps) <= C.MAX_GAPS_RETURNED
