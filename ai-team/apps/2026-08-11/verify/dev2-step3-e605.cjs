/* ④ 3단계 재현 — E-605 (S2) 복귀 재렌더
 * 검증 기준 = ⑤ 통합요청서 §2 3단계
 *   탭B hidden → 탭A 3건 저장 → 탭B 복귀 → DOM 3행 · 총합이 실제 합계와 일치 (되돌림 전: DOM 0 · "0원")
 * 같은 컨텍스트의 두 페이지 = 같은 localStorage origin = 두 탭.
 */
const { reporter, launch, chromium, APP } = require('./dev2-lib.cjs');

(async () => {
  const R = reporter('④ 3단계 — E-605 복귀 재렌더');
  const b = await launch();
  const ctx = await b.newContext();
  const errs = [];
  const open = async () => {
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
    await pg.goto(APP);
    await pg.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
    return pg;
  };

  const tabB = await open();
  const tabA = await open();

  const readB = () => tabB.evaluate(() => ({
    domRows: document.querySelectorAll('#jr-s01-list .jr-expense').length ||
             document.querySelectorAll('#jr-s01-list > *').length,
    listText: (document.getElementById('jr-s01-list') || {}).textContent || '',
    total: (document.getElementById('jr-s01-total') || {}).textContent || '',
    modelCount: JR.model.getExpenses().data.items.length
  }));

  const b0 = await readB();
  R.note('탭B 초기: ' + JSON.stringify(b0));

  /* 탭B 를 hidden 으로 */
  await tabB.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  /* 탭A 에서 3건 저장 */
  const a = await tabA.evaluate(() => {
    const cid = JR.model.getCategories().data.items[0].id;
    const m = JR.model.shiftMonth(JR.model.today().slice(0, 7), 0);
    const d = JR.model.today();
    JR.model.addExpense({ date: d, amount: '30000', categoryId: cid, memo: '탭A-1' });
    JR.model.addExpense({ date: d, amount: '20000', categoryId: cid, memo: '탭A-2' });
    JR.model.addExpense({ date: d, amount: '16000', categoryId: cid, memo: '탭A-3' });
    return { month: m, count: JR.model.getExpenses().data.items.length,
      total: JR.stats.monthTotal(m).data.total };
  });
  R.note('탭A 저장: ' + JSON.stringify(a));

  /* 탭B 복귀 */
  await tabB.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await tabB.waitForTimeout(200);
  const b1 = await readB();
  const toastText = await tabB.evaluate(() => (document.getElementById('jr-toast') || {}).textContent || '');

  R.note('탭B 복귀 후: ' + JSON.stringify(b1));
  R.ok(b1.modelCount === 3, '전제 — 탭B 의 JR.model 이 3건으로 갱신됨', 'model 건수=' + b1.modelCount);
  R.ok(b1.domRows === 3, '⑤-3단계 DOM 3행 (되돌림 전: 0행)', 'DOM 행수=' + b1.domRows);
  R.ok(/탭A-1/.test(b1.listText) && /탭A-3/.test(b1.listText),
    '⑤-3단계 목록에 탭A 가 저장한 기록이 실제로 그려짐', '목록 텍스트에 탭A-1·탭A-3 포함');
  R.ok(b1.total.replace(/[^0-9]/g, '') === String(a.total),
    '⑤-3단계 **총합이 실제 합계와 일치** (되돌림 전: "0원")',
    '화면 총합="' + b1.total + '" 실제 합계=' + a.total + '원');
  R.ok(/새로 불러왔습니다/.test(toastText), 'E-605 통지 자체는 그대로 뜸 (회귀 금지)', '토스트="' + toastText + '"');
  R.ok(errs.length === 0, '콘솔·페이지 오류 0건', JSON.stringify(errs).slice(0, 400));

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });
