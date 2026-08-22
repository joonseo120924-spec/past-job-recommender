"""노션 연동 — 에이전트팀 정본을 볼트로 끌어옵니다.

두 갈래로 동작합니다.

1. `NOTION_TOKEN` 이 있으면 노션 API 에서 직접 읽어 미러를 갱신합니다.
2. 없으면 볼트에 이미 있는 미러를 그대로 씁니다. 토큰이 없다고 자비스가
   "모르겠습니다" 라고 하지는 않습니다 — 대신 언제 찍은 스냅샷인지 밝힙니다.

의존성을 늘리지 않으려고 표준 라이브러리만 씁니다.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from jarvis.vault import Vault

API = "https://api.notion.com/v1"
VERSION = "2022-06-28"          # 노션 API 버전은 헤더로 고정해야 합니다.
MIRROR_TAG = "notion"


class NotionError(RuntimeError):
    pass


@dataclass(frozen=True)
class NotionPage:
    id: str
    title: str
    url: str
    text: str


class NotionClient:
    def __init__(self, token: str | None = None, *, timeout: float = 15.0) -> None:
        self.token = token or os.environ.get("NOTION_TOKEN", "")
        self.timeout = timeout

    @property
    def configured(self) -> bool:
        return bool(self.token)

    def _request(self, method: str, path: str, payload: dict | None = None) -> dict:
        if not self.configured:
            raise NotionError("NOTION_TOKEN 이 없습니다.")
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(
            f"{API}{path}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Notion-Version": VERSION,
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")[:300]
            raise NotionError(f"노션 API {exc.code}: {body}") from exc
        except urllib.error.URLError as exc:
            raise NotionError(f"노션에 연결하지 못했습니다: {exc.reason}") from exc

    # ------------------------------------------------------------------ 읽기

    def search(self, query: str, *, limit: int = 5) -> list[dict]:
        result = self._request("POST", "/search", {"query": query, "page_size": limit})
        return result.get("results", [])

    def blocks(self, block_id: str, *, limit: int = 100) -> list[dict]:
        result = self._request("GET", f"/blocks/{block_id}/children?page_size={limit}")
        return result.get("results", [])

    def page_text(self, page_id: str, *, depth: int = 2) -> str:
        """블록을 마크다운 비슷하게 펼칩니다. 표는 행 단위로 눕힙니다."""
        lines: list[str] = []
        self._walk(page_id, lines, depth)
        return "\n".join(lines)

    def _walk(self, block_id: str, lines: list[str], depth: int) -> None:
        for block in self.blocks(block_id):
            kind = block.get("type", "")
            body = block.get(kind, {})
            text = _rich_text(body.get("rich_text", []))
            prefix = {
                "heading_1": "# ",
                "heading_2": "## ",
                "heading_3": "### ",
                "bulleted_list_item": "- ",
                "numbered_list_item": "- ",
                "to_do": "- [ ] " if not body.get("checked") else "- [x] ",
                "quote": "> ",
            }.get(kind, "")
            if kind == "table_row":
                cells = [_rich_text(cell) for cell in body.get("cells", [])]
                text = " | ".join(c for c in cells if c)
                prefix = "| "
            if text:
                lines.append(f"{prefix}{text}")
            if block.get("has_children") and depth > 0:
                self._walk(block["id"], lines, depth - 1)


def _rich_text(chunks: list[dict]) -> str:
    return "".join(chunk.get("plain_text", "") for chunk in chunks).strip()


# ---------------------------------------------------------------- 볼트 미러


def mirror_path(vault: Vault) -> Path:
    return vault.root / "wiki"


def sync_agent_team(vault: Vault, client: NotionClient | None = None) -> dict:
    """노션의 팀 페이지들을 볼트 wiki/ 로 복사합니다.

    성공하면 갱신된 노트 id 목록을, 토큰이 없으면 그 사실을 돌려줍니다.
    실패를 조용히 삼키지 않습니다 — 오래된 미러를 최신인 척하는 게 더 나쁩니다.
    """
    client = client or NotionClient()
    index_path = vault.root / "data" / "agent-team.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}

    if not client.configured:
        return {
            "synced": False,
            "reason": "NOTION_TOKEN 이 설정되지 않아 볼트의 스냅샷을 씁니다.",
            "snapshot_at": index.get("synced_at"),
            "notes": [],
        }

    updated: list[str] = []
    for source in index.get("sources", []):
        page_id = str(source.get("id", "")).replace("-", "")
        if not page_id:
            continue
        text = client.page_text(page_id)
        note = vault.write(
            title=source.get("title", page_id),
            body=f"> 노션 정본: {source.get('url', '')}\n\n{text}",
            kind="wiki",
            type="notion",
            tags=[MIRROR_TAG, "agent-team"],
            note_id=source.get("note_id") or f"notion-{page_id[:8]}",
        )
        updated.append(note.id)

    index["synced_at"] = datetime.now().isoformat(timespec="seconds")
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"synced": True, "reason": "", "snapshot_at": index["synced_at"], "notes": updated}
