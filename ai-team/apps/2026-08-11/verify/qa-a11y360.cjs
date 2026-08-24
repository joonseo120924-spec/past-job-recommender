(async()=>{const ENG=process.argv[2]||'chromium';const pw=require('/opt/node22/lib/node_modules/playwright');
const b=await pw[ENG].launch();
for(const W of [320,360,390]){
 const p=await(await b.newContext({viewport:{width:W,height:640}})).newPage();
 await p.goto('file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html');await p.waitForTimeout(600);
 // 카테고리 9개 + 지출 2건으로 동적 행까지 채운다
 await p.evaluate(()=>{const c=JR.model.getCategories().data.items;
   JR.model.addCategory('추가분류');
   JR.model.addExpense({date:JR.model.today(),amount:'12500',categoryId:c[0].id,memo:'점심'});
   JR.model.addExpense({date:JR.model.today(),amount:'3200',categoryId:c[1].id,memo:'버스'});});
 const scan=()=>p.evaluate(()=>Array.from(document.querySelectorAll('button:not([hidden]),a[href],input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])'))
   .filter(e=>e.offsetParent!==null&&!e.disabled)
   .map(e=>{const r=e.getBoundingClientRect();return{id:e.id||e.className.split(' ')[0],w:Math.round(r.width),h:Math.round(r.height)};})
   .filter(x=>x.w<44||x.h<44).filter(x=>x.id!=='jr-import-file'));
 const out={};
 for(const [s,n] of [['S-01',1],['S-03',2],['S-04',3]]){await p.click(`#jr-tabbar button:nth-of-type(${n})`);await p.waitForTimeout(300);out[s]=await scan();}
 await p.click('#jr-tabbar button:nth-of-type(1)');await p.waitForTimeout(200);
 await p.click('#jr-s01-add');await p.waitForTimeout(400);out['S-02']=await scan();
 const sc=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
 console.log(ENG+' '+W+'px  44미달='+JSON.stringify(out)+'  S-02가로스크롤='+JSON.stringify(sc));
 await p.close();
}
await b.close();})();
