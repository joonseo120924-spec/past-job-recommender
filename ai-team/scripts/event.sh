#!/usr/bin/env bash
# 회의실 이벤트 기록 — **파일이 1차, 외부 저장소는 2차** (D-037)
#
#   ai-team/scripts/event.sh <종류> <발언자> <제목> [참조]
#   ai-team/scripts/event.sh 호출 strategy-lead "① 전략 분배안 저장" D-038
#
# 2026-08-30 감사 치명-2: 회의실 이벤트의 유일한 기록 수단이 슈퍼베이스였고,
# 키가 없으면 규정이 통째로 실행 불가였습니다. D-021·D-028 이 「규정만 있고
# 실행 0건」이 된 것이 그 결과입니다. 이 스크립트는 **키도 네트워크도 없이** 돕니다.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || true

KIND="${1:-}"; ACTOR="${2:-}"; TITLE="${3:-}"; REF="${4:-}"
if [ -z "$KIND" ] || [ -z "$TITLE" ]; then
  echo "사용법: ai-team/scripts/event.sh <호출|승인|반려|결정|막힘|기록|동기화|감사|논쟁> <발언자> <제목> [참조]"
  exit 2
fi
case "$KIND" in
  호출|승인|반려|결정|막힘|기록|동기화|감사|논쟁) ;;
  *) echo "⚠️ 알 수 없는 종류: $KIND"; exit 2;;
esac

LOG=ai-team/events.log
TS="$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M KST')"
printf '%s\t%s\t%s\t%s\t%s\n' "$TS" "$KIND" "${ACTOR:--}" "$TITLE" "${REF:--}" >> "$LOG"
echo "✓ 1차 기록 — $LOG ($KIND · ${ACTOR:--} · $TITLE)"

# 2차: 슈퍼베이스. 실패해도 1차 기록은 이미 남아 있으므로 세션을 막지 않습니다
if [ -f ai-team/supabase/.env ] || [ -n "${SUPABASE_URL:-}" ]; then
  if python3 ai-team/scripts/supabase-sync.py event --kind "$KIND" \
       ${ACTOR:+--actor "$ACTOR"} --title "$TITLE" ${REF:+--ref "$REF"} >/dev/null 2>&1; then
    echo "✓ 2차 반영 — 슈퍼베이스"
  else
    echo "⚠️ 2차 반영 실패 — 슈퍼베이스 (1차 기록은 남았습니다)"
  fi
else
  echo "⏭ 2차 반영 건너뜀 — 키 없음(B-08). **못 했다고 적습니다**"
fi
exit 0
