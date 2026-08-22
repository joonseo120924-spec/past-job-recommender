(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html'); await p.waitForTimeout(600);
const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''));

// show() 가 슬롯대로 라우팅하는가
const route=await p.evaluate(()=>{
  const out={};
  const bn=()=>Array.from(document.querySelectorAll('.jr-banner')).map(x=>x.getAttribute('data-code')||x.textContent.trim().slice(0,20));
  const tt=()=>document.getElementById('jr-toast').textContent.trim();
  JR.ui.show('E-413',{}); out.e413_banner=bn(); out.e413_toast=tt();
  JR.ui.show('E-119',{}); out.e119_toast=document.getElementById('jr-toast').textContent.trim();
  JR.ui.show('E-101',{},'amount'); out.e101_inline=(document.getElementById('jr-amount-hint')||{}).textContent;
  out.slots={ 'E-413':JR.err.slot('E-413'), 'E-119':JR.err.slot('E-119'), 'E-101':JR.err.slot('E-101') };
  return out;
});
ok('show() B 슬롯 → 배너(E-413)', route.e413_banner.length>0, JSON.stringify(route.e413_banner));
ok('show() B 슬롯이 토스트로 새지 않음', !/저장 공간이 부족해/.test(route.e413_toast), 'toast="'+route.e413_toast.slice(0,30)+'"');
ok('show() T 슬롯 → 토스트(E-119)', /이미 삭제된 기록/.test(route.e119_toast), route.e119_toast);
ok('show() I 슬롯 → 인라인(E-101)', /금액을 입력해 주세요/.test(route.e101_inline||''), String(route.e101_inline));
await p.screenshot({path:'shots/31-int32-e413-banner.png'});

// 배너 우선순위 — 가장 심각한 것 하나만
const prio=await p.evaluate(()=>{
  document.querySelectorAll('.jr-banner').forEach(b=>b.remove());
  JR.ui.banner('E-203',{percent:80}); JR.ui.banner('E-002',{}); JR.ui.banner('E-202',{});
  return Array.from(document.querySelectorAll('.jr-banner')).map(x=>x.textContent.trim().slice(0,25));
});
ok('배너 우선순위 — 가장 심각한 것만 표시', prio.length===1&&/저장 공간이 가득 차/.test(prio[0]), 'banners='+JSON.stringify(prio));
await p.screenshot({path:'shots/32-banner-priority.png'});

// 같은 코드 중복 배너 금지
const dup=await p.evaluate(()=>{document.querySelectorAll('.jr-banner').forEach(b=>b.remove());
  JR.ui.banner('E-202',{});JR.ui.banner('E-202',{});JR.ui.banner('E-202',{});
  return document.querySelectorAll('.jr-banner').length;});
ok('같은 코드 배너 중복 생성 안 함', dup===1, 'count='+dup);

// 토스트 교체(누적 없음) + TOAST_MS
const toast=await p.evaluate(()=>{JR.ui.toast('E-119',{});JR.ui.toast('E-124',{});
  return {n:document.querySelectorAll('#jr-toast').length,txt:document.getElementById('jr-toast').textContent.trim(),ms:JR.ui.TOAST_MS};});
ok('토스트 교체(누적 없음)', toast.n===1&&/카테고리/.test(toast.txt), JSON.stringify(toast));
ok('TOAST_MS = 3000 (INT-33)', toast.ms===3000, 'TOAST_MS='+toast.ms);

// E-413 실제 경로: 저장 공간 부족 상태에서 큰 파일 가져오기
await p.evaluate(()=>{document.querySelectorAll('.jr-banner').forEach(b=>b.remove());});
const big=JSON.stringify({schema:1,exportedAt:new Date().toISOString(),app:'한달정리',
  data:{expenses:Array.from({length:200},(_,i)=>({id:'x_'+i,date:'2026-08-11',amount:1000,categoryId:'c_d01',memo:'m',createdAt:Date.now()+i})),
  categories:[{id:'c_d01',name:'식비',order:0}],settings:{selectedMonth:'2026-08',dismissedNotices:[]}}});
await p.evaluate(()=>{ /* 남은 용량을 거의 없게 만든다 */
  window.__origLimit=JR.store.LIMIT_CHARS;
  Object.defineProperty(JR.store,'LIMIT_CHARS',{value:100,configurable:true});
});
await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(200);
await p.setInputFiles('#jr-import-file',{name:'big.json',mimeType:'application/json',buffer:Buffer.from(big,'utf8')});
await p.waitForTimeout(900);
const st=await p.evaluate(()=>({banners:Array.from(document.querySelectorAll('.jr-banner')).map(x=>x.textContent.trim().slice(0,35)),
  scrollY:window.scrollY, dialog:document.querySelectorAll('#jr-dialog-overlay').length}));
ok('E-413 저장공간 부족 경로 도달', st.banners.some(t=>/저장 공간이 부족해/.test(t)), JSON.stringify(st.banners));
ok('E-413 배너는 확인 대화상자 전에(INT-27)', st.dialog===0, 'dialog='+st.dialog);
ok('E-413 화면 최상단 스크롤(INT-32)', st.scrollY===0, 'scrollY='+st.scrollY);
await p.screenshot({path:'shots/33-e413-live.png'});
R.forEach(r=>console.log(r)); console.log('\n콘솔 에러:',errs.length,errs);
await b.close();
})();
