(async()=>{
const pw=require('/opt/node22/lib/node_modules/playwright');
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
for(const nm of ['chromium','firefox','webkit']){
  let b;
  try{ b=await pw[nm].launch(); }catch(e){ console.log('=== '+nm+' === 기동 실패:', String(e).split('\n')[0].slice(0,140)); continue; }
  try{
    const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});
    const p=await ctx.newPage(); const errs=[];
    p.on('pageerror',e=>errs.push('PAGEERROR '+e)); p.on('console',m=>{if(m.type()==='error')errs.push('err '+m.text())});
    await p.goto(APP); await p.waitForTimeout(800);
    const st=await p.evaluate(()=>({mode:JR.store.mode(),ready:JR.model.isReady(),screen:document.body.getAttribute('data-screen'),
      mods:Object.keys(JR).length, unsup:!!document.getElementById('jr-unsupported'), load:!!document.getElementById('jr-loading')}));
    // F-01 최소 경로
    await p.click('#jr-s01-add'); await p.waitForTimeout(300);
    await p.fill('#jr-amount','12500'); await p.click('#jr-cat-group button:nth-of-type(1)');
    await p.click('#jr-s02-save'); await p.waitForTimeout(500);
    const n=await p.evaluate(()=>JR.model.getExpenses().data.items.length);
    const total=await p.textContent('#jr-s01-total');
    await p.reload(); await p.waitForTimeout(600);
    const n2=await p.evaluate(()=>JR.model.getExpenses().data.items.length);
    // 탭 전환
    await p.click('#jr-tabbar button:nth-of-type(2)'); await p.waitForTimeout(250);
    const s3=await p.evaluate(()=>document.body.getAttribute('data-screen'));
    await p.screenshot({path:'shots/40-'+nm+'.png'});
    console.log('=== '+nm+' ===');
    console.log('  부팅:',JSON.stringify(st));
    console.log('  F-01 저장:',n,'건 · 총합',total.trim(),'· 새로고침 후',n2,'건 · 통계탭',s3);
    console.log('  콘솔 에러:',errs.length, errs.slice(0,3));
  }catch(e){ console.log('=== '+nm+' === 실행 중 오류:', String(e).split('\n')[0].slice(0,160)); }
  await b.close();
}
})();
