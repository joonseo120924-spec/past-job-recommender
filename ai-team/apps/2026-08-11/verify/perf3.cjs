(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
await p.goto('file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html'); await p.waitForTimeout(600);
const out=await p.evaluate(()=>{
  const med=a=>{a=a.slice().sort((x,y)=>x-y);return +a[Math.floor(a.length/2)].toFixed(2)};
  const wst=a=>+Math.max.apply(null,a).toFixed(2);
  function seed(n){const cats=JR.model.getCategories().data.items;const ex=[],base=Date.now();
    for(let i=0;i<n;i++)ex.push({id:'e_'+i,date:'2026-'+String((i%12)+1).padStart(2,'0')+'-'+String((i%28)+1).padStart(2,'0'),
      amount:(i%9000)+100,categoryId:cats[i%cats.length].id,memo:'메모'+i,createdAt:base+i});
    localStorage.setItem('jr.v1.expenses',JSON.stringify(ex));JR.model.init();
    return JSON.stringify(ex).length;}
  const res={};
  [100,500,1000,2000,5000].forEach(n=>{
    const chars=seed(n);
    const cur=JR.model.getSettings().data.settings.selectedMonth;
    const t=[]; let m=cur;
    for(let k=0;k<15;k++){ const nx=JR.model.shiftMonth(m,-1);
      const t0=performance.now(); JR.model.setSelectedMonth(nx); t.push(performance.now()-t0); m=nx;
      if(k%6===5) m=cur; }
    t.shift();
    // 추가 기록 1건(F-01 저장 경로)
    const cats=JR.model.getCategories().data.items; const s=[];
    for(let k=0;k<11;k++){const t0=performance.now();
      const r=JR.model.addExpense({date:'2026-08-1'+(k%9),amount:'1000',categoryId:cats[0].id,memo:''});
      s.push(performance.now()-t0);} s.shift();
    res[n]={chars, 월이동:{med:med(t),worst:wst(t)}, 저장:{med:med(s),worst:wst(s)}};
  });
  return res;
});
console.log('Chromium · 쓰기 경로 단일 호출 (median/worst ms)');
console.log('건수   직렬화문자   월이동(setSelectedMonth)   저장(addExpense)');
Object.keys(out).forEach(n=>{const o=out[n];
  console.log(String(n).padStart(5), String(o.chars).padStart(9), '   ',
   (o.월이동.med+'/'+o.월이동.worst).padEnd(16), (o.저장.med+'/'+o.저장.worst).padEnd(14),
   (o.월이동.worst<16&&o.저장.worst<16)?'✅ 16ms 이내':'⚠️ 16ms 초과');});
await b.close();
})();
