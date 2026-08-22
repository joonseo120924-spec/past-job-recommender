"""지표 스냅샷 — `vault/data/metrics.jsonl` 한 줄에 하루."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

FIELDS = ("views", "subscribers", "followers")
LABELS = {"views": "조회수", "subscribers": "구독자", "followers": "팔로워"}


class MetricsLog:
    def __init__(self, vault_root: Path) -> None:
        self.path = Path(vault_root) / "data" / "metrics.jsonl"
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def snapshots(self) -> list[dict]:
        if not self.path.exists():
            return []
        rows: list[dict] = []
        for line in self.path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue  # 손으로 고치다 깨진 줄 하나가 전체를 막지 않게.
            if isinstance(row, dict) and "date" in row:
                rows.append(row)
        rows.sort(key=lambda r: str(r["date"]))
        return rows

    def record(self, values: dict[str, int], on: str | None = None) -> dict:
        """같은 날짜는 덮어씁니다 — 하루에 한 번만 세는 게 지표의 기본입니다."""
        when = on or date.today().isoformat()
        row = {"date": when, **{f: int(values.get(f, 0)) for f in FIELDS}}
        rows = [r for r in self.snapshots() if r.get("date") != when] + [row]
        rows.sort(key=lambda r: str(r["date"]))
        self.path.write_text(
            "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n",
            encoding="utf-8",
        )
        return row

    def latest_delta(self) -> tuple[dict | None, dict | None, dict[str, int]]:
        rows = self.snapshots()
        latest = rows[-1] if rows else None
        previous = rows[-2] if len(rows) > 1 else None
        delta: dict[str, int] = {}
        if latest and previous:
            for f in FIELDS:
                delta[f] = int(latest.get(f, 0)) - int(previous.get(f, 0))
        return latest, previous, delta
