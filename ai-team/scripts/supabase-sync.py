#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI 앱 개발팀 · 슈퍼베이스 동기화 (Linux 원격 컨테이너용)

Windows 로컬에는 Python 이 없으므로 같은 기능을 supabase-sync.ps1 이 담당합니다.

  python3 ai-team/scripts/supabase-sync.py status
  python3 ai-team/scripts/supabase-sync.py push
  python3 ai-team/scripts/supabase-sync.py push --team     # 팀 정의(.claude 31명·규정·스킬·스크립트)까지
  python3 ai-team/scripts/supabase-sync.py pull            # 차이만 보고, 파일은 건드리지 않음
  python3 ai-team/scripts/supabase-sync.py pull --force    # 로컬 파일을 원격 내용으로 덮어씀
  python3 ai-team/scripts/supabase-sync.py restore         # 팀 전체를 원격에서 이 체크아웃으로 복원(예행)
  python3 ai-team/scripts/supabase-sync.py restore --force # 실제로 파일을 씀
  python3 ai-team/scripts/supabase-sync.py verify          # 원격만으로 팀이 완전히 복원되는가 (실측)
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

# 팀 정의 — 저장소 루트 기준 상대 경로로 저장합니다.
# 위 FILES(8개)는 예전부터 파일명만으로 저장돼 있어 그대로 두고, 여기서는 "/" 가 들어간
# 루트 기준 경로만 씁니다. 그래서 키가 겹치지 않고 supabase-sync.ps1 과도 호환됩니다.
TEAM_GLOBS = [
    ".claude/*.md", ".claude/settings.json", ".claude/agents/*.md", ".claude/skills/*/SKILL.md",
    "ai-team/*.md", "ai-team/scripts/*.sh", "ai-team/scripts/*.py", "ai-team/scripts/*.ps1",
    "ai-team/scripts/*.json", "ai-team/supabase/schema.sql", "ai-team/supabase/.env.example",
    "ai-team/notion-queue/*.md",
    # 3차 감사 중대-2: 정본 1차 기록처(events.log)와 감사 보고서가 빠진 채
    # verify 가 「✅ 완전」을 냈습니다. 복원해도 감사 이력과 회의 기록이 사라집니다
    "ai-team/events.log",
    "ai-team/docs/*.md",
]
# 복원 후 이것이 갖춰지지 않으면 "복원됨"이라고 쓰지 않습니다 (verify 가 실측합니다)
REQUIRED = {
    "agents": 31,                       # 6본부 29명 + 감사실 2명
    "files": ["ai-team/events.log", ".claude/team-rules.md", ".claude/team-org.md", ".claude/master.md",
              ".claude/master-doctrine.md", ".claude/settings.json",
              ".claude/skills/meeting-room/SKILL.md", ".claude/skills/daily-app/SKILL.md",
              "ai-team/scripts/roster.sh", "ai-team/scripts/team-check.sh",
              "ai-team/scripts/checkpoint.sh", "ai-team/scripts/supabase-sync.py"],
}
EXEC_SUFFIX = (".sh", ".py")

KINDS = ["호출", "승인", "반려", "결정", "막힘", "기록", "동기화", "감사", "논쟁"]


def die(msg, code=1):
    print("✗ " + msg, file=sys.stderr)
    sys.exit(code)


def load_config():
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if (not url or not key) and os.path.exists(ENV_FILE):
        # 메모장·PowerShell 5.1 은 UTF-8 에 BOM 을 붙입니다. BOM 이 남으면 첫 줄 키가
        # "\ufeffSUPABASE_URL" 이 되어 조용히 인식되지 않습니다 — encoding 으로 흡수합니다.
        with open(ENV_FILE, encoding="utf-8-sig") as fh:
            for line in fh:
                line = line.strip().lstrip("\ufeff")
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


def team_files():
    """팀 정의 파일 — {루트 기준 경로: 본문}. 키에 반드시 "/" 가 들어갑니다."""
    import glob as _glob
    out = {}
    for pattern in TEAM_GLOBS:
        for path in sorted(_glob.glob(os.path.join(ROOT, pattern))):
            rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
            # ai-team/ 바로 아래 8개 상태 파일은 예전 키(파일명만)로 이미 올라갑니다
            if rel.count("/") == 1 and rel.startswith("ai-team/") and os.path.basename(rel) in FILES:
                continue
            if not os.path.isfile(path):
                continue
            try:
                with open(path, encoding="utf-8") as fh:
                    out[rel] = fh.read()
            except UnicodeDecodeError:
                print("⏭ 건너뜀(UTF-8 아님): %s" % rel)
    return out


def write_file(rel, content):
    """루트 기준 경로에 파일을 씁니다. 디렉터리를 만들고 실행권한도 되살립니다."""
    dest = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8", newline="") as fh:
        fh.write(content)
    if rel.startswith("ai-team/scripts/") and rel.endswith(EXEC_SUFFIX):
        os.chmod(dest, 0o755)


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


def upload(rows, url, key, chunk=40):
    """team_state 로 upsert. 행이 많으면 나눠 보냅니다 — 한 번에 다 보내다 끊기면
    무엇이 올라갔는지 알 수 없게 됩니다."""
    sent = 0
    for i in range(0, len(rows), chunk):
        part = rows[i:i + chunk]
        request("POST", "/rest/v1/team_state", key, url, part,
                prefer="resolution=merge-duplicates,return=minimal")
        sent += len(part)
        if len(rows) > chunk:
            print("  … %d / %d" % (sent, len(rows)))
    return sent


def cmd_push(args, url, key):
    local = local_files()
    if not local:
        die("보낼 상태 파일이 없습니다.")
    now = datetime.now(timezone.utc).isoformat()
    branch = git_branch()
    payload = dict(local)
    team = {}
    if args.team:
        team = team_files()
        if len(team) < 40:
            die("팀 정의 파일이 %d개뿐입니다. 이 체크아웃에 팀이 없는 것으로 보입니다 — "
                "덮어쓰면 원격의 온전한 팀이 망가집니다. 중단합니다." % len(team))
        payload.update(team)
    rows = [{"key": n, "content": c, "sha256": sha256(c), "bytes": len(c.encode("utf-8")),
             "branch": branch, "source": args.source, "updated_at": now}
            for n, c in payload.items()]
    upload(rows, url, key)
    print("✓ %d개 파일 업로드 — 상태 %d · 팀 정의 %d (source=%s, branch=%s)"
          % (len(rows), len(local), len(team), args.source, branch))
    title = ("상태 %d + 팀 정의 %d개 push" % (len(local), len(team))) if team \
        else ("상태 파일 %d개 push" % len(local))
    request("POST", "/rest/v1/team_events", key, url,
            [{"kind": "동기화", "title": title,
              "body": ", ".join(sorted(payload)), "actor": "supabase-sync",
              "ref": branch, "source": args.source}], prefer="return=minimal")
    print("✓ team_events 에 동기화 기록 남김")
    if team:
        print("→ 이제 어느 창에서든 복원됩니다:  python3 ai-team/scripts/supabase-sync.py restore --force")
        print("   저장소가 통째로 없는 창이라면 ai-team/BOOTSTRAP.md 의 붙여넣기 한 덩어리를 쓰십시오.")


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


def remote_all(url, key):
    """team_state 전량을 받아 {키: 본문} 으로. 행이 많으므로 페이지로 끊어 받습니다."""
    out, offset, page = {}, 0, 50
    while True:
        rows = request("GET", "/rest/v1/team_state?select=key,content&order=key"
                              "&offset=%d&limit=%d" % (offset, page), key, url) or []
        for r in rows:
            out[r["key"]] = r["content"]
        if len(rows) < page:
            break
        offset += page
    return out


def audit(rows):
    """원격 내용만으로 팀이 성립하는지 실측합니다. 부족한 것을 그대로 돌려줍니다."""
    missing = [f for f in REQUIRED["files"] if f not in rows]
    agents = sorted(k for k in rows if k.startswith(".claude/agents/") and k.endswith(".md"))
    bad = []
    for k in agents:
        body = rows[k]
        if body.startswith("\ufeff"):
            bad.append("%s — BOM 있음 (에이전트가 통째로 사라지는 원인)" % k)
        elif not body.startswith("---"):
            bad.append("%s — 첫 줄이 --- 가 아님" % k)
    state_missing = [f for f in FILES if f not in rows]
    return {"agents": len(agents), "missing": missing, "bad": bad, "state_missing": state_missing}


def report(a):
    ok = (a["agents"] == REQUIRED["agents"] and not a["missing"]
          and not a["bad"] and not a["state_missing"])
    print("  에이전트 %d / %d" % (a["agents"], REQUIRED["agents"]))
    for m in a["missing"]:
        print("  🔴 없음: %s" % m)
    for b in a["bad"]:
        print("  🔴 형식: %s" % b)
    for m in a["state_missing"]:
        print("  ⚠️ 상태 파일 없음: %s" % m)
    return ok


def cmd_verify(args, url, key):
    rows = remote_all(url, key)
    print("원격 보유 %d행 — 팀이 이것만으로 복원되는가" % len(rows))
    ok = report(audit(rows))
    print("\n%s" % ("✅ 완전 — 어느 창에서든 restore 하나로 팀이 나옵니다" if ok else
                    "🔴 불완전 — 팀이 있는 체크아웃에서 `push --team` 을 먼저 하십시오"))
    sys.exit(0 if ok else 2)


def cmd_restore(args, url, key):
    rows = remote_all(url, key)
    if not rows:
        die("원격에 아무것도 없습니다. 팀이 있는 체크아웃에서 `push --team` 을 먼저 하십시오.")
    a = audit(rows)
    print("원격 %d행 — 검사" % len(rows))
    ok = report(a)
    if not ok and not args.allow_incomplete:
        die("\n불완전한 원격으로는 복원하지 않습니다. 반쯤 복원된 팀이 더 위험합니다.\n"
            "  그래도 받으시려면 --allow-incomplete 를 주십시오.")
    plan_new, plan_diff, plan_same = [], [], []
    for k, content in sorted(rows.items()):
        rel = k if "/" in k else ("ai-team/" + k)
        dest = os.path.join(ROOT, rel)
        if not os.path.exists(dest):
            plan_new.append(rel)
        else:
            with open(dest, encoding="utf-8") as fh:
                cur = fh.read()
            (plan_same if cur == content else plan_diff).append(rel)
    print("\n새로 씀 %d · 덮어씀 %d · 그대로 %d"
          % (len(plan_new), len(plan_diff), len(plan_same)))
    for rel in plan_diff[:20]:
        print("  ✎ %s" % rel)
    if len(plan_diff) > 20:
        print("  … 외 %d개" % (len(plan_diff) - 20))
    if not args.force:
        print("\n예행입니다. 파일을 건드리지 않았습니다. 실제로 쓰려면 --force 를 주십시오.")
        print("정본은 저장소입니다 — 로컬이 더 최신이면 덮어쓰지 마십시오.")
        return
    for k, content in rows.items():
        write_file(k if "/" in k else ("ai-team/" + k), content)
    print("\n✓ %d개 파일 복원" % len(rows))
    print("  다음: ai-team/scripts/roster.sh  ·  ai-team/scripts/team-check.sh 로 실측 확인")
    print("  ⚠️ 이 창에서 에이전트가 곧바로 안 잡히면 새 세션이 필요합니다 "
          "(정의는 세션 시작 때 읽힙니다). 파일은 이미 여기 있습니다.")


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
    p_push = sub.add_parser("push", help="상태 파일을 슈퍼베이스로 올림")
    p_push.add_argument("--team", action="store_true",
                        help="팀 정의(.claude 31명·규정·스킬·스크립트)까지 함께 올림")
    p_pull = sub.add_parser("pull", help="원격 내용을 확인 (--force 여야 파일을 덮어씀)")
    p_pull.add_argument("--force", action="store_true")
    p_res = sub.add_parser("restore", help="원격에서 팀 전체를 이 체크아웃으로 복원")
    p_res.add_argument("--force", action="store_true", help="실제로 파일을 씀")
    p_res.add_argument("--allow-incomplete", action="store_true",
                       help="원격이 불완전해도 받음 (권장하지 않음)")
    sub.add_parser("verify", help="원격만으로 팀이 완전히 복원되는지 실측")
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
    {"status": cmd_status, "push": cmd_push, "pull": cmd_pull, "event": cmd_event,
     "restore": cmd_restore, "verify": cmd_verify}[args.cmd](args, url, key)


if __name__ == "__main__":
    main()
