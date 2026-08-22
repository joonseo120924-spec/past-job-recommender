(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html'); await p.waitForTimeout(500);
const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''));
// 1. allocatePercents 올바른 시그니처 (number[], total)
const a=await p.evaluate(()=>{
  const f=JR.stats.allocatePercents;
  const cases=[[[3334,3333,3333],10000],[[1,1,1],3],[[1],1],[[5000,8000],13000],[[1,1,1,1,1,1,1],7],[[0,0],0],[[],0],[[999999999,1],1000000000]];
  return cases.map(c=>{const r=f(c[0],c[1]);return {in:c[0].length+'개/total='+c[1], out:r, sum:r.reduce((s,x)=>s+x,0)}});
});
a.forEach(x=>ok('최대잔여법 '+x.in+' 합=100', x.sum===100||x.out.length===0||x.in.startsWith('2개/total=0'), 'out='+JSON.stringify(x.out)+' sum='+x.sum));
// 2. 20개 상한 안내문 — shared-hint
await p.evaluate(()=>{while(JR.model.getCategories().data.items.length<20)JR.model.addCategory('c'+JR.model.getCategories().data.items.length);});
await p.reload(); await p.waitForTimeout(400);
await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(300);
const maxHint=(await p.textContent('#jr-s04-cat-shared-hint')).trim();
ok('F-07 20개 상한 안내문(INT-31)', maxHint==='카테고리는 최대 20개까지 만들 수 있습니다.', '"'+maxHint+'"');
await p.screenshot({path:'shots/09-f07-max.png'});
// 3. 최소 1개 - 삭제 버튼 비활성
await p.evaluate(()=>{const it=JR.model.getCategories().data.items.slice();for(let i=0;i<it.length-1;i++)JR.model.deleteCategory(it[i].id);});
await p.reload(); await p.waitForTimeout(400);
await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(300);
const minHint=(await p.textContent('#jr-s04-cat-shared-hint')).trim();
const delDis=await p.isDisabled('#jr-s04-cat-list [data-act="delete"]');
ok('F-07 최소 안내문(INT-31)', minHint==='카테고리는 최소 1개가 있어야 합니다.', '"'+minHint+'"');
ok('F-07 마지막 1개 삭제 버튼 비활성', delDis===true, 'disabled='+delDis);
await p.screenshot({path:'shots/10-f07-min.png'});
R.forEach(r=>console.log(r)); console.log('\n콘솔 에러:',errs.length,errs);
await b.close();
})();
