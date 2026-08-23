/* QA(보안) — 저장소 무결성 · 격리 · 롤백 · wipeAll 잔존물 · 내보내기 누출 · 전역 오염 · 코드 실행면.
 * 사용: node verify/qa-sec-store.cjs [engine]
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

/* ---------- 1. 전역 오염 ---------- */
/* 주의: 이전 판에서 iframe 을 만들어 비교하다가 window[0] 이 생겨 오탐이 났습니다.
 * 정밀 측정은 verify/qa-sec-global.cjs 가 담당합니다(빈 페이지 컨텍스트 대조).
 * 여기서는 앱이 만든 것으로 볼 수 있는 소문자/JR 계열 전역만 봅니다. */
const base = await p.evaluate(() => ({
  jrKeys: Object.keys(window.JR || {}),
  appish: Object.getOwnPropertyNames(window).filter(k =>
    /^(JR|jr|app|App|state|store|model|stats|io|ui|expenses|categories|settings|monthIndex|statsCache|mem|_seq|subscribers)$/.test(k))
}));
console.log('전역 비교 원자료:', JSON.stringify(base));
ok('앱이 만든 전역이 JR 하나뿐', base.appish.length === 1 && base.appish[0] === 'JR', '앱 계열 전역=' + JSON.stringify(base.appish));
ok('모듈 사설 상태 monthIndex 가 외부에 노출되지 않음',
   base.jrKeys.indexOf('monthIndex') === -1 && !(await p.evaluate(() => typeof JR.model.monthIndex !== 'undefined' || typeof JR.monthIndex !== 'undefined')),
   'JR 표면=' + JSON.stringify(base.jrKeys));

/* ---------- 2. 코드 실행면 (런타임) ---------- */
const exec = await p.evaluate(() => {
  const inline = [];
  const all = document.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const a = all[i].attributes;
    for (let j = 0; j < a.length; j++) { if (/^on/i.test(a[j].name)) { inline.push(all[i].tagName + '@' + a[j].name); } }
  }
  const hrefs = Array.from(document.querySelectorAll('[href],[src],[action],[data]'))
    .map(e => e.getAttribute('href') || e.getAttribute('src') || e.getAttribute('action') || e.getAttribute('data'))
    .filter(Boolean);
  return { inline: inline,
    jsHrefs: hrefs.filter(h => /^javascript:/i.test(h)),
    externalHrefs: hrefs.filter(h => /^(https?:)?\/\//i.test(h)),
    allHrefs: hrefs.map(h => h.slice(0, 60)),
    docWrite: (''+document.write).indexOf('native code') >= 0,
    csp: Array.from(document.querySelectorAll('meta[http-equiv]')).map(m => m.getAttribute('http-equiv') + '=' + m.getAttribute('content'))
  };
});
console.log('코드 실행면 원자료:', JSON.stringify(exec, null, 1));
ok('인라인 이벤트 핸들러 속성 0건 (런타임 DOM 전수)', exec.inline.length === 0, JSON.stringify(exec.inline));
ok('javascript: URL 0건', exec.jsHrefs.length === 0, JSON.stringify(exec.jsHrefs));
ok('외부 호스트를 가리키는 href/src 0건', exec.externalHrefs.length === 0, JSON.stringify(exec.externalHrefs));
const cspMeta = exec.csp.filter(c => /Content-Security-Policy/i.test(c));
ok('CSP 메타 태그 존재 (심층방어)', cspMeta.length > 0, 'meta[http-equiv]=' + JSON.stringify(exec.csp));

/* ---------- 3. 하드코딩된 비밀키·토큰 정적 검사는 별도. 런타임 문자열 검사 ---------- */
const secrets = await p.evaluate(() => {
  const src = Array.from(document.scripts).map(s => s.textContent || '').join('\n');
  return { inlineScriptChars: src.length,
    suspicious: (src.match(/(api[_-]?key|secret|token|password|Bearer\s|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})/gi) || []) };
});
ok('인라인 스크립트에 비밀키 패턴 없음', secrets.suspicious.length === 0, JSON.stringify(secrets));

/* ---------- 4. 저장소 키 네임스페이스 ---------- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
await p.evaluate(m => {
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'k1', date: m + '-01', amount: 1000, categoryId: 'c', memo: 'ns', createdAt: 1 },
               { id: 'bad', date: 'zzz', amount: 1, categoryId: 'c', memo: '', createdAt: 0 }],
    categories: [{ id: 'c', name: '식비', order: 0 }], settings: { selectedMonth: m } } });
  JR.io.applyImport(JR.io.parseImport(t).data.payload);
}, MONTH);
await p.click('#jr-s01-add'); await p.waitForTimeout(250);
await p.fill('#jr-amount', '5000'); await p.fill('#jr-memo', '초안');
await p.waitForTimeout(400);
const ks1 = await p.evaluate(() => Object.keys(localStorage).sort());
console.log('전 기능 사용 후 키:', JSON.stringify(ks1));
ok('localStorage 키가 전부 jr. 네임스페이스',
   ks1.every(k => k.indexOf('jr.') === 0), JSON.stringify(ks1));
ok('jr.__probe 가 남지 않는다', ks1.indexOf('jr.__probe') === -1, JSON.stringify(ks1));

/* ---------- 5. 손상 격리가 원본을 지우지 않는가 ---------- */
await p.evaluate(() => {
  localStorage.setItem('jr.v1.expenses', '{{{ 깨진 JSON');
  localStorage.setItem('jr.v1.expenses.bak', '[{"id":"bakOnly","date":"2026-08-01","amount":4242,"categoryId":"c","memo":"백업본","createdAt":1}]');
});
await p.reload(); await p.waitForTimeout(800);
const corrupt = await p.evaluate(() => {
  const ks = Object.keys(localStorage).sort();
  const cs = ks.filter(k => k.indexOf('jr.v1.corrupt.') === 0);
  return { keys: ks, corrupt: cs, corruptValue: cs.length ? localStorage.getItem(cs[0]) : null,
    items: JR.model.getExpenses().data.items.map(e => e.id + '/' + e.amount),
    banner: Array.from(document.querySelectorAll('.jr-banner')).map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)) };
});
console.log('손상 격리 원자료:', JSON.stringify(corrupt, null, 1));
ok('손상 원본이 jr.v1.corrupt.* 로 보관된다', corrupt.corrupt.length >= 1 && /깨진 JSON/.test(corrupt.corruptValue || ''), JSON.stringify(corrupt.corrupt));
ok('손상 시 백업본으로 복구된다(E-303)', corrupt.items.some(i => i.indexOf('bakOnly') === 0), JSON.stringify(corrupt.items) + ' 배너=' + JSON.stringify(corrupt.banner));

/* corrupt 슬롯 3개 상한 */
const capOut = await p.evaluate(() => {
  for (let i = 0; i < 6; i++) { JR.store.quarantine('jr.v1.expenses', 'corrupt#' + i); }
  return Object.keys(localStorage).filter(k => k.indexOf('jr.v1.corrupt.') === 0).length;
});
ok('격리 슬롯이 3개를 넘지 않는다(MAX_CORRUPT)', capOut <= 3, '슬롯 수=' + capOut);

/* ---------- 6. 용량 초과 롤백이 데이터를 지키는가 ---------- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
const quota = await p.evaluate(m => {
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'safe', date: m + '-01', amount: 8888, categoryId: 'c', memo: '지켜야할기록', createdAt: 1 }],
    categories: [{ id: 'c', name: '식비', order: 0 }], settings: { selectedMonth: m } } });
  JR.io.applyImport(JR.io.parseImport(t).data.payload);
  const before = localStorage.getItem('jr.v1.expenses');
  /* setItem 을 강제로 QuotaExceededError 로 만든다 */
  const real = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === 'jr.v1.expenses' && v.indexOf('침입기록') >= 0) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
    return real.apply(this, arguments);
  };
  const t2 = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'evil', date: m + '-02', amount: 1, categoryId: 'c', memo: '침입기록', createdAt: 2 }],
    categories: [{ id: 'c', name: '식비', order: 0 }], settings: { selectedMonth: m } } });
  const pr = JR.io.parseImport(t2);
  const ar = pr.ok ? JR.io.applyImport(pr.data.payload) : { ok: false, code: pr.code };
  Storage.prototype.setItem = real;
  const after = localStorage.getItem('jr.v1.expenses');
  return { code: ar.code || null, applied: ar.ok, preserved: before === after,
    items: JR.model.getExpenses().data.items.map(e => e.id),
    rollbackKeyLeft: localStorage.getItem('jr.v1.rollback') !== null,
    afterRaw: (after || '').slice(0, 160) };
}, MONTH);
console.log('용량 롤백 원자료:', JSON.stringify(quota, null, 1));
ok('용량 초과로 가져오기가 실패하면 이전 데이터가 보존된다',
   quota.applied === false && quota.preserved === true, JSON.stringify(quota));
ok('롤백 성공 시 jr.v1.rollback 키가 남지 않는다', quota.rollbackKeyLeft === false, 'rollback 잔존=' + quota.rollbackKeyLeft);

/* ---------- 7. wipeAll 잔존물 ---------- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
await p.evaluate(m => {
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'w1', date: m + '-01', amount: 1234, categoryId: 'c', memo: '민감한지출메모', createdAt: 1 },
               { id: 'bad', date: 'zz', amount: 1, categoryId: 'c', memo: '', createdAt: 0 }],
    categories: [{ id: 'c', name: '내카테고리', order: 0 }], settings: { selectedMonth: m } } });
  JR.io.applyImport(JR.io.parseImport(t).data.payload);
}, MONTH);
/* 초안 · rejected · corrupt · bak 를 모두 만들어 둔다 */
await p.click('#jr-s01-add'); await p.waitForTimeout(250);
await p.fill('#jr-amount', '5000'); await p.fill('#jr-memo', '초안메모'); await p.waitForTimeout(500);
await p.click('#jr-s02-cancel'); await p.waitForTimeout(300);
let dbtn = await p.$$('#jr-dialog-overlay button'); if (dbtn.length) { await dbtn[dbtn.length - 1].click(); }
await p.waitForTimeout(400);
console.log('나가기 후 화면:', await p.evaluate(() => document.body.getAttribute('data-screen')));
await p.evaluate(() => { JR.store.quarantine('jr.v1.expenses', '손상원본-민감한지출메모'); });
const beforeWipe = await p.evaluate(() => ({ keys: Object.keys(localStorage).sort(),
  dump: Object.keys(localStorage).map(k => k + '=' + (localStorage.getItem(k) || '').slice(0, 80)) }));
console.log('삭제 전 키:', JSON.stringify(beforeWipe.keys));
console.log('삭제 전 내용:', JSON.stringify(beforeWipe.dump, null, 1));
await p.click('#jr-tabbar .jr-tab[data-screen="s04"]'); await p.waitForTimeout(300);
await p.click('#jr-s04-wipe'); await p.waitForTimeout(300);
dbtn = await p.$$('#jr-dialog-overlay button'); if (dbtn.length) await dbtn[dbtn.length - 1].click(); await p.waitForTimeout(300);
dbtn = await p.$$('#jr-dialog-overlay button'); if (dbtn.length) await dbtn[dbtn.length - 1].click(); await p.waitForTimeout(700);
const afterWipe = await p.evaluate(() => {
  const dump = Object.keys(localStorage).map(k => k + '=' + (localStorage.getItem(k) || ''));
  return { keys: Object.keys(localStorage).sort(), dump: dump.map(d => d.slice(0, 200)),
    residue: dump.filter(d => /민감한지출메모|내카테고리|초안메모|1234/.test(d)).map(d => d.slice(0, 200)),
    cats: JR.model.getCategories().data.items.map(c => c.name),
    exp: JR.model.getExpenses().data.items.length };
});
console.log('삭제 후:', JSON.stringify(afterWipe, null, 1));
ok('wipeAll 후 카테고리가 기본 8종', afterWipe.cats.length === 8, JSON.stringify(afterWipe.cats));
ok('wipeAll 후 기록 0건', afterWipe.exp === 0, String(afterWipe.exp));
ok('wipeAll 후 초안(jr.v1.draft) 삭제', afterWipe.keys.indexOf('jr.v1.draft') === -1, JSON.stringify(afterWipe.keys));
ok('wipeAll 후 거부목록(jr.v1.rejected) 삭제', afterWipe.keys.indexOf('jr.v1.rejected') === -1, JSON.stringify(afterWipe.keys));
ok('wipeAll 후 사용자 데이터 잔존물 0건 (문자열 전수 검색)',
   afterWipe.residue.length === 0, '잔존=' + JSON.stringify(afterWipe.residue) + ' / 전체키=' + JSON.stringify(afterWipe.keys));

/* ---------- 8. 내보내기 누출 ---------- */
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
const exp = await p.evaluate(m => {
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'x1', date: m + '-01', amount: 1000, categoryId: 'c', memo: 'mm', createdAt: 1 }],
    categories: [{ id: 'c', name: '식비', order: 0 }], settings: { selectedMonth: m } } });
  JR.io.applyImport(JR.io.parseImport(t).data.payload);
  JR.model.dismissNotice('E-203');
  JR.model.saveDraft({ date: m + '-09', amount: '77777', categoryId: 'c', memo: '비밀초안', mode: 'add' });
  const e = JR.io.buildExport();
  const o = JSON.parse(e.data.json);
  return { topKeys: Object.keys(o).sort(), dataKeys: Object.keys(o.data).sort(),
    settingsKeys: Object.keys(o.data.settings).sort(),
    expenseKeys: Object.keys(o.data.expenses[0] || {}).sort(),
    categoryKeys: Object.keys(o.data.categories[0] || {}).sort(),
    hasDraft: /비밀초안|77777/.test(e.data.json),
    hasDismissed: /dismissedNotices/.test(e.data.json),
    filename: e.data.filename, len: e.data.json.length };
}, MONTH);
console.log('내보내기 원자료:', JSON.stringify(exp, null, 1));
ok('내보내기에 초안이 섞이지 않는다', exp.hasDraft === false, 'hasDraft=' + exp.hasDraft);
ok('내보내기에 dismissedNotices 가 섞이지 않는다(§5-6-1)', exp.hasDismissed === false, 'hasDismissed=' + exp.hasDismissed);
ok('내보내기 최상위 키가 예상 목록과 정확히 일치',
   JSON.stringify(exp.topKeys) === JSON.stringify(['app', 'counts', 'data', 'exportedAt', 'exportedDate', 'kind', 'schema']),
   JSON.stringify(exp.topKeys));
ok('내보내기 레코드 필드가 예상 목록과 정확히 일치',
   JSON.stringify(exp.expenseKeys) === JSON.stringify(['amount', 'categoryId', 'createdAt', 'date', 'id', 'memo']) &&
   JSON.stringify(exp.categoryKeys) === JSON.stringify(['id', 'isDefault', 'name', 'order']),
   '기록=' + JSON.stringify(exp.expenseKeys) + ' 카테고리=' + JSON.stringify(exp.categoryKeys));

console.log('');
console.log('=== 결과 ===');
R.forEach(r => console.log(r));
console.log('FAIL:', R.filter(r => r.indexOf('**FAIL**') === 0).length, '/', R.length);
console.log('콘솔에러·pageerror:', errs.length, errs.slice(0, 12));
await b.close();
})();
