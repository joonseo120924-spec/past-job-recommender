"""호스트 사이드 커스텀 툴.

왜 이 툴들이 샌드박스가 아니라 여기 있는가:

CI 트리거와 스토어 제출에는 서명 키, 스토어 서비스 계정, CI 토큰이 필요하다.
그것들을 샌드박스에 넣으면, 에이전트가 쓴 코드가 그 컨테이너 안에서 실행되는 순간
크리덴셜은 그 코드의 사정권 안에 들어간다. 대신 에이전트는 `agent.custom_tool_use`를
내보내고, 이미 크리덴셜을 쥐고 있는 컨트롤 플레인이 실행한 뒤
`user.custom_tool_result`로 결과만 돌려준다. 샌드박스는 비밀을 본 적이 없다.

두 번째 이유는 게이트다. 스토어 제출은 되돌리기 어렵다. 호스트 사이드 툴이면
실행 직전에 사람의 승인을 끼워 넣을 자리가 생긴다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable

from ..config import Settings
from ..gates import Gate, GateDecision, GateKind
from ..journal import Journal
from . import ci, stores

#: 커스텀 툴 스키마의 단일 원본. 에이전트 매니페스트는 이름으로만 참조한다.
TOOL_SCHEMAS: dict[str, dict[str, Any]] = {
    "trigger_build": {
        "name": "trigger_build",
        "description": (
            "외부 CI에 앱 바이너리 빌드를 요청한다. 이 컨테이너는 리눅스라 iOS 빌드를 "
            "직접 할 수 없으므로, 빌드는 항상 이 툴을 거친다. 즉시 반환되며 빌드는 "
            "비동기로 돈다 — get_build_status로 결과를 확인해야 한다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "platform": {
                    "type": "string",
                    "enum": ["ios", "android", "both"],
                    "description": "빌드할 플랫폼",
                },
                "profile": {
                    "type": "string",
                    "enum": ["preview", "production"],
                    "description": (
                        "preview는 내부 배포용, production은 스토어 제출용. "
                        "제출 전에는 반드시 production으로 한 번 더 빌드한다."
                    ),
                },
                "commit_ref": {
                    "type": "string",
                    "description": "빌드할 git ref. 생략하면 설정된 기본 브랜치.",
                },
                "reason": {
                    "type": "string",
                    "description": "이 빌드를 요청하는 이유 한 줄. 기록에 남는다.",
                },
            },
            "required": ["platform", "profile", "reason"],
            "additionalProperties": False,
        },
    },
    "get_build_status": {
        "name": "get_build_status",
        "description": (
            "trigger_build가 돌려준 build_id의 현재 상태를 조회한다. "
            "queued / running / success / failure 중 하나와, 실패했으면 로그 요약을 준다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "build_id": {"type": "string", "description": "trigger_build가 반환한 ID"},
            },
            "required": ["build_id"],
            "additionalProperties": False,
        },
    },
    "submit_to_store": {
        "name": "submit_to_store",
        "description": (
            "빌드된 바이너리를 App Store Connect 또는 Google Play에 업로드한다. "
            "되돌리기 어려운 행동이며 반드시 사람의 승인을 거친다. "
            "호출하기 전에 컴플라이언스 보고서에 BLOCKER가 없고, 테스트가 초록이고, "
            "스토어 리스팅이 완성됐는지 확인할 것."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "platform": {"type": "string", "enum": ["ios", "android"]},
                "build_id": {"type": "string", "description": "성공한 production 빌드의 ID"},
                "track": {
                    "type": "string",
                    "enum": ["internal", "beta", "production"],
                    "description": (
                        "internal/beta는 내부·외부 테스터용, production은 심사 제출. "
                        "첫 출시는 internal부터 밟는 것을 권한다."
                    ),
                },
                "release_notes": {"type": "string", "description": "이 버전의 릴리스 노트"},
                "readiness_evidence": {
                    "type": "string",
                    "description": (
                        "제출 준비가 됐다는 근거. 컴플라이언스 보고서 상태, 테스트 결과, "
                        "빌드 번호를 구체적으로 적는다. 사람이 승인 화면에서 이걸 읽는다."
                    ),
                },
            },
            "required": ["platform", "build_id", "track", "release_notes", "readiness_evidence"],
            "additionalProperties": False,
        },
    },
    "request_human_decision": {
        "name": "request_human_decision",
        "description": (
            "사람의 판단이 필요한 갈림길에서 결정을 요청한다. 선택지와 각각의 결과를 "
            "같이 제시해야 한다. 네가 결정할 수 있는 것은 물어보지 마라 — 매번 물으면 병목이 된다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "결정해야 할 것 한 문장"},
                "options": {
                    "type": "array",
                    "description": "고를 수 있는 선택지들. 각각에 그것을 골랐을 때의 결과를 붙인다.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string", "description": "선택지 이름"},
                            "consequence": {"type": "string", "description": "이걸 고르면 무슨 일이 일어나는지"},
                        },
                        "required": ["label", "consequence"],
                        "additionalProperties": False,
                    },
                    "minItems": 2,
                },
                "context": {"type": "string", "description": "결정에 필요한 배경. 사람은 네 대화를 보지 않았다."},
                "recommendation": {"type": "string", "description": "네 추천과 그 이유"},
            },
            "required": ["question", "options", "context", "recommendation"],
            "additionalProperties": False,
        },
    },
}


def custom_tool_definitions(names: list[str]) -> list[dict[str, Any]]:
    """매니페스트의 `custom_tools:` 이름 목록을 API 툴 정의로 펼친다."""
    unknown = [n for n in names if n not in TOOL_SCHEMAS]
    if unknown:
        raise KeyError(f"알 수 없는 커스텀 툴: {unknown}. 정의는 shipyard/tools/__init__.py 에 있다.")
    return [{"type": "custom", **TOOL_SCHEMAS[n]} for n in names]


@dataclass
class ToolResult:
    """커스텀 툴 실행 결과. `is_error`는 에이전트에게 그대로 전달된다."""

    text: str
    is_error: bool = False


class ToolDispatcher:
    """`agent.custom_tool_use` 이벤트를 실제 실행으로 연결한다.

    실행 전후로 저널에 남기고, 게이트가 필요한 툴은 게이트를 통과시킨다.
    """

    def __init__(self, settings: Settings, gate: Gate, journal: Journal, run_id: str):
        self.settings = settings
        self.gate = gate
        self.journal = journal
        self.run_id = run_id
        self._handlers: dict[str, Callable[[dict[str, Any]], ToolResult]] = {
            "trigger_build": self._trigger_build,
            "get_build_status": self._get_build_status,
            "submit_to_store": self._submit_to_store,
            "request_human_decision": self._request_human_decision,
        }

    def dispatch(self, name: str, tool_input: dict[str, Any]) -> ToolResult:
        handler = self._handlers.get(name)
        if handler is None:
            return ToolResult(f"알 수 없는 툴: {name}", is_error=True)

        self.journal.record_tool_call(self.run_id, name, tool_input)
        try:
            result = handler(tool_input)
        except Exception as exc:  # 툴 실패로 세션을 죽이지 않는다 — 에이전트가 대응하게 한다.
            result = ToolResult(f"{name} 실행 실패: {exc}", is_error=True)
        self.journal.record_tool_result(self.run_id, name, result.text, result.is_error)
        return result

    # --- 개별 툴 ---

    def _trigger_build(self, args: dict[str, Any]) -> ToolResult:
        decision = self.gate.ask(
            GateKind.BUILD,
            summary=f"{args['platform']} / {args['profile']} 빌드 트리거",
            detail=args.get("reason", ""),
        )
        if not decision.approved:
            return ToolResult(f"사람이 빌드를 거절했다: {decision.note or '사유 없음'}", is_error=True)

        build = ci.trigger(
            self.settings,
            platform=args["platform"],
            profile=args["profile"],
            commit_ref=args.get("commit_ref"),
        )
        return ToolResult(
            f"빌드 요청됨. build_id={build.build_id} backend={build.backend}\n"
            f"{build.detail}\n"
            "빌드는 비동기다. get_build_status로 확인할 것."
        )

    def _get_build_status(self, args: dict[str, Any]) -> ToolResult:
        status = ci.status(self.settings, args["build_id"])
        payload = {
            "build_id": status.build_id,
            "state": status.state,
            "url": status.url,
            "detail": status.detail,
        }
        return ToolResult(json.dumps(payload, ensure_ascii=False, indent=2))

    def _submit_to_store(self, args: dict[str, Any]) -> ToolResult:
        # 이 게이트는 auto_approve_gates를 무시한다 — gates.py 참고.
        decision = self.gate.ask(
            GateKind.STORE_SUBMISSION,
            summary=f"{args['platform']} → {args['track']} 제출 (build {args['build_id']})",
            detail=(
                f"릴리스 노트:\n{args['release_notes']}\n\n"
                f"에이전트가 제시한 준비 근거:\n{args['readiness_evidence']}"
            ),
        )
        if not decision.approved:
            return ToolResult(
                f"사람이 제출을 승인하지 않았다: {decision.note or '사유 없음'}. "
                "제출하지 말고 지적된 부분을 처리할 것.",
                is_error=True,
            )

        outcome = stores.submit(
            self.settings,
            platform=args["platform"],
            build_id=args["build_id"],
            track=args["track"],
        )
        return ToolResult(outcome)

    def _request_human_decision(self, args: dict[str, Any]) -> ToolResult:
        options = "\n".join(
            f"  {i + 1}. {o['label']} — {o['consequence']}" for i, o in enumerate(args["options"])
        )
        decision = self.gate.ask(
            GateKind.DECISION,
            summary=args["question"],
            detail=f"{args['context']}\n\n선택지:\n{options}\n\n에이전트 추천: {args['recommendation']}",
            free_text=True,
        )
        if decision.note:
            return ToolResult(f"사람의 결정: {decision.note}")
        chosen = "승인(추천안대로 진행)" if decision.approved else "거절"
        return ToolResult(f"사람의 결정: {chosen}")


__all__ = [
    "TOOL_SCHEMAS",
    "ToolDispatcher",
    "ToolResult",
    "custom_tool_definitions",
]
