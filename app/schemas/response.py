from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ScoreBreakdown(BaseModel):
    similarity: float
    experience_fit: float
    transition: float
    industry: float
    contributions: dict[str, float] = Field(
        description="각 요소가 최종 점수에 기여한 값 (합계 = score/100)"
    )


class SkillItem(BaseModel):
    skill: str
    importance: float
    coverage: float
    evidence_skill: str | None = Field(
        default=None, description="부분 인정의 근거가 된 보유 스킬"
    )


class Recommendation(BaseModel):
    rank: int
    role_id: str
    title_ko: str
    title_en: str
    family: str
    seniority: str
    summary_ko: str
    typical_industries: list[str]
    score: float = Field(description="0-100. 절대 평가가 아닌 순위용 지표")
    readiness: float = Field(description="요구 역량 충족 비율 0-1")
    breakdown: ScoreBreakdown
    matched_skills: list[SkillItem]
    skill_gaps: list[SkillItem]
    explanation_ko: str
    explanation_bullets_ko: list[str]


class ExperienceSummary(BaseModel):
    title: str
    matched_role_id: str | None
    matched_title_ko: str | None
    industry: str | None
    years: float
    recognized_skills: list[str]


class ProfileSummary(BaseModel):
    total_years: float
    effective_years: float = Field(description="최근성으로 할인한 환산 경력")
    recognized_skills: list[str]
    unresolved_inputs: list[str] = Field(description="인식하지 못한 입력")
    experiences: list[ExperienceSummary]


class RecommendResponse(BaseModel):
    profile: ProfileSummary
    recommendations: list[Recommendation]
    generated_at: datetime
    engine_version: str


class RoleSummary(BaseModel):
    id: str
    title_ko: str
    title_en: str
    family: str
    seniority: str


class RoleDetail(RoleSummary):
    summary_ko: str
    required_skills: list[str]
    nice_to_have_skills: list[str]
    typical_industries: list[str]
    adjacent_role_ids: list[str]


class HealthResponse(BaseModel):
    status: str
    roles: int
    skills: int
    industries: int
    engine_version: str


class ErrorResponse(BaseModel):
    code: str
    message_ko: str
    detail: list[dict] | None = None
