"""The engine facade the API talks to.

Built once at application startup and then read-only: a request does vector
arithmetic and no disk I/O.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

from app.engine import constants as C
from app.engine.corpus import RoleCorpus, build_corpus
from app.engine.explain import build_explanation, weighted_contributions
from app.engine.features import build_profile_vector
from app.engine.gap import SkillAssessment, assess_role
from app.engine.loader import load_taxonomy
from app.engine.models import NormalizedProfile, Taxonomy
from app.engine.profile import normalize_profile
from app.engine.scoring import experience_weights, score_roles
from app.schemas.request import RecommendRequest
from app.schemas.response import (
    ExperienceSummary,
    ProfileSummary,
    Recommendation,
    RecommendResponse,
    RoleDetail,
    RoleSummary,
    ScoreBreakdown,
    SkillItem,
)


class Recommender:
    def __init__(self, taxonomy: Taxonomy, corpus: RoleCorpus) -> None:
        self.taxonomy = taxonomy
        self.corpus = corpus

    @classmethod
    def build(cls, data_path: Path) -> "Recommender":
        taxonomy = load_taxonomy(data_path)
        return cls(taxonomy, build_corpus(taxonomy))

    # --- queries ----------------------------------------------------------
    def list_roles(self) -> list[RoleSummary]:
        return [
            RoleSummary(
                id=role.id,
                title_ko=role.title_ko,
                title_en=role.title_en,
                family=role.family,
                seniority=role.seniority,
            )
            for role in self.taxonomy.roles
        ]

    def get_role(self, role_id: str) -> RoleDetail | None:
        role = self.taxonomy.role_by_id.get(role_id)
        if role is None:
            return None
        return RoleDetail(
            id=role.id,
            title_ko=role.title_ko,
            title_en=role.title_en,
            family=role.family,
            seniority=role.seniority,
            summary_ko=role.summary_ko,
            required_skills=list(role.required_skills),
            nice_to_have_skills=list(role.nice_to_have_skills),
            typical_industries=list(role.typical_industries),
            adjacent_role_ids=list(role.adjacent_role_ids),
        )

    def search_skills(self, query: str | None, limit: int) -> list[str]:
        skills = self.taxonomy.skills
        if not query:
            return list(skills[:limit])
        from app.engine.normalize import match_key

        needle = match_key(query)
        starts = [s for s in skills if match_key(s).startswith(needle)]
        contains = [
            s for s in skills if needle in match_key(s) and s not in starts
        ]
        return (starts + contains)[:limit]

    def list_industries(self) -> list[str]:
        return list(self.taxonomy.industries)

    # --- core -------------------------------------------------------------
    def build_profile(
        self, request: RecommendRequest, today: date | None = None
    ) -> NormalizedProfile:
        return normalize_profile(
            request.past_roles,
            request.preferred_industries,
            self.taxonomy,
            today or date.today(),
        )

    def recommend(
        self, request: RecommendRequest, today: date | None = None
    ) -> RecommendResponse:
        profile = self.build_profile(request, today)
        weights = experience_weights(profile)
        vector = build_profile_vector(profile, self.taxonomy, self.corpus, weights)
        scores = score_roles(profile, self.taxonomy, self.corpus, vector, weights)

        excluded = self._current_role_ids(profile) if not request.include_current_role else set()
        recommendations: list[Recommendation] = []
        for score in scores:
            if score.role_id in excluded:
                continue
            role = self.taxonomy.role_by_id[score.role_id]
            matched, gaps, readiness = assess_role(profile, role, self.taxonomy)
            headline, bullets = build_explanation(
                score, role, profile, matched, gaps, readiness
            )
            recommendations.append(
                Recommendation(
                    rank=len(recommendations) + 1,
                    role_id=role.id,
                    title_ko=role.title_ko,
                    title_en=role.title_en,
                    family=role.family,
                    seniority=role.seniority,
                    summary_ko=role.summary_ko,
                    typical_industries=list(role.typical_industries),
                    score=round(100 * score.final, 1),
                    readiness=round(readiness, 3),
                    breakdown=ScoreBreakdown(
                        similarity=round(score.similarity, 4),
                        experience_fit=round(score.experience_fit, 4),
                        transition=round(score.transition, 4),
                        industry=round(score.industry, 4),
                        contributions={
                            name: round(value, 4)
                            for name, value in weighted_contributions(score).items()
                        },
                    ),
                    matched_skills=_to_items(matched),
                    skill_gaps=_to_items(gaps),
                    explanation_ko=headline,
                    explanation_bullets_ko=bullets,
                )
            )
            if len(recommendations) >= request.top_k:
                break

        return RecommendResponse(
            profile=self.summarize(profile),
            recommendations=recommendations,
            generated_at=datetime.now(timezone.utc),
            engine_version=C.ENGINE_VERSION,
        )

    def summarize(self, profile: NormalizedProfile) -> ProfileSummary:
        return ProfileSummary(
            total_years=round(profile.total_years, 2),
            effective_years=round(profile.effective_years, 2),
            recognized_skills=sorted(profile.skills),
            unresolved_inputs=list(profile.unresolved_inputs),
            experiences=[
                ExperienceSummary(
                    title=exp.raw_title,
                    matched_role_id=exp.matched_role_id,
                    matched_title_ko=(
                        self.taxonomy.role_by_id[exp.matched_role_id].title_ko
                        if exp.matched_role_id
                        else None
                    ),
                    industry=exp.industry,
                    years=round(exp.years, 2),
                    recognized_skills=list(exp.skills),
                )
                for exp in profile.experiences
            ],
        )

    def _current_role_ids(self, profile: NormalizedProfile) -> set[str]:
        """The role the user most recently held, which they already have."""
        candidates = [
            exp for exp in profile.experiences if exp.matched_role_id is not None
        ]
        if not candidates:
            return set()
        most_recent = min(candidates, key=lambda exp: exp.months_since_end)
        return {most_recent.matched_role_id}  # type: ignore[arg-type]


def _to_items(assessments: list[SkillAssessment]) -> list[SkillItem]:
    return [
        SkillItem(
            skill=a.skill,
            importance=a.importance,
            coverage=round(a.coverage, 3),
            evidence_skill=a.evidence_skill if a.evidence_skill != a.skill else None,
        )
        for a in assessments
    ]
