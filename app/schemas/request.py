from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, model_validator

from app.engine import constants as C


class PastRole(BaseModel):
    title: str = Field(min_length=1, max_length=100, description="직무명")
    industry: str | None = Field(default=None, max_length=60, description="산업")
    start_date: date
    end_date: date | None = Field(default=None, description="비우면 재직 중")
    skills: list[str] = Field(default_factory=list, max_length=50)
    achievements: str = Field(default="", max_length=2000, description="주요 성과")

    @model_validator(mode="after")
    def _check_dates(self) -> "PastRole":
        if self.start_date > date.today():
            raise ValueError("입사일이 미래일 수 없습니다")
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("퇴사일이 입사일보다 빠를 수 없습니다")
        return self


class RecommendRequest(BaseModel):
    past_roles: list[PastRole] = Field(min_length=1, max_length=15)
    preferred_industries: list[str] = Field(default_factory=list, max_length=5)
    top_k: int = Field(default=C.DEFAULT_TOP_K, ge=1, le=C.MAX_TOP_K)
    include_current_role: bool = Field(
        default=False,
        description="현재 직무와 동일한 직무를 추천 목록에 포함할지 여부",
    )
