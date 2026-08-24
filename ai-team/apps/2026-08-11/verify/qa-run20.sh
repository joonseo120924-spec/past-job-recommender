#!/bin/sh
# QA 기능시험 20 사이클 러너 (functional-tester)
# 1 사이클 = 깨끗한 컨텍스트에서 qa-cycle.cjs + qa-exc.cjs 순차 전건 실행 (분배안 §5)
# 사용법: sh qa-run20.sh <출력디렉터리>
OUT=${1:-.}
APP=/home/user/past-job-recommender/ai-team/apps/2026-08-11/verify
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
# 크롬 12 · 파이어폭스 4 · 웹킷 4 = 20 (분배안 §5)
ENGINES="chromium chromium chromium chromium chromium chromium chromium chromium chromium chromium chromium chromium firefox firefox firefox firefox webkit webkit webkit webkit"
i=0
for E in $ENGINES; do
  i=$((i+1))
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  node $APP/qa-cycle.cjs $E $i > $OUT/cyc$i.$E.cycle.log 2>&1; RC1=$?
  node $APP/qa-exc.cjs   $E    > $OUT/cyc$i.$E.exc.log   2>&1; RC2=$?
  P1=$(grep -c '^PASS' $OUT/cyc$i.$E.cycle.log); F1=$(grep -c '^FAIL' $OUT/cyc$i.$E.cycle.log)
  P2=$(grep -c '^PASS' $OUT/cyc$i.$E.exc.log);   F2=$(grep -c '^FAIL' $OUT/cyc$i.$E.exc.log)
  CE=$(grep -o '콘솔에러 0' $OUT/cyc$i.$E.exc.log | head -1)
  echo "$i	$TS	$E	PASS=$((P1+P2))	FAIL=$((F1+F2))	rc=$RC1/$RC2" >> $OUT/CYCLES.tsv
  echo "cycle $i $E done PASS=$((P1+P2)) FAIL=$((F1+F2))"
done
echo ALLDONE
