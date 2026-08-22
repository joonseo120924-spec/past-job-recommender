(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();
const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR: '+e));
p.on('console',m=>{if(m.type()==='error')errs.push('console.error: '+m.text())});
const R=[]; const ok=(n,c,d)=>{R.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''))};
await p.goto(APP); await p.waitForTimeout(500);

const screen=()=>p.evaluate(()=>document.body.getAttribute('data-screen'));
const tab=async n=>{await p.click(`#jr-tabbar button:nth-of-type(${n})`); await p.waitForTimeout(200)};

// --- S-01~S-04 화면 전환 ---
ok('S-01 초기 화면', await screen()==='s01', await screen());
await tab(2); ok('S-03 통계 탭 전환', await screen()==='s03', await screen());
await p.screenshot({path:'shots/02-s03.png'});
await tab(3); ok('S-04 설정 탭 전환', await screen()==='s04', await screen());
await p.screenshot({path:'shots/03-s04.png'});
await tab(1); ok('S-01 홈 복귀', await screen()==='s01', await screen());
await p.click('#jr-s01-add'); await p.waitForTimeout(250);
ok('S-02 입력 화면 진입', await screen()==='s02', await screen());
await p.screenshot({path:'shots/04-s02.png'});

// --- F-01 지출 추가 ---
await p.fill('#jr-amount','12500');
await p.click('#jr-cat-group button:nth-of-type(1)');
await p.fill('#jr-memo','점심');
const dateVal=await p.inputValue('#jr-date');
await p.click('#jr-s02-save'); await p.waitForTimeout(400);
ok('F-01 저장 후 S-01 복귀', await screen()==='s01', await screen());
let rows=await p.locator('#jr-s01-list .jr-expense-row').count();
ok('F-01 목록에 1건', rows===1, 'rows='+rows);
let total=await p.textContent('#jr-s01-total');
ok('F-01 총합 표시', /12,500/.test(total), 'total='+total);
await p.screenshot({path:'shots/05-f01.png'});

// --- 새로고침 후 유지 ---
await p.reload(); await p.waitForTimeout(500);
rows=await p.locator('#jr-s01-list .jr-expense-row').count();
ok('F-01 새로고침 후 유지', rows===1, 'rows='+rows);

// --- F-02 지출 수정 ---
const before=await p.evaluate(()=>{const e=JR.model.getExpenses().data.items[0];return {id:e.id,createdAt:e.createdAt}});
await p.click('#jr-s01-list .jr-expense-row'); await p.waitForTimeout(300);
ok('F-02 행 클릭 -> S-02', await screen()==='s02', await screen());
await p.fill('#jr-amount','20000');
await p.click('#jr-s02-save'); await p.waitForTimeout(400);
const after=await p.evaluate(()=>{const e=JR.model.getExpenses().data.items[0];return {id:e.id,createdAt:e.createdAt,amount:e.amount}});
ok('F-02 금액 반영', after.amount===20000, 'amount='+after.amount);
ok('F-02 id·createdAt 불변', before.id===after.id&&before.createdAt===after.createdAt, JSON.stringify(after));

// --- F-06 통계 · 비율 합 100 ---
await p.evaluate(()=>{
  const c=JR.model.getCategories().data.items;
  JR.model.addExpense({date:JR.model.today(),amount:'3334',categoryId:c[1].id,memo:''});
  JR.model.addExpense({date:JR.model.today(),amount:'3333',categoryId:c[2].id,memo:''});
  JR.model.addExpense({date:JR.model.today(),amount:'3333',categoryId:c[3].id,memo:''});
});
await tab(2); await p.waitForTimeout(300);
const pct=await p.evaluate(()=>{
  const m=JR.model.getSettings().data.settings.selectedMonth;
  const r=JR.stats.byCategory(m);
  return {ok:r.ok, items:r.data.items.map(i=>({n:i.name,p:i.percent})), sum:r.data.items.reduce((a,i)=>a+i.percent,0)};
});
ok('F-06 통계 반환 ok', pct.ok===true);
ok('F-06 비율 합 정확히 100', pct.sum===100, 'sum='+pct.sum+' '+JSON.stringify(pct.items));
await p.screenshot({path:'shots/06-f06-stats.png'});

// --- F-05 월 이동 공유 ---
await tab(1); await p.click('#jr-s01-prev'); await p.waitForTimeout(250);
const m1=await p.textContent('#jr-s01-month');
await tab(2); await p.waitForTimeout(200);
const m3=await p.textContent('#jr-s03-month');
ok('F-05 S-01/S-03 월 공유', m1.trim()===m3.trim(), 'S01='+m1.trim()+' S03='+m3.trim());
await p.reload(); await p.waitForTimeout(500);
const m1r=await p.textContent('#jr-s01-month');
ok('F-05 새로고침 후 유지', m1r.trim()===m1.trim(), 'after reload='+m1r.trim());
await p.click('#jr-s01-next'); await p.waitForTimeout(250);

// --- F-04 정렬 결정성 (10회 새로고침) ---
let sig=null,stable=true;
for(let i=0;i<10;i++){ await p.reload(); await p.waitForTimeout(300);
  const s=await p.evaluate(()=>JR.model.listByMonth(JR.model.getSettings().data.settings.selectedMonth).data.items.map(e=>e.id).join(','));
  if(sig===null)sig=s; else if(s!==sig)stable=false;
}
ok('F-04 10회 새로고침 정렬 불변', stable, 'sig='+sig);

console.log('=== 화면 전환 · F-01~F-06 ===');
R.forEach(r=>console.log(r));
console.log('\n콘솔 에러 누적:', errs.length); errs.forEach(e=>console.log('  ',e));
await b.close();
})();
