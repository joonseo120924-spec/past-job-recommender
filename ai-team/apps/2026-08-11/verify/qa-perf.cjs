/* QA 성능 측정 — 1,000건 기준 (분배안 §3-5 / INT-35)
 * 사용법: node qa-perf.cjs <chromium|firefox|webkit>
 */
(async () => {
const ENG = process.argv[2] || 'chromium';
const pw = require('/opt/node22/lib/node_modules/playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b = await pw[ENG].launch();
const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(''+e)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto(APP); await p.waitForTimeout(500);

const run = async (N) => await p.evaluate(async (N) => {
  const t = () => performance.now();
  const cats = JR.model.getCategories().data.items;
  // 1,000건을 저장소에 직접 심고 재초기화(읽기 측정) → UI 경로 저장(쓰기 측정)
  const items = [];
  for (let i = 0; i < N; i++) {
    const d = new Date(2026, 7, 1); d.setDate(d.getDate() - (i % 400));
    const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    items.push({ id:'exp_perf_'+i, date:ds, amount:(i%90000)+100, categoryId:cats[i%cats.length].id, memo:'성능테스트메모 '+i, createdAt:new Date(Date.now()-i*1000).toISOString(), updatedAt:new Date().toISOString() });
  }
  const t0=t(); const w = JR.store.setJSON('jr.v1.expenses', items); const t1=t();          // 대량 쓰기
  const t2=t(); const r = JR.store.getJSON('jr.v1.expenses'); const t3=t();                   // 대량 읽기
  const t4=t(); const ini = JR.model.init(); const t5=t();                           // 재초기화(파싱+정렬+색인)
  const n = JR.model.getExpenses().data.items.length;
  const cats2 = JR.model.getCategories().data.items;
  const c0 = (cats2[0]||cats[0]||{id:'cat_food'}).id;
  const t6=t(); const lm = JR.model.listByMonth('2026-08'); const t7=t();            // 월 조회
  const t8=t(); JR.stats.invalidate(); const bc = JR.stats.byCategory('2026-08'); const t9=t(); // 통계
  const t10=t(); const av = JR.model.availableMonths(); const t11=t();
  // 단건 추가(사용자 1회 저장 = 예산 판정 대상)
  const t12=t(); const add = JR.model.addExpense({ date: JR.model.today(), amount:'12500', categoryId:c0, memo:'단건' }); const t13=t();
  const t14=t(); const upd = JR.model.updateExpense((add.ok&&add.data.expense?add.data.expense.id:items[0].id), { date: JR.model.today(), amount:'20000', categoryId:c0, memo:'수정' }); const t15=t();
  const t16=t(); const del = JR.model.deleteExpense((add.ok&&add.data.expense?add.data.expense.id:items[0].id)); const t17=t();
  // 렌더 (S-01 목록 그리기)
  // 렌더: 탭 클릭으로 S-01→S-03(통계 렌더)→S-01(목록 렌더) 동기 측정
  const tabs = document.querySelectorAll('#jr-tabbar button');
  const t18=t(); tabs[1].click(); const t19=t();
  const t18b=t(); tabs[0].click(); const t19b=t();
  const t20=t(); const ex = JR.io.buildExport(); const t21=t();
  const json = ex.ok ? ex.data.json : '';
  const t22=t(); const pi = JR.io.parseImport(json); const t23=t();
  return { N:N, n:n, writeMs:t1-t0, readMs:t3-t2, initMs:t5-t4, listMonthMs:t7-t6, statsMs:t9-t8,
    monthsMs:t11-t10, addMs:t13-t12, updMs:t15-t14, delMs:t17-t16, renderStatsMs:t19-t18, renderListMs:t19b-t18b,
    exportMs:t21-t20, parseImportMs:t23-t22, rows:document.querySelectorAll('#jr-s01-list .jr-expense-row').length,
    writeOk:w.ok, readOk:r.ok, initOk:ini.ok, addOk:add.ok, updOk:upd.ok, delOk:del.ok, exportOk:ex.ok, parseOk:pi.ok,
    bytes: json.length, mode: JR.store.mode(), monthN: lm.ok?lm.data.items.length:-1, bcOk: bc.ok };
}, N);

const out = [];
for (const N of [100, 1000, 5000]) {
  const rows = [];
  for (let k = 0; k < 3; k++) { await p.evaluate(()=>{try{localStorage.clear();}catch(e){}}); await p.reload(); await p.waitForTimeout(400); rows.push(await run(N)); }
  const med = key => rows.map(r=>r[key]).sort((a,b)=>a-b)[1];
  out.push({ N:N, n:rows[0].n, mode:rows[0].mode, bytes:rows[0].bytes, rows:rows[0].rows, ok:[rows[0].writeOk,rows[0].readOk,rows[0].initOk,rows[0].addOk,rows[0].updOk,rows[0].delOk,rows[0].exportOk,rows[0].parseOk].join(','),
    write:med('writeMs'), read:med('readMs'), init:med('initMs'), listMonth:med('listMonthMs'), stats:med('statsMs'),
    months:med('monthsMs'), add:med('addMs'), upd:med('updMs'), del:med('delMs'), renderStats:med('renderStatsMs'), renderList:med('renderListMs'), exportT:med('exportMs'), parse:med('parseImportMs') });
}
console.log('===== 성능 · ' + ENG + ' · ' + new Date().toISOString() + ' =====');
console.log('(각 N 마다 3회 측정 후 중앙값 · 단위 ms · 예산 16ms = 1프레임)');
console.log(['N','저장분','write','read','init','listMonth','stats','months','add','upd','del','renderS03','renderS01','export','parseImport','JSON bytes','ok'].join('\t'));
out.forEach(o => console.log([o.N,o.n,o.write.toFixed(2),o.read.toFixed(2),o.init.toFixed(2),o.listMonth.toFixed(2),o.stats.toFixed(2),o.months.toFixed(2),o.add.toFixed(2),o.upd.toFixed(2),o.del.toFixed(2),o.renderStats.toFixed(2),o.renderList.toFixed(2),o.exportT.toFixed(2),o.parse.toFixed(2),o.bytes,o.ok].join('\t')));
const k = out.find(o=>o.N===1000);
const budget = ['write','read','init','listMonth','stats','months','add','upd','del','renderStats','renderList','exportT','parse'];
const over = budget.filter(f => k[f] > 16);
console.log('---- 1,000건 예산(16ms) 초과 항목: ' + (over.length ? over.map(f=>f+'='+k[f].toFixed(2)+'ms').join(', ') : '없음') + ' ----');
console.log('---- 콘솔에러 ' + errs.length + ' ' + JSON.stringify(errs.slice(0,3)) + ' ----');
await b.close();
})();
