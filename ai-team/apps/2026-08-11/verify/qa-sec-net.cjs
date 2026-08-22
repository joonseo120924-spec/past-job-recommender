/* QA(보안) 사이클 — 외부 네트워크 요청 실계측.
 * 전 기능 흐름을 1회 통과하며 request/response/websocket 전건 수집.
 * 사용: node verify/qa-sec-net.cjs [chromium|firefox|webkit]
 */
(async()=>{
const PW=require('/opt/node22/lib/node_modules/playwright');
const ENGINE=process.argv[2]||'chromium';
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b=await PW[ENGINE].launch();
const ctx=await b.newContext({viewport:{width:390,height:844}});
const reqs=[],ws=[],errs=[];
ctx.on('request',r=>reqs.push({url:r.url(),method:r.method(),rt:r.resourceType()}));
const p=await ctx.newPage();
p.on('websocket',w=>ws.push(w.url()));
p.on('pageerror',e=>errs.push('PAGEERROR '+e));
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
p.on('requestfailed',r=>reqs.push({url:r.url(),method:'FAILED',rt:r.resourceType()}));
const step=async(n,fn)=>{try{await fn()}catch(e){console.log('STEP-ERR',n,String(e).slice(0,160))}};

await p.goto(APP); await p.waitForTimeout(900);
// 1) 지출 추가
await step('add',async()=>{
  await p.click('#jr-s01-add'); await p.waitForTimeout(200);
  await p.fill('#jr-amount','12500');
  await p.fill('#jr-memo','네트워크 계측용 메모');
  await p.click('#jr-cat-group .jr-chip'); 
  await p.click('#jr-s02-save'); await p.waitForTimeout(400);
});
// 2) 월 이동
await step('month',async()=>{await p.click('#jr-s01-prev');await p.waitForTimeout(150);await p.click('#jr-s01-next');await p.waitForTimeout(150);});
// 3) 통계
await step('stats',async()=>{await p.click('#jr-tabbar .jr-tab[data-screen="s03"]');await p.waitForTimeout(300);});
// 4) 설정 + 카테고리 추가/삭제
await step('cat',async()=>{
  await p.click('#jr-tabbar .jr-tab[data-screen="s04"]');await p.waitForTimeout(300);
  await p.fill('#jr-cat-new','계측');await p.click('#jr-s04-cat-add');await p.waitForTimeout(300);
});
// 5) 내보내기
await step('export',async()=>{await p.click('#jr-s04-export');await p.waitForTimeout(600);});
// 6) 가져오기
await step('import',async()=>{
  const j=await p.evaluate(()=>JR.io.buildExport().data.json);
  await p.setInputFiles('#jr-import-file',{name:'b.json',mimeType:'application/json',buffer:Buffer.from(j,'utf8')});
  await p.waitForTimeout(600);
  const btns=await p.$$('#jr-dialog-overlay button');
  if(btns.length){await btns[btns.length-1].click();await p.waitForTimeout(700);}
});
// 7) 전체 삭제
await step('wipe',async()=>{
  await p.click('#jr-tabbar .jr-tab[data-screen="s04"]');await p.waitForTimeout(300);
  await p.click('#jr-s04-wipe');await p.waitForTimeout(250);
  let bt=await p.$$('#jr-dialog-overlay button'); if(bt.length)await bt[bt.length-1].click(); await p.waitForTimeout(250);
  bt=await p.$$('#jr-dialog-overlay button'); if(bt.length)await bt[bt.length-1].click(); await p.waitForTimeout(500);
});
// 8) 새로고침
await step('reload',async()=>{await p.reload();await p.waitForTimeout(800);});

const ext=reqs.filter(r=>!/^(file|data|blob|about):/.test(r.url));
console.log('엔진:',ENGINE);
console.log('총 수집 요청:',reqs.length);
console.log('--- 전체 요청 목록 ---');
reqs.forEach(r=>console.log('  ',r.method,r.rt,r.url.length>110?r.url.slice(0,110)+'…':r.url));
console.log('--- file://·data:·blob: 이외 요청 ---');
console.log('개수:',ext.length, JSON.stringify(ext,null,1));
console.log('WebSocket:',ws.length,ws);
console.log('콘솔에러/pageerror:',errs.length,errs);
console.log(ext.length===0&&ws.length===0?'RESULT PASS 외부요청 0건':'RESULT FAIL 외부요청 '+ext.length+'건');
await b.close();
})();
