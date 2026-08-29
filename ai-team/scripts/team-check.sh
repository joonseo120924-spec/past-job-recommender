#!/usr/bin/env bash
# 팀 정의 드리프트 점검기 — 문서와 실제 파일이 어긋난 것을 실측으로 잡는다.
# 사용: ai-team/scripts/team-check.sh [--quiet]
# --quiet 는 이상이 없으면 아무것도 출력하지 않는다 (훅용).
cd "$(dirname "$0")/../.." || exit 0
A=.claude/agents
QUIET=0; [ "$1" = "--quiet" ] && QUIET=1
FAIL=0
say() { [ $QUIET -eq 0 ] && echo "$@"; }
bad() { echo "🔴 $*"; FAIL=$((FAIL+1)); }

# 본부 정본 — team-org.md 와 일치해야 한다
declare -A UNIT=(
 [strategy-lead]="market-analyst competitor-analyst user-researcher source-verifier"
 [product-planner]="ux-designer system-architect ux-writer data-analyst"
 [design-lead]="ui-designer brand-designer accessibility-auditor"
 [tech-lead]="frontend-dev fullstack-dev performance-engineer security-architect"
 [qa-lead]="functional-tester security-tester compatibility-tester test-automation-engineer"
 [gtm-lead]="store-release ops-manager privacy-compliance tech-writer"
)
AUDIT="team-master evidence-auditor"

# 1) 정본 인원 = 실제 파일
EXPECT=0
for l in "${!UNIT[@]}"; do EXPECT=$((EXPECT+1)); for m in ${UNIT[$l]}; do EXPECT=$((EXPECT+1)); done; done
for m in $AUDIT; do EXPECT=$((EXPECT+1)); done
ACTUAL=$(ls "$A"/*.md 2>/dev/null | wc -l)
[ "$ACTUAL" -ne "$EXPECT" ] && bad "인원 불일치: 정본 ${EXPECT}명 vs 파일 ${ACTUAL}개"

# 2) 파일 형식
for f in "$A"/*.md; do
  n=$(basename "$f" .md)
  [ "$(head -1 "$f")" != "---" ] && bad "$n: 첫 줄이 --- 가 아님"
  [ "$(awk 'NR>1&&/^name:/{print $2;exit}' "$f")" != "$n" ] && bad "$n: name 이 파일명과 다름"
  [ "$(grep -c '^description:' "$f")" -ne 1 ] && bad "$n: description 이 1개가 아님"
  [ -z "$(awk '/^model:/{print $2;exit}' "$f")" ] && bad "$n: model 없음"
  grep -q 'team-rules.md' "$f" || bad "$n: 공통 규정(.claude/team-rules.md) 필독 지시 없음"
done

# 3) 정본에 있는데 파일이 없는 사람 / 파일만 있고 정본에 없는 사람
KNOWN=""
for l in "${!UNIT[@]}"; do KNOWN="$KNOWN $l ${UNIT[$l]}"; done
KNOWN="$KNOWN $AUDIT"
for who in $KNOWN; do
  [ -f "$A/$who.md" ] || bad "정본에 있으나 파일 없음: $who — 호출 불가"
done
for f in "$A"/*.md; do
  n=$(basename "$f" .md)
  echo " $KNOWN " | grep -q " $n " || bad "파일만 있고 정본(team-org.md)에 없음: $n"
done

# 4) 파트장이 본부 전원을 알고 있는가 — 분배안 누락의 원인
for l in "${!UNIT[@]}"; do
  [ -f "$A/$l.md" ] || continue
  for m in ${UNIT[$l]}; do
    grep -q "$m" "$A/$l.md" || bad "$l 가 부하 $m 를 언급하지 않음 — 분배안에서 빠집니다"
  done
done

# 5) 기록 파일 경로 (B-02 재발 방지)
n=$(grep -c '`\(approvals\|questions\|decisions\|SESSION-LOG\)\.md`' "$A"/*.md 2>/dev/null | grep -v ':0$' | wc -l)
[ "$n" -gt 0 ] && bad "경로 없는 기록파일 참조 ${n}개 — 루트에 새 파일이 생깁니다 (ai-team/ 접두 필요)"

# 6) 게이트 수치 드리프트
grep -q '10항목' "$A/tech-lead.md" || bad "tech-lead 착수 게이트가 10항목이 아님 (team-org.md 와 불일치)"
grep -q '6자료'  "$A/qa-lead.md"  || bad "qa-lead 착수 자료가 6자료가 아님 (team-org.md 와 불일치)"

if [ $FAIL -eq 0 ]; then
  say "✅ 팀 정의 점검 통과 — ${ACTUAL}명, 형식·명부·경로·게이트 일치"
else
  echo "⚠️ 팀 정의 드리프트 ${FAIL}건 — 위 항목을 고치기 전에는 사이클을 진행하지 마십시오"
fi
exit 0
