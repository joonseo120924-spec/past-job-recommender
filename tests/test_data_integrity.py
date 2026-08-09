"""Checks against the shipped `data/job_roles.json`.

The dataset is hand-authored and is the single largest source of silent
quality problems, so it gets its own suite.
"""

from __future__ import annotations

import json
import re

import pytest

from app.config import DATA_PATH
from app.engine import constants as C
from app.engine.normalize import match_key

HANGUL = re.compile(r"[가-힣]")
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


@pytest.fixture(scope="module")
def raw_roles():
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def test_dataset_loads(real_engine):
    assert len(real_engine.taxonomy.roles) >= 45


def test_role_ids_are_slugs(raw_roles):
    for role in raw_roles:
        assert SLUG.match(role["id"]), role["id"]


def test_adjacent_references_all_resolve(real_engine):
    ids = set(real_engine.taxonomy.role_by_id)
    for role in real_engine.taxonomy.roles:
        assert set(role.adjacent_role_ids) <= ids, role.id


def test_every_role_has_enough_skills(real_engine):
    for role in real_engine.taxonomy.roles:
        assert len(role.required_skills) >= 5, role.id


def test_no_skill_is_both_required_and_nice_to_have(real_engine):
    for role in real_engine.taxonomy.roles:
        overlap = set(role.required_skills) & set(role.nice_to_have_skills)
        assert not overlap, f"{role.id}: {overlap}"


def test_no_duplicate_skills_within_a_role(real_engine):
    for role in real_engine.taxonomy.roles:
        assert len(set(role.required_skills)) == len(role.required_skills), role.id


def test_skill_spellings_are_canonical(real_engine):
    """Two spellings of one skill split the vocabulary and break overlap.

    `데이터 시각화` and `데이터시각화` would become separate features, so each would
    match only half the roles that actually demand the skill.
    """
    by_key: dict[str, set[str]] = {}
    for role in real_engine.taxonomy.roles:
        for skill in role.all_skills:
            by_key.setdefault(match_key(skill), set()).add(skill)
    collisions = {k: v for k, v in by_key.items() if len(v) > 1}
    assert not collisions, collisions


def test_korean_fields_actually_contain_korean(real_engine):
    for role in real_engine.taxonomy.roles:
        assert HANGUL.search(role.title_ko), role.id
        assert HANGUL.search(role.summary_ko), role.id


def test_seniority_values_are_known(real_engine):
    for role in real_engine.taxonomy.roles:
        assert role.seniority in C.SENIORITY_YEARS


def test_every_family_has_multiple_roles(real_engine):
    """A single-role family gives its members nowhere to move."""
    counts: dict[str, int] = {}
    for role in real_engine.taxonomy.roles:
        counts[role.family] = counts.get(role.family, 0) + 1
    assert all(count >= 2 for count in counts.values()), counts


def test_titles_are_unique(real_engine):
    titles = [role.title_ko for role in real_engine.taxonomy.roles]
    assert len(set(titles)) == len(titles)


def test_every_role_is_reachable_from_another_role(real_engine):
    """A role nothing links to can only ever be reached by raw similarity."""
    referenced = {
        ref for role in real_engine.taxonomy.roles for ref in role.adjacent_role_ids
    }
    orphans = set(real_engine.taxonomy.role_by_id) - referenced
    assert not orphans, orphans


def test_industry_adjacency_is_bounded(real_engine):
    for strength in real_engine.taxonomy.industry_adjacency.values():
        assert 0.0 < strength <= 1.0


def test_skill_relations_are_bounded(real_engine):
    for related in real_engine.taxonomy.skill_relations.values():
        assert len(related) <= C.SKILL_RELATED_TOP_K
        assert all(0.0 < strength <= 1.0 for _, strength in related)
