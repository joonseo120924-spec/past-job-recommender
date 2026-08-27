"""실행 기록.

복잡한 에이전트 팀에서 제일 먼저 후회하는 것은 "그때 뭐가 있었는지 모른다"는 것이다.
세션 이벤트는 Anthropic 쪽에 남지만, 그것만으로는 **우리 쪽 결정**을 재구성할 수 없다 —
어떤 게이트에서 사람이 무엇을 거절했는지, 어떤 빌드가 어떤 커밋에서 나왔는지.

SQLite인 이유는 운영할 것이 하나도 없기 때문이다. 팀이 여러 릴리스를 동시에 돌리기
시작하면 Postgres로 옮기면 되고, 스키마는 그대로 쓸 수 있다.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id           TEXT PRIMARY KEY,
    app_name     TEXT NOT NULL,
    session_id   TEXT,
    stage        TEXT,
    status       TEXT NOT NULL,
    started_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL REFERENCES runs(id),
    stage       TEXT NOT NULL,
    status      TEXT NOT NULL,
    note        TEXT,
    at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gate_decisions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL REFERENCES runs(id),
    kind        TEXT NOT NULL,
    summary     TEXT NOT NULL,
    approved    INTEGER NOT NULL,
    automatic   INTEGER NOT NULL,
    note        TEXT,
    at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_calls (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL REFERENCES runs(id),
    tool        TEXT NOT NULL,
    payload     TEXT,
    result      TEXT,
    is_error    INTEGER,
    at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stages_run   ON stages(run_id);
CREATE INDEX IF NOT EXISTS idx_gates_run    ON gate_decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_tools_run    ON tool_calls(run_id);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Journal:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as conn:
            conn.executescript(SCHEMA)
            conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    # --- 실행 ---

    def start_run(self, app_name: str) -> str:
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        now = _now()
        with closing(self._connect()) as conn:
            conn.execute(
                "INSERT INTO runs (id, app_name, status, started_at, updated_at)"
                " VALUES (?, ?, 'running', ?, ?)",
                (run_id, app_name, now, now),
            )
            conn.commit()
        return run_id

    def attach_session(self, run_id: str, session_id: str) -> None:
        self._update_run(run_id, session_id=session_id)

    def set_stage(self, run_id: str, stage: str, status: str, note: str | None = None) -> None:
        with closing(self._connect()) as conn:
            conn.execute(
                "INSERT INTO stages (run_id, stage, status, note, at) VALUES (?, ?, ?, ?, ?)",
                (run_id, stage, status, note, _now()),
            )
            conn.execute(
                "UPDATE runs SET stage = ?, updated_at = ? WHERE id = ?",
                (stage, _now(), run_id),
            )
            conn.commit()

    def finish_run(self, run_id: str, status: str) -> None:
        self._update_run(run_id, status=status)

    def _update_run(self, run_id: str, **fields: Any) -> None:
        if not fields:
            return
        assigns = ", ".join(f"{k} = ?" for k in fields)
        with closing(self._connect()) as conn:
            conn.execute(
                f"UPDATE runs SET {assigns}, updated_at = ? WHERE id = ?",
                (*fields.values(), _now(), run_id),
            )
            conn.commit()

    # --- 게이트와 툴 ---

    def record_gate(
        self, run_id: str, kind: str, summary: str, approved: bool, automatic: bool, note: str | None
    ) -> None:
        with closing(self._connect()) as conn:
            conn.execute(
                "INSERT INTO gate_decisions (run_id, kind, summary, approved, automatic, note, at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (run_id, kind, summary, int(approved), int(automatic), note, _now()),
            )
            conn.commit()

    def record_tool_call(self, run_id: str, tool: str, payload: dict[str, Any]) -> None:
        with closing(self._connect()) as conn:
            conn.execute(
                "INSERT INTO tool_calls (run_id, tool, payload, at) VALUES (?, ?, ?, ?)",
                (run_id, tool, json.dumps(payload, ensure_ascii=False), _now()),
            )
            conn.commit()

    def record_tool_result(self, run_id: str, tool: str, result: str, is_error: bool) -> None:
        """가장 최근의 같은 이름 툴 호출에 결과를 붙인다."""
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT id FROM tool_calls WHERE run_id = ? AND tool = ? AND result IS NULL"
                " ORDER BY id DESC LIMIT 1",
                (run_id, tool),
            ).fetchone()
            if row is None:
                return
            conn.execute(
                "UPDATE tool_calls SET result = ?, is_error = ? WHERE id = ?",
                (result[:8000], int(is_error), row["id"]),
            )
            conn.commit()

    # --- 조회 ---

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
            return dict(row) if row else None

    def latest_run(self) -> dict[str, Any] | None:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM runs ORDER BY started_at DESC LIMIT 1").fetchone()
            return dict(row) if row else None

    def stage_history(self, run_id: str) -> list[dict[str, Any]]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT stage, status, note, at FROM stages WHERE run_id = ? ORDER BY id",
                (run_id,),
            ).fetchall()
            return [dict(r) for r in rows]
