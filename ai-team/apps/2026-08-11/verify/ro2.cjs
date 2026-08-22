(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b=await chromium.launch();
const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''));
// --- 읽기 전용(E-307): 상위 스키마 + 올바른 appId ---
{ const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.addInitScript(()=>{ localStorage.setItem('jr.v1.meta',JSON.stringify({appId:'jr-expense',schema:2,lastWriteAt:Date.now()})); });
  await p.goto(APP); await p.waitForTimeout(900);
  const st=await p.evaluate(()=>({ready:JR.model.isReady(),
    banners:Array.from(document.querySelectorAll('.jr-banner')).map(x=>x.textContent.trim().slice(0,50)),
    closable:Array.from(document.querySelectorAll('.jr-banner')).map(x=>!!x.querySelector('button')),
    addBtn:(document.getElementById('jr-s01-add')||{}).disabled,
    cats:JR.model.getCategories(), list:JR.model.listByMonth('2026-08'),
    write:JR.model.addExpense({date:'2026-08-11',amount:'100',categoryId:'c_d01',memo:''})}));
  ok('E-307 읽기 전용 진입', st.ready===false, 'isReady='+st.ready);
  ok('E-307 배너 표시', st.banners.some(t=>t.length>0), JSON.stringify(st.banners));
  ok('E-307 배너 닫기 불가', st.closable.every(c=>c===false), 'closable='+JSON.stringify(st.closable));
  ok('E-307 쓰기 차단', st.write.ok===false&&st.write.code==='E-307', 'code='+st.write.code);
  ok('INT-30 읽기 함수 {ok:true}+빈 배열', st.cats.ok===true&&st.cats.data.items.length===0&&st.list.ok===true&&st.list.data.items.length===0,
     'cats='+JSON.stringify(st.cats.data.items)+' list='+JSON.stringify(st.list.data.items));
  ok('E-307 추가 버튼 비활성', st.addBtn===true, 'disabled='+st.addBtn);
  ok('E-307 콘솔 에러 0', errs.length===0, JSON.stringify(errs));
  await p.screenshot({path:'shots/50-readonly.png'}); }
// --- E-605: 다른 탭이 바꾼 뒤 이 탭이 보이게 될 때 ---
{ const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto(APP); await p.waitForTimeout(700);
  const res=await p.evaluate(async()=>{
    // 1) 숨김 -> lastSeenWriteAt 기록
    Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true});
    document.dispatchEvent(new Event('visibilitychange'));
    // 2) 다른 탭이 쓴 것처럼 meta.lastWriteAt 을 바꾼다
    const m=JSON.parse(localStorage.getItem('jr.v1.meta')||'{}');
    m.lastWriteAt=(m.lastWriteAt||0)+999999; localStorage.setItem('jr.v1.meta',JSON.stringify(m));
    // 3) 다시 보이게
    Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true});
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r=>setTimeout(r,300));
    const t=document.getElementById('jr-toast');
    return {toast:t.textContent.trim(), op:getComputedStyle(t).opacity};});
  ok('E-605 다른 탭 변경 감지 → 토스트', /다른 탭|새로 불러왔습니다|변경/.test(res.toast)&&res.op!=='0', 'toast="'+res.toast+'" op='+res.op);
  ok('E-605 콘솔 에러 0', errs.length===0, JSON.stringify(errs));
  await p.screenshot({path:'shots/51-e605.png'}); }
R.forEach(x=>console.log(x));
await b.close();
})();
