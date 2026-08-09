from __future__ import annotations

from app.schemas.response import RecommendResponse

VALID_PAYLOAD = {
    "past_roles": [
        {
            "title": "알파 분석가",
            "industry": "IT 서비스",
            "start_date": "2021-01-01",
            "end_date": None,
            "skills": ["SQL", "Python"],
            "achievements": "지표 정의와 대시보드 구축",
        }
    ],
    "top_k": 3,
}


def test_health_reports_loaded_taxonomy(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["roles"] == 6
    assert body["skills"] > 0


def test_root_serves_the_form(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<form" in response.text


def test_recommend_returns_valid_schema(client):
    response = client.post("/api/recommend", json=VALID_PAYLOAD)
    assert response.status_code == 200
    parsed = RecommendResponse.model_validate(response.json())
    assert len(parsed.recommendations) == 3


def test_recommend_respects_top_k(client):
    response = client.post("/api/recommend", json={**VALID_PAYLOAD, "top_k": 1})
    assert len(response.json()["recommendations"]) == 1


def test_empty_history_is_rejected(client):
    response = client.post("/api/recommend", json={"past_roles": []})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"


def test_end_before_start_is_rejected(client):
    payload = {
        "past_roles": [
            {"title": "알파 분석가", "start_date": "2024-01-01", "end_date": "2023-01-01"}
        ]
    }
    response = client.post("/api/recommend", json=payload)
    assert response.status_code == 422


def test_future_start_date_is_rejected(client):
    payload = {"past_roles": [{"title": "알파 분석가", "start_date": "2999-01-01"}]}
    assert client.post("/api/recommend", json=payload).status_code == 422


def test_top_k_out_of_range_is_rejected(client):
    response = client.post("/api/recommend", json={**VALID_PAYLOAD, "top_k": 999})
    assert response.status_code == 422


def test_validation_errors_share_one_shape(client):
    body = client.post("/api/recommend", json={"past_roles": []}).json()
    assert set(body) == {"code", "message_ko", "detail"}
    assert body["detail"][0]["field"]


def test_normalize_endpoint_previews_recognition(client):
    payload = {
        "past_roles": [
            {
                "title": "알파 분석가",
                "start_date": "2021-01-01",
                "skills": ["SQL", "이건없는스킬"],
            }
        ]
    }
    body = client.post("/api/normalize", json=payload).json()
    assert body["recognized_skills"] == ["SQL"]
    assert body["unresolved_inputs"] == ["이건없는스킬"]
    assert body["experiences"][0]["matched_title_ko"] == "알파 분석가"


def test_roles_listing(client):
    roles = client.get("/api/roles").json()
    assert len(roles) == 6
    assert {"id", "title_ko", "title_en", "family", "seniority"} <= set(roles[0])


def test_role_detail(client):
    body = client.get("/api/roles/alpha-analyst").json()
    assert body["title_ko"] == "알파 분석가"
    assert "SQL" in body["required_skills"]


def test_unknown_role_returns_404(client):
    assert client.get("/api/roles/no-such-role").status_code == 404


def test_skill_autocomplete_matches_prefix(client):
    assert "SQL" in client.get("/api/skills", params={"q": "sq"}).json()


def test_skill_autocomplete_matches_without_spaces(client):
    assert "데이터 시각화" in client.get("/api/skills", params={"q": "데이터시각"}).json()


def test_skill_autocomplete_respects_limit(client):
    assert len(client.get("/api/skills", params={"limit": 3}).json()) == 3


def test_industries_listing(client):
    industries = client.get("/api/industries").json()
    assert "IT 서비스" in industries
