/* QA(보안) — 네트워크 2차 계측(인페이지 계기).
 * Playwright 의 request 이벤트가 file:// 에서 엔진별로 누락되므로
 * 페이지 안에서 네트워크 가능 API 를 전부 후킹해 "호출 시도" 자체를 센다.
 * 사용: node verify/qa-sec-net2.cjs [engine]
 */
(async()=>{
const PW=require('/opt/node22/lib/node_modules/playwright');
const ENGINE=process.argv[2]||'chromium';
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b=await PW[ENGINE].launch();
const ctx=await b.newContext({viewport:{width:390,height:844}});
await ctx.addInitScript(()=>{
  window.__NET__=[];
  const rec=(k,a)=>{try{window.__NET__.push(k+' :: '+Array.prototype.slice.call(a).map(x=>String(x).slice(0,80)).join(' | '))}catch(e){window.__NET__.push(k)}};
  const wrap=(o,n)=>{if(o&&typeof o[n]==='function'){const f=o[n];o[n]=function(){rec(n,arguments);return f.apply(this,arguments)}}};
  wrap(window,'fetch');
  if(window.XMLHttpRequest){wrap(XMLHttpRequest.prototype,'open');wrap(XMLHttpRequest.prototype,'send');}
  if(navigator.sendBeacon)wrap(navigator,'sendBeacon');
  ['WebSocket','EventSource','SharedWorker','Worker','RTCPeerConnection'].forEach(n=>{
    if(window[n]){const C=window[n];window[n]=function(){rec(n,arguments);return new C(...arguments)};}
  });
  if(navigator.serviceWorker)wrap(navigator.serviceWorker,'register');
  // 동적으로 만들어지는 네트워크 유발 요소 감시
  const ce=document.createElement.bind(document);
  document.createElement=function(t){const el=ce(t);
    if(/^(img|script|iframe|link|audio|video|source|object|embed)$/i.test(t)){rec('createElement:'+t.toLowerCase(),[t]);}
    return el;};
});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto(APP); await p.waitForTimeout(800);
const step=async(n,fn)=>{try{await fn()}catch(e){console.log('STEP-ERR',n,String(e).slice(0,120))}};
await step('add',async()=>{await p.click('#jr-s01-add');await p.waitForTimeout(200);
  await p.fill('#jr-amount','9900');await p.fill('#jr-memo','계기');await p.click('#jr-cat-group .jr-chip');
  await p.click('#jr-s02-save');await p.waitForTimeout(400);});
await step('stats',async()=>{await p.click('#jr-tabbar .jr-tab[data-screen="s03"]');await p.waitForTimeout(300);});
await step('s04',async()=>{await p.click('#jr-tabbar .jr-tab[data-screen="s04"]');await p.waitForTimeout(300);});
await step('export',async()=>{await p.click('#jr-s04-export');await p.waitForTimeout(600);});
await step('import',async()=>{const j=await p.evaluate(()=>JR.io.buildExport().data.json);
  await p.setInputFiles('#jr-import-file',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(j,'utf8')});
  await p.waitForTimeout(600);const bt=await p.$$('#jr-dialog-overlay button');if(bt.length)await bt[bt.length-1].click();await p.waitForTimeout(600);});
const out=await p.evaluate(()=>({
  hooked:window.__NET__.slice(),
  resources:(performance.getEntriesByType?performance.getEntriesByType('resource'):[]).map(r=>r.name),
  nav:(performance.getEntriesByType?performance.getEntriesByType('navigation'):[]).map(r=>r.name)
}));
const bad=[...out.hooked, ...out.resources.filter(u=>!/^(file|data|blob|about):/.test(u))];
console.log('엔진:',ENGINE);
console.log('후킹된 네트워크 API 호출:',out.hooked.length, out.hooked);
console.log('performance resource 항목:',out.resources.length);
out.resources.forEach(r=>console.log('  ',r.length>110?r.slice(0,110)+'…':r));
console.log('그중 비-file/data/blob:',out.resources.filter(u=>!/^(file|data|blob|about):/.test(u)).length);
console.log('콘솔에러:',errs.length,errs);
console.log(bad.length===0?'RESULT PASS 네트워크 호출 0건':'RESULT FAIL '+bad.length+'건: '+JSON.stringify(bad));
await b.close();
})();
