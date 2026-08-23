/* QA(보안) — 가져오기 공격면.
 * 기형·악성 파일이 거부되는가 + 거부 시 저장소가 정말 무접촉인가.
 * 사용: node verify/qa-sec-import.cjs [engine]
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

/* 기준 데이터를 하나 심어 둔다 — 거부 시 이것이 그대로 남아야 한다 */
await p.evaluate(m => {
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'base1', date: m + '-05', amount: 7777, categoryId: 'cb', memo: '기준데이터', createdAt: 5 }],
    categories: [{ id: 'cb', name: '기준', order: 0 }], settings: { selectedMonth: m } } });
  JR.io.applyImport(JR.io.parseImport(t).data.payload);
}, MONTH);
const BASE = await p.evaluate(() => JSON.stringify({
  keys: Object.keys(localStorage).sort(),
  exp: localStorage.getItem('jr.v1.expenses'),
  cat: localStorage.getItem('jr.v1.categories'),
  set: localStorage.getItem('jr.v1.settings')
}));
console.log('기준 저장소 상태:', BASE.slice(0, 400));

function deep(n) { let s = '{"a":'.repeat(n) + '1' + '}'.repeat(n); return s; }

const CASES = [
  ['비-JSON 텍스트 (E-404)', 'not json at all <<>>', 'E-404'],
  ['빈 문자열', '', 'E-404'],
  ['JSON 이지만 배열 (E-405)', '[1,2,3]', 'E-405'],
  ['JSON 이지만 null (E-405)', 'null', 'E-405'],
  ['JSON 이지만 숫자 (E-405)', '12345', 'E-405'],
  ['JSON 이지만 문자열 (E-405)', '"hello"', 'E-405'],
  ['남의 앱 JSON (E-405)', JSON.stringify({ app: 'other-app', kind: 'backup', schema: 1, data: { expenses: [], categories: [] } }), 'E-405'],
  ['kind 다름 (E-405)', JSON.stringify({ app: 'jr-expense', kind: 'export', schema: 1, data: { expenses: [], categories: [] } }), 'E-405'],
  ['app 자리에 객체 (타입혼동, E-405)', JSON.stringify({ app: { toString: 'jr-expense' }, kind: 'backup', schema: 1, data: {} }), 'E-405'],
  ['schema=2 미래버전 (E-406)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 2, data: { expenses: [], categories: [] } }), 'E-406'],
  ['schema 문자열 (E-406)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: '1', data: { expenses: [], categories: [] } }), 'E-406'],
  ['schema 1.5 (E-406)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1.5, data: { expenses: [], categories: [] } }), 'E-406'],
  ['data 없음 (E-407)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1 }), 'E-407'],
  ['data 가 배열 (E-407)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: [] }), 'E-407'],
  ['expenses 가 객체 (E-407)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: {}, categories: [] } }), 'E-407'],
  ['categories 가 문자열 (E-407)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: [], categories: 'x' } }), 'E-407'],
  ['categories 전부 무효 → 0개 (E-407)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: [], categories: [{ id: '', name: '' }, null, 3] } }), 'E-407'],
  ['counts 불일치 (E-407)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, counts: { expenses: 99 }, data: { expenses: [], categories: [{ id: 'c', name: 'a', order: 0 }] } }), 'E-407'],
  ['null 폭탄 (expenses 전부 null)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: [null, null, null], categories: [{ id: 'c', name: 'a', order: 0 }] } }), 'OK-REJECTED'],
  ['amount 자리에 객체', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: [{ id: 'a', date: MONTH + '-01', amount: { valueOf: 1 }, categoryId: 'c', memo: '', createdAt: 0 }], categories: [{ id: 'c', name: 'a', order: 0 }] } }), 'OK-REJECTED'],
  ['amount 자리에 문자열 "100"', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: [{ id: 'a', date: MONTH + '-01', amount: '100', categoryId: 'c', memo: '', createdAt: 0 }], categories: [{ id: 'c', name: 'a', order: 0 }] } }), 'OK-REJECTED'],
  ['amount = 1e21 (범위밖)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: [{ id: 'a', date: MONTH + '-01', amount: 1e21, categoryId: 'c', memo: '', createdAt: 0 }], categories: [{ id: 'c', name: 'a', order: 0 }] } }), 'OK-REJECTED'],
  ['amount = -1', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: [{ id: 'a', date: MONTH + '-01', amount: -1, categoryId: 'c', memo: '', createdAt: 0 }], categories: [{ id: 'c', name: 'a', order: 0 }] } }), 'OK-REJECTED'],
  ['date = 2026-13-45 (형식은 맞고 실재 안 함)', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: [{ id: 'a', date: '2026-13-45', amount: 100, categoryId: 'c', memo: '', createdAt: 0 }], categories: [{ id: 'c', name: 'a', order: 0 }] } }), 'CHECK'],
  ['date = 9999-99-99', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: [{ id: 'a', date: '9999-99-99', amount: 100, categoryId: 'c', memo: '', createdAt: 0 }], categories: [{ id: 'c', name: 'a', order: 0 }] } }), 'CHECK'],
  ['중복 JSON 키 (마지막 승리)', '{"app":"jr-expense","kind":"backup","schema":1,"app":"evil","data":{"expenses":[],"categories":[{"id":"c","name":"a","order":0}]}}', 'CHECK'],
  ['깊은 중첩 5,000단', '{"app":"jr-expense","kind":"backup","schema":1,"data":{"expenses":[],"categories":[{"id":"c","name":"a","order":0}],"deep":' + deep(5000) + '}}', 'CHECK'],
  ['깊은 중첩 100,000단', '{"app":"jr-expense","kind":"backup","schema":1,"data":{"expenses":[],"categories":[{"id":"c","name":"a","order":0}],"deep":' + deep(100000) + '}}', 'CHECK'],
  ['거대 memo 500,000자', JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: { expenses: [{ id: 'a', date: MONTH + '-01', amount: 100, categoryId: 'c', memo: 'x'.repeat(500000), createdAt: 0 }], categories: [{ id: 'c', name: 'a', order: 0 }] } }), 'CHECK'],
  ['MAX_IMPORT_CHARS 초과 (E-408)', null, 'E-408']
];

for (const [name, textIn, expect] of CASES) {
  const out = await p.evaluate(([t, exp]) => {
    let text = t;
    if (text === null) { text = '{"app":"jr-expense","kind":"backup","schema":1,"pad":"' + 'x'.repeat(JR.io.MAX_IMPORT_CHARS + 10) + '"}'; }
    const before = { exp: localStorage.getItem('jr.v1.expenses'), cat: localStorage.getItem('jr.v1.categories'),
                     set: localStorage.getItem('jr.v1.settings'), keys: Object.keys(localStorage).sort().join(',') };
    let pr, threw = null;
    try { pr = JR.io.parseImport(text); } catch (e) { threw = String(e); pr = null; }
    const after = { exp: localStorage.getItem('jr.v1.expenses'), cat: localStorage.getItem('jr.v1.categories'),
                    set: localStorage.getItem('jr.v1.settings'), keys: Object.keys(localStorage).sort().join(',') };
    return { threw: threw, ok: pr ? pr.ok : null, code: pr && !pr.ok ? pr.code : null,
      rejected: pr && pr.ok ? pr.data.payload.rejectedCount : null,
      incomingE: pr && pr.ok ? pr.data.summary.incomingExpenseCount : null,
      untouched: before.exp === after.exp && before.cat === after.cat && before.set === after.set && before.keys === after.keys,
      memoLen: pr && pr.ok && pr.data.payload.data.expenses[0] ? pr.data.payload.data.expenses[0].memo.length : null };
  }, [textIn, expect]);
  let pass;
  if (expect === 'OK-REJECTED') { pass = out.threw === null && out.ok === true && out.incomingE === 0; }
  else if (expect === 'CHECK') { pass = out.threw === null; }
  else { pass = out.threw === null && out.ok === false && out.code === expect; }
  ok('가져오기/' + name, pass && out.untouched !== false,
    '기대=' + expect + ' 실제=' + (out.threw ? 'THROW ' + out.threw.slice(0, 90) : (out.ok ? 'ok(수용' + out.incomingE + '건/거부' + out.rejected + '건' + (out.memoLen !== null ? ' memo길이=' + out.memoLen : '') + ')' : out.code)) +
    ' 저장소무접촉=' + out.untouched);
}

/* --- 실패한 가져오기 뒤에도 기준 데이터가 그대로인가 --- */
const now = await p.evaluate(() => JSON.stringify({
  keys: Object.keys(localStorage).sort(), exp: localStorage.getItem('jr.v1.expenses'),
  cat: localStorage.getItem('jr.v1.categories'), set: localStorage.getItem('jr.v1.settings') }));
ok('전 거부 케이스 통과 후 저장소가 기준 상태와 동일', now === BASE,
   now === BASE ? '동일' : ('변화 있음\n  기준=' + BASE.slice(0, 300) + '\n  현재=' + now.slice(0, 300)));

/* --- E-413 · 용량 부족 시 무접촉 --- */
const e413 = await p.evaluate(m => {
  const before = localStorage.getItem('jr.v1.expenses');
  Object.defineProperty(JR.store, 'LIMIT_CHARS', { value: 100, configurable: true });
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'z', date: m + '-01', amount: 1, categoryId: 'c', memo: '', createdAt: 0 }],
    categories: [{ id: 'c', name: 'a', order: 0 }], settings: {} } });
  const r = JR.io.parseImport(t);
  const after = localStorage.getItem('jr.v1.expenses');
  return { code: r.code, untouched: before === after };
}, MONTH);
ok('E-413 용량 부족 거부 + 저장소 무접촉', e413.code === 'E-413' && e413.untouched, JSON.stringify(e413));
await p.reload(); await p.waitForTimeout(500);

/* --- 실제 파일 입력(UI) 경로로 악성 파일 --- */
await p.click('#jr-tabbar .jr-tab[data-screen="s04"]'); await p.waitForTimeout(300);
const beforeUI = await p.evaluate(() => localStorage.getItem('jr.v1.expenses'));
await p.setInputFiles('#jr-import-file', { name: 'evil.json', mimeType: 'application/json',
  buffer: Buffer.from('{"app":"evil","kind":"backup","schema":1,"data":{}}', 'utf8') });
await p.waitForTimeout(800);
const uiOut = await p.evaluate(() => ({
  toast: (document.getElementById('jr-toast') || {}).textContent || '',
  dialog: document.querySelectorAll('#jr-dialog-overlay').length,
  exp: localStorage.getItem('jr.v1.expenses') }));
ok('UI 파일 입력: 남의 앱 JSON → E-405 토스트 · 대화상자 없음 · 데이터 유지',
   /이 앱에서 내보낸 파일이 아닙니다/.test(uiOut.toast) && uiOut.dialog === 0 && uiOut.exp === beforeUI,
   JSON.stringify(uiOut).slice(0, 300));

/* --- 실제 파일 입력: 비 JSON --- */
await p.setInputFiles('#jr-import-file', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hello', 'utf8') });
await p.waitForTimeout(800);
const uiOut2 = await p.evaluate(() => ({ toast: (document.getElementById('jr-toast') || {}).textContent || '',
  exp: localStorage.getItem('jr.v1.expenses') }));
ok('UI 파일 입력: 비-JSON → E-404 · 데이터 유지',
   /읽을 수 있는 형식이 아닙니다/.test(uiOut2.toast) && uiOut2.exp === beforeUI, JSON.stringify(uiOut2).slice(0, 260));

console.log('');
console.log('=== 결과 ===');
R.forEach(r => console.log(r));
console.log('FAIL:', R.filter(r => r.indexOf('**FAIL**') === 0).length, '/', R.length);
console.log('콘솔에러·pageerror:', errs.length, errs.slice(0, 12));
await b.close();
})();
