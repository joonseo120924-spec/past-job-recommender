"""백엔드 연결 계약과 프로젝트 설정 조회."""

import urllib.error

import pytest

from shipyard import backend
from shipyard.backend import CLIENT_PATH, ENV_KEY, ENV_URL, BackendFacts, probe, render_context

LIVE_SETTINGS = dict(
    supabase_url="https://example.supabase.co",
    supabase_publishable_key="sb_publishable_TEST",
)

AUTH_SETTINGS = {
    "external": {"email": True, "google": False, "anonymous_users": False},
    "disable_signup": False,
    "mailer_autoconfirm": False,
}


@pytest.fixture
def configured(settings):
    for key, value in LIVE_SETTINGS.items():
        setattr(settings, key, value)
    return settings


def test_probe_reads_auth_settings(configured):
    captured = {}

    def fetcher(url, headers):
        captured["url"] = url
        captured["headers"] = headers
        return AUTH_SETTINGS

    facts = probe(configured, fetcher)
    assert facts.reachable
    assert facts.providers == ["email"]
    assert facts.email_confirmation_required
    assert not facts.anonymous_signin
    assert captured["url"].endswith("/auth/v1/settings")
    assert captured["headers"]["apikey"] == "sb_publishable_TEST"


def test_probe_does_not_send_the_key_anywhere_else(configured):
    """키는 프로젝트 자신에게만 간다."""

    def fetcher(url, headers):
        assert url.startswith(configured.supabase_url)
        return AUTH_SETTINGS

    probe(configured, fetcher)


def test_probe_survives_network_failure(configured):
    def fetcher(url, headers):
        raise urllib.error.URLError("연결 실패")

    facts = probe(configured, fetcher)
    assert not facts.reachable
    assert facts.error


def test_probe_reports_bad_credentials(configured):
    def fetcher(url, headers):
        raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, None)

    facts = probe(configured, fetcher)
    assert not facts.reachable
    assert "401" in facts.error


def test_probe_without_config_is_not_an_error(settings):
    facts = probe(settings)
    assert not facts.reachable


def test_context_is_empty_without_supabase(settings):
    assert render_context(settings) == ""
    assert backend.describe(settings) == ""


def test_context_carries_the_wiring_contract(configured):
    text = render_context(configured, BackendFacts(reachable=True, providers=["email"]))
    assert CLIENT_PATH in text
    assert ENV_URL in text and ENV_KEY in text
    assert configured.supabase_url in text
    assert configured.supabase_publishable_key in text


def test_context_never_leaks_the_service_role_key(configured):
    """이 문자열은 세션 기록에 영구히 남는다. 서비스 롤 키가 들어가면 되돌릴 수 없다."""
    configured.supabase_service_role_key = "sb_secret_NEVER_SHIP_THIS"
    text = render_context(configured, BackendFacts(reachable=True, providers=["email"]))
    assert "sb_secret_NEVER_SHIP_THIS" not in text
    assert "service_role" in text  # 금지 사실 자체는 알려준다


def test_context_reflects_live_auth_config(configured):
    text = render_context(
        configured,
        BackendFacts(reachable=True, providers=["email"], email_confirmation_required=True),
    )
    assert "email" in text
    assert "확인 대기 화면" in text


def test_context_flags_a_project_with_no_login_method(configured):
    text = render_context(configured, BackendFacts(reachable=True, providers=[]))
    assert "request_human_decision" in text


def test_context_flags_an_unreachable_project(configured):
    text = render_context(configured, BackendFacts(reachable=False, error="HTTP 401"))
    assert "실패" in text and "HTTP 401" in text


def test_context_always_demands_rls(configured):
    """publishable 키의 권한 경계는 RLS 하나뿐이다 — 이 경고는 조건부가 아니다."""
    for facts in (
        BackendFacts(reachable=True, providers=["email"]),
        BackendFacts(reachable=False, error="타임아웃"),
        None,
    ):
        assert "RLS" in render_context(configured, facts)
