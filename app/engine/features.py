"""Turn a normalized profile into a vector in the role corpus' space."""

from __future__ import annotations

import numpy as np
from scipy import sparse
from sklearn.preprocessing import normalize

from app.engine import constants as C
from app.engine.corpus import RoleCorpus, combine_blocks, skill_token
from app.engine.models import NormalizedExperience, NormalizedProfile, Taxonomy
from app.engine.normalize import match_key


def experience_tokens(
    experience: NormalizedExperience, taxonomy: Taxonomy
) -> list[str]:
    """Block A tokens for one past role, using the same grammar roles use.

    Symmetry matters: if the user side emitted a different token shape the two
    vectors would be near-orthogonal no matter how well the careers matched.
    """
    tokens: list[str] = []
    for skill in experience.skills:
        tokens.extend([skill_token(skill)] * C.USER_SKILL_REPEAT)
    if experience.industry:
        tokens.append(f"ind:{match_key(experience.industry)}")
    if experience.matched_role_id:
        matched = taxonomy.role_by_id[experience.matched_role_id]
        tokens.extend([f"family:{match_key(matched.family)}"] * C.FAMILY_TOKEN_REPEAT)
    return tokens


def vectorize_experiences(
    profile: NormalizedProfile, taxonomy: Taxonomy, corpus: RoleCorpus
) -> sparse.csr_matrix:
    """One L2-normalized row per past role."""
    block_a = corpus.skill_vectorizer.transform(
        [experience_tokens(exp, taxonomy) for exp in profile.experiences]
    )
    block_b = corpus.text_vectorizer.transform(
        [f"{exp.raw_title} {exp.free_text}" for exp in profile.experiences]
    )
    return combine_blocks(block_a, block_b)


def build_profile_vector(
    profile: NormalizedProfile,
    taxonomy: Taxonomy,
    corpus: RoleCorpus,
    weights: np.ndarray,
) -> sparse.csr_matrix:
    """Weighted sum of the per-role vectors, re-normalized.

    A profile whose every input was unrecognized yields a genuine zero vector;
    `normalize` leaves it at zero rather than producing NaN, and every
    similarity downstream is then legitimately 0.
    """
    rows = vectorize_experiences(profile, taxonomy, corpus)
    weighted = sparse.csr_matrix(weights.reshape(1, -1) @ rows)
    return normalize(weighted, norm="l2", copy=False)
