/* ⚠️ 폐기 — 합본 가져오기가 용량 한도로 parse 거부되어 가짜 PASS 를 냅니다. qa-lead-s2b.cjs 를 쓰십시오. (QA보고서.md §3-5) */
/* ⑤ 파트장 — 보안 S2·S3 표본 재현 (QA-S-003 · S-004 · S-005 · S-006 · S-007) */
const { chromium } = require('playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
let P = 0, F = 0; const L = [];
const ok = (c, n, d) => { c ? (P++, L.push('PASS | ' + n + ' | ' + d)) : (F++, L.push('**FAIL** | ' + n + ' | ' + d)); };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(APP);
  await p.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());

  const r = await p.evaluate(() => {
    const ex = JR.io.buildExport(); const f = JSON.parse(ex.data.json);
    const cid = f.data.categories[0].id;
    const mk = (o) => Object.assign({ id: 'x' + Math.random().toString(36).slice(2), date: '2026-08-10',
      amount: 1000, categoryId: cid, memo: '', createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' }, o);
    f.data.expenses = [
      mk({ id: 'd1', date: '2026-02-30', memo: '달력에 없는 날 2월30일', amount: 999000 }),   /* S-005 */
      mk({ id: 'd2', date: '2026-04-31', memo: '달력에 없는 날 4월31일', amount: 888000 }),   /* S-005 */
      mk({ id: 'd3', memo: 'M'.repeat(300000) })                                              /* S-006 */
    ];
    f.data.categories = f.data.categories.concat([
      { id: 'ca', name: '__proto__', order: 90, isDefault: false },
      { id: 'cb', name: '__proto__', order: 91, isDefault: false },
      { id: 'cc', name: '커피', order: 92, isDefault: false },
      { id: 'cd', name: '커피', order: 93, isDefault: false },
      { id: 'ce', name: 'constructor', order: 94, isDefault: false },
      { id: 'cf', name: 'constructor', order: 95, isDefault: false },
      { id: '__proto__', name: '세탁', order: 96, isDefault: false }                          /* S-004 */
    ]);
    const pr = JR.io.parseImport(JSON.stringify(f));
    const ap = pr.ok ? JR.io.applyImport(pr.data.payload) : null;
    const items = JR.model.getExpenses().data.items;
    const cats = JR.model.getCategories().data.items;
    const map = JR.model.getCategoryMap().data;
    const m = map.map || map;
    /* S-007: restore 가 jr. 밖 키를 쓰는가 */
    const before = localStorage.getItem('완전히무관한키');
    JR.store.restore({ '완전히무관한키': '침입값', 'jr.v1.settings': localStorage.getItem('jr.v1.settings') || '{}' });
    const after = localStorage.getItem('완전히무관한키');
    return {
      parsed: pr.ok, applied: !!(ap && ap.ok),
      날짜통과: items.filter(e => /2026-02-30|2026-04-31/.test(e.date)).map(e => e.date + '/' + e.memo),
      메모길이: items.map(e => e.memo.length).sort((a, c) => c - a)[0],
      카테고리이름들: cats.map(c => c.id + ':' + c.name),
      proto이름수: cats.filter(c => c.name === '__proto__').length,
      커피수: cats.filter(c => c.name === '커피').length,
      constructor수: cats.filter(c => c.name === 'constructor').length,
      mapProto: Object.getPrototypeOf(m) === Object.prototype ? '정상' : JSON.stringify(Object.getPrototypeOf(m)),
      restore_전: before, restore_후: after
    };
  });

  ok(r.날짜통과.length === 0, 'QA-S-005 가져오기가 달력에 없는 날짜를 거부함', JSON.stringify(r.날짜통과));
  ok(r.메모길이 <= 100, 'QA-S-006 가져오기가 메모 100자 계약을 지킴', '최대 메모 길이=' + r.메모길이);
  ok(r.proto이름수 <= 1, 'QA-S-003 카테고리 이름 중복 제거가 __proto__ 에서도 동작',
     '__proto__=' + r.proto이름수 + ' 커피=' + r.커피수 + ' constructor=' + r.constructor수);
  ok(r.mapProto === '정상', 'QA-S-004 getCategoryMap 프로토타입이 교체되지 않음', String(r.mapProto).slice(0, 120));
  ok(r.restore_후 === r.restore_전, 'QA-S-007 store.restore 가 jr. 밖 키를 쓰지 않음',
     '전=' + JSON.stringify(r.restore_전) + ' 후=' + JSON.stringify(r.restore_후));
  ok(errs.length === 0, 'pageerror 0건', JSON.stringify(errs.slice(0, 2)));

  console.log('=== ⑤ 파트장 보안 S2·S3 표본 재현 ===');
  L.forEach(l => console.log(l));
  console.log('PASS=' + P + ' FAIL=' + F);
  console.log('원자료: ' + JSON.stringify(r).slice(0, 800));
  await b.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
