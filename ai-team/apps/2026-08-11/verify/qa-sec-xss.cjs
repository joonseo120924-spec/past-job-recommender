/* QA(보안) — XSS 실주입.
 * 경로 A: UI 타이핑(메모 · 카테고리 이름)
 * 경로 B: 가져오기 JSON 의 전 문자열 필드
 * 판정: 페이로드가 "실행"되었는가(전역 카나리아 · alert · 신규 script/img 노드 · pageerror)
 *      + DOM 에서 텍스트 노드로만 존재하는가(childElementCount)
 * 사용: node verify/qa-sec-xss.cjs [engine]
 */
(async () => {
const PW = require('/opt/node22/lib/node_modules/playwright');
const ENGINE = process.argv[2] || 'chromium';
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const BIDI = '‮';
const P = [
 ['img-onerror', '<img src=x onerror="window.__XSS__=1">'],
 ['script', '<script>window.__XSS__=1<' + '/script>'],
 ['svg-onload', '"><svg onload="window.__XSS__=1">'],
 ['js-url', 'javascript:window.__XSS__=1'],
 ['attr-break', '" onmouseover="window.__XSS__=1" x="'],
 ['iframe-srcdoc', '<iframe srcdoc="&lt;script&gt;parent.__XSS__=1&lt;/script&gt;">'],
 ['uni-escape', '\\u003cimg src=x onerror=window.__XSS__=1\\u003e'],
 ['raw-lt', '<<img src=x onerror=window.__XSS__=1>'],
 ['tab-in-tag', '<img\tsrc=x\tonerror=window.__XSS__=1>'],
 ['entity', '&lt;img src=x onerror=window.__XSS__=1&gt;'],
 ['style-import', '<style>@import "x";</style>'],
 ['closing-tpl', '</template><img src=x onerror=window.__XSS__=1>'],
 ['dataurl-a', '<a href="data:text/html,payload">x</a>'],
 ['bidi', BIDI + '<img src=x onerror=window.__XSS__=1>'],
 ['emoji-mix', '🧾<img src=x onerror=window.__XSS__=1>']
];
const b = await PW[ENGINE].launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => {
  window.__XSS__ = 0; window.__ALERT__ = 0; window.__NEWNODES__ = [];
  window.alert = function () { window.__ALERT__++; };
  window.confirm = function () { window.__ALERT__++; return false; };
  const mo = new MutationObserver(ms => { ms.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType === 1 && /^(SCRIPT|IMG|IFRAME|SVG|OBJECT|EMBED|LINK|STYLE|A)$/.test(n.tagName)) {
      window.__NEWNODES__.push(n.tagName);
    }
  })); });
  document.addEventListener('DOMContentLoaded', () => mo.observe(document.documentElement, { childList: true, subtree: true }));
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
const R = []; const ok = (n, c, d) => { R.push((c ? 'PASS' : '**FAIL**') + ' | ' + n + (d ? ' | ' + d : '')); };
await p.goto(APP); await p.waitForTimeout(700);

/* ---------- 경로 A: UI 타이핑 (메모) ---------- */
console.log('=== 경로 A · 메모란 실타이핑 ===');
for (const [name, pay] of P) {
  await p.click('#jr-tabbar .jr-tab[data-screen="s01"]').catch(() => {});
  await p.waitForTimeout(120);
  await p.evaluate(() => { window.__XSS__ = 0; window.__ALERT__ = 0; window.__NEWNODES__ = []; });
  await p.click('#jr-s01-add'); await p.waitForTimeout(200);
  await p.fill('#jr-amount', '1000');
  await p.fill('#jr-memo', pay.slice(0, 100));
  await p.click('#jr-cat-group .jr-chip');
  await p.click('#jr-s02-save'); await p.waitForTimeout(350);
  const st = await p.evaluate(() => {
    const rows = document.querySelectorAll('.jr-expense-row__memo');
    const last = rows[0];
    return { xss: window.__XSS__, alert: window.__ALERT__, nodes: window.__NEWNODES__.slice(),
      memoText: last ? last.textContent : null, memoKids: last ? last.childElementCount : -1 };
  });
  ok('메모/' + name, st.xss === 0 && st.alert === 0 && st.nodes.length === 0 && st.memoKids <= 0,
     'xss=' + st.xss + ' alert=' + st.alert + ' 신규위험노드=' + JSON.stringify(st.nodes) +
     ' 자식엘리먼트=' + st.memoKids + ' 원문보존=' + (st.memoText === pay.slice(0, 100)));
}

/* ---------- 경로 A2: 카테고리 이름 ---------- */
console.log('=== 경로 A2 · 카테고리 이름 실타이핑(12자 상한이라 절단 페이로드) ===');
const CP = ['<img src=x o', '<script>a<', '"><svg onl', 'javascript:a', '</template>', BIDI + '<img sr'];
await p.click('#jr-tabbar .jr-tab[data-screen="s04"]'); await p.waitForTimeout(300);
for (const pay of CP) {
  await p.evaluate(() => { window.__XSS__ = 0; window.__ALERT__ = 0; window.__NEWNODES__ = []; });
  await p.fill('#jr-cat-new', pay);
  await p.click('#jr-s04-cat-add'); await p.waitForTimeout(300);
  const st = await p.evaluate(t => {
    const names = Array.from(document.querySelectorAll('.jr-category-row__name'));
    const hit = names.filter(n => n.textContent === t);
    return { xss: window.__XSS__, alert: window.__ALERT__, nodes: window.__NEWNODES__.slice(),
      found: hit.length, kids: hit.length ? hit[0].childElementCount : -1 };
  }, pay);
  ok('카테고리명/' + JSON.stringify(pay), st.xss === 0 && st.alert === 0 && st.nodes.length === 0 && st.kids <= 0,
    '등록됨=' + st.found + ' 자식엘리먼트=' + st.kids + ' xss=' + st.xss + ' 신규위험노드=' + JSON.stringify(st.nodes));
}
await p.click('#jr-tabbar .jr-tab[data-screen="s01"]'); await p.waitForTimeout(150);
await p.click('#jr-s01-add'); await p.waitForTimeout(250);
const chip = await p.evaluate(() => {
  const c = Array.from(document.querySelectorAll('#jr-cat-group .jr-chip'));
  return { n: c.length, kids: c.map(x => x.childElementCount), texts: c.map(x => x.textContent).filter(t => /[<>]/.test(t)) };
});
ok('S-02 카테고리 칩 렌더', chip.kids.every(k => k === 0), '칩수=' + chip.n + ' 주입문자포함칩=' + JSON.stringify(chip.texts));
await p.click('#jr-s02-cancel').catch(() => {}); await p.waitForTimeout(250);
let dlg = await p.$$('#jr-dialog-overlay button'); if (dlg.length) { await dlg[dlg.length - 1].click().catch(() => {}); }
await p.waitForTimeout(300);

/* ---------- 경로 B: 가져오기 JSON 전 문자열 필드 ---------- */
console.log('=== 경로 B · 가져오기 JSON 문자열 필드 주입 ===');
for (const [name, pay] of P) {
  const file = { app: 'jr-expense', kind: 'backup', schema: 1,
    exportedAt: Date.now(), exportedDate: pay,
    data: { expenses: [{ id: 'x_' + name, date: '2026-08-11', amount: 1000, categoryId: 'c_x', memo: pay, createdAt: 1 }],
            categories: [{ id: 'c_x', name: pay.slice(0, 12), order: 0, isDefault: false }],
            settings: { selectedMonth: pay } } };
  const res = await p.evaluate(t => {
    window.__XSS__ = 0; window.__ALERT__ = 0; window.__NEWNODES__ = [];
    const pr = JR.io.parseImport(t);
    if (!pr.ok) { return { parsed: false, code: pr.code }; }
    const ar = JR.io.applyImport(pr.data.payload);
    return { parsed: true, applied: ar.ok, code: ar.code || null };
  }, JSON.stringify(file));
  await p.click('#jr-tabbar .jr-tab[data-screen="s03"]').catch(() => {}); await p.waitForTimeout(250);
  await p.click('#jr-tabbar .jr-tab[data-screen="s04"]').catch(() => {}); await p.waitForTimeout(250);
  await p.click('#jr-tabbar .jr-tab[data-screen="s01"]').catch(() => {}); await p.waitForTimeout(250);
  const st = await p.evaluate(() => ({ xss: window.__XSS__, alert: window.__ALERT__, nodes: window.__NEWNODES__.slice(),
    kids: Array.from(document.querySelectorAll('.jr-expense-row__memo,.jr-category-row__name,.jr-stat-row__name,.jr-chip')).map(n => n.childElementCount),
    scripts: document.querySelectorAll('script').length }));
  ok('가져오기/' + name, st.xss === 0 && st.alert === 0 && st.nodes.length === 0 && st.kids.every(k => k === 0),
    'parse=' + res.parsed + (res.code ? '(' + res.code + ')' : '') + ' apply=' + res.applied +
    ' xss=' + st.xss + ' 신규위험노드=' + JSON.stringify(st.nodes) + ' script태그수=' + st.scripts);
}
console.log('');
console.log('=== 결과 ===');
R.forEach(r => console.log(r));
console.log('FAIL:', R.filter(r => r.indexOf('**FAIL**') === 0).length, '/', R.length);
console.log('콘솔에러·pageerror:', errs.length, errs.slice(0, 10));
await p.screenshot({ path: 'shots/qa-sec-xss-' + ENGINE + '.png', fullPage: true });
await b.close();
})();
