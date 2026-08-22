(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''));
const b=await chromium.launch();
const mk=async(init,opts)=>{const ctx=await b.newContext(Object.assign({viewport:{width:390,height:844},acceptDownloads:true},opts||{}));
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERROR '+e)); p.on('console',m=>{if(m.type()==='error')errs.push('err '+m.text())});
  if(init) await p.addInitScript(init); await p.goto(APP); await p.waitForTimeout(700); return {p,errs};};
const toastTxt=p=>p.evaluate(()=>{const t=document.getElementById('jr-toast');return t?{txt:t.textContent.trim(),op:getComputedStyle(t).opacity,live:t.getAttribute('aria-live'),atomic:t.getAttribute('aria-atomic')}:null});

// 예외4 후속 — E-405 토스트 실제 표시 확인
{ const {p}=await mk();
  await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(200);
  await p.setInputFiles('#jr-import-file',{name:'foreign.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({app:'someone-else',records:[]}),'utf8')});
  await p.waitForTimeout(600);
  const t=await toastTxt(p);
  ok('예외4 E-405 토스트 실제 표시', t&&t.txt.length>0&&t.op!=='0', JSON.stringify(t));
  ok('예외4 토스트 라이브리전 속성(INT-33/Q-033)', t&&t.live&&t.atomic==='true', 'aria-live='+(t&&t.live)+' atomic='+(t&&t.atomic));
  await p.screenshot({path:'shots/25-exc4-toast.png'}); }

// ⑥ 새로고침 / 뒤로가기 — 초안 복원
{ const {p,errs}=await mk();
  await p.click('#jr-s01-add'); await p.waitForTimeout(300);
  await p.fill('#jr-amount','4200'); await p.fill('#jr-memo','작성중인 메모');
  await p.click('#jr-cat-group button:nth-of-type(2)');
  await p.waitForTimeout(1200);            // 초안 저장 대기
  const draftSaved=await p.evaluate(()=>{const d=JR.model.loadDraft();return d.ok?d.data:null});
  await p.reload(); await p.waitForTimeout(900);
  const t=await toastTxt(p);
  const scr=await p.evaluate(()=>document.body.getAttribute('data-screen'));
  const restored=await p.evaluate(()=>({amt:(document.getElementById('jr-amount')||{}).value,memo:(document.getElementById('jr-memo')||{}).value}));
  ok('예외6 새로고침 전 초안 저장됨', !!draftSaved, JSON.stringify(draftSaved).slice(0,120));
  ok('예외6 새로고침 후 초안 복원 경로 동작', scr==='s02'||(t&&/작성/.test(t.txt))||restored.amt==='4200', 'screen='+scr+' amount='+restored.amt+' toast='+(t&&t.txt));
  ok('예외6 콘솔 에러 0', errs.length===0, JSON.stringify(errs));
  await p.screenshot({path:'shots/26-exc6-draft.png'}); }

// ⑦ 다운로드 차단 — 3단 폴백
{ const {p,errs}=await mk(()=>{
    // Blob·createObjectURL·anchor 다운로드를 전부 막는다
    window.URL.createObjectURL=function(){throw new Error('blocked')};
    const realClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){ if(this.hasAttribute('download')) throw new Error('download blocked'); return realClick.apply(this,arguments); };
  });
  await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(200);
  await p.click('#jr-s04-export'); await p.waitForTimeout(900);
  const fb=await p.evaluate(()=>{const f=document.getElementById('jr-export-fallback');
     return {hidden:f.hidden, notice:(document.getElementById('jr-export-notice')||{}).textContent, len:(document.getElementById('jr-export-text')||{}).value?document.getElementById('jr-export-text').value.length:0}});
  ok('예외7 다운로드 차단 시 텍스트 폴백 노출', fb.hidden===false&&fb.len>0, JSON.stringify({hidden:fb.hidden,len:fb.len}));
  ok('예외7 폴백에 전체 JSON 담김', fb.len>100, 'textarea 길이='+fb.len+'자');
  ok('예외7 앱이 죽지 않음', errs.length===0, JSON.stringify(errs));
  await p.screenshot({path:'shots/27-exc7-dlblocked.png'}); }

// ⑧ 필요 API 미지원
{ const {p,errs}=await mk(()=>{ delete Storage.prototype.getItem; window.JSON=undefined; });
  const vis=await p.evaluate(()=>{const u=document.getElementById('jr-unsupported');
    return u?{present:true,txt:u.textContent.trim(),op:getComputedStyle(u).opacity,pe:getComputedStyle(u).pointerEvents}:{present:false}});
  ok('예외8 필수 API 부재 → 정적 폴백 유지', vis.present===true, JSON.stringify(vis).slice(0,180));
  ok('예외8 E-001 문구 정본 일치', vis.present&&vis.txt==='이 브라우저에서는 앱을 사용할 수 없습니다. 크롬·엣지·사파리·파이어폭스의 최신 버전에서 열어 주세요.', '"'+(vis.txt||'').slice(0,50)+'..."');
  await p.screenshot({path:'shots/28-exc8-unsupported.png'}); }

// ⑧-b 선택 API(FileReader) 부재 → E-002 배너 + 가져오기 비활성
{ const {p,errs}=await mk(()=>{ window.FileReader=undefined; });
  const bs=await p.evaluate(()=>Array.from(document.querySelectorAll('.jr-banner')).map(b=>b.textContent.trim().slice(0,50)));
  await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(250);
  const impDis=await p.isDisabled('#jr-s04-import');
  ok('예외8b FileReader 부재 → E-002 배너', bs.some(t=>/파일 가져오기를 쓸 수 없어/.test(t)), JSON.stringify(bs));
  ok('예외8b 가져오기 버튼 비활성', impDis===true, 'disabled='+impDis);
  ok('예외8b 나머지 기능 살아있음(콘솔 에러 0)', errs.length===0, JSON.stringify(errs));
  await p.screenshot({path:'shots/29-exc8b-e002.png'}); }

console.log('=== 예외 6~8 ===');
R.forEach(r=>console.log(r));
await b.close();
})();
