from __future__ import annotations

import os
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = PACKAGE_DIR.parent

# 볼트 위치는 환경변수로 갈아끼울 수 있습니다. 옵시디언 금고를 그대로 쓰고 싶으면
# JARVIS_VAULT=/path/to/obsidian-vault 로 지정하면 됩니다.
VAULT_DIR = Path(os.environ.get("JARVIS_VAULT", PROJECT_ROOT / "vault")).expanduser()

SKILLS_DIR = Path(os.environ.get("JARVIS_SKILLS", PACKAGE_DIR / "skills")).expanduser()
STATIC_DIR = PACKAGE_DIR / "static"

# 볼트의 세 칸. 이미지의 raw / wiki / outputs 그대로입니다.
KINDS = ("raw", "wiki", "outputs")

# 하루의 흐름 (07:00 / 09:00 / 14:00 / 19:00).
DAILY_FLOW = (
    ("07:00", "inbox", "모닝 브리핑: 메일·일정·AI 뉴스 요약"),
    ("09:00", "plan", "오늘 계획: 우선순위 3개 정리"),
    ("14:00", "metrics", "지표 확인: 조회수·구독자·팔로워 점검"),
    ("19:00", "review", "마감 정리: 회고 저장, 내일 준비"),
)
