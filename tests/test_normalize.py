from __future__ import annotations

from datetime import date

import pytest

from app.engine.normalize import (
    experience_years,
    match_key,
    months_since_end,
    ngram_similarity,
    normalize_text,
    resolve_skill,
)


def test_normalize_text_folds_case_and_width():
    assert normalize_text("Ｐｙｔｈｏｎ") == "python"
    assert normalize_text("  SQL   튜닝 ") == "sql 튜닝"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("C++", "c++"),
        ("C#", "c#"),
        (".NET", ".net"),
        ("HTML/CSS", "html/css"),
        ("ISMS-P", "isms-p"),
    ],
)
def test_normalize_text_keeps_identifier_punctuation(raw, expected):
    """Stripping these would collapse C++ and C# into the same token."""
    assert normalize_text(raw) == expected


def test_c_plus_plus_and_c_sharp_stay_distinct():
    assert normalize_text("C++") != normalize_text("C#")


def test_match_key_is_whitespace_insensitive():
    assert match_key("데이터 시각화") == match_key("데이터시각화")
    assert match_key("Google Analytics 4") == match_key("googleanalytics4")


def test_resolve_skill_exact_and_spacing_variants(mini_taxonomy):
    index = dict(mini_taxonomy.skill_index)
    assert resolve_skill("sql", index) == "SQL"
    assert resolve_skill("데이터시각화", index) == "데이터 시각화"
    assert resolve_skill(" Python ", index) == "Python"


def test_resolve_skill_unknown_returns_none(mini_taxonomy):
    """An unresolved input is surfaced to the user; a wrong guess is not."""
    assert resolve_skill("존재하지않는스킬xyz", dict(mini_taxonomy.skill_index)) is None


def test_ngram_similarity_bounds():
    assert ngram_similarity("백엔드 개발자", "백엔드 개발자") == 1.0
    assert ngram_similarity("백엔드 개발자", "") == 0.0
    assert 0.0 < ngram_similarity("백엔드 개발자", "시니어 백엔드 개발자") < 1.0


def test_experience_years_open_ended_runs_to_today():
    years = experience_years(date(2024, 1, 1), None, date(2026, 1, 1))
    assert years == pytest.approx(2.0, abs=0.01)


def test_experience_years_partial_period():
    years = experience_years(date(2024, 1, 1), date(2025, 7, 1), date(2026, 1, 1))
    assert years == pytest.approx(1.5, abs=0.02)


def test_experience_years_never_negative():
    assert experience_years(date(2026, 1, 1), date(2025, 1, 1), date(2026, 6, 1)) == 0.0


def test_months_since_end_zero_for_current_role():
    assert months_since_end(None, date(2026, 1, 1)) == 0.0


def test_months_since_end_counts_elapsed_months():
    assert months_since_end(date(2025, 1, 1), date(2026, 1, 1)) == pytest.approx(
        12.0, abs=0.1
    )
