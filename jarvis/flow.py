"""하루 흐름의 진행 상태 — 한 군데서만 판정합니다.

HUD 의 SCHEDULE, 음성 상황 보고, 자동 실행 스케줄러가 모두 이 함수를 씁니다.
같은 판정을 세 곳에 복사해 두면 언젠가 화면과 목소리가 다른 말을 합니다.
"""

from __future__ import annotations

from datetime import datetime

from jarvis.config import DAILY_FLOW
from jarvis.metrics import MetricsLog
from jarvis.vault import Vault

# 결과물 파일 이름 앞부분으로 실행 여부를 판정합니다.
OUTPUT_PREFIX = {"inbox": "brief", "plan": "plan", "review": "review"}


def blocks(vault: Vault, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now()
    today = now.strftime("%Y-%m-%d")
    outputs = {note.id for note in vault.notes("outputs")}
    # metrics 는 노트를 남기지 않습니다. 오늘 스냅샷이 있으면 확인한 겁니다.
    metrics_today = any(row.get("date") == today for row in MetricsLog(vault.root).snapshots())

    result = []
    for at, skill, description in DAILY_FLOW:
        marker = OUTPUT_PREFIX.get(skill)
        done = metrics_today if skill == "metrics" else (f"{marker}-{today}" in outputs if marker else False)
        result.append(
            {
                "at": at,
                "skill": skill,
                "description": description,
                "done": done,
                "past": now.strftime("%H:%M") >= at,
            }
        )
    return result


def done_count(vault: Vault, now: datetime | None = None) -> int:
    return sum(1 for block in blocks(vault, now) if block["done"])
