from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from jarvis.assistant import Assistant
from jarvis.main import create_app
from jarvis.metrics import MetricsLog
from jarvis.vault import Vault


@pytest.fixture()
def vault(tmp_path) -> Vault:
    v = Vault(tmp_path / "vault")
    v.write(
        title="빌드 노트",
        body="- [ ] 마감 오늘까지 썸네일\n- [ ] 데모 영상 편집\n- [ ] 릴리즈 노트\n- [ ] 색 정리\n\n[[architecture]]",
        kind="raw",
        type="capture",
        tags=["jarvis", "build"],
        note_id="build-note",
    )
    v.write(
        title="architecture",
        body="네 개의 부품만 있으면 된다.",
        kind="wiki",
        type="wiki",
        tags=["jarvis"],
        note_id="architecture",
    )
    log = MetricsLog(v.root)
    today = datetime.now().date()
    log.record({"views": 100, "subscribers": 10, "followers": 20}, on=str(today - timedelta(days=1)))
    log.record({"views": 150, "subscribers": 12, "followers": 19}, on=str(today))
    return v


@pytest.fixture()
def assistant(vault) -> Assistant:
    return Assistant(vault)


@pytest.fixture()
def client(vault):
    app = create_app(vault_dir=vault.root)
    with TestClient(app) as c:
        yield c
