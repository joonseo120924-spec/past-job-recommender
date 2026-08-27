import sys
from pathlib import Path

# agent-team/ 을 import 경로에 넣어 `shipyard` 를 찾게 한다.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from shipyard.config import Settings


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        environment_id="env_test",
        state_dir=tmp_path / ".shipyard",
        session_budget_usd=None,
        auto_approve_gates=False,
        _env_file=None,
    )
