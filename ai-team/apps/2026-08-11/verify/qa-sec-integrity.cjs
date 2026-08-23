/* QA(보안) — 중복 id 결함의 실제 사용자 영향 · UI 경로로 확인.
 * 사용: node verify/qa-sec-integrity.cjs [engine]
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
const D1 = MONTH + '-11', D2 = MONTH + '-12';

async function loadFile(obj) {
  return await p.evaluate(t => {
    const pr = JR.io.parseImport(t);
    if (!pr.ok) return { ok: false, code: pr.code };
    const ar = JR.io.applyImport(pr.data.payload);
    return { ok: ar.ok, code: ar.code || null, rejected: pr.data.payload.rejectedCount };
  }, JSON.stringify(obj));
}

/* --- 1. id='__proto__' 두 건이 UI 목록에 실제로 두 줄로 나온다 --- */
await loadFile({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
  expenses: [{ id: '__proto__', date: D1, amount: 11111, categoryId: 'c1', memo: '첫째줄', createdAt: 1 },
             { id: '__proto__', date: D2, amount: 22222, categoryId: 'c1', memo: '둘째줄', createdAt: 2 }],
  categories: [{ id: 'c1', name: '식비', order: 0 }],
  settings: { selectedMonth: MONTH } } });
await p.reload(); await p.waitForTimeout(700);
let ui = await p.evaluate(() => ({
  rows: Array.from(document.querySelectorAll('#jr-s01-list .jr-expense-row')).map(r => r.textContent.replace(/\s+/g, ' ').trim()),
  total: document.getElementById('jr-s01-total').textContent
}));
console.log('목록 초기 상태:', JSON.stringify(ui, null, 1));
ok('중복 id 2건이 목록에 2줄로 표시된다(결함 재현)', ui.rows.length === 2, JSON.stringify(ui.rows));

/* --- 2. 둘째 줄을 눌러 수정하면 어느 레코드가 열리는가 --- */
const rows = await p.$$('#jr-s01-list .jr-expense-row');
if (rows.length >= 2) {
  await rows[1].click(); await p.waitForTimeout(400);
  const form = await p.evaluate(() => ({
    title: document.getElementById('jr-s02-title').textContent,
    date: document.getElementById('jr-date').value,
    amount: document.getElementById('jr-amount').value,
    memo: document.getElementById('jr-memo').value
  }));
  console.log('둘째 줄 클릭 → 수정 폼:', JSON.stringify(form));
  ok('둘째 줄을 눌렀을 때 둘째 레코드가 열린다', form.memo === '둘째줄',
     '기대 memo=둘째줄 / 실제 memo=' + JSON.stringify(form.memo) + ' 금액=' + form.amount);

  /* --- 3. 그 화면에서 삭제하면 어느 레코드가 지워지는가 --- */
  const del = await p.$('#jr-s02-delete');
  if (del) {
    await del.click(); await p.waitForTimeout(300);
    const bt = await p.$$('#jr-dialog-overlay button');
    if (bt.length) { await bt[bt.length - 1].click(); }
    await p.waitForTimeout(600);
  }
  const after = await p.evaluate(() => JR.model.getExpenses().data.items.map(e => e.memo + '/' + e.amount));
  console.log('삭제 후 남은 기록:', JSON.stringify(after));
  ok('둘째 줄 삭제 시 둘째 레코드가 지워진다', after.length === 1 && after[0].indexOf('첫째줄') === 0,
     '남은 기록=' + JSON.stringify(after));
}

/* --- 4. 카테고리 이름 중복 방지(E-116)가 가져오기에서 우회되는가 --- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
const dupName = await loadFile({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
  expenses: [],
  categories: [{ id: 'ca', name: '__proto__', order: 0 }, { id: 'cb', name: '__proto__', order: 1 },
               { id: 'cc', name: '커피', order: 2 }, { id: 'cd', name: '커피', order: 3 },
               { id: 'ce', name: 'constructor', order: 4 }, { id: 'cf', name: 'constructor', order: 5 }],
  settings: { selectedMonth: MONTH } } });
const catState = await p.evaluate(() => JR.model.getCategories().data.items.map(c => c.id + ':' + c.name));
console.log('중복 이름 가져오기 결과:', JSON.stringify(dupName), JSON.stringify(catState));
const names = catState.map(s => s.split(':')[1]);
ok('일반 이름 중복은 하나만 남는다(기준선)', names.filter(n => n === '커피').length === 1, JSON.stringify(names));
ok("이름 '__proto__' 중복도 하나만 남는다", names.filter(n => n === '__proto__').length === 1, JSON.stringify(names));
ok("이름 'constructor' 중복도 하나만 남는다", names.filter(n => n === 'constructor').length === 1, JSON.stringify(names));

/* --- 5. 그 상태에서 UI 로 같은 이름을 추가하면 E-116 이 뜨는가 (일관성) --- */
await p.click('#jr-tabbar .jr-tab[data-screen="s04"]'); await p.waitForTimeout(300);
await p.fill('#jr-cat-new', '__proto__'); await p.click('#jr-s04-cat-add'); await p.waitForTimeout(400);
const e116 = await p.evaluate(() => ({
  inline: (document.querySelector('#jr-cat-new-hint') || {}).textContent || '',
  cats: JR.model.getCategories().data.items.map(c => c.name)
}));
console.log('UI 추가 시도 결과:', JSON.stringify(e116));
ok('UI 로 중복 이름 추가는 E-116 으로 막힌다', /이미 있습니다/.test(e116.inline),
   '인라인=' + JSON.stringify(e116.inline) + ' 카테고리=' + JSON.stringify(e116.cats));

/* --- 6. 통계 화면 금액 귀속 (categoryId='__proto__') --- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
await loadFile({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
  expenses: [{ id: 'e1', date: D1, amount: 50000, categoryId: '__proto__', memo: '세탁비', createdAt: 1 },
             { id: 'e2', date: D1, amount: 30000, categoryId: 'c1', memo: '밥', createdAt: 2 }],
  categories: [{ id: '__proto__', name: '세탁', order: 0 }, { id: 'c1', name: '식비', order: 1 }],
  settings: { selectedMonth: MONTH } } });
await p.reload(); await p.waitForTimeout(700);
await p.click('#jr-tabbar .jr-tab[data-screen="s03"]'); await p.waitForTimeout(400);
const stat = await p.evaluate(() => ({
  rows: Array.from(document.querySelectorAll('#jr-s03-list .jr-stat-row')).map(r => r.textContent.replace(/\s+/g, ' ').trim()),
  s04: null
}));
await p.click('#jr-tabbar .jr-tab[data-screen="s04"]'); await p.waitForTimeout(350);
stat.s04 = await p.evaluate(() => Array.from(document.querySelectorAll('.jr-category-row__name')).map(n => n.textContent));
console.log('통계 화면:', JSON.stringify(stat, null, 1));
ok('설정에 있는 카테고리가 통계에서도 같은 이름으로 집계된다',
   stat.rows.some(r => r.indexOf('세탁') >= 0) && stat.s04.indexOf('세탁') >= 0,
   '통계행=' + JSON.stringify(stat.rows) + ' / 설정목록=' + JSON.stringify(stat.s04));
await p.screenshot({ path: 'shots/qa-sec-integrity-' + ENGINE + '.png', fullPage: true });

console.log('');
console.log('=== 결과 ===');
R.forEach(r => console.log(r));
console.log('FAIL:', R.filter(r => r.indexOf('**FAIL**') === 0).length, '/', R.length);
console.log('콘솔에러·pageerror:', errs.length, errs.slice(0, 12));
await b.close();
})();
