/* QA(보안) — 전역 오염 정밀 측정(iframe 계측 부작용 제거판). */
(async()=>{
const PW=require('/opt/node22/lib/node_modules/playwright');
const ENGINE=process.argv[2]||'chromium';
const b=await PW[ENGINE].launch(); const ctx=await b.newContext();
const blank=await ctx.newPage(); await blank.goto('about:blank');
const baseKeys=await blank.evaluate(()=>Object.getOwnPropertyNames(window));
const p=await ctx.newPage();
await p.goto('file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html');
await p.waitForTimeout(900);
const appKeys=await p.evaluate(()=>Object.getOwnPropertyNames(window));
const extra=appKeys.filter(k=>baseKeys.indexOf(k)===-1);
const surface=await p.evaluate(()=>({
  JR:Object.keys(JR),
  err:Object.keys(JR.err),store:Object.keys(JR.store),model:Object.keys(JR.model),
  stats:Object.keys(JR.stats),io:Object.keys(JR.io),ui:Object.keys(JR.ui),
  privates:['monthIndex','expenses','categories','settings','subscribers','statsCache','mem','_seq']
    .filter(n=>typeof JR.model[n]!=='undefined'||typeof JR.store[n]!=='undefined'||typeof JR.stats[n]!=='undefined'||typeof window[n]!=='undefined')
}));
console.log('엔진:',ENGINE);
console.log('빈 페이지 대비 추가된 전역:',JSON.stringify(extra));
console.log('JR 표면:',JSON.stringify(surface,null,1));
console.log(extra.length===1&&extra[0]==='JR'?'RESULT PASS 전역은 JR 하나뿐':'RESULT CHECK '+JSON.stringify(extra));
await b.close();
})();
