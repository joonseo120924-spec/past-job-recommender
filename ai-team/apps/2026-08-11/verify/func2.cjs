(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e));
p.on('console',m=>{if(m.type()==='error')errs.push('console.error: '+m.text())});
const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''));
await p.goto(APP); await p.waitForTimeout(500);
const screen=()=>p.evaluate(()=>document.body.getAttribute('data-screen'));
const tab=async n=>{await p.click(`#jr-tabbar button:nth-of-type(${n})`);await p.waitForTimeout(200)};

// 최대잔여법 순수 케이스
const alloc=await p.evaluate(()=>{
  const r=JR.stats.allocatePercents([{amount:3334},{amount:3333},{amount:3333}]);
  const r2=JR.stats.allocatePercents([{amount:1},{amount:1},{amount:1}]);
  const r3=JR.stats.allocatePercents([{amount:1}]);
  return {a:r.map(x=>x.percent), sa:r.reduce((s,x)=>s+x.percent,0),
          b:r2.map(x=>x.percent), sb:r2.reduce((s,x)=>s+x.percent,0),
          c:r3.map(x=>x.percent), sc:r3.reduce((s,x)=>s+x.percent,0)};
});
ok('F-06 3334/3333/3333 합=100', alloc.sa===100, JSON.stringify(alloc.a));
ok('F-06 1/1/1 합=100', alloc.sb===100, JSON.stringify(alloc.b));
ok('F-06 단일 항목 합=100', alloc.sc===100, JSON.stringify(alloc.c));

// 데이터 심기
await p.evaluate(()=>{const c=JR.model.getCategories().data.items;
  JR.model.addExpense({date:JR.model.today(),amount:'5000',categoryId:c[0].id,memo:'커피'});
  JR.model.addExpense({date:JR.model.today(),amount:'8000',categoryId:c[1].id,memo:'버스'});});
await p.reload(); await p.waitForTimeout(400);
let n=await p.locator('#jr-s01-list .jr-expense-row').count();
ok('사전 데이터 2건', n===2, 'n='+n);

// --- F-03 삭제: 취소는 아무것도 안 바꾼다 ---
await p.click('#jr-s01-list .jr-expense-row'); await p.waitForTimeout(300);
await p.click('#jr-s02-delete'); await p.waitForTimeout(300);
const dlg=await p.locator('#jr-dialog-overlay').count();
ok('F-03 확인 대화상자 표시', dlg>0, 'overlay='+dlg);
await p.screenshot({path:'shots/07-f03-dialog.png'});
const btns=await p.evaluate(()=>Array.from(document.querySelectorAll('#jr-dialog-overlay button')).map(b=>b.textContent.trim()));
// 취소
await p.evaluate(()=>{const b=Array.from(document.querySelectorAll('#jr-dialog-overlay button')).find(x=>/취소/.test(x.textContent));b.click()});
await p.waitForTimeout(300);
let cnt=await p.evaluate(()=>JR.model.getExpenses().data.items.length);
ok('F-03 취소는 삭제 안 함', cnt===2, 'count='+cnt+' 버튼='+JSON.stringify(btns));
// 삭제 확정
await p.click('#jr-s02-delete'); await p.waitForTimeout(300);
await p.evaluate(()=>{const b=Array.from(document.querySelectorAll('#jr-dialog-overlay button')).find(x=>/삭제/.test(x.textContent));b.click()});
await p.waitForTimeout(400);
cnt=await p.evaluate(()=>JR.model.getExpenses().data.items.length);
ok('F-03 확인 후 삭제됨', cnt===1, 'count='+cnt);
ok('F-03 삭제 후 S-01 복귀', await screen()==='s01', await screen());

// --- F-07 카테고리 ---
await tab(3); await p.waitForTimeout(300);
let catN=await p.evaluate(()=>JR.model.getCategories().data.items.length);
ok('F-07 기본 카테고리 8종', catN===8, 'n='+catN);
await p.fill('#jr-cat-new','테스트분류'); await p.click('#jr-s04-cat-add'); await p.waitForTimeout(300);
catN=await p.evaluate(()=>JR.model.getCategories().data.items.length);
ok('F-07 카테고리 추가', catN===9, 'n='+catN);
// 중복 이름 -> E-116
await p.fill('#jr-cat-new','테스트분류'); await p.click('#jr-s04-cat-add'); await p.waitForTimeout(300);
const dupHint=await p.textContent('#jr-cat-new-hint');
ok('F-07 중복 이름 E-116 인라인', /이미 있습니다/.test(dupHint), 'hint='+dupHint.trim());
await p.screenshot({path:'shots/08-f07-dup.png'});
// 20개 상한
const maxState=await p.evaluate(async()=>{
  while(JR.model.getCategories().data.items.length<20){
    const r=JR.model.addCategory('cat'+JR.model.getCategories().data.items.length);
    if(!r.ok) return {err:r.code};
  }
  return {n:JR.model.getCategories().data.items.length, over:JR.model.addCategory('overflow')};
});
await p.reload(); await p.waitForTimeout(400); await tab(3); await p.waitForTimeout(300);
const addDisabled=await p.isDisabled('#jr-s04-cat-add');
const maxHint=await p.textContent('#jr-cat-new-hint');
ok('F-07 20개에서 추가 거부 E-117', maxState.over&&maxState.over.code==='E-117', JSON.stringify(maxState.over&&maxState.over.code));
ok('F-07 20개에서 추가 버튼 비활성', addDisabled===true, 'disabled='+addDisabled);
ok('F-07 상한 안내문 INT-31 문구', maxHint.trim()==='카테고리는 최대 20개까지 만들 수 있습니다.', 'hint="'+maxHint.trim()+'"');
await p.screenshot({path:'shots/09-f07-max.png'});
// 최소 1개
const minState=await p.evaluate(()=>{
  const items=JR.model.getCategories().data.items.slice();
  for(let i=0;i<items.length-1;i++) JR.model.deleteCategory(items[i].id);
  return {n:JR.model.getCategories().data.items.length, del:JR.model.deleteCategory(JR.model.getCategories().data.items[0].id)};
});
await p.reload(); await p.waitForTimeout(400); await tab(3); await p.waitForTimeout(300);
const minHint=await p.textContent('#jr-s04-cat-shared-hint');
const delDisabled=await p.evaluate(()=>{const b=document.querySelector('#jr-s04-cat-list button.jr-cat-del, #jr-s04-cat-list [data-act="del"]');return b?b.disabled:'no-btn'});
ok('F-07 1개 남으면 삭제 거부 E-118', minState.del&&minState.del.code==='E-118', 'code='+(minState.del&&minState.del.code));
ok('F-07 최소 안내문 INT-31 문구', minHint.trim()==='카테고리는 최소 1개가 있어야 합니다.', 'hint="'+minHint.trim()+'"');
ok('F-07 삭제 버튼 비활성', delDisabled===true, 'disabled='+delDisabled);
await p.screenshot({path:'shots/10-f07-min.png'});
console.log('=== F-03 · F-06 · F-07 ===');
R.forEach(r=>console.log(r));
console.log('\n콘솔 에러:',errs.length); errs.forEach(e=>console.log('  ',e));
await b.close();
})();
