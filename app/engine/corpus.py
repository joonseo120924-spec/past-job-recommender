"""Build the vector space that roles and users are compared in.

Two feature blocks are concatenated:

* **Block A** - a controlled vocabulary of skill / family / industry / seniority
  tokens that we tokenize ourselves. This carries the real signal.
* **Block B** - character n-grams over free text (role summaries, keywords, the
  user's own achievement notes). Korean morphology makes word tokenization
  unreliable, and character n-grams degrade gracefully where it would fail.

Block B is scaled down before concatenation: prose is noisy and, on the user
side, unverified.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from app.engine import constants as C
from app.engine.models import RoleDef, Taxonomy
from app.engine.normalize import match_key


def identity_analyzer(tokens: Sequence[str]) -> Sequence[str]:
    """Pass pre-tokenized input straight through.

    A module-level function rather than a lambda so the vectorizer stays
    picklable.
    """
    return tokens


def skill_token(skill: str) -> str:
    return f"skill:{match_key(skill)}"


def role_tokens(role: RoleDef) -> list[str]:
    """Block A tokens for a role. Repetition encodes importance as term frequency."""
    tokens: list[str] = []
    for skill in role.required_skills:
        tokens.extend([skill_token(skill)] * C.REQUIRED_SKILL_REPEAT)
    for skill in role.nice_to_have_skills:
        tokens.extend([skill_token(skill)] * C.NICE_TO_HAVE_REPEAT)
    tokens.extend([f"family:{match_key(role.family)}"] * C.FAMILY_TOKEN_REPEAT)
    tokens.extend(f"ind:{match_key(industry)}" for industry in role.typical_industries)
    tokens.append(f"sen:{role.seniority}")
    return tokens


def role_free_text(role: RoleDef) -> str:
    return " ".join((role.title_ko, role.title_en, role.summary_ko, *role.keywords))


@dataclass(frozen=True, slots=True)
class RoleCorpus:
    role_ids: tuple[str, ...]
    index_of: Mapping[str, int]
    skill_vectorizer: TfidfVectorizer
    text_vectorizer: TfidfVectorizer
    matrix: sparse.csr_matrix  # (n_roles, n_features), L2-normalized rows


def build_corpus(taxonomy: Taxonomy) -> RoleCorpus:
    roles = taxonomy.roles
    skill_vectorizer = TfidfVectorizer(
        analyzer=identity_analyzer, sublinear_tf=True, norm=None
    )
    text_vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=C.CHAR_NGRAM_RANGE,
        sublinear_tf=True,
        min_df=1,
        norm=None,
    )
    block_a = skill_vectorizer.fit_transform([role_tokens(role) for role in roles])
    block_b = text_vectorizer.fit_transform([role_free_text(role) for role in roles])

    return RoleCorpus(
        role_ids=tuple(role.id for role in roles),
        index_of={role.id: i for i, role in enumerate(roles)},
        skill_vectorizer=skill_vectorizer,
        text_vectorizer=text_vectorizer,
        matrix=combine_blocks(block_a, block_b),
    )


def combine_blocks(
    block_a: sparse.spmatrix, block_b: sparse.spmatrix
) -> sparse.csr_matrix:
    """Concatenate the two blocks with block B damped, then L2-normalize rows."""
    combined = sparse.hstack(
        [block_a, block_b * C.TEXT_BLOCK_WEIGHT], format="csr"
    )
    return normalize(combined, norm="l2", copy=False)
