/* ④ 7·8·9단계 재현
 *   7단계 QA-S-005 (S2) 가져오기 날짜 실재  ·  8단계 QA-S-007 (S3) restore 네임스페이스
 *   9단계 QA-F-001 (S3) 내보내기 대체 영역
 */
const { reporter, launch, freshPage, reboot, importMutated, MK } = require('./dev2-lib.cjs');

(async () => {
  const R = reporter('④ 7·8·9단계 — 날짜 실재 · restore 네임스페이스 · 내보내기 대체 영역');
  const b = await launch();

  /* ── 7단계 ── */
  let pg = await freshPage(b);
  const r7 = await importMutated(pg, MK +
    "f.data.expenses=[mk({id:'d1',date:'2026-02-30',amount:999000,memo:'2월30일'}),mk({id:'d2',date:'2026-04-31',amount:888000,memo:'4월31일'}),mk({id:'d3',date:'2024-02-29',amount:5000,memo:'윤년 정상'}),mk({id:'d4',date:'2026-08-10',amount:1000,memo:'정상'})];f.counts={expenses:4,categories:f.data.categories.length};");
  const bad = r7.expenses.filter(e => /2026-02-30|2026-04-31/.test(e.date));
  R.ok(bad.length === 0, '⑤-7단계 가져오기가 달력에 없는 날짜(2/30·4/31)를 거부함',
    'parsed=' + r7.parsed + ' 통과한 날짜=' + JSON.stringify(bad.map(e => e.date)) +
    ' / 저장된 것=' + JSON.stringify(r7.expenses.map(e => e.date)));
  R.ok(r7.expenses.filter(e => e.date === '2024-02-29').length === 1 &&
       r7.expenses.filter(e => e.date === '2026-08-10').length === 1,
    '회귀 금지 — 윤년 2024-02-29 와 평범한 날짜는 그대로 통과',
    JSON.stringify(r7.expenses.map(e => e.date)));
  R.ok(r7.rejectedCount === 2, '거부 2건이 기존 rejected 경로(E-409)로 셈됨 · 새 E-코드 없음',
    'rejectedCount=' + r7.rejectedCount);

  /* 7단계 확장 — ④ 가 범위를 넓힌 부분: 부팅 복구 경로도 같은 기준인가 */
  const pgB = await freshPage(b);
  await pgB.evaluate(() => {
    localStorage.setItem('jr.v1.expenses', JSON.stringify([
      { id: 'b1', date: '2026-02-30', amount: 700000, categoryId: 'c_d01', memo: '저장소에 심은 2월30일', createdAt: 1754870400000 },
      { id: 'b2', date: '2026-08-10', amount: 1000, categoryId: 'c_d01', memo: '정상', createdAt: 1754870400000 }
    ]));
  });
  await reboot(pgB);
  const rB = await pgB.evaluate(() => JR.model.getExpenses().data.items.map(e => e.date));
  R.ok(rB.indexOf('2026-02-30') === -1 && rB.indexOf('2026-08-10') !== -1,
    '④ 범위 확대 — 부팅 복구 경로(model.js sanitizeList)도 같은 기준을 적용 (⑤ 명단 밖 · 같은 뿌리)',
    '부팅 후 날짜=' + JSON.stringify(rB));

  /* ── 8단계 ── */
  pg = await freshPage(b);
  const r8 = await pg.evaluate(() => {
    const before = localStorage.getItem('완전히무관한키');
    const beforeJr = localStorage.getItem('jr.v1.settings');
    const res = JR.store.restore({ '완전히무관한키': '침입값', 'jr.v1.settings': beforeJr || '{}' });
    return { ok: res.ok, before: before, after: localStorage.getItem('완전히무관한키'),
      jrKept: localStorage.getItem('jr.v1.settings') !== null };
  });
  R.ok(r8.after === null, "⑤-8단계 restore() 가 jr.v1. 밖 키를 쓰지 않음 (되돌림 전: 전=null → 후='침입값')",
    '전=' + JSON.stringify(r8.before) + ' 후=' + JSON.stringify(r8.after));
  R.ok(r8.ok && r8.jrKept, '회귀 금지 — jr.v1. 키 복원은 그대로 동작', 'ok=' + r8.ok + ' jr.v1.settings 살아 있음=' + r8.jrKept);

  /* 롤백 회귀 — 실제 가져오기 트랜잭션의 되돌리기가 여전히 동작하는가 */
  const pgR = await freshPage(b);
  const rr = await pgR.evaluate(() => {
    const cid = JR.model.getCategories().data.items[0].id;
    JR.model.addExpense({ date: JR.model.today(), amount: '5000', categoryId: cid, memo: '롤백 회귀' });
    const snap = JR.store.snapshot().data.snap;
    JR.model.wipeAll();
    const afterWipe = JR.model.getExpenses().data.items.length;
    JR.store.restore(snap);
    JR.model.init();
    return { afterWipe: afterWipe, afterRestore: JR.model.getExpenses().data.items.length };
  });
  R.ok(rr.afterRestore === 1, '회귀 금지 — snapshot→restore 왕복(가져오기 되돌리기)이 그대로 동작',
    '삭제 후=' + rr.afterWipe + '건 · 복원 후=' + rr.afterRestore + '건');

  /* ── 9단계 ── */
  pg = await freshPage(b);
  const snapshot = async (label) => {
    const v = await pg.evaluate(() => {
      const s = document.getElementById('jr-export-fallback');
      const t = document.getElementById('jr-export-text');
      return { hidden: s.hasAttribute('hidden'), height: s.getBoundingClientRect().height,
        jsonLen: t.value.length, memoVisible: /메모|jr-expense/.test(t.value) };
    });
    R.note('  ' + label + ' hidden=' + v.hidden + ' 높이=' + Math.round(v.height) + ' JSON길이=' + v.jsonLen + ' 내용노출=' + v.memoVisible);
    return v;
  };
  await pg.evaluate(() => {
    const cid = JR.model.getCategories().data.items[0].id;
    JR.model.addExpense({ date: JR.model.today(), amount: '12000', categoryId: cid, memo: '내보내기 시험 메모' });
  });
  await pg.click('.jr-tab[data-screen="s04"]');
  await pg.waitForTimeout(150);
  const v1 = await snapshot('① S-04 진입(누르기 전)  ');
  await pg.click('#jr-s04-export');
  await pg.waitForTimeout(200);
  const v2 = await snapshot('② 내보내기 누른 직후     ');
  await pg.click('.jr-tab[data-screen="s01"]');
  await pg.waitForTimeout(150);
  const v3 = await snapshot('③ S-01 로 이탈          ');
  await pg.click('.jr-tab[data-screen="s04"]');
  await pg.waitForTimeout(150);
  const v4 = await snapshot('④ S-04 재진입 (안 눌렀음)');

  R.ok(v1.hidden === true && v1.jsonLen === 0, '① 누르기 전에는 접혀 있음', 'hidden=' + v1.hidden);
  R.ok(v2.hidden === false && v2.jsonLen > 0, '② 내보내기를 누르면 열리고 내용이 들어감 (회귀 금지)',
    'hidden=' + v2.hidden + ' JSON길이=' + v2.jsonLen);
  R.ok(v3.hidden === true && v3.jsonLen === 0, '③ 다른 화면으로 나가면 접히고 DOM 잔존도 사라짐',
    'hidden=' + v3.hidden + ' JSON길이=' + v3.jsonLen);
  R.ok(v4.hidden === true && v4.jsonLen === 0,
    '⑤-9단계 **④ 재진입 시 누르지도 않은 기록 JSON 전문이 뜨지 않음** (되돌림 전: hidden=false·높이 309·JSON 788자)',
    'hidden=' + v4.hidden + ' 높이=' + Math.round(v4.height) + ' JSON길이=' + v4.jsonLen);

  const errs = (pg.__errs || []).concat(pgB.__errs || [], pgR.__errs || []);
  R.ok(errs.length === 0, '콘솔·페이지 오류 0건', JSON.stringify(errs).slice(0, 400));

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });
