(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html'); await p.waitForTimeout(500);
const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''));
// 초안 작성
await p.click('#jr-s01-add'); await p.waitForTimeout(300);
await p.fill('#jr-amount','4200'); await p.fill('#jr-memo','작성중인 메모');
await p.click('#jr-cat-group button:nth-of-type(2)'); await p.waitForTimeout(300);
await p.locator('#jr-memo').blur().catch(()=>{}); await p.waitForTimeout(400);
// 새로고침 (사고 이탈)
await p.reload(); await p.waitForTimeout(700);
ok('예외6 새로고침 후 진입 화면은 S-01', await p.evaluate(()=>document.body.getAttribute('data-screen'))==='s01');
ok('예외6 초안이 저장소에 살아있음', await p.evaluate(()=>!!JR.model.loadDraft().data.draft));
// S-02 진입 -> 복원
await p.click('#jr-s01-add'); await p.waitForTimeout(600);
const st=await p.evaluate(()=>({amt:document.getElementById('jr-amount').value,memo:document.getElementById('jr-memo').value,
  toast:document.getElementById('jr-toast').textContent.trim(),op:getComputedStyle(document.getElementById('jr-toast')).opacity,
  chip:!!document.querySelector('#jr-cat-group button[aria-checked="true"]')}));
ok('예외6 금액 복원', st.amt==='4,200'||st.amt==='4200', 'amount='+st.amt);
ok('예외6 메모 복원', st.memo==='작성중인 메모', 'memo='+st.memo);
ok('예외6 카테고리 복원', st.chip===true, 'chip selected='+st.chip);
ok('예외6 E-602 토스트', /다시 불러왔습니다/.test(st.toast)&&st.op!=='0', 'toast="'+st.toast+'" opacity='+st.op);
await p.screenshot({path:'shots/26-exc6-draft-restored.png'});
// 명시적 이탈(취소->나가기)은 버린다
await p.click('#jr-s02-cancel'); await p.waitForTimeout(400);
const hasDlg=await p.locator('#jr-dialog-overlay').count();
if(hasDlg){await p.evaluate(()=>{const bs=Array.from(document.querySelectorAll('#jr-dialog-overlay button'));(bs.find(x=>/나가기/.test(x.textContent))||bs[bs.length-1]).click()});await p.waitForTimeout(400);}
const gone=await p.evaluate(()=>{const d=JR.model.loadDraft();return !d.data.draft});
ok('예외6 명시적 나가기는 초안 삭제', gone===true, 'draft cleared='+gone);
// 24시간 경과 -> E-603
await p.evaluate(()=>{JR.model.saveDraft({mode:'add',targetId:null,date:JR.model.today(),amount:'999',categoryId:null,memo:'오래된'});
  const raw=JSON.parse(localStorage.getItem('jr.v1.draft')); raw.savedAt=Date.now()-90000000; localStorage.setItem('jr.v1.draft',JSON.stringify(raw));});
await p.reload(); await p.waitForTimeout(600);
await p.click('#jr-s01-add'); await p.waitForTimeout(600);
const st2=await p.evaluate(()=>({amt:document.getElementById('jr-amount').value,toast:document.getElementById('jr-toast').textContent.trim()}));
ok('예외6 24시간 경과 초안 폐기 E-603', /하루가 지나 지워졌습니다/.test(st2.toast), 'toast="'+st2.toast+'"');
ok('예외6 폐기된 초안은 복원 안 함', st2.amt!=='999', 'amount='+st2.amt);
await p.screenshot({path:'shots/30-exc6-e603.png'});
R.forEach(r=>console.log(r)); console.log('\n콘솔 에러:',errs.length,errs);
await b.close();
})();
