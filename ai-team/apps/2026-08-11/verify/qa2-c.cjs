/* ⑤ 파트장 재시험 C — 부팅 복구 경로가 사용자에게 하는 말이 사실인가 (⑤ 신규 발견 2건)
 * 대상 함수 model.js loadKeyWithRecovery 는 675840e 와 동일합니다 — 이번 조치가 만든 것이 아닙니다.
 * 그러나 「남은 오류」는 누가 만들었는지가 아니라 지금 빌드에 있는지로 셉니다. */
const { reporter, launch, fresh, reboot, ENGINE } = require('./qa2-lib.cjs');

const TIGHT = `(function(){var n=0,sizes=[524288,65536,8192,1024,128,16,1];
for(var s=0;s<sizes.length;s++){for(;;){try{localStorage.setItem('PAD'+(n++),new Array(sizes[s]+1).join('x'));}catch(e){break;}}}
var t=false;try{localStorage.setItem('TINY','x');}catch(e){t=true;}return {blocks:n,reached:t};})()`;

const banner = pg => pg.evaluate(() => (document.querySelector('.jr-banner__text') || {}).textContent || '');

(async () => {
  const R = reporter('⑤ 재시험 C — 복구 경로 문구의 진실성');
  const b = await launch();

  /* ── C1 = Y-A. E-304 의 {count} 빈칸 + 「나머지 기록과 금액은 그대로입니다」의 사실 여부 ── */
  {
    const pg = await fresh(b);
    await pg.evaluate(() => localStorage.setItem('jr.v1.expenses', '{"not":"array"}'));
    await reboot(pg);
    const t = await banner(pg);
    const n = await pg.evaluate(() => JR.model.getExpenses().data.items.length);
    R.ok(!/가운데\s+건을/.test(t), 'C1-1 (Y-A) E-304 배너의 {count} 가 빈칸으로 나가지 않음', '배너="' + t + '"');
    R.ok(!(/나머지 기록과 금액은 그대로입니다/.test(t) && n === 0),
      'C1-2 (⑤ 신규) 「나머지 기록과 금액은 그대로입니다」가 실제 상태와 어긋나지 않음',
      '배너="' + t + '" 실제 남은 기록=' + n + '건');
  }

  /* ── C2 (⑤ 신규) 백업본이 없는데 「백업본으로 되살렸습니다」라고 말하는가 ── */
  {
    const pg = await fresh(b);
    const pre = await pg.evaluate(() => Object.keys(localStorage).filter(k => /\.bak$/.test(k)));
    await pg.evaluate(() => localStorage.setItem('jr.v1.expenses', '{깨진 JSON'));
    await reboot(pg);
    const t = await banner(pg);
    const st = await pg.evaluate(() => ({
      n: JR.model.getExpenses().data.items.length,
      bak: Object.keys(localStorage).filter(k => /\.bak$/.test(k))
    }));
    R.ok(pre.length === 0 && st.bak.length === 0, 'C2 전제 — 백업본이 실제로 하나도 없음',
         '부팅전=' + JSON.stringify(pre) + ' 부팅후=' + JSON.stringify(st.bak));
    R.ok(!/백업본으로 되살렸습니다/.test(t),
      'C2-1 백업본이 없는데 「백업본으로 되살렸습니다」라고 말하지 않음',
      '배너="' + t + '" 실제 남은 기록=' + st.n + '건 · .bak=' + JSON.stringify(st.bak));
  }

  /* ── C3 (⑤ 신규) 실제 데이터가 있는 상태에서 도달하는가
   *    저장소가 차면 복구 사다리 3단계가 .bak 을 지웁니다(store.js:233-237).
   *    그 뒤 메인 키가 손상되면 → 「되살렸습니다」라고 말하면서 전부 잃습니다. ── */
  {
    const pg = await fresh(b);
    const step = await pg.evaluate((t) => {
      const cid = JR.model.getCategories().data.items[0].id;
      ['31000', '22000', '13000'].forEach((a, i) =>
        JR.model.addExpense({ date: '2026-08-1' + i, amount: a, categoryId: cid, memo: '사다리검증' + i }));
      const bakBefore = Object.keys(localStorage).filter(k => /\.bak$/.test(k));
      const fill = (new Function('return ' + t))();
      const w = JR.model.addExpense({ date: '2026-08-14', amount: '9000', categoryId: cid, memo: '넘침' });
      const bakAfter = Object.keys(localStorage).filter(k => /\.bak$/.test(k));
      return { bakBefore: bakBefore, filled: fill.reached, writeOk: w.ok, code: w.ok ? null : w.code, bakAfter: bakAfter };
    }, TIGHT);
    R.ok(step.bakBefore.length > 0, 'C3 전제 — 실제 데이터와 백업본이 있는 상태', JSON.stringify(step.bakBefore));
    R.note('C3 실측: ' + JSON.stringify(step));
    if (step.bakAfter.length > 0) {
      R.unknown('C3 복구 사다리 3단계 도달', '사다리가 3단계까지 오르지 않아 .bak 이 남음: ' + JSON.stringify(step.bakAfter) + ' (쓰기ok=' + step.writeOk + ')');
    } else {
      /* .bak 이 사다리에 의해 지워졌습니다 — 이제 메인 키가 손상되면? */
      await pg.evaluate(() => {
        Object.keys(localStorage).filter(k => k.indexOf('PAD') === 0 || k === 'TINY').forEach(k => localStorage.removeItem(k));
        localStorage.setItem('jr.v1.expenses', '{깨진 JSON');   /* 쓰기 중단 흉내 */
      });
      await reboot(pg);
      const t2 = await banner(pg);
      const st2 = await pg.evaluate(() => ({ n: JR.model.getExpenses().data.items.length,
        leaked: Object.keys(localStorage).some(k => String(localStorage.getItem(k)).indexOf('사다리검증') !== -1) }));
      R.ok(!(/백업본으로 되살렸습니다/.test(t2) && st2.n === 0),
        'C3-1 **실데이터 경로** 저장소가 차서 .bak 이 정리된 뒤 메인 키가 손상되면, 화면이 「백업본으로 되살렸습니다」라고 말하며 3건을 전부 잃지 않음',
        '배너="' + t2 + '" 남은 기록=' + st2.n + '건 · 원문잔존=' + st2.leaked);
      R.ok(!/가장 최근에 입력한 기록이 빠졌을 수 있으니/.test(t2) || st2.n > 0,
        'C3-2 「가장 최근에 입력한 기록이 빠졌을 수 있으니」가 전건 소실을 축소해 말하지 않음',
        '배너="' + t2 + '" 남은 기록=' + st2.n + '건');
    }
  }

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH ' + e.stack); process.exit(2); });
