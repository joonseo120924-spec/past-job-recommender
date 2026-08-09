"""Skill coverage, gap ranking and readiness for a candidate role."""

from __future__ import annotations

from dataclasses import dataclass

from app.engine import constants as C
from app.engine.models import NormalizedProfile, RoleDef, Taxonomy

_REQUIRED_IMPORTANCE = 1.0
_NICE_TO_HAVE_IMPORTANCE = 0.5


@dataclass(frozen=True, slots=True)
class SkillAssessment:
    skill: str
    importance: float
    coverage: float
    gap_score: float
    evidence_skill: str | None


def _weighted_skills(role: RoleDef) -> list[tuple[str, float]]:
    return [(s, _REQUIRED_IMPORTANCE) for s in role.required_skills] + [
        (s, _NICE_TO_HAVE_IMPORTANCE) for s in role.nice_to_have_skills
    ]


def skill_coverage(
    owned: frozenset[str], skill: str, taxonomy: Taxonomy
) -> tuple[float, str | None]:
    """How much of `skill` the profile already covers, and what proves it.

    Exact possession is full credit. Otherwise a single hop through the derived
    relatedness graph gives partial credit - deliberately one hop, so the
    explanation stays traceable to a skill the user actually listed.
    """
    if skill in owned:
        return 1.0, skill
    best_strength = 0.0
    evidence: str | None = None
    for related_skill, strength in taxonomy.skill_relations.get(skill, ()):
        if related_skill in owned and strength > best_strength:
            best_strength, evidence = strength, related_skill
    if evidence is None:
        return 0.0, None
    return C.RELATED_CREDIT * best_strength, evidence


def assess_role(
    profile: NormalizedProfile, role: RoleDef, taxonomy: Taxonomy
) -> tuple[list[SkillAssessment], list[SkillAssessment], float]:
    """Return (matched, gaps, readiness) for one role.

    Gaps are ranked by importance weighted by how much is missing, so a
    critical skill the user lacks entirely outranks a secondary one they
    partially cover.
    """
    matched: list[SkillAssessment] = []
    gaps: list[SkillAssessment] = []
    covered_weight = 0.0
    total_weight = 0.0

    for skill, importance in _weighted_skills(role):
        coverage, evidence = skill_coverage(profile.skills, skill, taxonomy)
        total_weight += importance
        covered_weight += importance * coverage
        assessment = SkillAssessment(
            skill=skill,
            importance=importance,
            coverage=coverage,
            gap_score=importance * (1.0 - coverage),
            evidence_skill=evidence,
        )
        if coverage >= C.MATCH_THRESHOLD:
            matched.append(assessment)
        else:
            gaps.append(assessment)

    matched.sort(key=lambda a: (-a.importance, a.skill))
    gaps.sort(key=lambda a: (-a.gap_score, a.skill))
    readiness = covered_weight / total_weight if total_weight else 0.0
    return (
        matched[: C.MAX_MATCHED_RETURNED],
        gaps[: C.MAX_GAPS_RETURNED],
        readiness,
    )
