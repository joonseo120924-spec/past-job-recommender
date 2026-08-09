"""Text and date normalization.

Korean is agglutinative and `TfidfVectorizer`'s default token pattern splits
`데이터를` / `데이터의` / `데이터` into three unrelated types. The engine therefore
never relies on whitespace tokenization of Korean prose for its primary signal:
free text is only ever seen as character n-grams, and the discriminating
features come from skill strings resolved against a controlled vocabulary here.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date

_PUNCT = re.compile(r"[^\w\s+#./-]", re.UNICODE)
_SPACE = re.compile(r"\s+")
_DAYS_PER_YEAR = 365.25
_DAYS_PER_MONTH = _DAYS_PER_YEAR / 12


def normalize_text(raw: str) -> str:
    """NFKC-fold, lowercase, drop punctuation, collapse whitespace.

    `+`, `#`, `.`, `/` and `-` survive so that C++, C#, .NET, HTML/CSS and
    ISMS-P stay distinguishable from their neighbours.
    """
    if not raw:
        return ""
    folded = unicodedata.normalize("NFKC", raw).casefold()
    return _SPACE.sub(" ", _PUNCT.sub(" ", folded)).strip()


def match_key(raw: str) -> str:
    """Whitespace-insensitive lookup key.

    `데이터 시각화` and `데이터시각화` are the same skill to a human and must be
    the same key here; users type both.
    """
    return normalize_text(raw).replace(" ", "")


def char_ngrams(raw: str, n: int = 3) -> set[str]:
    text = match_key(raw)
    if len(text) < n:
        return {text} if text else set()
    return {text[i : i + n] for i in range(len(text) - n + 1)}


def ngram_similarity(a: str, b: str, n: int = 2) -> float:
    """Jaccard overlap of character n-grams, used for fuzzy title matching."""
    ga, gb = char_ngrams(a, n), char_ngrams(b, n)
    if not ga or not gb:
        return 0.0
    return len(ga & gb) / len(ga | gb)


def resolve_skill(raw: str, skill_index: dict[str, str]) -> str | None:
    """Exact lookup against the controlled vocabulary. No fuzzy matching.

    A near-miss silently resolving to the wrong skill is worse than an
    unresolved input, because the UI surfaces unresolved inputs back to the user.
    """
    return skill_index.get(match_key(raw))


def resolve_industry(raw: str | None, industry_index: dict[str, str]) -> str | None:
    if not raw:
        return None
    return industry_index.get(match_key(raw))


def experience_years(start: date, end: date | None, today: date) -> float:
    """Duration of a role in years. An open-ended role runs until `today`."""
    finish = end or today
    return max(0.0, (finish - start).days / _DAYS_PER_YEAR)


def months_since_end(end: date | None, today: date) -> float:
    """Months elapsed since a role finished. Currently-held roles return 0."""
    if end is None:
        return 0.0
    return max(0.0, (today - end).days / _DAYS_PER_MONTH)
