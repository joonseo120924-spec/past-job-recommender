"""Immutable internal representations used across the engine.

These are deliberately separate from the API schemas: the wire format is free
to change without disturbing the scoring pipeline, and vice versa.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


class TaxonomyError(ValueError):
    """Raised when the seed dataset is malformed. Fails loudly at startup."""


@dataclass(frozen=True, slots=True)
class RoleDef:
    id: str
    title_ko: str
    title_en: str
    family: str
    seniority: str
    summary_ko: str
    required_skills: tuple[str, ...]
    nice_to_have_skills: tuple[str, ...]
    typical_industries: tuple[str, ...]
    adjacent_role_ids: tuple[str, ...]
    keywords: tuple[str, ...]

    @property
    def all_skills(self) -> tuple[str, ...]:
        return self.required_skills + self.nice_to_have_skills


@dataclass(frozen=True, slots=True)
class Taxonomy:
    """The loaded dataset plus every index derived from it."""

    roles: tuple[RoleDef, ...]
    role_by_id: Mapping[str, RoleDef]
    # normalized skill key -> canonical skill label
    skill_index: Mapping[str, str]
    # normalized title/keyword key -> role ids that use it
    title_index: Mapping[str, tuple[str, ...]]
    # normalized industry key -> canonical industry label
    industry_index: Mapping[str, str]
    # canonical skill -> ((other skill, jaccard strength), ...)
    skill_relations: Mapping[str, tuple[tuple[str, float], ...]]
    # (industry a, industry b) -> adjacency in [0, 1]
    industry_adjacency: Mapping[tuple[str, str], float]

    @property
    def skills(self) -> tuple[str, ...]:
        return tuple(sorted(set(self.skill_index.values())))

    @property
    def industries(self) -> tuple[str, ...]:
        return tuple(sorted(set(self.industry_index.values())))


@dataclass(frozen=True, slots=True)
class NormalizedExperience:
    raw_title: str
    matched_role_id: str | None
    industry: str | None
    years: float
    months_since_end: float
    skills: tuple[str, ...]
    unresolved_skills: tuple[str, ...]
    free_text: str


@dataclass(frozen=True, slots=True)
class NormalizedProfile:
    experiences: tuple[NormalizedExperience, ...]
    total_years: float
    effective_years: float
    skills: frozenset[str]
    unresolved_inputs: tuple[str, ...]
    preferred_industries: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RoleScore:
    role_id: str
    similarity: float
    experience_fit: float
    transition: float
    industry: float
    final: float
