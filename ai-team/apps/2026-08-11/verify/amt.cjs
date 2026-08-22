(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto('file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html'); await p.waitForTimeout(600);
// 1) 모델 계층 직접 검증 (UI 를 거치지 않음)
const model=await p.evaluate(()=>{
  const c=JR.model.getCategories().data.items[0].id;
  const cases=['-5','1.5','0','abc','','1000000000','999999999','12,500',' 3000 ','1e3','٣','1.0','-0'];
  return cases.map(v=>{const r=JR.model.validateExpense({date:'2026-08-11',amount:v,categoryId:c,memo:''});
    return {in:JSON.stringify(v), ok:r.ok, code:r.ok?'':r.code,
            errs:r.ok?'':(r.data.errors||[]).map(e=>e.field+':'+e.code).join(',')};});
});
console.log('=== JR.model.validateExpense 직접 호출 ===');
model.forEach(m=>console.log('  amount='+m.in.padEnd(14), m.ok?'✅ 통과':'❌ 거부 '+m.code, m.errs));
// 2) UI 입력란이 무엇을 하는지
const ui=await p.evaluate(async()=>{
  const out=[];
  for(const v of ['-5','1.5','12,500','abc']){
    document.body.setAttribute('data-screen','s02');
    const el=document.getElementById('jr-amount');
    el.value=''; el.focus();
    // 실제 입력 이벤트 흉내
    el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));
    out.push({typed:v, afterInput:el.value});
    el.dispatchEvent(new Event('change',{bubbles:true}));
    out[out.length-1].afterChange=el.value;
  }
  return out;});
console.log('\n=== UI 금액 입력란이 값을 바꾸는가 ===');
ui.forEach(u=>console.log('  입력 "'+u.typed+'" → input 후 "'+u.afterInput+'" → change 후 "'+u.afterChange+'"'));
// 3) 실제로 저장된 금액
await p.evaluate(()=>{const c=JR.model.getCategories().data.items[0].id;
  JR.model.addExpense({date:'2026-08-11',amount:'-5',categoryId:c,memo:'음수'});
  JR.model.addExpense({date:'2026-08-11',amount:'1.5',categoryId:c,memo:'소수'});});
const saved=await p.evaluate(()=>JR.model.getExpenses().data.items.map(e=>({memo:e.memo,amount:e.amount})));
console.log('\n=== addExpense 로 직접 저장 시도한 결과 ===');
console.log(' ', JSON.stringify(saved));
await b.close();
})();
