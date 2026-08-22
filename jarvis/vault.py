"""기억 장치 — 마크다운 볼트 읽기/쓰기.

모든 기록은 사람이 읽을 수 있는 마크다운으로 남습니다. DB도, 인덱스 파일도
없습니다. 볼트를 통째로 옵시디언에서 열어도 그대로 보입니다.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from jarvis.config import KINDS, VAULT_DIR

WIKILINK = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")
OPEN_TODO = re.compile(r"^\s*[-*]\s*\[ \]\s*(.+?)\s*$", re.MULTILINE)
_SLUG_STRIP = re.compile(r"[^\w가-힣]+")


@dataclass(frozen=True)
class Note:
    id: str
    title: str
    kind: str
    type: str
    tags: tuple[str, ...]
    created: str
    updated: str
    body: str
    path: Path
    links: tuple[str, ...] = field(default=())

    @property
    def excerpt(self) -> str:
        for line in self.body.splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                return line[:160]
        return ""

    def to_dict(self, *, with_body: bool = False) -> dict:
        d = {
            "id": self.id,
            "title": self.title,
            "kind": self.kind,
            "type": self.type,
            "tags": list(self.tags),
            "created": self.created,
            "updated": self.updated,
            "excerpt": self.excerpt,
            "links": list(self.links),
        }
        if with_body:
            d["body"] = self.body
        return d


def slugify(text: str) -> str:
    """한글은 살리고 공백/기호만 정리합니다. 로마자로 옮기지 않습니다."""
    text = unicodedata.normalize("NFKC", text).strip().lower()
    slug = _SLUG_STRIP.sub("-", text).strip("-")
    return slug[:60] or "note"


def _parse_frontmatter(raw: str) -> tuple[dict[str, str | list[str]], str]:
    """`---` 로 감싼 최소 프론트매터만 읽습니다 (PyYAML 의존성 없음)."""
    if not raw.startswith("---"):
        return {}, raw
    end = raw.find("\n---", 3)
    if end == -1:
        return {}, raw
    head, body = raw[3:end], raw[end + 4 :]
    meta: dict[str, str | list[str]] = {}
    for line in head.splitlines():
        if not line.strip() or ":" not in line:
            continue
        key, _, value = line.partition(":")
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            meta[key.strip()] = [
                v.strip().strip("'\"") for v in value[1:-1].split(",") if v.strip()
            ]
        else:
            meta[key.strip()] = value.strip("'\"")
    return meta, body.lstrip("\n")


def _render_frontmatter(note_fields: dict[str, str | list[str]]) -> str:
    lines = ["---"]
    for key, value in note_fields.items():
        if isinstance(value, (list, tuple)):
            lines.append(f"{key}: [{', '.join(value)}]")
        else:
            lines.append(f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines)


class Vault:
    """볼트 하나에 대한 읽기/쓰기 창구."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = Path(root or VAULT_DIR)
        for kind in KINDS:
            (self.root / kind).mkdir(parents=True, exist_ok=True)
        (self.root / "data").mkdir(parents=True, exist_ok=True)
        # 경로 → (mtime_ns, Note). 파일을 다시 읽는 것보다 stat 이 훨씬 쌉니다.
        # 옵시디언에서 밖에서 고쳐도 mtime 이 바뀌므로 그대로 반영됩니다.
        self._cache: dict[Path, tuple[int, Note]] = {}

    # ---------------------------------------------------------------- 읽기

    def _load(self, path: Path, mtime_ns: int | None = None) -> Note | None:
        try:
            raw = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            return None
        meta, body = _parse_frontmatter(raw)
        kind = path.parent.name if path.parent.name in KINDS else "raw"
        if mtime_ns is None:
            try:
                mtime_ns = path.stat().st_mtime_ns
            except OSError:
                return None
        stat_time = datetime.fromtimestamp(mtime_ns / 1e9).isoformat(timespec="seconds")
        tags = meta.get("tags", [])
        if isinstance(tags, str):
            tags = [t for t in tags.split() if t]
        title = str(meta.get("title") or path.stem)
        return Note(
            id=str(meta.get("id") or path.stem),
            title=title,
            kind=str(meta.get("kind") or kind),
            type=str(meta.get("type") or "note"),
            tags=tuple(str(t).lstrip("#") for t in tags),
            created=str(meta.get("created") or stat_time),
            updated=str(meta.get("updated") or stat_time),
            body=body,
            path=path,
            links=tuple(dict.fromkeys(WIKILINK.findall(body))),
        )

    def notes(self, kind: str | None = None) -> list[Note]:
        """볼트를 훑습니다 — 바뀐 파일만 다시 읽습니다.

        별도 인덱스 파일은 두지 않습니다. mtime 만 보면 되고, 인덱스는 언젠가
        실제 파일과 어긋나는데 그때 틀린 답을 확신에 차서 말하게 됩니다.
        """
        kinds = (kind,) if kind else KINDS
        found: list[Note] = []
        seen: set[Path] = set()
        for k in kinds:
            for path in sorted((self.root / k).rglob("*.md")):
                try:
                    mtime_ns = path.stat().st_mtime_ns
                except OSError:
                    continue    # 훑는 도중 지워진 파일
                seen.add(path)
                cached = self._cache.get(path)
                if cached is not None and cached[0] == mtime_ns:
                    found.append(cached[1])
                    continue
                note = self._load(path, mtime_ns)
                if note is not None:
                    self._cache[path] = (mtime_ns, note)
                    found.append(note)
        if kind is None:
            # 전체를 훑었을 때만 정리합니다. 부분 훑기로 지우면 다른 칸이 날아갑니다.
            for stale in set(self._cache) - seen:
                del self._cache[stale]
        found.sort(key=lambda n: n.updated, reverse=True)
        return found

    def get(self, note_id: str) -> Note | None:
        for note in self.notes():
            if note.id == note_id:
                return note
        return None

    def search(self, query: str, *, limit: int = 8, kind: str | None = None) -> list[Note]:
        """부분 문자열 검색. 한국어는 형태소 분석 없이도 이 방식이 가장 덜 틀립니다."""
        q = unicodedata.normalize("NFKC", query).strip().lower()
        if not q:
            return []
        terms = [t for t in q.split() if t]
        scored: list[tuple[float, Note]] = []
        for note in self.notes(kind):
            title = note.title.lower()
            body = note.body.lower()
            tags = " ".join(note.tags).lower()
            score = 0.0
            for term in terms:
                score += 3.0 * title.count(term)
                score += 2.0 * tags.count(term)
                score += min(body.count(term), 5) * 1.0
            if score:
                scored.append((score, note))
        # notes() 가 이미 최신순이므로, 안정 정렬이면 동점은 최신 노트가 앞섭니다.
        scored.sort(key=lambda pair: -pair[0])
        return [note for _, note in scored[:limit]]

    def backlinks(self, note_id: str) -> list[Note]:
        target = self.get(note_id)
        titles = {note_id}
        if target:
            titles.add(target.title)
        return [n for n in self.notes() if set(n.links) & titles and n.id != note_id]

    def open_todos(self, *, limit: int = 20) -> list[tuple[str, Note]]:
        """raw/ 에 널려 있는 `- [ ] 할 일` 을 모읍니다."""
        todos: list[tuple[str, Note]] = []
        for note in self.notes("raw"):
            for text in OPEN_TODO.findall(note.body):
                todos.append((text, note))
                if len(todos) >= limit:
                    return todos
        return todos

    def stats(self) -> dict:
        notes = self.notes()
        by_kind = {k: sum(1 for n in notes if n.kind == k) for k in KINDS}
        linked = sum(1 for n in notes if n.links)
        return {
            "total": len(notes),
            "by_kind": by_kind,
            "linked": linked,
            # 링크 없는 노트는 나중에 절대 다시 안 읽힙니다. 그 비율이 볼트 건강도입니다.
            "sync": round(100 * linked / len(notes)) if notes else 0,
            "root": str(self.root),
        }

    # ---------------------------------------------------------------- 쓰기

    def write(
        self,
        *,
        title: str,
        body: str,
        kind: str = "raw",
        type: str = "note",
        tags: list[str] | tuple[str, ...] = (),
        note_id: str | None = None,
    ) -> Note:
        if kind not in KINDS:
            raise ValueError(f"kind는 {KINDS} 중 하나여야 합니다: {kind!r}")
        today = date.today().isoformat()
        note_id = note_id or f"{today}-{slugify(title)}"
        path = (self.root / kind / f"{note_id}.md")
        now = datetime.now().isoformat(timespec="seconds")
        created = now
        if path.exists():
            existing = self._load(path)
            if existing:
                created = existing.created
        header = _render_frontmatter(
            {
                "id": note_id,
                "title": title,
                "kind": kind,
                "type": type,
                "tags": [str(t).lstrip("#") for t in tags],
                "created": created,
                "updated": now,
            }
        )
        path.write_text(f"{header}\n\n{body.strip()}\n", encoding="utf-8")
        note = self._load(path)
        assert note is not None  # 방금 쓴 파일
        return note

    def append(self, note_id: str, line: str, *, title: str | None = None) -> Note:
        """있으면 한 줄 덧붙이고, 없으면 새로 만듭니다 (빠른 메모용)."""
        note = self.get(note_id)
        stamp = datetime.now().strftime("%H:%M")
        if note is None:
            # note_id 를 그대로 씁니다. 호출자가 정한 id 를 바꿔 버리면 같은 날
            # 두 번째 캡처가 다른 파일로 흩어집니다.
            return self.write(
                title=title or note_id,
                body=f"- {stamp} {line}",
                kind="raw",
                type="capture",
                tags=["capture"],
                note_id=note_id,
            )
        return self.write(
            title=note.title,
            body=f"{note.body.rstrip()}\n- {stamp} {line}",
            kind=note.kind,
            type=note.type,
            tags=list(note.tags),
            note_id=note.id,
        )
