#!/bin/sh
# QA 기능시험 20 사이클 — B 트랙 (보강 사냥 + 자리표시자)
# A 트랙(qa-run20.sh)과 같은 엔진 배분. 사이클 N = A트랙(N) + B트랙(N).
OUT=${1:-.}
APP=/home/user/past-job-recommender/ai-team/apps/2026-08-11/verify
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
ENGINES="chromium chromium chromium chromium chromium chromium chromium chromium chromium chromium chromium chromium firefox firefox firefox firefox webkit webkit webkit webkit"
i=0
for E in $ENGINES; do
  i=$((i+1))
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  node $APP/qa-extra.cjs $E > $OUT/cyc$i.$E.extra.log 2>&1
  node $APP/qa-ph.cjs    $E > $OUT/cyc$i.$E.ph.log    2>&1
  P=$(cat $OUT/cyc$i.$E.extra.log $OUT/cyc$i.$E.ph.log | grep -c '^PASS')
  F=$(cat $OUT/cyc$i.$E.extra.log $OUT/cyc$i.$E.ph.log | grep -c '^FAIL')
  echo "$i	$TS	$E	PASS=$P	FAIL=$F" >> $OUT/CYCLES-B.tsv
  echo "B cycle $i $E PASS=$P FAIL=$F"
done
echo ALLDONE-B
