#!/usr/bin/env bash
# 팀 로스터를 .claude/agents/ 에서 **실측해** 출력합니다 (D-026).
# 손으로 관리하는 목록은 드리프트합니다 — 실제로 2026-08-29 에
# "tools 금지 역할 10개" 목록이 실물과 달랐던 전례가 있습니다.
#
#   roster.sh              명단만
#   roster.sh --unit 1     ① 전략이 발언하는 날의 출석부 (🗣/⏳/👁)
#   roster.sh --unit all   전원 발언 (킥오프·개편·감사)
#   roster.sh --full       전원 상세 — 파트장/직원 · 모델(opus·sonnet) · 도구 · 하는 일
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0
[ -d .claude/agents ] || { echo "⚠️ .claude/agents 없음 — 팀이 이 체크아웃에 없습니다"; exit 0; }

if [ "${1:-}" = "--full" ]; then FULL=1 python3 "$(dirname "$0")/roster-full.py"; exit 0; fi
UNIT="${2:-}"; [ "${1:-}" = "--unit" ] || UNIT=""
N=$(ls .claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
if [ -n "$UNIT" ]; then
  echo "🔔 출석 ${N} / ${N} — 🗣 오늘 발언 · ⏳ 대기 · 👁 상시 감시"
else
  echo "👥 팀 ${N}명 — 이름을 그대로 불러 호출합니다 (Agent 도구의 subagent_type)"
fi
UNIT="$UNIT" python3 - <<'PY'
import glob, os, re, io
UNIT = [
    ("① 전략",   ["strategy-lead","market-analyst","competitor-analyst","user-researcher","source-verifier"]),
    ("② 프로덕트",["product-planner","ux-designer","system-architect","ux-writer","data-analyst"]),
    ("③ 디자인",  ["design-lead","ui-designer","brand-designer","accessibility-auditor"]),
    ("④ 개발",    ["tech-lead","frontend-dev","fullstack-dev","performance-engineer","security-architect"]),
    ("⑤ 품질",    ["qa-lead","functional-tester","security-tester","compatibility-tester","test-automation-engineer"]),
    ("⑥ 출시운영",["gtm-lead","store-release","ops-manager","privacy-compliance","tech-writer"]),
    ("🎖️ 감사실", ["team-master","evidence-auditor"]),
]
have = {os.path.basename(p)[:-3] for p in glob.glob(".claude/agents/*.md")}
sel = os.environ.get("UNIT", "").strip()
WAIT = {  # 대기 사유 — "대기"라고만 적는 것은 빠뜨린 것과 구별되지 않습니다
    "① 전략": "사이클 착수 시", "② 프로덕트": "① 승인 후", "③ 디자인": "② 설계 승인 후",
    "④ 개발": "③ 디자인 승인 + 착수 10항목 충족 후", "⑤ 품질": "④ 구현 완료 승인 후",
    "⑥ 출시운영": "⑤ 품질 승인 후",
}
listed = set()
for i, (unit, names) in enumerate(UNIT, start=1):
    present = [n for n in names if n in have]
    listed |= set(names)
    missing = [n for n in names if n not in have]
    if not sel:
        lead = present[0] if present else ""
        rest = " · ".join(present[1:])
        line = "  %-11s %s" % (unit, lead + (" | " + rest if rest else ""))
    else:
        audit = unit.startswith("🎖️")
        active = audit or sel == "all" or sel == str(i)
        mark = "👁" if audit else ("🗣" if active else "⏳")
        tail = "" if active else "  ← %s" % WAIT.get(unit, "선행 단계 후")
        line = "  %-11s %s%s" % (unit, " ".join("%s%s" % (n, mark) for n in present), tail)
    if missing:
        line += "   ⚠️ 호출 불가(파일 없음): " + ", ".join(missing)
    print(line)
extra = sorted(have - listed)
if extra:
    print("  (조직도에 없는 에이전트: %s)" % ", ".join(extra))
PY
