(async()=>{
const { chromium, firefox } = require('/opt/node22/lib/node_modules/playwright');
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
for(const [nm,eng] of [['Chromium',chromium],['Firefox',firefox]]){
  const b=await eng.launch(); const p=await (await b.newContext()).newPage();
  await p.goto(APP); await p.waitForTimeout(600);
  const out=await p.evaluate(()=>{
    const med=a=>{a=a.slice().sort((x,y)=>x-y);return +a[Math.floor(a.length/2)].toFixed(2)};
    const worst=a=>+Math.max.apply(null,a).toFixed(2);
    function seed(n,single){
      const cats=JR.model.getCategories().data.items; const ex=[],base=Date.now();
      for(let i=0;i<n;i++){const mo=single?8:(i%12)+1;
        ex.push({id:'e_'+i,date:'2026-'+String(mo).padStart(2,'0')+'-'+String((i%28)+1).padStart(2,'0'),
          amount:(i%9000)+100,categoryId:cats[i%cats.length].id,memo:'메모'+i,createdAt:base+i});}
      localStorage.setItem('jr.v1.expenses',JSON.stringify(ex));
    }
    function bench(n,single){
      seed(n,single); 
      const boot=[]; for(let k=0;k<11;k++){const t=performance.now();JR.model.init();boot.push(performance.now()-t)} boot.shift();
      JR.model.init();
      const m=JR.model.getSettings().data.settings.selectedMonth;
      // 상호작용: 목록 조회
      const list=[]; for(let k=0;k<21;k++){const t=performance.now();JR.model.listByMonth(m);list.push(performance.now()-t)} list.shift();
      // 상호작용: 통계(캐시 무효화 후 = 최악)
      const st=[]; for(let k=0;k<21;k++){JR.stats.invalidate();const t=performance.now();JR.stats.byCategory(m);st.push(performance.now()-t)} st.shift();
      // 상호작용: 통계(캐시 적중)
      JR.stats.byCategory(m);
      const stc=[]; for(let k=0;k<21;k++){const t=performance.now();JR.stats.byCategory(m);stc.push(performance.now()-t)} stc.shift();
      // 상호작용: 월 이동(UI 경유)
      const mv=[]; for(let k=0;k<11;k++){const t=performance.now();JR.model.setSelectedMonth(JR.model.shiftMonth(m,-1));JR.model.setSelectedMonth(m);mv.push(performance.now()-t)} mv.shift();
      return {boot:{med:med(boot),worst:worst(boot)}, list:{med:med(list),worst:worst(list)},
              statsCold:{med:med(st),worst:worst(st)}, statsWarm:{med:med(stc),worst:worst(stc)},
              move:{med:med(mv),worst:worst(mv)}};
    }
    return {n1000:bench(1000,false), n5000:bench(5000,false), n5000single:bench(5000,true)};
  });
  console.log('=== '+nm+' (median/worst, ms) ===');
  for(const k of ['n1000','n5000','n5000single']){
    const o=out[k];
    console.log(' '+k.padEnd(12)+' 부팅init '+o.boot.med+'/'+o.boot.worst+
      ' | 목록 '+o.list.med+'/'+o.list.worst+
      ' | 통계(캐시무효) '+o.statsCold.med+'/'+o.statsCold.worst+
      ' | 통계(캐시적중) '+o.statsWarm.med+'/'+o.statsWarm.worst+
      ' | 월이동 '+o.move.med+'/'+o.move.worst);
  }
  const interWorst=Math.max(...['n1000','n5000','n5000single'].flatMap(k=>[out[k].list.worst,out[k].statsCold.worst,out[k].statsWarm.worst,out[k].move.worst]));
  const bootWorst=Math.max(...['n1000','n5000','n5000single'].map(k=>out[k].boot.worst));
  console.log(' 상호작용 최악:',interWorst+'ms', interWorst<16?'✅ 16ms 충족':'❌ 초과');
  console.log(' 부팅 init 최악:',bootWorst+'ms (1회성)');
  await b.close();
}
})();
