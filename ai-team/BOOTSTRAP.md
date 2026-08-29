# 🚀 어느 창에서든 팀 불러오기 — 붙여넣기 한 덩어리

> **지시 원문 (2026-08-29)**: "슈퍼베이스에 ㄷ다른 창에서도 회의 실을 부르면 완벽하게 나오게 해놔"

새 대화창에 저장소가 있든 없든, 아래 한 덩어리면 **팀 31명 + 규정 + 회의실 스킬 + 상태 파일**이
슈퍼베이스에서 그대로 내려옵니다. `git` 도, 브랜치 이름도 몰라도 됩니다.

## 0. 키 (한 번만)
```bash
export SUPABASE_URL='https://<프로젝트>.supabase.co'
export SUPABASE_KEY='sb_publishable_...'
```
> 이 저장소는 **공개**입니다. 키는 커밋하지 마십시오. 원격 환경이면 환경변수로,
> 로컬이면 `ai-team/supabase/.env` (git 추적 안 함) 에 두십시오.

## 1. 붙여넣기 — 이게 전부입니다
```bash
python3 - <<'PY'
# AI 앱 개발팀 · 슈퍼베이스 부트스트랩 (외부 의존 없음, 표준 라이브러리만)
import json, os, subprocess, sys, urllib.request
U = os.environ.get("SUPABASE_URL", "").rstrip("/"); K = os.environ.get("SUPABASE_KEY", "")
if not U or not K:
    sys.exit("✗ SUPABASE_URL / SUPABASE_KEY 를 먼저 export 하십시오")
try:                                    # 저장소 안이면 루트에, 아니면 현재 폴더에 풉니다
    root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"],
                                   stderr=subprocess.DEVNULL, text=True).strip()
except Exception:
    root = os.getcwd()
rows, off = {}, 0
while True:                             # 페이지로 끊어 받습니다 (행이 79개 이상입니다)
    req = urllib.request.Request(
        "%s/rest/v1/team_state?select=key,content&order=key&offset=%d&limit=50" % (U, off))
    req.add_header("apikey", K); req.add_header("Authorization", "Bearer " + K)
    part = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
    rows.update({r["key"]: r["content"] for r in part})
    if len(part) < 50: break
    off += 50
if not rows: sys.exit("✗ 원격이 비어 있습니다. 팀이 있는 창에서 push --team 을 먼저 하십시오")
n = 0
for k, c in rows.items():
    rel = k if "/" in k else "ai-team/" + k          # 이름만 있는 8개는 ai-team/ 아래로
    dest = os.path.join(root, rel); os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w", encoding="utf-8", newline="").write(c)
    if rel.startswith("ai-team/scripts/") and rel.endswith((".sh", ".py")): os.chmod(dest, 0o755)
    n += 1
agents = sum(1 for k in rows if k.startswith(".claude/agents/"))
print("✓ %d개 파일 복원 · 에이전트 %d명 → %s" % (n, agents, root))
print("⚠️ 31명이 아니면 원격이 불완전합니다" if agents != 31 else "다음: ai-team/scripts/roster.sh")
PY
```

## 2. 확인
```bash
ai-team/scripts/roster.sh          # 31명 점호
ai-team/scripts/team-check.sh      # 정의 드리프트 실측
cat ai-team/STATE.md               # 지금 어디까지 왔나
```

## 3. 그다음 — "회의실"
파일이 갖춰졌으면 **"회의실"** 이라고 하시면 됩니다.

> ⚠️ **언제 잡히는가 — 실측 2026-08-29 (두 번 재어 값이 달랐으므로 둘 다 적습니다).**
> ① 파일을 부어 넣은 **바로 그 턴**에 회의실 스킬 호출 → **`Unknown skill: meeting-room`**
> ② **다음 턴**에 다시 보니 `meeting-room` · `daily-app` 이 **스킬 목록에 올라와 있었습니다**
> 즉 같은 창에서도 **한 턴 뒤에는 잡힙니다.** 곧바로 안 되면 실패가 아니라 아직인 것이니,
> 한 번 더 말을 걸어 보시고 그래도 없으면 그때 새 창을 여십시오.
> (서브에이전트 31명이 같은 창에서 곧바로 불리는지는 **아직 확인하지 않았습니다** — 회의실을 열 때 실제로 호출해 보고 그 결과를 적겠습니다.)
> 이미 열려 있던 창에 방금 파일을 부어 넣으면, 그 창에서 31명이 곧바로 안 잡힐 수 있습니다.
> 그때는 **새 창을 열면** 됩니다 — 파일은 이미 디스크(그리고 슈퍼베이스)에 있으므로 다시 받을 필요가 없습니다.
> 가장 확실한 길은 여전히 **팀 브랜치로 창을 여는 것**이고, 이 부트스트랩은 그게 안 될 때의 확실한 우회로입니다.

## 4. 반대 방향 — 올리기
팀을 고쳤으면 **올려야** 다른 창이 같은 것을 봅니다.
```bash
python3 ai-team/scripts/supabase-sync.py push --team    # 팀 정의 + 상태 전부
python3 ai-team/scripts/supabase-sync.py verify         # 원격만으로 복원되는가
```
`verify` 가 ✅ 를 내지 않으면 **다른 창에서 완벽하게 나오지 않습니다.** 그 상태로 두지 마십시오.

## 5. 키 없이 이 구조가 맞는지 시험하기
```bash
python3 ai-team/scripts/selftest-supabase.py
```
가짜 서버를 띄워 **push → 빈 디렉터리 restore → sha256 전량 대조 → verify** 까지 실측합니다.
