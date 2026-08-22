from __future__ import annotations

import pytest

from jarvis.skills_registry import load_skills, route


@pytest.fixture(scope="module")
def skills():
    return load_skills()


def test_all_skills_are_loaded(skills):
    assert {s.name for s in skills} == {
        "metrics", "inbox", "trends", "plan", "vault", "agents", "status",
    }


@pytest.mark.parametrize(
    "utterance,expected",
    [
        ("오늘 지표 어때?", "metrics"),
        ("구독자 몇 명이야", "metrics"),
        ("아침 브리핑 줘", "inbox"),
        ("오늘 할 일 우선순위 정리해줘", "plan"),
        ("요즘 흐름 스캔해봐", "trends"),
        ("기억해 3시에 콜 있음", "vault"),
        ("지금 상황 보고해", "status"),
        ("에이전트팀 어떻게 돼", "agents"),
        # 곁가지(상황·보고)가 본체(에이전트)를 이기면 안 됩니다.
        ("에이전트팀 상황 보고해", "agents"),
        ("노션 팀 현황 알려줘", "agents"),
    ],
)
def test_intent_routes_to_expected_skill(skills, utterance, expected):
    assert route(utterance, skills).skill.name == expected


def test_unknown_intent_falls_back_to_vault(skills):
    match = route("작년 워크숍 자료 어디 있더라", skills)
    assert match.skill.name == "vault"
    assert match.score == 0.0


def test_empty_utterance_has_no_skill(skills):
    assert route("   ", skills).skill is None
