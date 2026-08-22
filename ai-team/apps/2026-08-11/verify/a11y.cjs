(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:360,height:640}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html'); await p.waitForTimeout(600);
// 데이터 심기
await p.evaluate(()=>{const c=JR.model.getCategories().data.items;
  JR.model.addExpense({date:JR.model.today(),amount:'12500',categoryId:c[0].id,memo:'점심'});
  JR.model.addExpense({date:JR.model.today(),amount:'3200',categoryId:c[1].id,memo:'커피'});});
await p.reload(); await p.waitForTimeout(600);
const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+' | '+n+(d?' | '+d:''));
const scan=async(label)=>{
  const bad=await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('button,a[href],input,select,textarea,[role="radio"],[tabindex]:not([tabindex="-1"])').forEach(el=>{
      if(el.disabled) return;
      const r=el.getBoundingClientRect();
      if(r.width===0&&r.height===0) return;               // 숨김
      if(el.closest('[hidden]')) return;
      if(r.height<44||r.width<44) out.push({tag:el.tagName,id:el.id||'',cls:(el.className||'').toString().slice(0,30),w:Math.round(r.width),h:Math.round(r.height)});
    });
    return out;});
  ok('44×44 터치영역 — '+label, bad.length===0, bad.length?JSON.stringify(bad.slice(0,6)):'전 요소 통과');
  return bad;};
await scan('S-01');
await p.click('#jr-s01-add'); await p.waitForTimeout(400); await scan('S-02');
await p.click('#jr-s02-cancel'); await p.waitForTimeout(400);
const dlg=await p.locator('#jr-dialog-overlay').count();
if(dlg){await p.evaluate(()=>{const bs=[...document.querySelectorAll('#jr-dialog-overlay button')];(bs.find(x=>/나가기/.test(x.textContent))||bs[0]).click()});await p.waitForTimeout(400);}
await p.click('#jr-tabbar button:nth-of-type(2)'); await p.waitForTimeout(400); await scan('S-03');
await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(400); await scan('S-04');
// 가로 스크롤 없음
const hs=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
ok('가로 스크롤 없음(360px)', hs.sw<=hs.cw, JSON.stringify(hs));
// tabular-nums 실제 적용
await p.click('#jr-tabbar button:nth-of-type(1)'); await p.waitForTimeout(400);
const tn=await p.evaluate(()=>{const el=document.querySelector('.jr-expense-row__amount')||document.querySelector('.jr-card__amount');
  return el?getComputedStyle(el).fontVariantNumeric:'없음'});
ok('금액 tabular-nums 실제 적용', /tabular-nums/.test(tn), 'computed='+tn);
// 다크모드 분기 없음
const dark=await p.evaluate(()=>{let n=0;for(const s of document.styleSheets){try{for(const r of s.cssRules){if(r.conditionText&&/prefers-color-scheme/.test(r.conditionText))n++}}catch(e){}}return n});
ok('prefers-color-scheme 분기 0건(v2 금지사항)', dark===0, 'count='+dark);
// lang / viewport
const meta=await p.evaluate(()=>({lang:document.documentElement.lang,vp:(document.querySelector('meta[name=viewport]')||{}).content,title:document.title}));
ok('html lang="ko"', meta.lang==='ko', 'lang='+meta.lang);
ok('viewport 지정', /width=device-width/.test(meta.vp||''), meta.vp);
await p.screenshot({path:'shots/41-a11y-360.png'});
R.forEach(r=>console.log(r)); console.log('\n제목:',meta.title,'\n콘솔 에러:',errs.length,errs);
await b.close();
})();
