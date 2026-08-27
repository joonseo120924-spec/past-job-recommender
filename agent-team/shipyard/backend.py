"""백엔드(Supabase) 연결.

에이전트에게 "Supabase를 쓰라"고만 말하면 팀은 매번 다르게 배선한다 — 어떤 실행에서는
`lib/supabase.ts`, 다른 실행에서는 `services/db.ts`, 환경변수 이름도 제각각.
그래서 여기서 **연결 계약**을 못박는다: 파일 경로, 환경변수 이름, 클라이언트 초기화 형태.

또 하나: 프로젝트의 인증 설정(어떤 로그인 방식이 켜져 있는지, 이메일 확인이 필요한지)을
실행 시점에 조회해서 넘긴다. 이 값을 문서에 박아두면 콘솔에서 설정이 바뀐 순간
팀이 낡은 정보로 화면을 설계하게 된다. 조회에 실패해도 릴리스를 막지는 않는다 —
사실이 하나 줄어들 뿐이다.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Callable

from .config import Settings

#: 앱 코드가 반드시 따라야 하는 연결 계약.
CLIENT_PATH = "lib/supabase.ts"
ENV_URL = "EXPO_PUBLIC_SUPABASE_URL"
ENV_KEY = "EXPO_PUBLIC_SUPABASE_ANON_KEY"

Fetcher = Callable[[str, dict[str, str]], dict]


@dataclass
class BackendFacts:
    """실행 시점에 확인한 프로젝트 설정."""

    reachable: bool
    providers: list[str] = field(default_factory=list)
    anonymous_signin: bool = False
    signup_disabled: bool = False
    email_confirmation_required: bool = False
    error: str | None = None


def _default_fetcher(url: str, headers: dict[str, str]) -> dict:
    request = urllib.request.Request(url)
    for key, value in headers.items():
        request.add_header(key, value)
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read())


def probe(settings: Settings, fetcher: Fetcher | None = None) -> BackendFacts:
    """프로젝트가 살아 있는지, 인증이 어떻게 설정돼 있는지 확인한다."""
    if not (settings.supabase_url and settings.supabase_publishable_key):
        return BackendFacts(reachable=False, error="Supabase가 설정되지 않았다")

    fetch = fetcher or _default_fetcher
    try:
        data = fetch(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/settings",
            {"apikey": settings.supabase_publishable_key},
        )
    except urllib.error.HTTPError as exc:
        return BackendFacts(reachable=False, error=f"HTTP {exc.code} — 키나 URL을 확인할 것")
    except Exception as exc:
        return BackendFacts(reachable=False, error=str(exc))

    external = data.get("external", {}) or {}
    return BackendFacts(
        reachable=True,
        providers=sorted(k for k, v in external.items() if v is True and k != "anonymous_users"),
        anonymous_signin=bool(external.get("anonymous_users")),
        signup_disabled=bool(data.get("disable_signup")),
        email_confirmation_required=data.get("mailer_autoconfirm") is False,
    )


def render_context(settings: Settings, facts: BackendFacts | None = None) -> str:
    """세션에 넘길 백엔드 사실과 연결 계약.

    여기에 비밀을 넣지 않는다. 이 문자열은 세션 이벤트 기록에 영구히 남는다 —
    service_role 키가 한 번 들어가면 되돌릴 수 없다. publishable 키만 내보낸다.
    """
    if not settings.supabase_url:
        return ""

    lines = [
        "## 백엔드 — 이미 존재하는 Supabase 프로젝트",
        "",
        "새 프로젝트를 만들지 마라. 아래 프로젝트에 연결한다.",
        "",
        f"- 프로젝트 URL: {settings.supabase_url}",
    ]
    if settings.supabase_publishable_key:
        lines.append(f"- 공개 키(publishable): {settings.supabase_publishable_key}")

    if facts and facts.reachable:
        lines += [
            "",
            "### 실행 시점에 확인한 프로젝트 설정",
            "",
            f"- 활성 로그인 방식: {', '.join(facts.providers) if facts.providers else '없음'}",
            f"- 익명 로그인: {'켜짐' if facts.anonymous_signin else '꺼짐'}",
            f"- 회원가입: {'막혀 있음' if facts.signup_disabled else '열려 있음'}",
            f"- 이메일 확인: {'필요' if facts.email_confirmation_required else '불필요'}",
            "",
            "**이 설정에 맞춰 화면을 설계해라.** 켜져 있지 않은 로그인 방식을 UI에 넣지 마라 —",
            "빌드는 되지만 사용자는 로그인하지 못하고, 스토어 리뷰어도 마찬가지다.",
        ]
        if facts.email_confirmation_required:
            lines += [
                "",
                "이메일 확인이 필요하므로 **가입 직후 확인 대기 화면**이 반드시 있어야 한다.",
                "이게 없으면 가입한 사용자가 빈 화면에 갇힌다.",
            ]
        if not facts.providers:
            lines += [
                "",
                "활성 로그인 방식이 하나도 없다. 인증이 필요한 앱이라면 이건 지금 막아야 할 문제다 —",
                "request_human_decision 으로 사람에게 어떤 방식을 켤지 물어라.",
            ]
    elif facts and facts.error:
        lines += [
            "",
            f"※ 프로젝트 설정 조회에 실패했다: {facts.error}",
            "인증 설계를 확정하기 전에 사람에게 확인해라.",
        ]

    lines += [
        "",
        "### 연결 계약 (반드시 이대로)",
        "",
        f"- 클라이언트는 `{CLIENT_PATH}` 한 곳에서만 만든다. 화면마다 만들지 마라.",
        f"- URL과 키는 `{ENV_URL}` / `{ENV_KEY}` 환경변수로 읽는다. 소스에 박지 마라.",
        "  (`EXPO_PUBLIC_` 접두사가 있어야 Expo가 클라이언트 번들에 넣는다.)",
        "- 두 값을 `.env` 와 `.env.example` 에 넣고, `.env` 는 gitignore 한다.",
        "- 세션 지속에 `@react-native-async-storage/async-storage` 를 쓰고,",
        "  `detectSessionInUrl: false` 로 둔다 — 이건 웹이 아니라 네이티브다.",
        "",
        "### 보안 — 이게 이 앱의 유일한 경계다",
        "",
        "**service_role 키는 이 컨테이너에 존재하지 않는다.** 찾지 말고, 요구하지 말고,",
        "그것이 필요한 코드를 쓰지 마라.",
        "",
        "publishable 키는 앱 번들에 실려 나가도록 설계된 키다. 즉 **이 키를 가진 사람은",
        "누구나 REST API를 직접 호출할 수 있다.** 그 키의 권한 경계는 RLS 하나뿐이다.",
        "RLS를 켜지 않은 테이블은 전 세계에 열려 있는 것과 같다.",
        "",
        "그러므로: 테이블을 만드는 마이그레이션과 그 테이블의 RLS 정책은 **같은 마이그레이션**에",
        "들어간다. 정책 없는 테이블을 한 순간도 남기지 마라.",
    ]
    return "\n".join(lines)


def describe(settings: Settings, fetcher: Fetcher | None = None) -> str:
    """probe + render. 파이프라인이 부르는 입구."""
    if not settings.supabase_url:
        return ""
    return render_context(settings, probe(settings, fetcher))
