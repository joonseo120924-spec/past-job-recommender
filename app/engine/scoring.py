"""Weighting of past roles and the final blend that ranks candidate roles."""

from __future__ import annotations

import math

import numpy as np
from scipy import sparse

from app.engine import constants as C
from app.engine.corpus import RoleCorpus
from app.engine.loader import industry_adjacency
from app.engine.models import NormalizedProfile, RoleDef, RoleScore, Taxonomy


def recency_weight(months: float) -> float:
    """Exponential decay with a floor, so stale roles fade but never vanish."""
    decayed = 0.5 ** ((months / 12.0) / C.RECENCY_HALF_LIFE_YEARS)
    return max(C.RECENCY_FLOOR, decayed)


def tenure_weight(years: float) -> float:
    """Log-saturating: the second year in a job teaches more than the eighth."""
    if years <= 0:
        return 0.0
    return min(1.0, math.log1p(years) / math.log1p(C.TENURE_SATURATION_YEARS))


def experience_weights(profile: NormalizedProfile) -> np.ndarray:
    """Per-past-role weights summing to 1."""
    raw = np.array(
        [
            recency_weight(exp.months_since_end) * tenure_weight(exp.years)
            for exp in profile.experiences
        ],
        dtype=float,
    )
    total = raw.sum()
    if total <= 0:
        # Every role is zero-length; fall back to treating them equally rather
        # than dividing by zero.
        return np.full(len(raw), 1.0 / len(raw)) if len(raw) else raw
    return raw / total


def similarity_scores(
    profile_vector: sparse.csr_matrix, corpus: RoleCorpus
) -> np.ndarray:
    """Cosine against every role. Both sides are already L2-normalized."""
    raw = np.asarray((corpus.matrix @ profile_vector.T).todense()).ravel()
    clipped = np.clip(raw, 0.0, 1.0)
    # Cosine over short sparse documents compresses into a narrow band; the
    # exponent spreads it so ranking gaps are legible. Monotonic, so it never
    # reorders anything - it only changes the spacing.
    return np.power(clipped, C.SIM_GAMMA)


def experience_fit(effective_years: float, role: RoleDef) -> float:
    """How well total (recency-discounted) experience matches the role's band.

    Being under-experienced is penalized harder than being over-experienced:
    recommending a director role to a first-year analyst is the failure mode
    users find absurd, while suggesting a role slightly below someone's level
    is merely uninteresting.
    """
    low, high = C.SENIORITY_YEARS[role.seniority]
    if effective_years < low:
        if low <= 0:
            return 1.0
        return max(C.UNDERQUALIFIED_FLOOR, effective_years / low)
    if effective_years <= high:
        return 1.0
    return max(
        C.OVERQUALIFIED_FLOOR,
        1.0 - C.OVERQUAL_PENALTY * (effective_years - high) / high,
    )


def transition_score(
    profile: NormalizedProfile, weights: np.ndarray, role: RoleDef, taxonomy: Taxonomy
) -> float:
    """Use the taxonomy's own career-transition edges.

    `adjacent_role_ids` is the most direct statement in the dataset about which
    moves are natural, so it gets its own term rather than being buried in
    text similarity.
    """
    total = 0.0
    for weight, exp in zip(weights, profile.experiences):
        if not exp.matched_role_id:
            continue
        source = taxonomy.role_by_id[exp.matched_role_id]
        if source.id == role.id:
            affinity = C.TRANSITION_SAME_ROLE
        elif role.id in source.adjacent_role_ids:
            affinity = C.TRANSITION_ADJACENT
        elif source.family == role.family:
            affinity = C.TRANSITION_SAME_FAMILY
        else:
            affinity = 0.0
        total += weight * affinity
    return min(1.0, total)


def industry_score(
    profile: NormalizedProfile, weights: np.ndarray, role: RoleDef, taxonomy: Taxonomy
) -> float:
    total = 0.0
    for weight, exp in zip(weights, profile.experiences):
        best = max(
            (
                industry_adjacency(taxonomy, exp.industry, industry)
                for industry in role.typical_industries
            ),
            default=0.0,
        )
        total += weight * best
    if set(role.typical_industries) & set(profile.preferred_industries):
        total += C.PREFERRED_INDUSTRY_BONUS
    return min(1.0, total)


def blend(similarity: float, fit: float, transition: float, industry: float) -> float:
    return (
        C.W_SIMILARITY * similarity
        + C.W_EXPERIENCE * fit
        + C.W_TRANSITION * transition
        + C.W_INDUSTRY * industry
    )


def score_roles(
    profile: NormalizedProfile,
    taxonomy: Taxonomy,
    corpus: RoleCorpus,
    profile_vector: sparse.csr_matrix,
    weights: np.ndarray,
) -> list[RoleScore]:
    """Score every role, best first. Ties break on role id so output is stable."""
    similarities = similarity_scores(profile_vector, corpus)
    scores = []
    for role in taxonomy.roles:
        similarity = float(similarities[corpus.index_of[role.id]])
        fit = experience_fit(profile.effective_years, role)
        transition = transition_score(profile, weights, role, taxonomy)
        industry = industry_score(profile, weights, role, taxonomy)
        scores.append(
            RoleScore(
                role_id=role.id,
                similarity=similarity,
                experience_fit=fit,
                transition=transition,
                industry=industry,
                final=blend(similarity, fit, transition, industry),
            )
        )
    scores.sort(key=lambda s: (-s.final, s.role_id))
    return scores
