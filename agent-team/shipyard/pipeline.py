"""릴리스 상태 머신.

한 릴리스 = 한 세션이다. 단계마다 세션을 새로 만들지 않는 이유는 두 가지다:
컨테이너 파일시스템이 유지되어야 하고(코드가 거기 있다), 서브에이전트 스레드가
유지되어야 한다(리뷰어가 앞서 본 코드를 기억한다).

단계는 코디네이터에게 보내는 `user.message` 한 번씩이다. 오케스트레이션 코드가
에이전트를 대신해 계획을 세우지 않는다 — 그건 Showrunner의 일이다. 이 파일이
소유하는 것은 **순서와 게이트**뿐이다.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Callable

from .gates import Gate, GateKind
from .journal import Journal
from .session import SessionDriver, TurnResult


class Stage(str, Enum):
    DISCOVERY = "discovery"
    SPEC = "spec"
    IMPLEMENT = "implement"
    HARDEN = "harden"
    COMPLIANCE = "compliance"
    RELEASE_PREP = "release_prep"
    BINARY = "binary"
    SUBMIT = "submit"


@dataclass(frozen=True)
class StageSpec:
    stage: Stage
    title: str
    brief: str
    gate: GateKind | None = None
    gate_summary: str = ""


DOCS = "/workspace/app/docs"

STAGES: tuple[StageSpec, ...] = (
    StageSpec(
        stage=Stage.DISCOVERY,
        title="발견 — 아이디어를 요구사항으로",
        brief=(
            "이번 릴리스의 아이디어는 다음과 같다.\n\n"
            "{idea}\n\n"
            "대상 플랫폼: {platforms}\n\n"
            "Product Strategist에게 이 아이디어를 넘겨 경쟁 조사와 범위 확정을 시켜라. "
            f"결과는 {DOCS}/product-brief.md 다.\n"
            "브리프가 돌아오면 네가 직접 읽고 검증해라. 특히 다음을 확인한다:\n"
            "- v1 범위가 실제로 잘려 있는가, 아니면 아이디어를 그대로 옮겨 적었는가\n"
            "- '결정 필요:' 로 남은 항목이 무엇인가\n"
            "- 스토어 심사에 걸릴 요소가 표시되어 있는가\n\n"
            "그다음 기술 스택을 확정해서 "
            f"{DOCS}/architecture.md 에 직접 써라. 기본 전제는 "
            "React Native + Expo(TypeScript)이고, 백엔드가 필요하면 Supabase다. "
            "이 전제를 바꿀 이유가 있으면 그 이유를 문서에 남겨라."
        ),
    ),
    StageSpec(
        stage=Stage.SPEC,
        title="설계 — 화면과 데이터",
        brief=(
            "제품 브리프가 확정됐다. 이제 구현 가능한 스펙을 만든다.\n\n"
            "UX Designer에게 화면 스펙과 디자인 토큰을 맡겨라 "
            f"({DOCS}/product-brief.md 를 읽게 하고, 결과는 {DOCS}/screens.md 와 "
            f"{DOCS}/design-tokens.md).\n"
            "백엔드가 필요하면 Backend Engineer에게 데이터 모델 설계를 동시에 맡겨라 — "
            "화면 스펙과 데이터 모델은 서로 독립적으로 시작할 수 있다.\n\n"
            "둘이 돌아오면 네가 대조한다. 화면이 요구하는 데이터가 모델에 다 있는지, "
            "모델에 있는데 아무 화면도 쓰지 않는 필드가 있는지. 불일치는 지금 잡는 게 "
            "구현 후에 잡는 것보다 스무 배 싸다.\n\n"
            f"마지막으로 {DOCS}/release-log.md 를 만들어 지금까지의 결정을 기록해라. "
            "다음 단계는 사람의 승인을 받아야 시작된다."
        ),
    ),
    StageSpec(
        stage=Stage.IMPLEMENT,
        title="구현",
        gate=GateKind.CONCEPT,
        gate_summary="컨셉과 스펙 승인 — 이 시점 이후로는 실제 구현 비용이 발생한다",
        brief=(
            "스펙이 승인됐다. 구현을 시작해라.\n\n"
            "먼저 프로젝트 스캐폴드를 네가 직접 세워라 (Expo 프로젝트 초기화, TypeScript 설정, "
            "린트, 디렉터리 구조, 네비게이션 뼈대). 이건 위임하기엔 너무 얽혀 있다.\n\n"
            "그다음 화면을 RN Engineer들에게 나눠라. 중요한 규칙:\n"
            "- **파일 범위가 겹치지 않게 나눠라.** 같은 컨테이너 파일시스템을 공유한다.\n"
            "- 각 작업에 읽을 스펙 경로, 손댈 파일 범위, 완료 기준을 명시해라.\n"
            "- 독립적인 화면은 동시에 스폰해라. 순서에 의존하는 것만 순서대로.\n"
            "- 공유 컴포넌트는 네가 먼저 만들어라. 여러 명이 각자 만들면 세 벌이 생긴다.\n\n"
            "백엔드가 있으면 Backend Engineer에게 두 가지를 맡겨라: (1) 마이그레이션과 RLS 정책, "
            "(2) 위 '연결 계약'에 적힌 그대로의 클라이언트 배선. 계약의 파일 경로와 환경변수 "
            "이름을 작업 지시에 그대로 옮겨 적어라 — 서브에이전트는 그 계약문을 보지 못했다.\n\n"
            "각 엔지니어가 돌아올 때마다 typecheck를 네가 직접 돌려 확인해라. "
            "'통과했다'는 보고를 믿지 마라."
        ),
    ),
    StageSpec(
        stage=Stage.HARDEN,
        title="검증 — 리뷰와 테스트",
        brief=(
            "구현이 끝났다. 이제 굳힌다.\n\n"
            "1. Code Reviewer **2~3명을 동시에** 스폰해서 같은 변경을 독립적으로 보게 해라. "
            "각각에게 볼 파일 목록과 지켜져야 할 불변조건을 줘라. "
            "돌아온 발견을 합치고 중복을 제거한 뒤, **각 발견을 코드에서 직접 확인하고** "
            "고칠지 판단해라. 리뷰어가 틀릴 수도 있다.\n\n"
            "2. Test Engineer에게 테스트를 맡겨라. 정상 경로보다 빈 상태·에러·오프라인·"
            "권한 거부를 더 촘촘히 요구해라.\n\n"
            "3. 테스트가 빨간 채로 이 단계를 끝내지 마라. 못 고치는 게 있으면 "
            f"{DOCS}/release-log.md 에 무엇이 왜 막혔는지 적어라.\n\n"
            "리뷰 발견을 고치느라 새 기능을 추가하지 마라. 범위는 브리프에 고정돼 있다."
        ),
    ),
    StageSpec(
        stage=Stage.COMPLIANCE,
        title="심사 대비",
        brief=(
            "Store Compliance에게 코드베이스 전체를 검증시켜라. "
            f"결과는 {DOCS}/compliance-report.md 다.\n\n"
            "보고서가 오면 BLOCKER부터 처리한다. 각 BLOCKER마다:\n"
            "- 코드 수정이 필요하면 해당 엔지니어에게 구체적인 작업으로 넘겨라\n"
            "- 정보가 필요한 것(개인정보처리방침 URL, 지원 연락처, 연령 등급)은 "
            "request_human_decision 으로 사람에게 물어라 — 네가 지어내면 안 된다\n\n"
            "RISK 항목은 판단해서 처리하거나, 감수하기로 했다면 그 이유를 릴리스 로그에 남겨라.\n\n"
            "BLOCKER가 남은 상태로 다음 단계로 넘어가지 마라."
        ),
    ),
    StageSpec(
        stage=Stage.RELEASE_PREP,
        title="출시 준비 — 설정과 리스팅",
        brief=(
            "이제 스토어에 올릴 준비를 한다. 두 갈래를 동시에 진행해라.\n\n"
            "Release Engineer: app.json/app.config, eas.json, 버전과 빌드 번호, 아이콘과 "
            "스플래시, 권한 문자열. 빌드 번호는 단조 증가여야 한다.\n\n"
            "Store Copywriter: 대상 스토어와 언어별 리스팅. 글자 수 제한을 지키고, "
            "제품 브리프에 없는 기능을 광고하지 않게 해라. "
            "컴플라이언스 보고서의 개인정보 라벨 초안도 넘겨줘라.\n\n"
            "둘이 돌아오면 대조해라: 리스팅의 앱 이름과 app.json의 이름이 같은가, "
            "스크린샷 요구 규격이 준비됐는가, 개인정보처리방침 URL이 실제로 열리는가.\n\n"
            "다음 단계에서 실제 빌드를 트리거한다 — 돈이 든다."
        ),
    ),
    StageSpec(
        stage=Stage.BINARY,
        title="바이너리 빌드",
        brief=(
            "설정이 준비됐다. production 프로파일로 빌드를 트리거해라.\n\n"
            "`trigger_build` 로 요청하고 `get_build_status` 로 결과를 확인해라. "
            "빌드는 비동기다 — 상태를 확인하는 사이에 다른 일을 해도 된다.\n\n"
            "빌드가 실패하면 로그를 읽고 원인을 짚어라. 흔한 원인:\n"
            "- config plugin이 필요한 네이티브 의존성을 Expo Go 전제로 넣음\n"
            "- 아이콘/스플래시 규격 불일치\n"
            "- 번들 ID 불일치, 프로비저닝 프로파일 부재\n"
            "고칠 수 있는 것은 Release Engineer에게 넘기고 다시 빌드해라. "
            "**같은 실패로 세 번 이상 재시도하지 마라** — 그때는 사람에게 물어라.\n\n"
            "빌드가 성공하면 build_id를 릴리스 로그에 기록해라."
        ),
    ),
    StageSpec(
        stage=Stage.SUBMIT,
        title="스토어 제출",
        gate=GateKind.BUILD,
        gate_summary="제출 단계 진입 — 다음은 실제 스토어 업로드다",
        brief=(
            "마지막 단계다. 제출 전 점검을 네가 직접 해라. 서브에이전트 보고가 아니라 "
            "파일과 명령 출력으로 확인한다:\n\n"
            "1. 컴플라이언스 보고서에 BLOCKER가 없다\n"
            "2. 테스트가 초록이다 (직접 돌려서 확인)\n"
            "3. 스토어 리스팅 파일이 전부 있고 글자 수 제한 안이다\n"
            "4. 빌드가 성공했고 build_id가 있다\n"
            "5. 빌드 번호가 지난 제출보다 크다\n\n"
            "하나라도 안 되면 제출하지 말고 그것부터 처리해라.\n\n"
            "전부 확인되면 `submit_to_store` 를 호출해라. **첫 출시는 production이 아니라 "
            "internal 트랙부터 밟는 것을 권한다** — 실제 기기에서 한 번 열어보지 않고 "
            "심사에 넣는 것은 도박이다. 사람이 다르게 지시하면 따라라.\n\n"
            "제출 요청의 readiness_evidence 에는 위 다섯 가지를 구체적인 값으로 적어라. "
            "사람이 승인 화면에서 그것만 보고 판단한다."
        ),
    ),
)

STAGE_INDEX = {spec.stage: i for i, spec in enumerate(STAGES)}


def render_brief(spec: StageSpec, idea: str, platforms: str) -> str:
    """브리프의 자리표시자를 채운다.

    `str.format` 을 쓰지 않는 것은 의도적이다. 브리프에는 코드 조각이나 JSON이
    들어갈 수 있고, 거기 중괄호가 하나만 있어도 format은 KeyError로 터진다.
    자리표시자가 두 개뿐인데 그런 함정을 남길 이유가 없다.
    """
    return spec.brief.replace("{idea}", idea).replace("{platforms}", platforms)


@dataclass
class PipelineResult:
    completed: list[Stage]
    stopped_at: Stage | None
    reason: str | None


class ReleasePipeline:
    """단계를 순서대로 돌리고, 게이트에서 멈춘다."""

    def __init__(
        self,
        driver: SessionDriver,
        gate: Gate,
        journal: Journal,
        run_id: str,
        on_stage: Callable[[StageSpec], None] | None = None,
    ):
        self.driver = driver
        self.gate = gate
        self.journal = journal
        self.run_id = run_id
        self.on_stage = on_stage or (lambda spec: None)

    def run(
        self,
        idea: str,
        platforms: str,
        start: Stage = Stage.DISCOVERY,
        stop_after: Stage | None = None,
        context: str = "",
    ) -> PipelineResult:
        """`context` 는 이미 존재하는 인프라 같은 프로젝트 사실이며, 첫 브리프에 한 번 얹힌다.

        매 단계마다 반복해서 넣지 않는 이유는 캐시다 — 같은 세션에서 프리픽스가
        유지될수록 캐시가 살아 있고, Showrunner는 자기 대화 안에서 이미 그것을 본다.
        서브에이전트에게 전달하는 것은 Showrunner의 책임이며 시스템 프롬프트에 명시돼 있다.
        """
        completed: list[Stage] = []
        first_brief = True
        start_at = STAGE_INDEX[start]
        stop_at = STAGE_INDEX[stop_after] if stop_after else len(STAGES) - 1

        for spec in STAGES[start_at : stop_at + 1]:
            if spec.gate is not None:
                decision = self.gate.ask(spec.gate, summary=spec.gate_summary or spec.title)
                if not decision.approved:
                    self.journal.set_stage(self.run_id, spec.stage.value, "gate_denied", decision.note)
                    return PipelineResult(completed, spec.stage, decision.note or "게이트에서 거절됨")

            self.on_stage(spec)
            self.journal.set_stage(self.run_id, spec.stage.value, "running")

            brief = render_brief(spec, idea, platforms)
            if first_brief and context:
                brief = f"{context}\n\n---\n\n{brief}"
            first_brief = False

            result: TurnResult = self.driver.turn(brief)

            self.journal.set_stage(
                self.run_id,
                spec.stage.value,
                "done",
                f"stop_reason={result.stop_reason} tool_calls={result.tool_calls}",
            )
            completed.append(spec.stage)

        return PipelineResult(completed, None, None)
