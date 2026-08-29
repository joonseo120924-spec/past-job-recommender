#!/usr/bin/env bash
# AI 앱 개발팀 · 체크포인트 (D-026 「항상 규칙」)
#
#   슈퍼베이스 저장 → GitHub 푸시 → 노션 큐 확인 을 한 번에 합니다.
#   훅(Stop)이 자동으로 부르고, 사람도 직접 부를 수 있습니다.
#
#   ai-team/scripts/checkpoint.sh                 사람이 읽는 출력
#   ai-team/scripts/checkpoint.sh --hook          훅용 JSON 한 줄
#   ai-team/scripts/checkpoint.sh "사유" 	  커밋 메시지에 사유를 남김
#
# 설계 원칙
#   - 세션을 절대 막지 않습니다. 무엇이 실패해도 exit 0
#   - 못 한 것을 했다고 쓰지 않습니다. 각 단계의 성공/실패를 그대로 보고
#   - 자동 커밋은 메시지에 [checkpoint] 를 달아 사람이 낸 커밋과 구별됩니다

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0

HOOK=0; REASON=""
for a in "$@"; do
  case "$a" in
    --hook) HOOK=1 ;;
    *) REASON="$a" ;;
  esac
done

SB="—"; GIT="—"; NOTION="—"; CHANGED=0

# ── 1. 슈퍼베이스 (항상)
#    팀 정의(.claude · 스크립트)가 이번에 바뀌었으면 --team 으로 함께 올립니다.
#    그래야 다른 창이 restore 만으로 **지금의** 팀을 그대로 받습니다 (D-035).
TEAMFLAG=""
if [ -n "$(git status --porcelain -- .claude ai-team/scripts ai-team/BOOTSTRAP.md 2>/dev/null)" ] \
   || git log -1 --name-only --format= 2>/dev/null | grep -qE '^(\.claude/|ai-team/scripts/)'; then
  TEAMFLAG="--team"
fi
if [ -f ai-team/supabase/.env ] || [ -n "${SUPABASE_URL:-}" ]; then
  if python3 ai-team/scripts/supabase-sync.py push $TEAMFLAG >/dev/null 2>&1; then
    SB="✓ push${TEAMFLAG:+ (팀 정의 포함)}"
  else
    SB="✗ 실패(키·네트워크·테이블 확인)"
  fi
else
  SB="⏭ 설정 없음(.env) — 다른 창에서 팀을 못 받습니다. ai-team/BOOTSTRAP.md 0절"
fi

# ── 2. GitHub (변경이 있을 때만)
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  CHANGED=$(git status --porcelain | wc -l | tr -d ' ')
  git add -A >/dev/null 2>&1
  MSG="[checkpoint] 자동 저장 — $(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M KST')"
  [ -n "$REASON" ] && MSG="$MSG · $REASON"
  if git commit -q -m "$MSG" >/dev/null 2>&1; then GIT="✓ 커밋 ${CHANGED}건"; else GIT="✗ 커밋 실패"; fi
else
  GIT="변경 없음"
fi

# 앞서 있으면 푸시 (네트워크 실패 시 재시도 2·4·8초)
if [ -n "$(git log --branches --not --remotes --oneline 2>/dev/null)" ]; then
  PUSHED=0
  for d in 0 2 4 8; do
    [ "$d" -gt 0 ] && sleep "$d"
    if git push -q -u origin "$BRANCH" >/dev/null 2>&1; then PUSHED=1; break; fi
  done
  if [ "$PUSHED" = 1 ]; then GIT="$GIT · ✓ 푸시"; else GIT="$GIT · ✗ 푸시 실패(커밋은 남음)"; fi
fi

# ── 3. 노션 큐 (반영은 도구가 있는 세션에서만 가능하므로 '확인'까지)
PENDING=$(grep -l '^상태: *대기' ai-team/notion-queue/*.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$PENDING" = "0" ]; then
  NOTION="미반영 0건"
else
  NOTION="🔴 미반영 ${PENDING}건 — 노션 도구가 있는 세션에서 반영 필요"
fi

if [ "$HOOK" = 1 ]; then
  python3 -c "
import json,sys
print(json.dumps({'systemMessage': '📌 체크포인트 — 슈퍼베이스 %s · git %s · 노션 %s' % (sys.argv[1],sys.argv[2],sys.argv[3])}, ensure_ascii=False))
" "$SB" "$GIT" "$NOTION" 2>/dev/null || true
else
  echo "📌 체크포인트 ($(TZ=Asia/Seoul date '+%H:%M KST'))"
  echo "  슈퍼베이스 : $SB"
  echo "  GitHub     : $GIT  [$BRANCH]"
  echo "  노션 큐    : $NOTION"
fi
exit 0
