#!/usr/bin/env bash
# 팀 로스터를 .claude/agents/ 에서 **실측해** 출력합니다 (D-026).
# 손으로 관리하는 목록은 드리프트합니다 — 실제로 2026-08-29 에
# "tools 금지 역할 10개" 목록이 실물과 달랐던 전례가 있습니다.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0
[ -d .claude/agents ] || { echo "⚠️ .claude/agents 없음 — 팀이 이 체크아웃에 없습니다"; exit 0; }

N=$(ls .claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "👥 팀 ${N}명 — 이름을 그대로 불러 호출합니다 (Agent 도구의 subagent_type)"
python3 - <<'PY'
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
listed = set()
for unit, names in UNIT:
    present = [n for n in names if n in have]
    listed |= set(names)
    lead = present[0] if present else ""
    rest = " · ".join(present[1:])
    missing = [n for n in names if n not in have]
    line = "  %-11s %s" % (unit, lead + (" | " + rest if rest else ""))
    if missing:
        line += "   ⚠️ 없음: " + ", ".join(missing)
    print(line)
extra = sorted(have - listed)
if extra:
    print("  (조직도에 없는 에이전트: %s)" % ", ".join(extra))
PY
