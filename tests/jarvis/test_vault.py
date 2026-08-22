from __future__ import annotations

import pytest

from jarvis.vault import Vault, slugify


def test_write_then_read_roundtrip(vault: Vault):
    note = vault.write(title="회고", body="오늘은 됐다.", kind="outputs", type="review", tags=["daily"])
    again = vault.get(note.id)
    assert again is not None
    assert again.title == "회고"
    assert again.kind == "outputs"
    assert again.tags == ("daily",)
    assert "오늘은 됐다." in again.body


def test_file_is_plain_markdown_with_frontmatter(vault: Vault):
    note = vault.write(title="메모", body="본문", kind="raw")
    raw = note.path.read_text(encoding="utf-8")
    assert raw.startswith("---\n")
    assert "title: 메모" in raw
    assert raw.rstrip().endswith("본문")


def test_search_matches_korean_substring(vault: Vault):
    assert [n.id for n in vault.search("썸네일")] == ["build-note"]
    assert vault.search("존재하지않는말") == []


def test_search_ranks_title_over_body(vault: Vault):
    vault.write(title="컬러 정리", body="관계 없음", kind="wiki", note_id="color")
    vault.write(title="딴 노트", body="컬러 컬러 컬러", kind="wiki", note_id="other")
    assert vault.search("컬러")[0].id == "color"


def test_backlinks_follow_wikilinks(vault: Vault):
    assert [n.id for n in vault.backlinks("architecture")] == ["build-note"]


def test_open_todos_collected_from_raw_only(vault: Vault):
    vault.write(title="위키 할일", body="- [ ] 위키에 있는 건 세지 않는다", kind="wiki")
    todos = [text for text, _ in vault.open_todos()]
    assert "마감 오늘까지 썸네일" in todos
    assert "위키에 있는 건 세지 않는다" not in todos


def test_append_creates_then_extends(vault: Vault):
    first = vault.append("capture-test", "첫 줄")
    second = vault.append("capture-test", "둘째 줄")
    # 같은 날 두 번째 캡처가 다른 파일로 흩어지면 안 됩니다.
    assert first.id == second.id == "capture-test"
    assert "첫 줄" in second.body and "둘째 줄" in second.body


def test_write_rejects_unknown_kind(vault: Vault):
    with pytest.raises(ValueError):
        vault.write(title="x", body="y", kind="somewhere")


def test_slugify_keeps_hangul():
    assert slugify("오늘의 상위 3개") == "오늘의-상위-3개"


def test_stats_counts_by_kind(vault: Vault):
    stats = vault.stats()
    assert stats["total"] == 2
    assert stats["by_kind"]["raw"] == 1
    assert stats["sync"] == 50  # 두 노트 중 하나만 링크를 가짐


def test_cache_serves_repeat_scans_without_rereading(vault: Vault):
    vault.notes()
    reads = []
    original = vault._load

    def counting_load(path, mtime_ns=None):
        reads.append(path)
        return original(path, mtime_ns)

    vault._load = counting_load
    vault.notes()
    assert reads == []   # 바뀐 게 없으면 파일을 다시 열지 않습니다


def test_external_edit_is_picked_up(vault: Vault):
    """옵시디언에서 밖에서 고쳐도 다음 조회에 반영돼야 합니다."""
    note = vault.get("build-note")
    note.path.write_text(
        "---\nid: build-note\ntitle: 밖에서 고침\nkind: raw\n---\n\n새 본문\n", encoding="utf-8"
    )
    assert vault.get("build-note").title == "밖에서 고침"


def test_deleted_note_leaves_the_cache(vault: Vault):
    vault.notes()
    vault.get("architecture").path.unlink()
    assert vault.get("architecture") is None
    assert all(path.name != "architecture.md" for path in vault._cache)


def test_partial_scan_does_not_evict_other_kinds(vault: Vault):
    vault.notes()
    before = len(vault._cache)
    vault.notes("raw")            # 한 칸만 훑어도
    assert len(vault._cache) == before   # 다른 칸의 캐시가 날아가지 않습니다
