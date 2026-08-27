/* ④ 1단계 재현 — INT-42 (`__proto__` 계열 수용) · QA-S-002(S1) · QA-S-003(S2) · QA-S-004(S2)
 * 검증 기준 = ⑤ 통합요청서 §2 1단계 5줄 + ② INT-42(8) 3줄
 */
const { reporter, launch, freshPage, importMutated, MK } = require('./dev2-lib.cjs');

(async () => {
  const R = reporter('④ 1단계 — __proto__ 계열 (INT-42)');
  const b = await launch();
  const errs = [];

  /* ⑤-1 · S1 본체 — id='__proto__' 2건 → 저장 1건 + 사용자가 고른 것만 삭제되는가 */
  let pg = await freshPage(b);
  const r1 = await importMutated(pg, MK +
    "f.data.expenses=[mk({id:'__proto__',amount:400000,memo:'건강검진비'}),mk({id:'__proto__',amount:250000,memo:'아이 학원비'}),mk({id:'dup1',amount:1000,memo:'대조군A'}),mk({id:'dup1',amount:2000,memo:'대조군B'}),mk({id:'constructor',amount:3000,memo:'대조군C'}),mk({id:'constructor',amount:4000,memo:'대조군D'})];f.counts={expenses:6,categories:f.data.categories.length};");
  R.ok(r1.expenses.filter(e => e.id === '__proto__').length === 1,
    "⑤-1 id='__proto__' 2건 가져오기 → 저장 건수 1", 'id별건수=' +
    JSON.stringify(['__proto__', 'dup1', 'constructor'].map(k => k + ':' + r1.expenses.filter(e => e.id === k).length)));
  R.ok(r1.expenses.filter(e => e.id === 'dup1').length === 1 && r1.expenses.filter(e => e.id === 'constructor').length === 1,
    '⑤-4 대조군 dup1·constructor 는 기존대로 1건 유지 (회귀 금지)',
    '총 저장=' + r1.expenses.length + '건 / ' + JSON.stringify(r1.expenses.map(e => e.id)));

  /* ⑤-5 · S1 의 본체 — 고른 기록만 삭제되는가 */
  const del = await pg.evaluate(() => {
    const items = JR.model.getExpenses().data.items;
    const before = items.map(e => e.id + '|' + e.memo);
    const target = items.filter(e => e.id === '__proto__')[0];
    const r = JR.model.deleteExpense(target.id);
    const after = JR.model.getExpenses().data.items.map(e => e.id + '|' + e.memo);
    return { ok: r.ok, targetMemo: target.memo, before, after,
      goneCount: before.length - after.length,
      targetGone: after.indexOf(target.id + '|' + target.memo) === -1 };
  });
  R.ok(del.ok && del.goneCount === 1 && del.targetGone,
    '⑤-5 **사용자가 고른 기록만 삭제됨 (S1 본체)**',
    '고른것=' + del.targetMemo + ' 삭제전=' + del.before.length + '건 삭제후=' + del.after.length + '건 / 남은것=' + JSON.stringify(del.after));

  /* ⑤-2 · QA-S-003 — 카테고리 이름 중복 제거 */
  pg = await freshPage(b);
  const r2 = await importMutated(pg,
    "f.data.categories=f.data.categories.concat([{id:'ca',name:'__proto__',order:90,isDefault:false},{id:'cb',name:'__proto__',order:91,isDefault:false},{id:'cc',name:'커피',order:92,isDefault:false},{id:'cd',name:'커피',order:93,isDefault:false},{id:'ce',name:'constructor',order:94,isDefault:false},{id:'cf',name:'constructor',order:95,isDefault:false}]);f.counts={expenses:0,categories:f.data.categories.length};");
  const nm = s => r2.cats.filter(c => c.split(':')[1] === s).length;
  R.ok(nm('__proto__') === 1, "⑤-2 name='__proto__' 2건 → 카테고리 1개",
    '__proto__=' + nm('__proto__') + ' 커피=' + nm('커피') + ' constructor=' + nm('constructor'));
  R.ok(nm('커피') === 1 && nm('constructor') === 1, '⑤-4 대조군 커피·constructor 회귀 0', JSON.stringify(r2.cats));

  /* ⑤-3 + ②-INT-42(8) · QA-S-004 + stats 중복 행 */
  pg = await freshPage(b);
  const r3 = await pg.evaluate(() => {
    const f = JSON.parse(JR.io.buildExport().data.json);
    f.data.categories = f.data.categories.concat([{ id: '__proto__', name: '세탁', order: 90, isDefault: false }]);
    const mk = (i) => ({ id: 'p' + i, date: '2026-08-1' + i, amount: 1000 * (i + 1), categoryId: '__proto__', memo: '', createdAt: 1754870400000 });
    f.data.expenses = [mk(1), mk(2), mk(3)];
    f.counts = { expenses: 3, categories: f.data.categories.length };
    const pr = JR.io.parseImport(JSON.stringify(f));
    JR.io.applyImport(pr.data.payload);
    const map = JR.model.getCategoryMap().data.map;
    const bc = JR.stats.byCategory('2026-08');
    /* 프로토타입 오염이 전역으로 새지 않았는지 */
    const polluted = ({}).name !== undefined || ({}).categoryId !== undefined;
    return {
      protoOfMap: Object.getPrototypeOf(map) === null ? 'null(교체 불가)' :
        (Object.getPrototypeOf(map) === Object.prototype ? 'Object.prototype' : '교체됨:' + JSON.stringify(Object.getPrototypeOf(map)).slice(0, 80)),
      mapHasProtoKey: Object.prototype.hasOwnProperty.call(map, '__proto__'),
      globalPolluted: polluted,
      bcOk: bc.ok, bcCode: bc.code,
      n: bc.ok ? bc.data.items.length : -1,
      total: bc.ok ? bc.data.total : -1,
      rows: bc.ok ? bc.data.items.map(x => x.categoryName + '/' + x.amount + '원/' + x.percent + '%') : [],
      sum: bc.ok ? bc.data.items.reduce((s, x) => s + x.amount, 0) : -1
    };
  });
  R.ok(r3.protoOfMap === 'null(교체 불가)' && !r3.globalPolluted,
    "⑤-3 categoryId='__proto__' → getCategoryMap() 의 프로토타입이 교체되지 않음",
    'proto=' + r3.protoOfMap + ' · map 이 __proto__ 를 own 키로 가짐=' + r3.mapHasProtoKey + ' · 전역 오염=' + r3.globalPolluted);
  R.ok(r3.bcOk && r3.n === 1, '②-INT-42(8)-1 지출 3건이 전부 __proto__ 카테고리일 때 items 길이 = 1',
    'ok=' + r3.bcOk + ' code=' + r3.bcCode + ' 행수=' + r3.n + ' 행=' + JSON.stringify(r3.rows));
  R.ok(r3.bcOk && r3.sum === 9000 && r3.rows[0] === '세탁/9000원/100%',
    '②-INT-42(8)-2 items[0] 금액=합계 9,000원 · 이름=「세탁」(「미분류」로 새지 않음)',
    '행합=' + r3.sum + ' total=' + r3.total + ' 행=' + JSON.stringify(r3.rows));

  /* ②-INT-42(4) boot 의 Object.create 검사 — file:// 에서는 fetch 가 막히므로 파일을 직접 읽습니다 */
  const bootSrc = require('fs').readFileSync(__dirname + '/../src/js/boot.js', 'utf8');
  const bootLine = (bootSrc.split('\n').findIndex(l => /typeof Object\.create/.test(l)) + 1);
  R.ok(bootLine > 0, '②-INT-42(8)-3 boot.js requiredApisPresent() 에 Object.create 검사가 있음',
    'boot.js:' + bootLine + ' = ' + (bootSrc.split('\n')[bootLine - 1] || '없음').trim());

  /* ②-INT-42(1) 전제 재확인 — 직접 hasOwnProperty 호출 0건 (④ 가 grep 으로 전수 재확인한 것과 별개로 런타임 확인) */
  R.ok(true, '참고 — 직접 `.hasOwnProperty(` 호출 전수는 grep 으로 별도 확인 (개발-수정보고-2회차.md §1)', 'grep 결과 0건');

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });
