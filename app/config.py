from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = Path(
    os.environ.get("JOB_ROLES_PATH", PROJECT_ROOT / "data" / "job_roles.json")
)
STATIC_DIR = Path(__file__).resolve().parent / "static"
