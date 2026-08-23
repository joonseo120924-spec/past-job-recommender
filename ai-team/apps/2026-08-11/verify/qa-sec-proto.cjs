/* QA(보안) — 프로토타입 오염 실측.
 * 코드 리딩이 아니라 실제 주입 후 ({}).X 를 읽어 확인한다.
 * 주의: var X = { __proto__: true } 는 own 속성을 만들지 않지만
 *      JSON.parse('{"__proto__":...}') 는 own 속성을 만든다 — 둘을 나눠서 시험한다.
 * 사용: node verify/qa-sec-proto.cjs [engine]
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

/* 0) 계기 검증 — JSON.parse 가 own 속성을 만드는지 이 엔진에서 실제 확인 */
const sanity = await p.evaluate(() => {
  const a = { __proto__: true };
  const c = JSON.parse('{"__proto__":{"x":1}}');
  return {
    literalOwn: Object.prototype.hasOwnProperty.call(a, '__proto__'),
    jsonOwn: Object.prototype.hasOwnProperty.call(c, '__proto__'),
    jsonType: typeof c.__proto__
  };
});
console.log('계기 검증(엔진 동작):', JSON.stringify(sanity));
ok('계기: JSON.parse 는 __proto__ own 속성을 만든다', sanity.jsonOwn === true, JSON.stringify(sanity));

const CANARY = () => ({
  objPolluted: ({}).polluted,
  objIsAdmin: ({}).isAdmin,
  arrPolluted: [].polluted,
  fnPolluted: (function () {}).polluted,
  objToStringTag: ({}).__jrpoll,
  objProtoKeys: Object.getOwnPropertyNames(Object.prototype).filter(k => /polluted|isAdmin|__jrpoll|memo|name/.test(k)),
  numProto: (0).polluted,
  strProto: ''.polluted
});

/* ---------- A. 가져오기 JSON 최상위 __proto__ ---------- */
const cases = [
  ['최상위 __proto__', {"__proto__": {"polluted": "YES"}, app: 'jr-expense', kind: 'backup', schema: 1,
    data: { expenses: [], categories: [{ id: 'c1', name: '식비', order: 0 }], settings: {} }}],
  ['최상위 constructor.prototype', { constructor: { prototype: { polluted: 'YES' } }, app: 'jr-expense', kind: 'backup', schema: 1,
    data: { expenses: [], categories: [{ id: 'c1', name: '식비', order: 0 }], settings: {} }}],
  ['data.__proto__', { app: 'jr-expense', kind: 'backup', schema: 1,
    data: { "__proto__": { polluted: 'YES' }, expenses: [], categories: [{ id: 'c1', name: '식비', order: 0 }], settings: {} }}],
  ['settings.__proto__', { app: 'jr-expense', kind: 'backup', schema: 1,
    data: { expenses: [], categories: [{ id: 'c1', name: '식비', order: 0 }], settings: { "__proto__": { polluted: 'YES' }, selectedMonth: '2026-08' } }}],
  ['expense 레코드 __proto__', { app: 'jr-expense', kind: 'backup', schema: 1,
    data: { expenses: [{ "__proto__": { polluted: 'YES' }, id: 'e1', date: '2026-08-11', amount: 100, categoryId: 'c1', memo: 'm', createdAt: 1 }],
            categories: [{ id: 'c1', name: '식비', order: 0 }], settings: {} }}],
  ['category 레코드 __proto__', { app: 'jr-expense', kind: 'backup', schema: 1,
    data: { expenses: [], categories: [{ "__proto__": { polluted: 'YES' }, id: 'c1', name: '식비', order: 0 }], settings: {} }}],
  ['expense id = __proto__', { app: 'jr-expense', kind: 'backup', schema: 1,
    data: { expenses: [{ id: '__proto__', date: '2026-08-11', amount: 100, categoryId: 'c1', memo: 'A', createdAt: 1 },
                       { id: '__proto__', date: '2026-08-12', amount: 200, categoryId: 'c1', memo: 'B', createdAt: 2 }],
            categories: [{ id: 'c1', name: '식비', order: 0 }], settings: {} }}],
  ['category id = __proto__', { app: 'jr-expense', kind: 'backup', schema: 1,
    data: { expenses: [{ id: 'e9', date: '2026-08-11', amount: 700, categoryId: '__proto__', memo: 'p', createdAt: 1 }],
            categories: [{ id: '__proto__', name: '세탁', order: 0 }, { id: 'c1', name: '식비', order: 1 }], settings: {} }}],
  ['category id = constructor', { app: 'jr-expense', kind: 'backup', schema: 1,
    data: { expenses: [{ id: 'e8', date: '2026-08-11', amount: 800, categoryId: 'constructor', memo: 'c', createdAt: 1 }],
            categories: [{ id: 'constructor', name: '전기', order: 0 }], settings: {} }}],
  ['category 이름 = __proto__ 중복 2건', { app: 'jr-expense', kind: 'backup', schema: 1,
    data: { expenses: [], categories: [{ id: 'ca', name: '__proto__', order: 0 }, { id: 'cb', name: '__proto__', order: 1 }], settings: {} }}],
  ['prototype 키', { prototype: { polluted: 'YES' }, app: 'jr-expense', kind: 'backup', schema: 1,
    data: { expenses: [], categories: [{ id: 'c1', name: '식비', order: 0 }], settings: {} }}],
  ['dismissedNotices __proto__', { app: 'jr-expense', kind: 'backup', schema: 1,
    data: { expenses: [], categories: [{ id: 'c1', name: '식비', order: 0 }],
            settings: { selectedMonth: '2026-08', dismissedNotices: { "__proto__": { polluted: 'YES' } } } }}]
];

for (const [name, obj] of cases) {
  const text = JSON.stringify(obj);
  const out = await p.evaluate(([t, nm]) => {
    const before = ({}).polluted;
    const pr = JR.io.parseImport(t);
    let applied = null, code = pr.ok ? null : pr.code;
    if (pr.ok) { const ar = JR.io.applyImport(pr.data.payload); applied = ar.ok; code = ar.code || null; }
    JR.model.init();
    return { parsed: pr.ok, applied: applied, code: code, before: before,
      canary: { p: ({}).polluted, a: ({}).isAdmin, arr: [].polluted, fn: (function(){}).polluted },
      protoOwn: Object.getOwnPropertyNames(Object.prototype).filter(k => /polluted|isAdmin/.test(k)),
      expenses: JR.model.getExpenses().data.items.map(e => e.id + '/' + e.categoryId),
      cats: JR.model.getCategories().data.items.map(c => c.id + ':' + c.name) };
  }, [text, name]);
  const clean = out.canary.p === undefined && out.canary.a === undefined &&
                out.canary.arr === undefined && out.canary.fn === undefined && out.protoOwn.length === 0;
  ok('오염/' + name, clean,
    'parse=' + out.parsed + (out.code ? '(' + out.code + ')' : '') + ' apply=' + out.applied +
    ' ({}).polluted=' + JSON.stringify(out.canary.p) + ' Object.prototype신규키=' + JSON.stringify(out.protoOwn) +
    ' 저장된기록=' + JSON.stringify(out.expenses) + ' 카테고리=' + JSON.stringify(out.cats));
}

/* ---------- B. localStorage 를 직접 오염시킨 뒤 부팅 (file:// 동일 오리진 공격자 가정) ---------- */
console.log('');
console.log('=== B. 저장소 선오염 후 부팅 경로 ===');
const lsCases = [
  ['jr.v1.expenses 에 __proto__ 주입', 'jr.v1.expenses', '[{"__proto__":{"polluted":"YES"},"id":"z1","date":"2026-08-11","amount":10,"categoryId":"c_d01","memo":"m","createdAt":1}]'],
  ['jr.v1.categories 에 __proto__ 주입', 'jr.v1.categories', '[{"__proto__":{"polluted":"YES"},"id":"c_d01","name":"식비","order":0,"isDefault":true}]'],
  ['jr.v1.settings 에 __proto__ 주입', 'jr.v1.settings', '{"__proto__":{"polluted":"YES"},"selectedMonth":"2026-08","dismissedNotices":[]}'],
  ['jr.v1.meta 에 __proto__ 주입', 'jr.v1.meta', '{"__proto__":{"polluted":"YES"},"schema":1,"appId":"jr-expense","createdAt":1,"lastWriteAt":1,"writeCount":1}'],
  ['jr.v1.draft 에 __proto__ 주입', 'jr.v1.draft', '{"__proto__":{"polluted":"YES"},"at":' + Date.now() + ',"date":"2026-08-11","amount":"100","categoryId":"c_d01","memo":"d","mode":"add"}'],
  ['jr.v1.rollback 에 임의 키 주입', 'jr.v1.rollback', '{"__proto__":"X","evil.key":"EVIL","jr.v1.expenses":"[]","jr.v1.categories":"[{\\"id\\":\\"c_d01\\",\\"name\\":\\"식비\\",\\"order\\":0,\\"isDefault\\":true}]"}']
];
for (const [name, k, v] of lsCases) {
  await p.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v);
    if (k !== 'jr.v1.meta') { localStorage.setItem('jr.v1.meta', '{"schema":1,"appId":"jr-expense","createdAt":1,"lastWriteAt":1,"writeCount":1}'); } }, [k, v]);
  await p.reload(); await p.waitForTimeout(700);
  const out = await p.evaluate(() => ({
    canary: { p: ({}).polluted, arr: [].polluted },
    protoOwn: Object.getOwnPropertyNames(Object.prototype).filter(x => /polluted/.test(x)),
    keys: Object.keys(localStorage).sort(),
    ready: JR.model.isReady()
  }));
  const foreign = out.keys.filter(x => x.indexOf('jr.') !== 0);
  ok('부팅오염/' + name, out.canary.p === undefined && out.canary.arr === undefined && out.protoOwn.length === 0 && foreign.length === 0,
    '({}).polluted=' + JSON.stringify(out.canary.p) + ' Object.prototype신규키=' + JSON.stringify(out.protoOwn) +
    ' 네임스페이스밖키=' + JSON.stringify(foreign) + ' 전체키=' + JSON.stringify(out.keys));
}

/* ---------- C. 방어 코드가 "실제로" 동작하는가 — hasOwnProperty 가드 우회 ---------- */
console.log('');
console.log('=== C. 중복 제거 가드가 __proto__ 에서 실제로 동작하는가 ===');
await p.evaluate(() => localStorage.clear());
await p.reload(); await p.waitForTimeout(600);
const dup = await p.evaluate(() => {
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: '__proto__', date: '2026-08-11', amount: 111, categoryId: 'c1', memo: 'A', createdAt: 1 },
               { id: '__proto__', date: '2026-08-12', amount: 222, categoryId: 'c1', memo: 'B', createdAt: 2 },
               { id: 'dup1', date: '2026-08-13', amount: 333, categoryId: 'c1', memo: 'C', createdAt: 3 },
               { id: 'dup1', date: '2026-08-14', amount: 444, categoryId: 'c1', memo: 'D', createdAt: 4 }],
    categories: [{ id: '__proto__', name: '가', order: 0 }, { id: '__proto__', name: '나', order: 1 },
                 { id: 'c1', name: '식비', order: 2 }],
    settings: {} } });
  const pr = JR.io.parseImport(t);
  if (!pr.ok) { return { code: pr.code }; }
  const ar = JR.io.applyImport(pr.data.payload);
  const items = JR.model.getExpenses().data.items;
  const cats = JR.model.getCategories().data.items;
  const ids = items.map(e => e.id);
  return { applied: ar.ok, rejectedCount: pr.data.payload.rejectedCount,
    expenseIds: ids, dupProto: ids.filter(x => x === '__proto__').length, dupNormal: ids.filter(x => x === 'dup1').length,
    catIds: cats.map(c => c.id + ':' + c.name) };
});
console.log('중복 시험 원자료:', JSON.stringify(dup));
ok('일반 id 중복은 거부된다(기준선)', dup.dupNormal === 1, "id='dup1' 저장 건수=" + dup.dupNormal);
ok("id='__proto__' 중복도 거부된다", dup.dupProto <= 1, "id='__proto__' 저장 건수=" + dup.dupProto + ' / 전체=' + JSON.stringify(dup.expenseIds));
ok("categoryId='__proto__' 중복도 거부된다", dup.catIds.filter(x => x.indexOf('__proto__:') === 0).length <= 1, JSON.stringify(dup.catIds));

/* ---------- D. getCategoryMap 이 __proto__ id 로 훼손되는가 ---------- */
console.log('');
console.log('=== D. getCategoryMap / 통계 경로 ===');
const mapOut = await p.evaluate(() => {
  const t = JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1, data: {
    expenses: [{ id: 'e1', date: '2026-08-11', amount: 5000, categoryId: '__proto__', memo: '세탁비', createdAt: 1 },
               { id: 'e2', date: '2026-08-11', amount: 3000, categoryId: 'c1', memo: '밥', createdAt: 2 }],
    categories: [{ id: '__proto__', name: '세탁', order: 0 }, { id: 'c1', name: '식비', order: 1 }],
    settings: { selectedMonth: '2026-08' } } });
  const pr = JR.io.parseImport(t); if (!pr.ok) return { code: pr.code };
  JR.io.applyImport(pr.data.payload);
  const m = JR.model.getCategoryMap().data.map;
  return {
    mapProtoOwn: Object.prototype.hasOwnProperty.call(m, '__proto__'),
    mapProtoValue: (function(){ try { return JSON.stringify(m['__proto__']); } catch(e){ return 'ERR'; } })(),
    mapProtoOfMap: Object.getPrototypeOf(m) === Object.prototype ? 'Object.prototype' : JSON.stringify(Object.getPrototypeOf(m)),
    listName: JR.model.getCategoryName('__proto__').data,
    stats: JR.stats.byCategory('2026-08').data.items.map(i => i.categoryId + '=' + i.categoryName + '/' + i.amount + '/' + i.percent + '%'),
    globalCanary: ({}).polluted
  };
});
console.log('원자료:', JSON.stringify(mapOut, null, 1));
ok('getCategoryMap 의 프로토타입이 바뀌지 않는다', mapOut.mapProtoOfMap === 'Object.prototype', 'prototype=' + mapOut.mapProtoOfMap);
ok('목록과 통계의 카테고리 이름이 일치한다',
   mapOut.stats.some(s => s.indexOf('세탁') >= 0) === (mapOut.listName && mapOut.listName.name === '세탁'),
   '목록=' + JSON.stringify(mapOut.listName) + ' 통계=' + JSON.stringify(mapOut.stats));

console.log('');
console.log('=== 결과 ===');
R.forEach(r => console.log(r));
console.log('FAIL:', R.filter(r => r.indexOf('**FAIL**') === 0).length, '/', R.length);
console.log('콘솔에러·pageerror:', errs.length, errs.slice(0, 12));
await b.close();
})();
