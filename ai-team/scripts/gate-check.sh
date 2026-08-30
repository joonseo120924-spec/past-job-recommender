#!/usr/bin/env bash
# 게이트 실측 보조 — 파트장이 손으로 세던 항목을 파일로 대조합니다.
#
#   ai-team/scripts/gate-check.sh <앱폴더>            전체 게이트
#   ai-team/scripts/gate-check.sh <앱폴더> --gate 4   ④ 개발 착수 10항목만
#
# ⚠️ 이것은 **보조**입니다. 판정은 파트장이 합니다.
#    파일이 있다는 것과 내용이 충분하다는 것은 다릅니다 — 여기서는 존재만 봅니다.
#    「있음」이 나와도 파트장은 열어서 읽어야 합니다 (팀 규정 「주장을 믿지 않는다」).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || true

APP="${1:-}"
[ -z "$APP" ] && { echo "사용법: ai-team/scripts/gate-check.sh <앱폴더> [--gate 2|3|4|5|6]"; exit 2; }
[ -d "$APP" ] || { echo "⚠️ 앱 폴더가 없습니다: $APP"; exit 2; }
GATE=""
[ "${2:-}" = "--gate" ] && GATE="${3:-}"

DOCS="$APP/docs"; HAND="$APP/handoff"; APPROVALS="ai-team/approvals.md"
MISS=0

# 문서 존재 — 파일명에 키워드가 들어간 파일을 찾습니다
doc() {  # doc "<표시명>" "<키워드1>" ["<키워드2>" …]  (하나라도 맞으면 있음)
  local label="$1"; shift
  local found=""
  for kw in "$@"; do
    f=$(ls "$DOCS" 2>/dev/null | grep -F "$kw" | head -1)
    [ -n "$f" ] && { found="$DOCS/$f"; break; }
  done
  if [ -n "$found" ]; then
    printf "  ✅ %-12s %s (%s행)\n" "$label" "$found" "$(wc -l < "$found" | tr -d ' ')"
  else
    printf "  ❌ %-12s 없음 — %s 중 하나를 찾았습니다\n" "$label" "$*"; MISS=$((MISS+1))
  fi
}

# 승인 기록 — approvals.md 에서 그 앱에 대한 줄을 찾습니다
appr() {  # appr "<표시명>" "<검색어>"
  local label="$1" kw="$2"
  if grep -q "$kw" "$APPROVALS" 2>/dev/null; then
    printf "  ✅ %-12s %s:%s\n" "$label" "$APPROVALS" "$(grep -n "$kw" "$APPROVALS" | head -1 | cut -d: -f1)"
  elif grep -qi "면제" "$APPROVALS" 2>/dev/null && grep -qi "$(basename "$APP")" "$APPROVALS" 2>/dev/null; then
    printf "  ⚠️ %-12s 면제 기록이 있는지 파트장이 직접 확인하십시오 (면제는 YELLOW)\n" "$label"
  else
    printf "  ❌ %-12s %s 에 「%s」 없음\n" "$label" "$APPROVALS" "$kw"; MISS=$((MISS+1))
  fi
}

g2() { echo "② 설계 완료 게이트"; doc 기능정의 기능정의 기획서; doc 화면설계 화면설계
       doc 구조설계 구조설계 데이터구조; doc 문구 문구; doc 지표 지표 계측; }
g3() { echo "③ 디자인 완료 게이트"; doc 디자인 디자인; doc 접근성실측 접근성 대비비; }
g4() { echo "④ 개발 착수 게이트 — 10항목"
       doc 시장분석 시장; doc 출처검증 출처; appr 아이디어승인 "① 전략"
       doc 기능정의 기능정의 기획서; doc 화면설계 화면설계; doc 데이터구조 구조설계 데이터구조
       doc API정의 구조설계 API; doc 예외정의 구조설계 예외 E-코드; doc 문구확정 문구
       appr 디자인승인 "③ 디자인"; }
g5() { echo "⑤ QA 착수 게이트 — 6자료"
       [ -f "$HAND/04-개발.md" ] && printf "  ✅ %-12s %s\n" "인수인계" "$HAND/04-개발.md" \
         || { printf "  ❌ %-12s %s 없음 (6자료가 여기 실립니다)\n" "인수인계" "$HAND/04-개발.md"; MISS=$((MISS+1)); }
       doc 보안설계서 보안설계 위협; }
g6() { echo "⑥ 출시 착수 게이트"; appr 품질승인 "⑤ 품질"; doc 데이터안전 데이터안전 데이터 안전; }

case "$GATE" in
  2) g2;; 3) g3;; 4) g4;; 5) g5;; 6) g6;;
  "") g2; echo; g3; echo; g4; echo; g5; echo; g6;;
  *) echo "게이트 번호는 2~6 입니다"; exit 2;;
esac

echo
if [ "$MISS" = 0 ]; then
  echo "✅ 빠진 파일 없음 — 그래도 **내용은 파트장이 열어서 확인**하십시오"
else
  echo "❌ 빠진 항목 ${MISS}건 — 규정상 이 게이트는 통과할 수 없습니다"
fi
exit 0
