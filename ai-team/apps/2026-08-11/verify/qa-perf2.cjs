/* QA 성능 2차 — 「클릭 → 다음 페인트」 실제 체감 시간 측정 (1,000건 기준)
 * qa-perf.cjs 의 renderS03 129ms 가 측정 인공물인지 실제 지연인지 가리기 위한 정밀 측정.
 * 사용법: node qa-perf2.cjs <engine> [N]
 */
(async () => {
const ENG = process.argv[2] || 'chromium';
const N = Number(process.argv[3] || 1000);
const pw = require('/opt/node22/lib/node_modules/playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b = await pw[ENG].launch();
const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(''+e)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto(APP); await p.waitForTimeout(500);

const seed = async (N, spread) => p.evaluate(async ({N,spread}) => {
  const cats = JR.model.getCategories().data.items;
  const items = [];
  const base = JR.model.today();
  for (let i = 0; i < N; i++) {
    const d = spread ? new Date(2026, 7, 28 - (i % 28), 0,0,0) : new Date(2026, 7, Math.max(1, 28 - (i % 28)));
    if (spread) { d.setMonth(d.getMonth() - Math.floor(i / Math.ceil(N/12))); }
    const ds = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    items.push({ id:'e_p'+i, date:ds, amount:(i%90000)+100, categoryId:cats[i%cats.length].id, memo:'메모'+i, createdAt:Date.now()-i*1000 });
  }
  JR.store.setJSON('jr.v1.expenses', items);
  JR.model.init();
  return JR.model.getExpenses().data.items.length;
}, {N,spread});

/* 클릭 → 다음 페인트까지 (double rAF). 사용자가 체감하는 시간. */
const clickToPaint = async (sel, label) => p.evaluate(async ({sel,label}) => {
  await new Promise(r => requestAnimationFrame(()=>requestAnimationFrame(r)));   // 프레임 정렬
  const t0 = performance.now();
  document.querySelector(sel).click();
  const tSync = performance.now();
  await new Promise(r => requestAnimationFrame(()=>requestAnimationFrame(r)));
  const t1 = performance.now();
  return { label, sync:+(tSync-t0).toFixed(2), toPaint:+(t1-t0).toFixed(2),
    screen: document.body.getAttribute('data-screen'),
    s01rows: document.querySelectorAll('#jr-s01-list .jr-expense-row').length,
    s03rows: document.querySelectorAll('#jr-s03-list .jr-stat-row').length };
}, {sel,label});

const med = a => a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
const results = [];
for (const CASE of [[0,false],[100,false],[1000,true],[1000,false],[5000,true],[5000,false]]) {
  const NN = CASE[0], SPREAD = CASE[1];
  await p.evaluate(()=>{try{localStorage.clear();}catch(e){}}); await p.reload(); await p.waitForTimeout(400);
  const n = NN === 0 ? 0 : await seed(NN, SPREAD);
  const runs = { 'S-01→S-03(통계)':[], 'S-03→S-01(목록)':[], 'S-01→S-04(설정)':[], 'S-04→S-01(목록)':[], '월 이전(S-01)':[], '월 다음(S-01)':[] };
  for (let k=0;k<5;k++){
    runs['S-01→S-03(통계)'].push((await clickToPaint('#jr-tabbar button:nth-of-type(2)')).toPaint);
    runs['S-03→S-01(목록)'].push((await clickToPaint('#jr-tabbar button:nth-of-type(1)')).toPaint);
    runs['S-01→S-04(설정)'].push((await clickToPaint('#jr-tabbar button:nth-of-type(3)')).toPaint);
    runs['S-04→S-01(목록)'].push((await clickToPaint('#jr-tabbar button:nth-of-type(1)')).toPaint);
    runs['월 이전(S-01)'].push((await clickToPaint('#jr-s01-prev')).toPaint);
    runs['월 다음(S-01)'].push((await clickToPaint('#jr-s01-next')).toPaint);
  }
  const s01n = await p.evaluate(()=>document.querySelectorAll('#jr-s01-list .jr-expense-row').length);
  const row = { N:NN, n:n, label: NN + (NN===0?'':(SPREAD?'건/12개월분산':'건/단일월집중')), s01rows:s01n };
  Object.keys(runs).forEach(k => row[k] = med(runs[k]));
  results.push(row);
}
console.log('===== 클릭→다음 페인트(체감) · ' + ENG + ' · ' + new Date().toISOString() + ' =====');
console.log('(각 5회 측정 중앙값 · ms · double rAF 로 실제 페인트까지 측정 · 예산 16ms)');
const keys = Object.keys(results[0]).filter(k=>['N','n','label','s01rows'].indexOf(k)===-1);
console.log(['조건','S01표시행'].concat(keys).join('\t'));
results.forEach(r => console.log([r.label, r.s01rows].concat(keys.map(k=>r[k].toFixed(2))).join('\t')));
const FLOOR = results[0][keys[0]];
console.log('측정 바닥(0건 · double rAF 2프레임) = ' + FLOOR.toFixed(2) + 'ms — 이 값이면 「한 프레임 안」입니다');
const k1000 = results.find(r=>r.N===1000 && r.label.indexOf('분산')!==-1);
const over = keys.filter(k => k1000[k] > FLOOR * 1.5);
console.log('---- 1,000건/12개월분산(정상 사용 상정) · 바닥*1.5 초과: ' + (over.length ? over.map(k=>k+'='+k1000[k].toFixed(2)+'ms').join(' / ') : '없음') + ' ----');
console.log('---- 콘솔에러 ' + errs.length + ' ----');
await b.close();
})();
