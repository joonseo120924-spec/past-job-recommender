"""Turn raw user-submitted work history into a `NormalizedProfile`."""

from __future__ import annotations

from datetime import date
from typing import Iterable, Protocol, Sequence

from app.engine import constants as C
from app.engine.models import NormalizedExperience, NormalizedProfile, Taxonomy
from app.engine.normalize import (
    experience_years,
    match_key,
    months_since_end,
    ngram_similarity,
    resolve_industry,
    resolve_skill,
)
from app.engine.scoring import recency_weight


class PastRoleInput(Protocol):
    """Structural view of a submitted past role, so the engine stays decoupled
    from the API schema module."""

    title: str
    industry: str | None
    start_date: date
    end_date: date | None
    skills: Sequence[str]
    achievements: str


def resolve_title(raw: str, taxonomy: Taxonomy) -> str | None:
    """Map a free-text job title onto a taxonomy role.

    Resumes rarely use canonical titles - they say "시니어 백엔드 개발자" or just
    "PM". Exact match wins, then the longest indexed phrase contained in the
    title, then fuzzy character overlap above a floor. Below that floor the
    title is left unmatched: an unmatched title costs a little ranking signal,
    while a wrongly matched one poisons the transition score.
    """
    key = match_key(raw)
    if not key:
        return None

    exact = taxonomy.title_index.get(key)
    if exact:
        return _best_of(exact, raw, taxonomy)

    contained = [
        indexed
        for indexed in taxonomy.title_index
        if len(indexed) >= 2 and indexed in key
    ]
    if contained:
        longest = max(contained, key=len)
        return _best_of(taxonomy.title_index[longest], raw, taxonomy)

    best_id, best_score = None, 0.0
    for role in taxonomy.roles:
        score = max(
            ngram_similarity(raw, role.title_ko),
            ngram_similarity(raw, role.title_en),
        )
        if score > best_score:
            best_id, best_score = role.id, score
    return best_id if best_score >= C.TITLE_MATCH_MIN_SIMILARITY else None


def _best_of(candidates: Sequence[str], raw: str, taxonomy: Taxonomy) -> str:
    """Pick the closest role when one keyword maps to several."""
    if len(candidates) == 1:
        return candidates[0]
    return max(
        candidates,
        key=lambda role_id: (
            ngram_similarity(raw, taxonomy.role_by_id[role_id].title_ko),
            -ord(role_id[0]),
            role_id,
        ),
    )


def normalize_experience(
    entry: PastRoleInput, taxonomy: Taxonomy, today: date
) -> NormalizedExperience:
    resolved: list[str] = []
    unresolved: list[str] = []
    for raw_skill in entry.skills:
        skill = resolve_skill(raw_skill, dict(taxonomy.skill_index))
        if skill is None:
            if raw_skill.strip():
                unresolved.append(raw_skill.strip())
        elif skill not in resolved:
            resolved.append(skill)

    return NormalizedExperience(
        raw_title=entry.title,
        matched_role_id=resolve_title(entry.title, taxonomy),
        industry=resolve_industry(entry.industry, dict(taxonomy.industry_index)),
        years=experience_years(entry.start_date, entry.end_date, today),
        months_since_end=months_since_end(entry.end_date, today),
        skills=tuple(resolved),
        unresolved_skills=tuple(unresolved),
        free_text=entry.achievements or "",
    )


def normalize_profile(
    entries: Iterable[PastRoleInput],
    preferred_industries: Iterable[str],
    taxonomy: Taxonomy,
    today: date,
) -> NormalizedProfile:
    experiences = tuple(
        normalize_experience(entry, taxonomy, today) for entry in entries
    )
    industry_index = dict(taxonomy.industry_index)
    preferred = tuple(
        industry
        for industry in (
            resolve_industry(raw, industry_index) for raw in preferred_industries
        )
        if industry
    )

    unresolved: list[str] = []
    for exp in experiences:
        for item in exp.unresolved_skills:
            if item not in unresolved:
                unresolved.append(item)

    return NormalizedProfile(
        experiences=experiences,
        total_years=sum(exp.years for exp in experiences),
        # Recency-discounted: 10 years of stale experience is not 10 years of
        # current experience, and the seniority band check should reflect that.
        effective_years=sum(
            recency_weight(exp.months_since_end) * exp.years for exp in experiences
        ),
        skills=frozenset(skill for exp in experiences for skill in exp.skills),
        unresolved_inputs=tuple(unresolved),
        preferred_industries=preferred,
    )
