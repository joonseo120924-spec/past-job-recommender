/* ⑤ 파트장 — S-003~006 을 케이스별로 분리 재현 (앞선 합본은 파일 크기로 parse 거부 → 계기 오류였음) */
const { chromium } = require('playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
let P = 0, F = 0; const L = [];
const ok = (c, n, d) => { c ? (P++, L.push('PASS | ' + n + ' | ' + d)) : (F++, L.push('**FAIL** | ' + n + ' | ' + d)); };
(async () => {
  const b = await chromium.launch();
  const fresh = async () => {
    const pg = await (await b.newContext()).newPage();
    await pg.goto(APP);
    await pg.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
    return pg;
  };
  const imp = async (pg, mut) => pg.evaluate((mutSrc) => {
    const f = JSON.parse(JR.io.buildExport().data.json);
    // eslint-disable-next-line no-new-func
    (new Function('f', 'cid', mutSrc))(f, f.data.categories[0].id);
    const pr = JR.io.parseImport(JSON.stringify(f));
    const ap = pr.ok ? JR.io.applyImport(pr.data.payload) : null;
    return {
      parsed: pr.ok, parseCode: pr.ok ? null : pr.code, applied: !!(ap && ap.ok),
      expenses: JR.model.getExpenses().data.items.map(e => ({ id: e.id, date: e.date, memoLen: e.memo.length })),
      cats: JR.model.getCategories().data.items.map(c => c.id + ':' + c.name),
      mapProtoIsClean: Object.getPrototypeOf(JR.model.getCategoryMap().data.map || JR.model.getCategoryMap().data) === Object.prototype,
      mapProtoVal: JSON.stringify(Object.getPrototypeOf(JR.model.getCategoryMap().data.map || JR.model.getCategoryMap().data)).slice(0, 120)
    };
  }, mut);

  const MK = "var mk=function(o){return Object.assign({id:'x'+Math.random().toString(36).slice(2),date:'2026-08-10',amount:1000,categoryId:cid,memo:'',createdAt:'2026-08-10T00:00:00.000Z',updatedAt:'2026-08-10T00:00:00.000Z'},o)};";

  /* S-005 달력에 없는 날짜 */
  let pg = await fresh();
  let r5 = await imp(pg, MK + "f.data.expenses=[mk({id:'d1',date:'2026-02-30',amount:999000}),mk({id:'d2',date:'2026-04-31',amount:888000}),mk({id:'d3',date:'2026-08-10'})];f.counts={expenses:3,categories:f.data.categories.length};");
  const bad = r5.expenses.filter(e => /2026-02-30|2026-04-31/.test(e.date));
  ok(bad.length === 0, 'QA-S-005 가져오기가 달력에 없는 날짜(2/30·4/31)를 거부함',
     'parsed=' + r5.parsed + ' 통과한날짜=' + JSON.stringify(bad));

  /* S-006 메모 100자 계약 — 파일 크기 한도 아래에서 */
  pg = await fresh();
  let r6 = await imp(pg, MK + "f.data.expenses=[mk({id:'m1',memo:'M'.repeat(5000)})];f.counts={expenses:1,categories:f.data.categories.length};");
  const maxLen = r6.expenses.length ? Math.max.apply(null, r6.expenses.map(e => e.memoLen)) : -1;
  ok(maxLen <= 100, 'QA-S-006 가져오기가 메모 100자 계약을 지킴',
     'parsed=' + r6.parsed + ' code=' + r6.parseCode + ' 최대메모길이=' + maxLen);

  /* S-003 카테고리 이름 중복 제거 (V-11) */
  pg = await fresh();
  let r3 = await imp(pg, "f.data.categories=f.data.categories.concat([{id:'ca',name:'__proto__',order:90,isDefault:false},{id:'cb',name:'__proto__',order:91,isDefault:false},{id:'cc',name:'커피',order:92,isDefault:false},{id:'cd',name:'커피',order:93,isDefault:false},{id:'ce',name:'constructor',order:94,isDefault:false},{id:'cf',name:'constructor',order:95,isDefault:false}]);f.counts={expenses:0,categories:f.data.categories.length};");
  const nm = s => r3.cats.filter(c => c.split(':')[1] === s).length;
  ok(nm('__proto__') <= 1, 'QA-S-003 이름 중복 제거가 __proto__ 에서도 동작',
     'parsed=' + r3.parsed + ' __proto__=' + nm('__proto__') + ' 커피=' + nm('커피') + ' constructor=' + nm('constructor') + ' / ' + JSON.stringify(r3.cats));

  /* S-004 getCategoryMap 프로토타입 교체 */
  pg = await fresh();
  let r4 = await imp(pg, "f.data.categories=f.data.categories.concat([{id:'__proto__',name:'세탁',order:96,isDefault:false}]);f.counts={expenses:0,categories:f.data.categories.length};");
  ok(r4.mapProtoIsClean, 'QA-S-004 getCategoryMap 프로토타입이 교체되지 않음',
     'parsed=' + r4.parsed + ' proto=' + r4.mapProtoVal);

  console.log('=== ⑤ 파트장 보안 S2·S3 케이스 분리 재현 ===');
  L.forEach(l => console.log(l));
  console.log('PASS=' + P + ' FAIL=' + F);
  await b.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
