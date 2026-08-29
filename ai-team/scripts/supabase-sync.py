#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI 앱 개발팀 · 슈퍼베이스 동기화 (Linux 원격 컨테이너용)

Windows 로컬에는 Python 이 없으므로 같은 기능을 supabase-sync.ps1 이 담당합니다.

  python3 ai-team/scripts/supabase-sync.py status
  python3 ai-team/scripts/supabase-sync.py push
  python3 ai-team/scripts/supabase-sync.py pull            # 차이만 보고, 파일은 건드리지 않음
  python3 ai-team/scripts/supabase-sync.py pull --force    # 로컬 파일을 원격 내용으로 덮어씀
  python3 ai-team/scripts/supabase-sync.py event --kind 결정 --title "D-023 …" --ref D-023

설정: 환경변수 SUPABASE_URL · SUPABASE_KEY, 없으면 ai-team/supabase/.env (git 추적 안 함)
"""
import argparse, hashlib, json, os, sys, urllib.error, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE_DIR = os.path.join(ROOT, "ai-team")
ENV_FILE = os.path.join(STATE_DIR, "supabase", ".env")

# 동기화 대상 — ai-team/ 기준 상대 경로
FILES = ["STATE.md", "cycle.md", "board.md", "approvals.md",
         "decisions.md", "questions.md", "SESSION-LOG.md", "README.md"]

KINDS = ["호출", "승인", "반려", "결정", "막힘", "기록", "동기화", "감사"]


def die(msg, code=1):
    print("✗ " + msg, file=sys.stderr)
    sys.exit(code)


def load_config():
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if (not url or not key) and os.path.exists(ENV_FILE):
        with open(ENV_FILE, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                v = v.strip().strip('"').strip("'")
                if k.strip() == "SUPABASE_URL" and not url:
                    url = v
                elif k.strip() == "SUPABASE_KEY" and not key:
                    key = v
    if not url or not key:
        die("SUPABASE_URL / SUPABASE_KEY 를 찾지 못했습니다.\n"
            "  환경변수로 주거나 ai-team/supabase/.env 를 만드십시오 "
            "(.env.example 참고). 이 파일은 git 에 올라가지 않습니다.")
    return url.rstrip("/"), key


def request(method, path, key, url, body=None, prefer=None):
    req = urllib.request.Request(url + path, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        if "PGRST205" in detail or "schema cache" in detail:
            die("테이블이 아직 없습니다. ai-team/supabase/schema.sql 을 "
                "Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하십시오.\n  " + detail)
        die("HTTP %s %s\n  %s" % (e.code, path, detail))
    except urllib.error.URLError as e:
        die("네트워크 오류: %s" % e.reason)


def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def local_files():
    out = {}
    for name in FILES:
        p = os.path.join(STATE_DIR, name)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as fh:
                out[name] = fh.read()
    return out


def git_branch():
    head = os.path.join(ROOT, ".git", "HEAD")
    try:
        with open(head, encoding="utf-8") as fh:
            ref = fh.read().strip()
        return ref.split("refs/heads/", 1)[1] if "refs/heads/" in ref else ref
    except OSError:
        return None


def remote_state(url, key):
    rows = request("GET", "/rest/v1/team_state?select=key,sha256,bytes,updated_at,source,branch",
                   key, url) or []
    return {r["key"]: r for r in rows}


def cmd_status(args, url, key):
    local, remote = local_files(), remote_state(url, key)
    print("브랜치: %s" % (git_branch() or "?"))
    print("%-16s %-10s %s" % ("파일", "상태", "원격 갱신"))
    print("-" * 62)
    same = 0
    for name in FILES:
        l, r = local.get(name), remote.get(name)
        if l is None and r is None:
            continue
        if l is None:
            mark, when = "원격만", r["updated_at"]
        elif r is None:
            mark, when = "미전송", "-"
        elif sha256(l) == r["sha256"]:
            mark, when = "일치", r["updated_at"]
            same += 1
        else:
            mark, when = "**다름**", r["updated_at"]
        print("%-16s %-10s %s" % (name, mark, when))
    print("-" * 62)
    print("일치 %d / %d" % (same, len(FILES)))

    blockers = request("GET", "/rest/v1/team_blockers?select=id,title,needs_user"
                              "&resolved_at=is.null&order=id", key, url) or []
    print("\n🔴 열린 차단 %d건%s" % (len(blockers),
          " (사용자 지시 필요 %d)" % sum(1 for b in blockers if b["needs_user"]) if blockers else ""))
    for b in blockers:
        print("  %s %s" % (b["id"], b["title"]))

    events = request("GET", "/rest/v1/team_events?select=at,kind,actor,title"
                            "&order=at.desc&limit=5", key, url) or []
    print("\n최근 이벤트 %d건" % len(events))
    for e in events:
        print("  %s [%s] %s %s" % (e["at"][:19], e["kind"], e.get("actor") or "-", e["title"]))


def cmd_push(args, url, key):
    local = local_files()
    if not local:
        die("보낼 상태 파일이 없습니다.")
    now = datetime.now(timezone.utc).isoformat()
    branch = git_branch()
    rows = [{"key": n, "content": c, "sha256": sha256(c), "bytes": len(c.encode("utf-8")),
             "branch": branch, "source": args.source, "updated_at": now}
            for n, c in local.items()]
    request("POST", "/rest/v1/team_state", key, url, rows,
            prefer="resolution=merge-duplicates,return=minimal")
    print("✓ %d개 파일 업로드 (source=%s, branch=%s)" % (len(rows), args.source, branch))
    request("POST", "/rest/v1/team_events", key, url,
            [{"kind": "동기화", "title": "상태 파일 %d개 push" % len(rows),
              "body": ", ".join(sorted(local)), "actor": "supabase-sync",
              "ref": branch, "source": args.source}], prefer="return=minimal")
    print("✓ team_events 에 동기화 기록 남김")


def cmd_pull(args, url, key):
    rows = request("GET", "/rest/v1/team_state?select=key,content,sha256,updated_at,source", key, url) or []
    local = local_files()
    changed = []
    for r in rows:
        if r["key"] not in FILES:
            continue
        if local.get(r["key"]) != r["content"]:
            changed.append(r)
    if not changed:
        print("✓ 원격과 로컬이 같습니다. 받을 것이 없습니다.")
        return
    print("원격이 다른 파일 %d개:" % len(changed))
    for r in changed:
        cur = local.get(r["key"])
        print("  %-16s 로컬 %s → 원격 %s (%s, %s)" % (
            r["key"], "없음" if cur is None else "%dB" % len(cur.encode("utf-8")),
            "%dB" % len(r["content"].encode("utf-8")), r["updated_at"][:19], r["source"]))
    if not args.force:
        print("\n파일은 건드리지 않았습니다. 덮어쓰려면 --force 를 주십시오.")
        print("정본은 저장소입니다 — 덮어쓰기 전에 무엇이 최신인지 확인하십시오.")
        return
    for r in changed:
        with open(os.path.join(STATE_DIR, r["key"]), "w", encoding="utf-8") as fh:
            fh.write(r["content"])
    print("\n✓ %d개 파일을 원격 내용으로 덮어썼습니다." % len(changed))


def cmd_event(args, url, key):
    row = {"kind": args.kind, "title": args.title, "body": args.body, "actor": args.actor,
           "ref": args.ref, "stage": args.stage, "cycle": args.cycle, "day": args.day,
           "source": args.source}
    request("POST", "/rest/v1/team_events", key, url,
            [{k: v for k, v in row.items() if v is not None}], prefer="return=minimal")
    print("✓ 이벤트 기록: [%s] %s" % (args.kind, args.title))


def main():
    ap = argparse.ArgumentParser(description="AI 앱 개발팀 슈퍼베이스 동기화")
    ap.add_argument("--source", default="remote-container", help="이 기기 이름 (기본: remote-container)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status", help="로컬 ↔ 원격 차이와 최근 이벤트")
    sub.add_parser("push", help="상태 파일을 슈퍼베이스로 올림")
    p_pull = sub.add_parser("pull", help="원격 내용을 확인 (--force 여야 파일을 덮어씀)")
    p_pull.add_argument("--force", action="store_true")
    p_ev = sub.add_parser("event", help="이벤트 한 건 기록")
    p_ev.add_argument("--kind", required=True, choices=KINDS)
    p_ev.add_argument("--title", required=True)
    p_ev.add_argument("--body")
    p_ev.add_argument("--actor")
    p_ev.add_argument("--ref")
    p_ev.add_argument("--stage")
    p_ev.add_argument("--cycle", type=int)
    p_ev.add_argument("--day", type=int)
    args = ap.parse_args()
    url, key = load_config()
    {"status": cmd_status, "push": cmd_push, "pull": cmd_pull, "event": cmd_event}[args.cmd](args, url, key)


if __name__ == "__main__":
    main()
