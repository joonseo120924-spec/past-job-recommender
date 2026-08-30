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

# 6-1) 게이트 숫자가 **정본끼리** 일치하는가 (D-036)
#      6번은 본문에 '10항목' 이 있기만 하면 통과시켰습니다. 그래서 최우선 정본
#      team-rules.md 와 description 줄이 옛 숫자로 남아 있어도 초록불이 켜졌고,
#      2026-08-30 감사에서 치명-2·치명-3 으로 지적됐습니다.
R=.claude/team-rules.md
grep -q '10항목' "$R" || bad "규정 정본 team-rules.md 에 10항목이 없음 — 게이트 정본은 이 파일입니다"
grep -q '6자료'  "$R" || bad "규정 정본 team-rules.md 에 6자료가 없음"
grep -q '호환성 실측표' "$R" || bad "규정 정본 team-rules.md 의 ⑤ QA 완료에 호환성 실측표가 없음"
grep -q '② 설계 완료' "$R" || bad "규정 정본 team-rules.md 에 ② 설계 완료 게이트가 없음"
grep -q '⑥ 출시 착수' "$R" || bad "규정 정본 team-rules.md 에 ⑥ 출시 착수 게이트가 없음"
# 수치는 정본 한 곳에만. team-org.md 에 다시 표가 생기면 드리프트가 재발합니다
# 표의 줄(| 로 시작)만 봅니다. 경위 설명에서 옛 값을 인용하는 것은 정상입니다
grep -E '^\|.*(8항목|5자료)' "$R" >/dev/null && bad "규정 정본 **표**에 옛 수치(8항목/5자료)가 남아 있음"
# description 줄 — 마스터가 누구를 부를지 고를 때 읽는 줄입니다. 본문만 고치면 여기 남습니다
grep '^description:' "$A/tech-lead.md" | grep -q '8항목' && bad "tech-lead description 이 아직 8항목"
grep '^description:' "$A/qa-lead.md"   | grep -q '5자료' && bad "qa-lead description 이 아직 5자료"
grep -q 'QA 착수 6자료' "$A/tech-lead.md" || bad "tech-lead 의 handoff 지시가 6자료가 아님 — qa-lead 는 6자료를 요구합니다"
# 파트장이 부하 인원을 옛 숫자로 전제하지 않는가
grep -q '두 실무자\|두 산출물' "$A/product-planner.md" "$A/design-lead.md" && bad "파트장 정의가 실무자를 옛 인원(2인)으로 전제"
# 감사관 둘 다 산출 경로 절이 있어야 합니다 (B-02 부류)
for f in team-master evidence-auditor; do
  grep -q '^## 산출물' "$A/$f.md" || bad "$f 에 산출 경로 절이 없음 — 접두사 없이 쓰면 루트에 떨어집니다"
done

# 6-2) 게이트·명부 **값 대조** (D-037) — 낱말이 아니라 집합과 개수를 봅니다
python3 ai-team/scripts/check-gates.py || FAIL=$((FAIL+1))

# 7) 총괄 호칭 (D-034) — 역사 기록(decisions.md)은 소급 수정하지 않으므로 제외
[ -f .claude/master.md ] || bad "정체성 정본 .claude/master.md 가 없습니다"
# 파일명에 남아 있으면 실패
n=$(find . -path ./.git -prune -o -iname '*jarvis*' -print 2>/dev/null | wc -l)
[ "$n" -gt 0 ] && bad "파일명에 옛 호칭이 남은 파일 ${n}개 — D-034 대조표대로 바꾸십시오"
# 본문은 '경위 설명'만 허용한다. 되돌림 맥락(D-029/D-034/되돌/옛/이전) 없이 쓴 줄이면 실패
n=$(grep -rn --exclude-dir=.git --exclude-dir=__pycache__ -iE 'jarvis|자비스|J *A *R *V *I *S' . 2>/dev/null \
      | grep -v '^\./ai-team/decisions\.md:' \
      | grep -v '^\./ai-team/scripts/team-check\.sh:' \
      | grep -v '^\./ai-team/docs/감사-' \
      | grep -v '^\./ai-team/notion-queue/' \
      | grep -vE 'D-029|D-034|되돌|옛 호칭|이전 호칭' | wc -l)
[ "$n" -gt 0 ] && bad "옛 호칭을 현재 호칭처럼 쓴 줄 ${n}개 — 총괄 호칭은 마스터입니다 (D-034)"

if [ $FAIL -eq 0 ]; then
  say "✅ 팀 정의 점검 통과 — ${ACTUAL}명, 형식·명부·경로·게이트 일치"
else
  echo "⚠️ 팀 정의 드리프트 ${FAIL}건 — 위 항목을 고치기 전에는 사이클을 진행하지 마십시오"
fi
exit 0
