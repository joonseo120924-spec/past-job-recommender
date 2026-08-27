"""휴먼 게이트.

자율성의 문제는 "에이전트가 사람을 대체하느냐"가 아니라 "어디서 멈추느냐"다.
이 팀은 네 지점에서 멈춘다.

| 게이트 | 언제 | 왜 |
|---|---|---|
| CONCEPT | 스펙 확정 후, 구현 시작 전 | 잘못된 걸 잘 만드는 게 제일 비싸다 |
| BUILD | CI 트리거 직전 | 돈이 들고, 빌드 큐를 점유한다 |
| STORE_SUBMISSION | 스토어 업로드 직전 | **되돌릴 수 없다** |
| DECISION | 에이전트가 판단을 못 할 때 | 갈림길 |

STORE_SUBMISSION 은 `auto_approve_gates` 를 무시한다. 자동 승인은 개발 편의를 위한
장치지, 실제 사용자에게 앱을 내보내는 결정까지 위임하라는 뜻이 아니다.
이 예외를 설정으로 끌 수 있게 만들지 않은 것은 의도적이다.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from enum import Enum
from typing import Callable

from .config import Settings


class GateKind(str, Enum):
    CONCEPT = "concept"
    BUILD = "build"
    STORE_SUBMISSION = "store_submission"
    DECISION = "decision"


#: 자동 승인이 절대 적용되지 않는 게이트.
IRREVERSIBLE: frozenset[GateKind] = frozenset({GateKind.STORE_SUBMISSION})


@dataclass
class GateDecision:
    approved: bool
    note: str | None = None
    automatic: bool = False


class GateDenied(Exception):
    """게이트에서 사람이 거절했고, 그대로 진행할 수 없을 때."""


class Gate:
    """터미널로 사람에게 묻는다.

    비대화형 환경(CI, 데몬)에서는 `prompt` 를 갈아끼워 Slack·웹훅·웹 UI로 보낼 수 있다.
    기본 구현이 터미널인 것은 이 팀이 아직 사람 옆에서 돌기 때문이다.
    """

    def __init__(
        self,
        settings: Settings,
        prompt: Callable[[str], str] | None = None,
        on_record: Callable[[GateKind, GateDecision, str], None] | None = None,
    ):
        self.settings = settings
        self._prompt = prompt or self._terminal_prompt
        self._on_record = on_record

    def ask(
        self,
        kind: GateKind,
        summary: str,
        detail: str = "",
        free_text: bool = False,
    ) -> GateDecision:
        decision = self._decide(kind, summary, detail, free_text)
        if self._on_record:
            self._on_record(kind, decision, summary)
        return decision

    def _decide(
        self, kind: GateKind, summary: str, detail: str, free_text: bool
    ) -> GateDecision:
        if self.settings.auto_approve_gates and kind not in IRREVERSIBLE:
            return GateDecision(approved=True, note="자동 승인", automatic=True)

        if not sys.stdin.isatty():
            # 물어볼 사람이 없는데 되돌릴 수 없는 일을 하지는 않는다.
            return GateDecision(
                approved=False,
                note=(
                    "비대화형 환경이라 승인을 받을 수 없었다. "
                    "터미널에서 다시 실행하거나 Gate.prompt를 비동기 채널로 교체할 것."
                ),
            )

        banner = f"\n{'=' * 72}\n[게이트: {kind.value}] {summary}\n{'=' * 72}"
        if detail:
            banner += f"\n{detail}\n"
        if kind in IRREVERSIBLE:
            banner += "\n※ 이 행동은 되돌릴 수 없다. 자동 승인이 적용되지 않는다.\n"

        print(banner)
        if free_text:
            answer = self._prompt("결정을 적어라 (빈 줄이면 거절): ").strip()
            return GateDecision(approved=bool(answer), note=answer or None)

        answer = self._prompt("승인하려면 'y', 거절하려면 사유를 적어라: ").strip()
        if answer.lower() in {"y", "yes"}:
            return GateDecision(approved=True)
        return GateDecision(approved=False, note=answer or "사유 없이 거절")

    @staticmethod
    def _terminal_prompt(message: str) -> str:
        try:
            return input(message)
        except EOFError:
            return ""
