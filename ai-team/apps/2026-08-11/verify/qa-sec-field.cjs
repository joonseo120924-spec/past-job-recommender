/* QA(보안) — 가져오기 경로가 UI 경로의 필드 계약을 우회하는가.
 * (UI 로는 절대 못 넣는 값을 파일로는 넣을 수 있는가 · 넣으면 무슨 일이 나는가)
 * 사용: node verify/qa-sec-field.cjs [engine]
 */
(async () => {
const PW = require('/opt/node22/lib/node_modules/playwright');
const ENGINE = process.argv[2] || 'chromium';
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b = await PW[ENGINE].launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
const R = []; const ok = (n, c, d) => R.push((c ? 'PASS' : '**FAIL**') + ' | ' + n + (d ? ' | ' + d : ''));
await p.goto(APP); await p.waitForTimeout(700);
const MONTH = await p.evaluate(() => JR.model.today().slice(0, 7));

/* 기준: UI 경로(모델 검증)는 이 값들을 무엇이라 판정하는가 */
const uiVerdict = await p.evaluate(m => ({
  badDate: JR.model.validateExpense({ date: '2026-13-45', amount: '100', categoryId: 'c_d01', memo: '' }),
  bigMemo: JR.model.validateExpense({ date: m + '-01', amount: '100', categoryId: 'c_d01', memo: 'x'.repeat(500) })
}), MONTH);
console.log('UI(모델) 판정 기준선:', JSON.stringify(uiVerdict));

/* --- 1. 달력에 없는 날짜가 파일로 들어오는가 --- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
const dateOut = await p.evaluate(m => {
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'bad1', date: '2026-13-45', amount: 500000, categoryId: 'c', memo: '없는달', createdAt: 1 },
               { id: 'bad2', date: '9999-99-99', amount: 900000, categoryId: 'c', memo: '없는날', createdAt: 2 },
               { id: 'bad3', date: '0000-00-00', amount: 100000, categoryId: 'c', memo: '영', createdAt: 3 },
               { id: 'good', date: m + '-01', amount: 1000, categoryId: 'c', memo: '정상', createdAt: 4 }],
    categories: [{ id: 'c', name: '식비', order: 0 }], settings: { selectedMonth: m } } });
  const pr = JR.io.parseImport(t);
  if (!pr.ok) return { code: pr.code };
  JR.io.applyImport(pr.data.payload);
  return {
    stored: JR.model.getExpenses().data.items.map(e => e.id + '/' + e.date + '/' + e.amount),
    months: JR.model.availableMonths().data.months,
    range: JR.model.monthRange(),
    thisMonth: JR.model.listByMonth(m).data.total
  };
}, MONTH);
console.log('날짜 시험 원자료:', JSON.stringify(dateOut, null, 1));
ok('달력에 없는 날짜는 가져오기에서도 거부된다(UI 는 E-109 로 거부)',
   dateOut.stored && dateOut.stored.filter(s => /2026-13-45|9999-99-99|0000-00-00/.test(s)).length === 0,
   'UI판정=' + JSON.stringify(uiVerdict.badDate) + ' / 저장된 기록=' + JSON.stringify(dateOut.stored));
const unreachable = dateOut.months ? dateOut.months.filter(mm => mm < dateOut.range.min || mm > dateOut.range.max) : [];
ok('저장된 모든 기록이 월 이동으로 도달 가능한 달에 있다',
   unreachable.length === 0,
   '이동 가능 범위=' + JSON.stringify(dateOut.range) + ' / 실제 존재하는 달=' + JSON.stringify(dateOut.months) +
   ' / 도달 불가한 달=' + JSON.stringify(unreachable));

/* --- 2. 메모 100자 상한이 파일 경로에서 지켜지는가 --- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
const memoOut = await p.evaluate(m => {
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'm1', date: m + '-01', amount: 1000, categoryId: 'c', memo: 'A'.repeat(300000), createdAt: 1 }],
    categories: [{ id: 'c', name: '식비', order: 0 }], settings: { selectedMonth: m } } });
  const pr = JR.io.parseImport(t);
  if (!pr.ok) return { code: pr.code };
  const ar = JR.io.applyImport(pr.data.payload);
  const it = JR.model.getExpenses().data.items[0];
  return { applied: ar.ok, memoLen: it ? it.memo.length : -1,
    storedBytes: (localStorage.getItem('jr.v1.expenses') || '').length,
    usage: JR.store.usage().data };
}, MONTH);
await p.waitForTimeout(300);
const memoDom = await p.evaluate(() => {
  const n = document.querySelector('#jr-s01-list .jr-expense-row__memo');
  const row = document.querySelector('#jr-s01-list .jr-expense-row');
  return { domLen: n ? n.textContent.length : -1,
    rowHeight: row ? Math.round(row.getBoundingClientRect().height) : -1,
    docWidth: document.documentElement.scrollWidth, winWidth: window.innerWidth };
});
console.log('메모 시험 원자료:', JSON.stringify(memoOut), JSON.stringify(memoDom));
ok('메모 100자 상한이 가져오기 경로에서도 적용된다',
   memoOut.memoLen >= 0 && memoOut.memoLen <= 100,
   'UI판정=' + JSON.stringify(uiVerdict.bigMemo) + ' / 저장된 memo 길이=' + memoOut.memoLen +
   ' / jr.v1.expenses 크기=' + memoOut.storedBytes + '자 / 사용률=' + (memoOut.usage ? Math.round(memoOut.usage.ratio * 100) + '%' : '?') +
   ' / DOM 표시 길이=' + memoDom.domLen + ' / 행 높이=' + memoDom.rowHeight + 'px');
ok('거대 메모가 가로 스크롤을 만들지 않는다', memoDom.docWidth <= memoDom.winWidth,
   'scrollWidth=' + memoDom.docWidth + ' innerWidth=' + memoDom.winWidth);
await p.screenshot({ path: 'shots/qa-sec-field-memo-' + ENGINE + '.png' });

/* --- 3. 한 파일로 저장 용량을 얼마나 밀어 넣을 수 있는가 (E-413 사전검사 우회 여부) --- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
const bulk = await p.evaluate(m => {
  const big = 'B'.repeat(600000);
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'b1', date: m + '-01', amount: 1000, categoryId: 'c', memo: big, createdAt: 1 }],
    categories: [{ id: 'c', name: '식비', order: 0 }], settings: { selectedMonth: m } } });
  const pr = JR.io.parseImport(t);
  if (!pr.ok) return { code: pr.code, max: JR.io.MAX_IMPORT_CHARS, limit: JR.store.LIMIT_CHARS };
  const ar = JR.io.applyImport(pr.data.payload);
  return { applied: ar.ok, max: JR.io.MAX_IMPORT_CHARS, limit: JR.store.LIMIT_CHARS,
    usedChars: JR.store.usage().data.usedChars, ratio: JR.store.usage().data.ratio };
}, MONTH);
console.log('용량 시험:', JSON.stringify(bulk));
ok('MAX_IMPORT_CHARS 로 한 번에 늘릴 수 있는 용량이 제한된다(관측치 기록)',
   true, JSON.stringify(bulk));

/* --- 4. categoryId 가 존재하지 않는 카테고리를 가리켜도 되는가 --- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
const dangling = await p.evaluate(m => {
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'd1', date: m + '-01', amount: 4000, categoryId: 'NOPE', memo: '없는카테고리', createdAt: 1 }],
    categories: [{ id: 'c', name: '식비', order: 0 }], settings: { selectedMonth: m } } });
  const pr = JR.io.parseImport(t); if (!pr.ok) return { code: pr.code };
  JR.io.applyImport(pr.data.payload);
  return { name: JR.model.getCategoryName('NOPE').data, stats: JR.stats.byCategory(m).data.items.map(i => i.categoryName + '/' + i.amount) };
}, MONTH);
ok('없는 카테고리를 가리키는 기록은 미분류로 흡수된다(INT-06)',
   dangling.name && dangling.name.isDeletedCategory === true, JSON.stringify(dangling));

/* --- 5. order 값 조작 --- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
const order = await p.evaluate(m => {
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [],
    categories: [{ id: 'c1', name: '가', order: -99 }, { id: 'c2', name: '나', order: 1e9 },
                 { id: 'c3', name: '다', order: 'x' }, { id: 'c4', name: '라', order: null }],
    settings: { selectedMonth: m } } });
  const pr = JR.io.parseImport(t); if (!pr.ok) return { code: pr.code };
  JR.io.applyImport(pr.data.payload);
  return JR.model.getCategories().data.items.map(c => c.name + '=' + c.order);
}, MONTH);
ok('order 는 파일 값을 무시하고 0..n-1 로 재부여된다(§4-2)',
   JSON.stringify(order) === JSON.stringify(['가=0', '나=1', '다=2', '라=3']), JSON.stringify(order));

/* --- 6. 카테고리 20개 상한 · 100건 rejected 상한 --- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
const cap = await p.evaluate(m => {
  const cats = []; for (let i = 0; i < 60; i++) { cats.push({ id: 'k' + i, name: 'N' + i, order: i }); }
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: [], categories: cats, settings: { selectedMonth: m } } });
  const pr = JR.io.parseImport(t); if (!pr.ok) return { code: pr.code };
  JR.io.applyImport(pr.data.payload);
  return { count: JR.model.getCategories().data.items.length, rejected: pr.data.payload.rejectedCount };
}, MONTH);
ok('카테고리 20개 상한이 가져오기에서 지켜진다', cap.count === 20, JSON.stringify(cap));

console.log('');
console.log('=== 결과 ===');
R.forEach(r => console.log(r));
console.log('FAIL:', R.filter(r => r.indexOf('**FAIL**') === 0).length, '/', R.length);
console.log('콘솔에러·pageerror:', errs.length, errs.slice(0, 12));
await b.close();
})();
