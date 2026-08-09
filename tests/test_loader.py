from __future__ import annotations

import json

import pytest

from app.engine.loader import industry_adjacency, load_taxonomy
from app.engine.models import TaxonomyError
from app.engine.profile import resolve_title
from tests.conftest import FIXTURE_DATA


def _write(tmp_path, roles):
    path = tmp_path / "roles.json"
    path.write_text(json.dumps(roles, ensure_ascii=False), encoding="utf-8")
    return path


@pytest.fixture
def base_role():
    return json.loads(FIXTURE_DATA.read_text(encoding="utf-8"))[0]


def test_missing_file_raises(tmp_path):
    with pytest.raises(TaxonomyError, match="not found"):
        load_taxonomy(tmp_path / "nope.json")


def test_invalid_json_raises(tmp_path):
    path = tmp_path / "roles.json"
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(TaxonomyError, match="valid JSON"):
        load_taxonomy(path)


def test_empty_dataset_raises(tmp_path):
    with pytest.raises(TaxonomyError, match="non-empty"):
        load_taxonomy(_write(tmp_path, []))


def test_missing_key_raises(tmp_path, base_role):
    broken = {k: v for k, v in base_role.items() if k != "required_skills"}
    with pytest.raises(TaxonomyError, match="missing keys"):
        load_taxonomy(_write(tmp_path, [broken]))


def test_unknown_seniority_raises(tmp_path, base_role):
    broken = {**base_role, "seniority": "principal", "adjacent_role_ids": []}
    with pytest.raises(TaxonomyError, match="seniority"):
        load_taxonomy(_write(tmp_path, [broken]))


def test_duplicate_ids_raise(tmp_path, base_role):
    role = {**base_role, "adjacent_role_ids": []}
    with pytest.raises(TaxonomyError, match="duplicate role ids"):
        load_taxonomy(_write(tmp_path, [role, dict(role)]))


def test_dangling_adjacent_reference_raises(tmp_path, base_role):
    broken = {**base_role, "adjacent_role_ids": ["does-not-exist"]}
    with pytest.raises(TaxonomyError, match="unknown adjacent role"):
        load_taxonomy(_write(tmp_path, [broken]))


def test_self_reference_raises(tmp_path, base_role):
    broken = {**base_role, "adjacent_role_ids": [base_role["id"]]}
    with pytest.raises(TaxonomyError, match="lists itself"):
        load_taxonomy(_write(tmp_path, [broken]))


def test_skill_index_covers_required_and_nice_to_have(mini_taxonomy):
    for role in mini_taxonomy.roles:
        for skill in role.all_skills:
            assert skill in mini_taxonomy.skill_index.values()


def test_skill_relations_are_symmetric(mini_taxonomy):
    for skill, related in mini_taxonomy.skill_relations.items():
        for other, strength in related:
            back = dict(mini_taxonomy.skill_relations[other])
            assert back[skill] == pytest.approx(strength)


def test_skill_relations_stay_in_unit_interval(mini_taxonomy):
    for related in mini_taxonomy.skill_relations.values():
        assert all(0.0 < strength <= 1.0 for _, strength in related)


def test_single_role_co_occurrence_is_damped(mini_taxonomy):
    """Two skills sharing exactly one role must not look perfectly related.

    Without the support damping, any pair listed together by one role would
    score a full 1.0 purely from that coincidence.
    """
    figma_related = dict(mini_taxonomy.skill_relations["Figma"])
    assert figma_related["UI 디자인"] == pytest.approx(0.5)


def test_industry_adjacency_is_symmetric_and_bounded(mini_taxonomy):
    for (a, b), strength in mini_taxonomy.industry_adjacency.items():
        assert 0.0 < strength <= 1.0
        assert mini_taxonomy.industry_adjacency[(b, a)] == pytest.approx(strength)


def test_industry_adjacency_identity_and_unknown(mini_taxonomy):
    assert industry_adjacency(mini_taxonomy, "IT 서비스", "IT 서비스") == 1.0
    assert industry_adjacency(mini_taxonomy, "IT 서비스", None) == 0.0


def test_resolve_title_exact_match(mini_taxonomy):
    assert resolve_title("알파 분석가", mini_taxonomy) == "alpha-analyst"


def test_resolve_title_via_keyword(mini_taxonomy):
    assert resolve_title("백엔드", mini_taxonomy) == "gamma-backend"


def test_resolve_title_with_seniority_prefix(mini_taxonomy):
    """Resumes say "시니어 감마 백엔드 개발자", never the bare canonical title."""
    assert resolve_title("시니어 감마 백엔드 개발자", mini_taxonomy) == "gamma-backend"


def test_resolve_title_unrelated_returns_none(mini_taxonomy):
    assert resolve_title("소믈리에", mini_taxonomy) is None
