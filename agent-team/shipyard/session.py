"""세션 드라이버 — 이벤트 스트림을 돌리고 호스트 사이드 툴 요청에 응답한다.

여기서 조심해야 할 것 세 가지.

**스트림 우선.** 스트림은 열린 뒤에 발생한 이벤트만 준다. 메시지를 먼저 보내고
스트림을 열면 초기 이벤트가 한 덩어리로 늦게 온다. 그래서 항상 스트림을 먼저 연다.

**스트림에는 재생이 없다.** 커스텀 툴 호출이 미해결인 채로 연결이 끊기면
세션은 교착된다 — 클라이언트가 끊겼으니 결과가 안 오고, 세션은 idle로 앉아 있는다.
그래서 (재)연결할 때마다 이벤트 목록을 다시 읽어 ID로 중복을 제거하고,
아직 답하지 않은 툴 호출이 있으면 그것부터 처리한다.

**HTTP 타임아웃은 벽시계가 아니다.** requests/httpx의 timeout은 청크 단위라
바이트가 계속 흘러오면 영원히 안 끝난다. SDK를 쓰되, 루프 차원에서
`time.monotonic()` 으로 별도의 마감을 둔다.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .config import Settings
from .gates import GateKind
from .tools import ToolDispatcher

#: 한 턴이 이만큼 넘어가면 뭔가 잘못된 것이다. 앱 전체 빌드는 여러 턴에 걸쳐 진행한다.
DEFAULT_TURN_TIMEOUT_S = 60 * 60


class SessionError(RuntimeError):
    pass


class BudgetReached(SessionError):
    """세션이 지출 상한에 걸려 멈췄다. 상한을 올리거나 없애야 계속된다."""


@dataclass
class TurnResult:
    stop_reason: str | None
    text: str
    tool_calls: int = 0
    thread_events: list[str] = field(default_factory=list)


class SessionDriver:
    def __init__(
        self,
        client: Any,
        settings: Settings,
        dispatcher: ToolDispatcher,
        session_id: str,
        on_event: Callable[[str], None] | None = None,
    ):
        self.client = client
        self.settings = settings
        self.dispatcher = dispatcher
        self.session_id = session_id
        self.on_event = on_event or (lambda line: None)
        self._seen: set[str] = set()

    # --- 세션 만들기 ---

    @classmethod
    def start(
        cls,
        client: Any,
        settings: Settings,
        dispatcher: ToolDispatcher,
        agent_id: str,
        title: str,
        first_message: str | None = None,
        on_event: Callable[[str], None] | None = None,
    ) -> "SessionDriver":
        kwargs: dict[str, Any] = {
            "agent": agent_id,
            "environment_id": settings.environment_id,
            "title": title,
        }
        if settings.repo_url:
            resource: dict[str, Any] = {
                "type": "github_repository",
                "url": settings.repo_url,
                "mount_path": settings.repo_mount_path,
                "branch": settings.repo_branch,
            }
            if settings.github_token:
                # git 프록시가 주입한다 — 샌드박스 안에서는 보이지 않는다.
                resource["authorization_token"] = settings.github_token
            kwargs["resources"] = [resource]
        if settings.session_budget_usd is not None:
            kwargs["budget"] = {
                "type": "limit",
                "max_list_cost": {
                    # 최소 단위(센트)의 정수 문자열.
                    "amount": str(int(round(settings.session_budget_usd * 100))),
                    "currency": "USD",
                },
            }
        if first_message:
            kwargs["initial_events"] = [
                {"type": "user.message", "content": [{"type": "text", "text": first_message}]}
            ]

        session = client.beta.sessions.create(**kwargs)
        driver = cls(client, settings, dispatcher, session.id, on_event)
        driver.on_event(f"세션 생성됨: {session.id} (status={session.status})")
        driver.on_event(f"트레이스: {settings.console_url(session.id)}")
        return driver

    # --- 한 턴 돌리기 ---

    def turn(self, message: str | None = None, timeout_s: int = DEFAULT_TURN_TIMEOUT_S) -> TurnResult:
        """메시지를 보내고 세션이 idle이 될 때까지 펌프한다.

        `message` 가 None이면 이미 진행 중인 작업을 이어서 펌프하기만 한다
        (initial_events 로 시작한 세션이나, 끊긴 연결을 이어붙일 때).
        """
        deadline = time.monotonic() + timeout_s
        transcript: list[str] = []
        threads: list[str] = []
        tool_call_count = 0
        stop_reason: str | None = None
        pending_message = message

        while True:
            if time.monotonic() > deadline:
                raise SessionError(f"턴이 {timeout_s}초를 넘겼다. 세션 {self.session_id} 를 직접 확인할 것.")

            # 재연결 시 놓친 것을 메운다. 스트림에는 재생이 없다.
            unresolved = self._unresolved_tool_calls()

            with self.client.beta.sessions.events.stream(session_id=self.session_id) as stream:
                if pending_message is not None:
                    self.client.beta.sessions.events.send(
                        session_id=self.session_id,
                        events=[
                            {
                                "type": "user.message",
                                "content": [{"type": "text", "text": pending_message}],
                            }
                        ],
                    )
                    pending_message = None

                pending_tools: list[Any] = list(unresolved)
                confirmations: list[dict[str, Any]] = []
                terminated = False

                for event in stream:
                    event_id = getattr(event, "id", None)
                    if event_id and event_id in self._seen:
                        continue
                    if event_id:
                        self._seen.add(event_id)

                    kind = getattr(event, "type", "")

                    if kind == "agent.message":
                        text = _text_of(event)
                        if text:
                            transcript.append(text)
                            self.on_event(text)
                    elif kind == "agent.custom_tool_use":
                        pending_tools.append(event)
                    elif kind in {"agent.tool_use", "agent.mcp_tool_use"}:
                        confirmation = self._maybe_confirm(event)
                        if confirmation:
                            confirmations.append(confirmation)
                    elif kind == "session.thread_created":
                        line = f"[스레드 생성] {getattr(event, 'name', '') or getattr(event, 'id', '')}"
                        threads.append(line)
                        self.on_event(line)
                    elif kind in {"agent.thread_message_sent", "agent.thread_message_received"}:
                        threads.append(kind)
                    elif kind == "session.error":
                        self.on_event(f"[세션 에러] {getattr(event, 'message', event)}")
                    elif kind == "session.status_idle":
                        stop_reason = getattr(event, "stop_reason", None)
                        break
                    elif kind == "session.status_terminated":
                        stop_reason = getattr(event, "stop_reason", "terminated")
                        terminated = True
                        break

            if stop_reason == "budget_reached" and not pending_tools and not confirmations:
                raise BudgetReached(
                    f"세션 {self.session_id} 가 지출 상한에 도달했다. "
                    "상한을 올리거나 없애야 이어서 진행할 수 있다."
                )

            if terminated:
                break

            outbound = list(confirmations)
            for call in pending_tools:
                result = self.dispatcher.dispatch(getattr(call, "name", ""), getattr(call, "input", {}) or {})
                tool_call_count += 1
                self.on_event(f"[툴] {getattr(call, 'name', '?')} → {'실패' if result.is_error else '완료'}")
                outbound.append(
                    {
                        "type": "user.custom_tool_result",
                        "custom_tool_use_id": call.id,
                        "content": [{"type": "text", "text": result.text}],
                        "is_error": result.is_error,
                    }
                )

            if not outbound:
                break

            self.client.beta.sessions.events.send(session_id=self.session_id, events=outbound)

        return TurnResult(
            stop_reason=stop_reason,
            text="\n".join(transcript),
            tool_calls=tool_call_count,
            thread_events=threads,
        )

    # --- 내부 ---

    def _maybe_confirm(self, event: Any) -> dict[str, Any] | None:
        """`always_ask` 정책이 걸린 서버 실행 툴에 응답한다.

        현재 매니페스트는 always_ask를 쓰지 않지만, 나중에 특정 툴(bash 등)에
        승인을 걸고 싶을 때 이 경로가 필요하다. 승인 정책이 없는 툴은 애초에
        여기로 오지 않으므로, 도달했다면 물어봐야 하는 것이다.
        """
        if not getattr(event, "requires_confirmation", False):
            return None
        decision = self.dispatcher.gate.ask(
            kind=GateKind.DECISION,
            summary=f"툴 실행 승인: {getattr(event, 'name', '?')}",
            detail=str(getattr(event, "input", ""))[:2000],
        )
        return {
            "type": "user.tool_confirmation",
            "tool_use_id": event.id,
            "result": "allow" if decision.approved else "deny",
            **({"message": decision.note} if decision.note and not decision.approved else {}),
        }

    def _unresolved_tool_calls(self) -> list[Any]:
        """아직 결과를 보내지 않은 커스텀 툴 호출을 이벤트 기록에서 찾는다."""
        try:
            page = self.client.beta.sessions.events.list(session_id=self.session_id)
        except Exception:  # 기록 조회 실패로 세션을 못 이어가게 하지는 않는다.
            return []

        calls: dict[str, Any] = {}
        answered: set[str] = set()
        for event in getattr(page, "data", []):
            kind = getattr(event, "type", "")
            event_id = getattr(event, "id", None)
            if kind == "agent.custom_tool_use" and event_id:
                calls[event_id] = event
            elif kind == "user.custom_tool_result":
                answered.add(getattr(event, "custom_tool_use_id", ""))

        unresolved = [ev for eid, ev in calls.items() if eid not in answered]
        for event in unresolved:
            # 아직 답하지 않았으므로 seen에서 빼서 다시 처리되게 한다.
            self._seen.discard(event.id)
        return unresolved


def _text_of(event: Any) -> str:
    parts = []
    for block in getattr(event, "content", []) or []:
        if getattr(block, "type", "") == "text":
            parts.append(getattr(block, "text", ""))
    return "".join(parts)
