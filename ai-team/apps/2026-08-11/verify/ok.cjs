/* ⚠️ 폐기 — Q-066 판정(④ tech-lead · 2026-08-26). **이 도구로 기준선을 산출하지 마십시오.**
 * 인자를 모르는 함수를 「미호출(인자 불명)」로 조용히 빼고도 「개수: N」을 출력해
 * 비-{ok} 기준선을 네 번(12→17→18→28) 틀리게 만든 원인입니다. JR.ui 도 세지 않습니다.
 * 대체 도구: verify/dev2-census.cjs (표면 전건을 ARGS 로 덮고 누락이 있으면 FAIL 로 중단 · INT-41 명단과 1:1 대조)
 * 실행 코드는 한 줄도 고치지 않았습니다 — ⑤ 의 회귀 기준선을 그대로 두기 위해 이 주석만 붙였습니다. */
(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto(APP); await p.waitForTimeout(600);
const res=await p.evaluate(()=>{
  const args={
    'model.today':[], 'model.minDate':[], 'model.maxDate':[], 'model.countChars':['abc'],
    'model.normName':[' 커피 '], 'model.shiftMonth':['2026-08',1], 'model.monthRange':['2026-08'],
    'model.isReady':[], 'model.isNoticeDismissed':['E-203'], 'model.init':[],
    'model.subscribe':[function(){}],
    'model.validateExpense':[{date:'2026-08-11',amount:'1000',categoryId:'c1',memo:''}],
    'model.getExpenses':[], 'model.listByMonth':['2026-08'], 'model.availableMonths':[],
    'model.countByCategory':['c1'], 'model.getCategories':[], 'model.getCategoryMap':[],
    'model.getCategoryName':['c1'], 'model.getSettings':[], 'model.getExpense':['nope'],
    'model.loadDraft':[], 'model.clearDraft':[], 'model.saveDraft':[{date:'2026-08-11'}],
    'model.setSelectedMonth':['2026-08'], 'model.dismissNotice':['E-203'],
    'stats.allocatePercents':[[{amount:10},{amount:20}]], 'stats.formatAmount':[12500],
    'stats.byCategory':['2026-08'], 'stats.summary':['2026-08'], 'stats.invalidate':[],
    'store.mode':[], 'store.usage':[], 'store.init':[], 'store.snapshot':[],
    'err.get':['E-101'], 'err.slot':['E-101'], 'err.format':['E-101',{}],
    'err.ok':[{}], 'err.fail':['E-101',{}],
    'io.buildExport':[], 'io.canDownload':[], 'io.parseImport':['{}'],
  };
  const out=[];
  ['err','store','model','stats','io'].forEach(mod=>{
    Object.keys(JR[mod]).forEach(fn=>{
      const key=mod+'.'+fn; const v=JR[mod][fn];
      if(typeof v!=='function'){ out.push({key,kind:'상수'}); return; }
      if(!(key in args)){ out.push({key,kind:'미호출(인자 불명)'}); return; }
      let r; try{ r=v.apply(null,args[key]); }catch(e){ out.push({key,kind:'예외발생!',detail:String(e)}); return; }
      const isOk = r!==null && typeof r==='object' && typeof r.ok==='boolean';
      out.push({key, kind: isOk?'{ok}':'비-{ok}', ret: isOk?('ok='+r.ok+(r.ok?'':' code='+r.code)+' dataObj='+(r.data!==null&&typeof r.data==='object')):(Object.prototype.toString.call(r))});
    });
  });
  return {out, uiLock: typeof JR.ui.lock('save'), uiLockVal: JR.ui.lock('save'), uiSurface:Object.keys(JR.ui)};
});
const nonOk=res.out.filter(o=>o.kind==='비-{ok}');
const thrown=res.out.filter(o=>o.kind==='예외발생!');
const uncalled=res.out.filter(o=>o.kind==='미호출(인자 불명)');
const okFns=res.out.filter(o=>o.kind==='{ok}');
console.log('=== 비-{ok} 반환 함수 ==='); nonOk.forEach(o=>console.log('  ',o.key,'→',o.ret));
console.log('개수:',nonOk.length);
console.log('\n=== 예외를 던진 함수 (규약 위반) ===', thrown.length); thrown.forEach(o=>console.log('  ',o.key,o.detail));
console.log('\n=== {ok} 준수 확인 ==='); 
const bad=okFns.filter(o=>!/dataObj=true/.test(o.ret));
console.log('{ok} 함수',okFns.length,'개 중 data 가 객체가 아닌 것:',bad.length); bad.forEach(o=>console.log('  ',o.key,o.ret));
console.log('\n=== 인자 불명으로 미호출 ===',uncalled.length); uncalled.forEach(o=>console.log('  ',o.key));
console.log('\n=== 상수 ===', res.out.filter(o=>o.kind==='상수').map(o=>o.key).join(', '));
console.log('\n=== JR.ui.lock 반환 타입 ===', res.uiLock, '값=', res.uiLockVal);
console.log('=== JR.ui 표면 ===', res.uiSurface.join(', '));
console.log('\n콘솔 에러:', errs.length, errs);
await b.close();
})();
