#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""슈퍼베이스 왕복 자체 시험 — **키 없이** 실측합니다.

가짜 PostgREST 를 로컬에 띄우고 실제 supabase-sync.py 를 그대로 실행합니다.

  1) 이 저장소에서  push --team      → 팀 정의 + 상태를 올림
  2) **빈 디렉터리**에서 restore --force → 아무것도 없는 곳에 팀이 복원되는가
  3) 원본 ↔ 복원본을 sha256 으로 전량 대조
  4) verify 가 "완전"으로 판정하는가

  python3 ai-team/scripts/selftest-supabase.py

실패하면 종료코드 1. "돌려봤다"가 아니라 **무엇이 몇 개 일치했는지**를 찍습니다.
"""
import hashlib, http.server, json, os, shutil, subprocess, sys, tempfile, threading, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SYNC = os.path.join("ai-team", "scripts", "supabase-sync.py")
STORE = {}          # team_state — key → row
EVENTS = []         # team_events


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        rows = json.loads(self.rfile.read(n).decode("utf-8")) if n else []
        if self.path.startswith("/rest/v1/team_state"):
            for r in rows:                      # upsert (PK = key)
                STORE[r["key"]] = r
        elif self.path.startswith("/rest/v1/team_events"):
            EVENTS.extend(rows)
        self._json([], 201)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path.endswith("team_state"):
            rows = [STORE[k] for k in sorted(STORE)]
            off = int(q.get("offset", [0])[0])
            lim = int(q.get("limit", [10 ** 6])[0])
            return self._json(rows[off:off + lim])
        if u.path.endswith("team_events"):
            return self._json(EVENTS[-5:])
        return self._json([])


def run(cmd, cwd, url, extra=None):
    env = dict(os.environ, SUPABASE_URL=url, SUPABASE_KEY="test-key",
               no_proxy="127.0.0.1,localhost", NO_PROXY="127.0.0.1,localhost")
    if extra:
        env.update(extra)
    for v in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        env.pop(v, None)
    return subprocess.run([sys.executable] + cmd, cwd=cwd, env=env,
                          capture_output=True, text=True)


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    url = "http://127.0.0.1:%d" % srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    fail = []

    # 1) 올리기
    r = run([SYNC, "--source", "selftest", "push", "--team"], ROOT, url)
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode != 0:
        print("🔴 push 실패"); return 1
    print("→ 원격(가짜) 보유 %d행 · 이벤트 %d건" % (len(STORE), len(EVENTS)))

    # 2) 빈 디렉터리에 복원 — 저장소가 통째로 없는 창을 흉내냅니다
    tmp = tempfile.mkdtemp(prefix="team-restore-")
    os.makedirs(os.path.join(tmp, "ai-team", "scripts"), exist_ok=True)
    shutil.copy2(os.path.join(ROOT, SYNC), os.path.join(tmp, SYNC))
    r = run([SYNC, "restore", "--force"], tmp, url)
    print(r.stdout.strip()[-500:] or r.stderr.strip())
    if r.returncode != 0:
        print("🔴 restore 실패"); return 1

    # 3) 전량 대조
    same = 0
    for key, row in STORE.items():
        rel = key if "/" in key else ("ai-team/" + key)
        dest = os.path.join(tmp, rel)
        if not os.path.exists(dest):
            fail.append("복원 안 됨: " + rel); continue
        got = open(dest, encoding="utf-8").read()
        if hashlib.sha256(got.encode()).hexdigest() == row["sha256"]:
            same += 1
        else:
            fail.append("내용 다름: " + rel)
    print("\n대조: sha256 일치 %d / %d" % (same, len(STORE)))

    # 3-1) 실행권한 — roster.sh 가 실행 가능해야 점호를 낼 수 있습니다
    rost = os.path.join(tmp, "ai-team", "scripts", "roster.sh")
    if os.path.exists(rost) and not os.access(rost, os.X_OK):
        fail.append("roster.sh 실행권한 없음")

    # 3-2) 복원된 곳에서 실제로 점호가 나오는가
    got = subprocess.run(["bash", os.path.join(tmp, "ai-team", "scripts", "team-check.sh")],
                         cwd=tmp, capture_output=True, text=True)
    print("복원본 team-check: %s" % (got.stdout.strip().splitlines() or ["(출력 없음)"])[-1])

    # 3-3) BOOTSTRAP.md 의 붙여넣기 덩어리 — 문서에 적힌 그대로가 실제로 도는가
    doc = os.path.join(ROOT, "ai-team", "BOOTSTRAP.md")
    if os.path.exists(doc):
        text = open(doc, encoding="utf-8").read()
        if "<<'PY'" in text:
            snippet = text.split("<<'PY'", 1)[1].split("\nPY", 1)[0]
            tmp2 = tempfile.mkdtemp(prefix="team-bootstrap-")
            boot = os.path.join(tmp2, "boot.py")
            open(boot, "w", encoding="utf-8").write(snippet)
            # 덩어리는 이제 기본이 **예행**입니다 (3차 감사 치명-2). 먼저 예행을 확인하고,
            # CONFIRM=1 로 실제 복원까지 봅니다 — 안전장치가 사는지도 시험입니다
            dry = run([boot], tmp2, url)
            if os.path.exists(os.path.join(tmp2, ".claude")):
                fail.append("BOOTSTRAP 예행이 파일을 썼습니다 — 안전장치 없음")
            r = run([boot], tmp2, url, extra={"CONFIRM": "1"})
            print("BOOTSTRAP.md 붙여넣기: %s" % (r.stdout.strip().splitlines() or [r.stderr.strip()])[0])
            got = sum(len(files) for _, _, files in os.walk(tmp2)) - 1   # boot.py 제외
            if got != len(STORE):
                fail.append("BOOTSTRAP 덩어리가 %d개만 복원 (기대 %d)" % (got, len(STORE)))
            if not os.path.exists(os.path.join(tmp2, ".claude", "skills", "meeting-room", "SKILL.md")):
                fail.append("BOOTSTRAP 덩어리가 회의실 스킬을 복원하지 못함")
            shutil.rmtree(tmp2, ignore_errors=True)
        else:
            fail.append("BOOTSTRAP.md 에 붙여넣기 덩어리가 없습니다")
    else:
        fail.append("ai-team/BOOTSTRAP.md 가 없습니다")

    # 4) verify
    r = run([SYNC, "verify"], tmp, url)
    print(r.stdout.strip())
    if r.returncode != 0:
        fail.append("verify 가 불완전으로 판정")

    shutil.rmtree(tmp, ignore_errors=True)
    srv.shutdown()
    if fail:
        print("\n🔴 실패 %d건" % len(fail))
        for f in fail[:20]:
            print("  " + f)
        return 1
    print("\n✅ 왕복 통과 — 빈 디렉터리에 %d개 파일이 sha256 까지 같게 복원됐습니다" % len(STORE))
    return 0


if __name__ == "__main__":
    sys.exit(main())
