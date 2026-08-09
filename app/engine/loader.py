"""Load and validate `data/job_roles.json`, then derive every lookup index.

The seed dataset carries only roles. Skill relatedness and industry adjacency
are *derived* from how the taxonomy uses them rather than hand-authored in a
second file, so there is exactly one source of truth to keep consistent.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

from app.engine import constants as C
from app.engine.models import RoleDef, Taxonomy, TaxonomyError
from app.engine.normalize import match_key

_REQUIRED_KEYS = {
    "id",
    "title_ko",
    "title_en",
    "family",
    "seniority",
    "summary_ko",
    "required_skills",
    "nice_to_have_skills",
    "typical_industries",
    "adjacent_role_ids",
    "keywords",
}
_VALID_SENIORITY = frozenset(C.SENIORITY_YEARS)


def load_taxonomy(data_path: Path) -> Taxonomy:
    if not data_path.exists():
        raise TaxonomyError(f"job role dataset not found: {data_path}")
    try:
        raw = json.loads(data_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise TaxonomyError(f"job role dataset is not valid JSON: {exc}") from exc
    if not isinstance(raw, list) or not raw:
        raise TaxonomyError("job role dataset must be a non-empty JSON array")

    roles = tuple(_parse_role(entry, i) for i, entry in enumerate(raw))
    role_by_id = {role.id: role for role in roles}
    if len(role_by_id) != len(roles):
        raise TaxonomyError("duplicate role ids in dataset")
    _validate_references(roles, role_by_id)

    return Taxonomy(
        roles=roles,
        role_by_id=role_by_id,
        skill_index=_build_label_index(
            skill for role in roles for skill in role.all_skills
        ),
        title_index=_build_title_index(roles),
        industry_index=_build_label_index(
            industry for role in roles for industry in role.typical_industries
        ),
        skill_relations=_derive_skill_relations(roles),
        industry_adjacency=_derive_industry_adjacency(roles),
    )


def _parse_role(entry: Any, position: int) -> RoleDef:
    if not isinstance(entry, dict):
        raise TaxonomyError(f"role at position {position} is not an object")
    missing = _REQUIRED_KEYS - entry.keys()
    if missing:
        raise TaxonomyError(
            f"role at position {position} is missing keys: {sorted(missing)}"
        )
    role_id = entry["id"]
    if not isinstance(role_id, str) or not role_id.strip():
        raise TaxonomyError(f"role at position {position} has an empty id")
    if entry["seniority"] not in _VALID_SENIORITY:
        raise TaxonomyError(
            f"role {role_id!r} has unknown seniority {entry['seniority']!r}"
        )
    for key in ("required_skills", "typical_industries", "keywords"):
        if not entry[key]:
            raise TaxonomyError(f"role {role_id!r} has an empty {key}")

    return RoleDef(
        id=role_id,
        title_ko=entry["title_ko"],
        title_en=entry["title_en"],
        family=entry["family"],
        seniority=entry["seniority"],
        summary_ko=entry["summary_ko"],
        required_skills=tuple(entry["required_skills"]),
        nice_to_have_skills=tuple(entry["nice_to_have_skills"]),
        typical_industries=tuple(entry["typical_industries"]),
        adjacent_role_ids=tuple(entry["adjacent_role_ids"]),
        keywords=tuple(entry["keywords"]),
    )


def _validate_references(roles: Iterable[RoleDef], role_by_id: dict[str, RoleDef]) -> None:
    for role in roles:
        for ref in role.adjacent_role_ids:
            if ref not in role_by_id:
                raise TaxonomyError(
                    f"role {role.id!r} references unknown adjacent role {ref!r}"
                )
            if ref == role.id:
                raise TaxonomyError(f"role {role.id!r} lists itself as adjacent")


def _build_label_index(labels: Iterable[str]) -> dict[str, str]:
    """Map every normalized spelling of a label to its canonical form."""
    index: dict[str, str] = {}
    for label in labels:
        index.setdefault(match_key(label), label)
    return index


def _build_title_index(roles: Iterable[RoleDef]) -> dict[str, tuple[str, ...]]:
    """Map job titles and resume keywords to the roles that claim them.

    Keywords are included because real resumes say "PM" or "서버 개발자" far more
    often than they say the taxonomy's canonical title. A keyword shared by
    several roles maps to all of them and is resolved by scoring, not guessing.
    """
    index: dict[str, list[str]] = defaultdict(list)
    for role in roles:
        for label in (role.title_ko, role.title_en, *role.keywords):
            key = match_key(label)
            if key and role.id not in index[key]:
                index[key].append(role.id)
    return {key: tuple(ids) for key, ids in index.items()}


def _derive_skill_relations(
    roles: Iterable[RoleDef],
) -> dict[str, tuple[tuple[str, float], ...]]:
    """Relate skills by how often they are demanded by the same roles.

    Strength is Jaccard overlap of the two skills' role sets, damped by how much
    evidence there is: a pair that co-occurs in a single role would otherwise
    score a perfect 1.0 purely by coincidence of that one role's skill list.
    """
    roles_by_skill: dict[str, set[str]] = defaultdict(set)
    for role in roles:
        for skill in role.all_skills:
            roles_by_skill[skill].add(role.id)

    co_occurrence: dict[tuple[str, str], int] = defaultdict(int)
    for role in roles:
        unique = sorted(set(role.all_skills))
        for i, a in enumerate(unique):
            for b in unique[i + 1 :]:
                co_occurrence[(a, b)] += 1

    scored: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for (a, b), shared in co_occurrence.items():
        union = len(roles_by_skill[a] | roles_by_skill[b])
        support = shared / (shared + 1)  # 1 role -> 0.5, 3 roles -> 0.75
        strength = (shared / union) * support
        if strength >= C.SKILL_RELATED_MIN_JACCARD:
            scored[a].append((b, strength))
            scored[b].append((a, strength))

    return {
        skill: tuple(
            sorted(related, key=lambda pair: (-pair[1], pair[0]))[
                : C.SKILL_RELATED_TOP_K
            ]
        )
        for skill, related in scored.items()
    }


def _derive_industry_adjacency(
    roles: Iterable[RoleDef],
) -> dict[tuple[str, str], float]:
    """Relate industries by how often the same role spans both of them."""
    industries_by_role = [set(role.typical_industries) for role in roles]
    roles_by_industry: dict[str, set[int]] = defaultdict(set)
    for i, industries in enumerate(industries_by_role):
        for industry in industries:
            roles_by_industry[industry].add(i)

    adjacency: dict[tuple[str, str], float] = {}
    names = sorted(roles_by_industry)
    for i, a in enumerate(names):
        for b in names[i + 1 :]:
            shared = roles_by_industry[a] & roles_by_industry[b]
            if not shared:
                continue
            union = len(roles_by_industry[a] | roles_by_industry[b])
            strength = len(shared) / union
            if strength >= C.INDUSTRY_MIN_ADJACENCY:
                adjacency[(a, b)] = strength
                adjacency[(b, a)] = strength
    return adjacency


def industry_adjacency(taxonomy: Taxonomy, a: str | None, b: str | None) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return taxonomy.industry_adjacency.get((a, b), 0.0)
