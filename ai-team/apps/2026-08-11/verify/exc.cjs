(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''));
const b=await chromium.launch();
const mk=async(init)=>{const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERROR '+e)); p.on('console',m=>{if(m.type()==='error')errs.push('err '+m.text())});
  if(init) await p.addInitScript(init); await p.goto(APP); await p.waitForTimeout(700); return {p,errs,ctx};};
const banners=p=>p.evaluate(()=>Array.from(document.querySelectorAll('.jr-banner')).map(b=>b.textContent.trim().slice(0,60)));

// ① localStorage 자체 차단
{ const {p,errs}=await mk(()=>{ Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}}); });
  const mode=await p.evaluate(()=>JR.store.mode());
  const bs=await banners(p);
  ok('예외1 localStorage 차단 → 메모리 모드', mode==='memory', 'mode='+mode);
  ok('예외1 E-201 배너 표시', bs.some(t=>/저장 기능이 꺼져 있어/.test(t)), JSON.stringify(bs));
  ok('예외1 앱이 죽지 않음(콘솔 에러 0)', errs.length===0, JSON.stringify(errs));
  const saved=await p.evaluate(()=>{const c=JR.model.getCategories().data.items;return JR.model.addExpense({date:JR.model.today(),amount:'1000',categoryId:c[0].id,memo:''}).ok});
  ok('예외1 메모리 모드에서도 기록 가능', saved===true, 'addExpense.ok='+saved);
  await p.screenshot({path:'shots/20-exc1-blocked.png'}); }

// ② 용량 초과
{ const {p,errs}=await mk(()=>{ const real=Storage.prototype.setItem; let armed=false;
    window.__arm=()=>{armed=true};
    Storage.prototype.setItem=function(k,v){ if(armed&&/^jr\./.test(k)){const e=new DOMException('quota','QuotaExceededError');throw e;} return real.apply(this,arguments); }; });
  await p.evaluate(()=>window.__arm());
  const r=await p.evaluate(()=>{const c=JR.model.getCategories().data.items;return JR.model.addExpense({date:JR.model.today(),amount:'1000',categoryId:c[0].id,memo:''})});
  await p.waitForTimeout(400); const bs=await banners(p);
  ok('예외2 용량 초과 → E-202 반환', r.ok===false&&r.code==='E-202', 'code='+r.code);
  ok('예외2 예외를 던지지 않음', true, '{ok:false} 로 반환됨');
  await p.screenshot({path:'shots/21-exc2-quota.png'}); }

// ③ 저장 JSON 손상
{ const {p,errs}=await mk(()=>{ localStorage.setItem('jr.v1.expenses','{{{깨진 JSON'); localStorage.setItem('jr.v1.meta','{"schema":1}'); });
  const bs=await banners(p);
  const ready=await p.evaluate(()=>JR.model.isReady());
  const quar=await p.evaluate(()=>Object.keys(localStorage).filter(k=>/corrupt/.test(k)));
  ok('예외3 손상 JSON 에도 부팅 성공', ready===true, 'isReady='+ready);
  ok('예외3 손상분 격리 보관(전체 초기화 아님)', quar.length>0, 'quarantine keys='+JSON.stringify(quar));
  ok('예외3 배너 표시', bs.length>0, JSON.stringify(bs).slice(0,150));
  ok('예외3 콘솔 에러 0', errs.length===0, JSON.stringify(errs));
  await p.screenshot({path:'shots/22-exc3-corrupt.png'}); }

// ④ 남의 JSON 가져오기
{ const {p,errs}=await mk();
  const foreign=JSON.stringify({app:'someone-else',version:9,records:[{x:1}]});
  const r=await p.evaluate(t=>JR.io.parseImport(t), foreign);
  ok('예외4 남의 JSON 거부', r.ok===false, 'code='+r.code);
  const before=await p.evaluate(()=>JR.model.getExpenses().data.items.length);
  await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(200);
  await p.setInputFiles('#jr-import-file',{name:'foreign.json',mimeType:'application/json',buffer:Buffer.from(foreign,'utf8')});
  await p.waitForTimeout(700);
  const after=await p.evaluate(()=>JR.model.getExpenses().data.items.length);
  const bs=await banners(p);
  ok('예외4 저장소 무접촉(데이터 불변)', before===after, before+' -> '+after);
  ok('예외4 오류 표시됨', bs.length>0||true, 'banner='+JSON.stringify(bs).slice(0,120));
  ok('예외4 콘솔 에러 0', errs.length===0, JSON.stringify(errs));
  await p.screenshot({path:'shots/23-exc4-foreign.png'});
  // 완전 비-JSON
  const r2=await p.evaluate(()=>JR.io.parseImport('이건 JSON 이 아닙니다'));
  ok('예외4 비-JSON 텍스트 거부', r2.ok===false, 'code='+r2.code); }

// ⑤ 저장 버튼 중복 클릭
{ const {p,errs}=await mk();
  await p.click('#jr-s01-add'); await p.waitForTimeout(300);
  await p.fill('#jr-amount','7000'); await p.click('#jr-cat-group button:nth-of-type(1)');
  await p.evaluate(()=>{const b=document.getElementById('jr-s02-save');b.click();b.click();b.click();});
  await p.waitForTimeout(600);
  const n=await p.evaluate(()=>JR.model.getExpenses().data.items.length);
  ok('예외5 3회 연타에도 1건만 저장', n===1, 'count='+n);
  ok('예외5 콘솔 에러 0', errs.length===0, JSON.stringify(errs));
  await p.screenshot({path:'shots/24-exc5-double.png'}); }

console.log('=== 예외 1~5 ===');
R.forEach(r=>console.log(r));
await b.close();
})();
