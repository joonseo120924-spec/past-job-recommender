(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html'); await p.waitForTimeout(600);
const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''));
// 스크롤을 아래로 내려둔다 (INT-32 가 노린 상황)
await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(300);
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
const beforeScroll=await p.evaluate(()=>window.scrollY);
// 남은 용량 부족 상태 (LIMIT_CHARS 를 낮춤 — INT-33 6항이 안내한 검증법)
await p.evaluate(()=>Object.defineProperty(JR.store,'LIMIT_CHARS',{value:100,configurable:true}));
const payload=JSON.stringify({schema:1,exportedAt:'2026-08-21T00:00:00.000Z',app:'한달정리',
  data:{expenses:[{id:'x_1',date:'2026-08-11',amount:1000,categoryId:'c_d01',memo:'m',createdAt:1787000000000}],
  categories:[{id:'c_d01',name:'식비',order:0}],settings:{selectedMonth:'2026-08',dismissedNotices:[]}}});
const before=await p.evaluate(()=>JR.model.getExpenses().data.items.length);
await p.setInputFiles('#jr-import-file',{name:'backup.json',mimeType:'application/json',buffer:Buffer.from(payload,'utf8')});
await p.waitForTimeout(900);
const st=await p.evaluate(()=>({banners:Array.from(document.querySelectorAll('.jr-banner')).map(x=>x.textContent.trim().slice(0,40)),
  scrollY:window.scrollY, dialog:document.querySelectorAll('#jr-dialog-overlay').length,
  count:JR.model.getExpenses().data.items.length}));
ok('E-413 저장공간 부족 → 배너 도달', st.banners.some(t=>/저장 공간이 부족해 이 파일을 가져올/.test(t)), JSON.stringify(st.banners));
ok('E-413 확인 대화상자보다 먼저(INT-27)', st.dialog===0, 'dialog='+st.dialog);
ok('E-413 화면 최상단으로 스크롤(INT-32)', st.scrollY===0&&beforeScroll>=0, '이전 scrollY='+beforeScroll+' → 현재 '+st.scrollY);
ok('E-413 데이터 무접촉', st.count===before, before+' -> '+st.count);
await p.screenshot({path:'shots/33-e413-live.png'});
// parseImport 직접 반환값
const direct=await p.evaluate(t=>JR.io.parseImport(t), payload);
ok('E-413 parseImport 반환 코드', direct.ok===false&&direct.code==='E-413', 'code='+direct.code);
R.forEach(r=>console.log(r)); console.log('\n콘솔 에러:',errs.length,errs);
await b.close();
})();
