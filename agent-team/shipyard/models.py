"""모델 ID와 역할별 배치.

레포의 `app/engine/constants.py`와 같은 원칙이다 — 튜닝 가능한 값은 한 파일에 모은다.

모델을 세션 중간에 바꾸면 프롬프트 캐시가 통째로 깨진다. 그래서 "싼 모델로 갈아타기"는
하지 않고, 대신 **싼 모델로 도는 서브에이전트를 따로 스폰**한다. 각 로스터 멤버는
자기 모델로 돌고 자기 요율로 과금되므로, 코디네이터는 Opus를 유지한 채
읽기 위주의 작업만 Sonnet 쪽으로 넘길 수 있다.
"""

from __future__ import annotations

from typing import Final, Literal

OPUS: Final = "claude-opus-5"
SONNET: Final = "claude-sonnet-5"
HAIKU: Final = "claude-haiku-4-5"

#: 문서에 적힌 공개 요율 (USD / 1M 토큰). 예산 추정에만 쓰고, 청구의 진실은 세션의
#: `usage.list_cost`다 — 이 표는 사람이 계획을 세울 때 보는 용도다.
LIST_PRICE_PER_MTOK: Final[dict[str, tuple[float, float]]] = {
    OPUS: (5.0, 25.0),
    SONNET: (2.0, 10.0),
    HAIKU: (1.0, 5.0),
}

Effort = Literal["low", "medium", "high", "xhigh", "max"]

#: 매니페스트에서 `model: opus` 처럼 짧게 쓰기 위한 별칭.
MODEL_ALIASES: Final[dict[str, str]] = {
    "opus": OPUS,
    "sonnet": SONNET,
    "haiku": HAIKU,
}


def resolve_model(value: str | dict) -> str | dict:
    """매니페스트의 `model` 값을 실제 모델 ID로 푼다.

    문자열이면 별칭 테이블을 거치고, 객체면 `id` 필드만 푼다 —
    `speed` / `effort` / `inference_geo` 같은 나머지 필드는 그대로 통과시킨다.
    알 수 없는 값은 조용히 통과시키지 않고 그대로 두어, API가 거절하게 한다.
    별칭을 놓친 것과 새 모델 ID를 직접 쓴 것을 여기서 구분할 방법이 없기 때문이다.
    """
    if isinstance(value, str):
        return MODEL_ALIASES.get(value, value)
    if isinstance(value, dict) and "id" in value:
        return {**value, "id": MODEL_ALIASES.get(value["id"], value["id"])}
    return value


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    """공개 요율 기준 추정 비용. 캐시 할인은 반영하지 않으므로 항상 상한선이다."""
    if model not in LIST_PRICE_PER_MTOK:
        return 0.0
    in_rate, out_rate = LIST_PRICE_PER_MTOK[model]
    return (input_tokens * in_rate + output_tokens * out_rate) / 1_000_000
