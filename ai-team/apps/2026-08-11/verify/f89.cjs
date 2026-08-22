(async()=>{
const fs=require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e)); p.on('console',m=>{if(m.type()==='error')errs.push('err '+m.text())});
await p.goto('file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html'); await p.waitForTimeout(500);
const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''));
const tab=async n=>{await p.click(`#jr-tabbar button:nth-of-type(${n})`);await p.waitForTimeout(250)};

// 데이터 심기
await p.evaluate(()=>{const c=JR.model.getCategories().data.items;
 JR.model.addExpense({date:JR.model.today(),amount:'5000',categoryId:c[0].id,memo:'커피'});
 JR.model.addExpense({date:JR.model.today(),amount:'8000',categoryId:c[1].id,memo:'버스'});
 JR.model.addCategory('여행');});
await p.reload(); await p.waitForTimeout(400);
const before=await p.evaluate(()=>({e:JR.model.getExpenses().data.items.length,c:JR.model.getCategories().data.items.length}));

// --- F-08 내보내기: 실제 다운로드 ---
await tab(3);
const [dl]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null), p.click('#jr-s04-export')]);
await p.waitForTimeout(500);
let exported=null;
if(dl){ const pth='/tmp/claude-0/-home-user-past-job-recommender/8d4acae0-280d-5be6-a1c7-998f5ee810eb/scratchpad/verify/export.json';
  await dl.saveAs(pth); exported=fs.readFileSync(pth,'utf8');
  ok('F-08 내보내기 다운로드 발생', true, '파일명='+dl.suggestedFilename()+' 크기='+exported.length+'자');
} else { ok('F-08 내보내기 다운로드 발생', false, '다운로드 이벤트 없음'); }
await p.screenshot({path:'shots/11-f08-export.png'});
if(exported){
  let j=null; try{j=JSON.parse(exported)}catch(e){}
  ok('F-08 내보낸 JSON 파싱 가능', !!j, j?('schema='+j.schema+' expenses='+(j.data&&j.data.expenses.length)):'파싱 실패');
}

// --- F-09 전체 삭제 (2단계 확인) ---
await tab(3);
await p.click('#jr-s04-wipe'); await p.waitForTimeout(300);
await p.screenshot({path:'shots/12-f09-step1.png'});
let dlgTxt=await p.textContent('#jr-dialog-overlay').catch(()=>'');
ok('F-09 1단계 확인 대화상자', /#jr-dialog|삭제/.test(dlgTxt)||dlgTxt.length>0, '1단계 표시');
await p.evaluate(()=>{const bs=Array.from(document.querySelectorAll('#jr-dialog-overlay button'));(bs.find(x=>/삭제|계속|확인/.test(x.textContent))||bs[bs.length-1]).click()});
await p.waitForTimeout(400);
const stillDialog=await p.locator('#jr-dialog-overlay').count();
ok('F-09 2단계 확인 존재', stillDialog>0, '2단계 대화상자='+stillDialog);
await p.screenshot({path:'shots/13-f09-step2.png'});
const midCount=await p.evaluate(()=>JR.model.getExpenses().data.items.length);
ok('F-09 1단계만으로는 삭제 안 됨', midCount===before.e, 'count='+midCount);
await p.evaluate(()=>{const bs=Array.from(document.querySelectorAll('#jr-dialog-overlay button'));(bs.find(x=>/삭제|확인/.test(x.textContent))||bs[bs.length-1]).click()});
await p.waitForTimeout(500);
const after=await p.evaluate(()=>({e:JR.model.getExpenses().data.items.length,c:JR.model.getCategories().data.items.length}));
ok('F-09 전체 삭제 완료', after.e===0, 'expenses='+after.e);
ok('F-09 카테고리 기본 8종 복귀', after.c===8, 'categories='+after.c);
await p.screenshot({path:'shots/14-f09-done.png'});

// --- F-08 가져오기: 내보낸 파일 복원 ---
if(exported){
  await tab(3);
  await p.setInputFiles('#jr-import-file',{name:'backup.json',mimeType:'application/json',buffer:Buffer.from(exported,'utf8')});
  await p.waitForTimeout(700);
  await p.screenshot({path:'shots/15-f08-import-confirm.png'});
  const hasDlg=await p.locator('#jr-dialog-overlay').count();
  ok('F-08 가져오기 확인 대화상자(파괴적)', hasDlg>0, 'dialog='+hasDlg);
  await p.evaluate(()=>{const bs=Array.from(document.querySelectorAll('#jr-dialog-overlay button'));(bs.find(x=>/가져오기|확인|덮어/.test(x.textContent))||bs[bs.length-1]).click()});
  await p.waitForTimeout(800);
  const rest=await p.evaluate(()=>({e:JR.model.getExpenses().data.items.length,c:JR.model.getCategories().data.items.length}));
  ok('F-08 가져오기로 기록 복원', rest.e===before.e, 'expenses='+rest.e+' (내보내기 시점 '+before.e+')');
  ok('F-08 가져오기로 카테고리 복원', rest.c===before.c, 'categories='+rest.c+' (내보내기 시점 '+before.c+')');
  await p.screenshot({path:'shots/16-f08-imported.png'});
}
R.forEach(r=>console.log(r)); console.log('\n콘솔 에러:',errs.length); errs.forEach(e=>console.log('  ',e));
await b.close();
})();
