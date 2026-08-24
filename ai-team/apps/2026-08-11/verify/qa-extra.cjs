/* QA 기능시험 — 보강 사냥 (qa-cycle.cjs 가 다루지 않은 자리)
 * 사용법: node qa-extra.cjs <chromium|firefox|webkit>
 * verify/ 기존 19개는 건드리지 않습니다. 신규 qa-*.cjs 입니다.
 */
(async () => {
const ENG = process.argv[2] || 'chromium';
const pw = require('/opt/node22/lib/node_modules/playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const R=[]; let nPass=0,nFail=0;
const ok=(n,c,d)=>{ if(c)nPass++; else nFail++; R.push((c?'PASS':'FAIL')+' | '+n+(d!==undefined?' | '+d:'')); };
const b = await pw[ENG].launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, acceptDownloads:true });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto(APP); await p.waitForTimeout(500);

/* ═══ A. 비-{ok} 함수 18번째 탐지 — 전 모듈 전 표면 (분배안 §3-1) ═══ */
const nonOk = await p.evaluate(() => {
  const out = [];
  const cats = JR.model.getCategories().data.items;
  const probe = {
    err: { get:['E-101'], slot:['E-101'], format:['E-101',{}] },
    store:{ mode:[], usage:[], keys:[], getRaw:['jr.v1.meta'], getJSON:['jr.v1.meta'], snapshot:[] },
    model:{ isReady:[], today:[], minDate:[], maxDate:[], countChars:['abc'], normName:[' a '], shiftMonth:['2026-08',-1], monthRange:[],
            isNoticeDismissed:['E-201'], getExpenses:[], getCategories:[], getSettings:[], availableMonths:[], listByMonth:['2026-08'],
            countByCategory:[cats[0].id], getExpense:['nope'], getCategory:['nope'] },
    stats:{ allocatePercents:[[1,2]], formatAmount:[1000], invalidate:[], monthTotal:['2026-08'], byCategory:['2026-08'] },
    io:   { canDownload:[], buildExport:[], parseImport:['{}'] },
    ui:   { lock:['save'], unlock:['save'] }
  };
  Object.keys(probe).forEach(mod => {
    Object.keys(probe[mod]).forEach(fn => {
      const args = probe[mod][fn];
      if (typeof JR[mod][fn] !== 'function') return;
      let r; try { r = JR[mod][fn].apply(null, args); } catch (e) { out.push({ mod, fn, kind:'THREW', v:String(e) }); return; }
      const isOk = r && typeof r === 'object' && typeof r.ok === 'boolean';
      if (!isOk) out.push({ mod, fn, kind: (r===undefined?'undefined':Array.isArray(r)?'Array':typeof r) });
    });
  });
  return out;
});
const BASE17 = ['err.get','err.slot','err.format','store.mode','model.isReady','model.today','model.minDate','model.maxDate',
  'model.countChars','model.normName','model.shiftMonth','model.monthRange','model.isNoticeDismissed',
  'stats.allocatePercents','stats.formatAmount','stats.invalidate','ui.lock'];
const found = nonOk.map(x => x.mod+'.'+x.fn);
const extra = found.filter(f => BASE17.indexOf(f) === -1);
const threw = nonOk.filter(x => x.kind === 'THREW');
ok('비-{ok} 함수 — INT-34 정본 17개 명단 밖 신규 0건', extra.length === 0, '측정=' + found.length + '개 ' + JSON.stringify(found) + ' / 명단밖=' + JSON.stringify(extra));
ok('표면 함수 중 예외를 던지는 것 0건', threw.length === 0, JSON.stringify(threw));

/* ═══ B. 날짜 경계 — 0 · -1 · 최대 · 최대+1 (E-107~E-111) ═══ */
const dt = await p.evaluate(() => {
  const c = JR.model.getCategories().data.items[0].id;
  const t = d => { const r = JR.model.validateExpense({date:d, amount:'1000', categoryId:c, memo:''}); return r.ok?'OK':(r.data.errors||[]).map(e=>e.code).join(','); };
  const min = JR.model.minDate(), max = JR.model.maxDate();
  const shift = (s,n)=>{ const d=new Date(s+'T00:00:00'); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  return { min, max, atMin:t(min), belowMin:t(shift(min,-1)), atMax:t(max), aboveMax:t(shift(max,1)),
    empty:t(''), bad:t('2026-8-1'), noSuchDay:t('2026-02-30'), zero:t('0000-00-00'), neg:t('-0001-01-01'),
    huge:t('9999-12-31'),
    fmtNoParam: JR.err.get('E-111').msg,
    fmtParam: JR.err.get('E-111', { max: max }).msg,
    /* 실제 UI 경로: validateExpense 가 내려준 params 가 인라인 문구까지 가는가 */
    uiPath: (function () {
      var r = JR.model.validateExpense({ date: '9999-12-31', amount: '1000', categoryId: c, memo: '' });
      var es = (r.data && r.data.errors) || [];
      var e111 = es.filter(function (x) { return x.code === 'E-111'; })[0] || null;
      JR.ui.showErrors(es);
      return { err: e111, hint: (document.getElementById('jr-date-hint') || {}).textContent || '' };
    })() };
});
ok('날짜 하한 ' + dt.min + ' 통과', dt.atMin === 'OK', dt.atMin);
ok('날짜 하한-1일 거부 E-110', dt.belowMin === 'E-110', dt.belowMin);
ok('날짜 상한 ' + dt.max + ' 통과', dt.atMax === 'OK', dt.atMax);
ok('날짜 상한+1일 거부 E-111', dt.aboveMax === 'E-111', dt.aboveMax);
ok('빈 날짜 거부 E-108', dt.empty === 'E-108', dt.empty);
ok('형식 오류 2026-8-1 거부 E-107', dt.bad === 'E-107', dt.bad);
ok('달력에 없는 2026-02-30 거부 E-109', dt.noSuchDay === 'E-109', dt.noSuchDay);
ok('0000-00-00 거부', dt.zero !== 'OK', dt.zero);
ok('-0001-01-01 거부', dt.neg !== 'OK', dt.neg);
ok('9999-12-31 거부 E-111', dt.huge === 'E-111', dt.huge);
ok('E-111 params 없이 err.get — 빈 치환 자리(공백)로 나감', dt.fmtNoParam.indexOf('{max}') === -1, 'params없이="' + dt.fmtNoParam.slice(0,45) + '"');
ok('E-111 params 전달 시 {max} 치환됨', dt.fmtParam.indexOf(dt.max) !== -1, '"' + dt.fmtParam.slice(0,45) + '"');
ok('E-111 검증 결과가 params.max 를 함께 내려줌 (INT-36 대상 6코드 중 하나)',
  !!(dt.uiPath.err && dt.uiPath.err.params && dt.uiPath.err.params.max), JSON.stringify(dt.uiPath.err));
ok('E-111 인라인 문구에 날짜가 실제로 채워짐(빈 자리 없음)',
  dt.uiPath.hint.indexOf(dt.max) !== -1, 'hint="' + dt.uiPath.hint.slice(0,60) + '"');

/* ═══ C. 메모 경계 150/151자 (분배안 요구) + 전각·이모지·유니코드 ═══ */
const CTRL = String.fromCharCode(7);
const mm = await p.evaluate((CTRL) => {
  const c = JR.model.getCategories().data.items[0].id, d = JR.model.today();
  const t = m => { const r = JR.model.validateExpense({date:d, amount:'1000', categoryId:c, memo:m}); return r.ok?'OK':(r.data.errors||[]).map(e=>e.code).join(','); };
  const val = m => { const r = JR.model.validateExpense({date:d, amount:'1000', categoryId:c, memo:m}); return r.ok ? r.data.value.memo : null; };
  return { c150: t('가'.repeat(150)), c151: t('가'.repeat(151)),
    zwj: t('\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}'.repeat(20)),
    zwjCount: JR.model.countChars('\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}'.repeat(20)),
    full: t('ａｂｃ１２３'), rtl: t('مرحبا'),
    ctrl: t('a' + CTRL + 'bc'), ctrlVal: val('a' + CTRL + 'bc'),
    combining: t('é'.repeat(60)), surrogate: t('\uD800'), ws: t('   ') };
}, CTRL);
ok('메모 150자 거부(정본 상한 100)', mm.c150 !== 'OK', mm.c150);
ok('메모 151자 거부(정본 상한 100)', mm.c151 !== 'OK', mm.c151);
ok('메모 ZWJ 가족 이모지 20세트 — countChars 계수 후 판정', typeof mm.zwj === 'string', 'countChars=' + mm.zwjCount + ' 판정=' + mm.zwj);
ok('메모 전각문자 ａｂｃ１２３ 통과', mm.full === 'OK', mm.full);
ok('메모 RTL 아랍문자 통과', mm.rtl === 'OK', mm.rtl);
ok('메모 제어문자(U+0007) — 예외 없이 처리', typeof mm.ctrl === 'string', mm.ctrl);
ok('메모 제어문자 제거됨', mm.ctrlVal !== null && mm.ctrlVal.indexOf(CTRL) === -1, JSON.stringify(mm.ctrlVal));
ok('메모 결합문자 120코드유닛 처리', typeof mm.combining === 'string', mm.combining);
ok('메모 고립 서로게이트 처리', typeof mm.surrogate === 'string', mm.surrogate);
ok('메모 공백만 — 예외 없이 처리', typeof mm.ws === 'string', mm.ws);

/* ═══ D. F-04 정렬 규칙 — 날짜 desc · 동일 날짜는 createdAt desc ═══ */
const sortRes = await p.evaluate(() => {
  const c = JR.model.getCategories().data.items[0].id;
  const mk = (date, ms) => ({ id:'e_s'+date.replace(/-/g,'')+'_'+ms, date:date, amount:1000+ms, categoryId:c, memo:'s'+ms, createdAt: ms });
  JR.store.setJSON('jr.v1.expenses', [ mk('2026-08-10',300), mk('2026-08-12',100), mk('2026-08-10',500), mk('2026-08-11',900), mk('2026-08-10',100) ]);
  JR.model.init();
  return JR.model.listByMonth('2026-08').data.items.map(x => x.date + '#' + x.createdAt);
});
ok('F-04 정렬 = 날짜 내림차 + 동일날짜 createdAt 내림차',
  JSON.stringify(sortRes) === JSON.stringify(['2026-08-12#100','2026-08-11#900','2026-08-10#500','2026-08-10#300','2026-08-10#100']),
  JSON.stringify(sortRes));

/* ═══ E. 월 이동 상하한 클램프 ═══ */
await p.evaluate(()=>{try{localStorage.clear();}catch(e){}}); await p.reload(); await p.waitForTimeout(400);
for (const which of ['min','max']) {
  const st = await p.evaluate(async (w) => {
    const range = JR.model.monthRange();
    JR.model.setSelectedMonth(range[w]);
    document.querySelector('#jr-tabbar button:nth-of-type(2)').click();
    await new Promise(r=>setTimeout(r,80));
    const s03 = { prev: document.getElementById('jr-s03-prev').disabled, next: document.getElementById('jr-s03-next').disabled };
    document.querySelector('#jr-tabbar button:nth-of-type(1)').click();
    await new Promise(r=>setTimeout(r,80));
    return { month: document.getElementById('jr-s01-month').textContent.trim(),
      prev: document.getElementById('jr-s01-prev').disabled, next: document.getElementById('jr-s01-next').disabled, s03, range };
  }, which);
  ok('월 ' + which + '(' + st.range[which] + ') 에서 S-01 ' + (which==='min'?'이전':'다음') + ' 버튼 비활성',
    which==='min' ? st.prev===true : st.next===true, JSON.stringify(st));
  ok('월 ' + which + ' 에서 S-03 도 같은 비활성', which==='min' ? st.s03.prev===true : st.s03.next===true, JSON.stringify(st.s03));
}
const clamp = await p.evaluate(async () => {
  const range = JR.model.monthRange(); JR.model.setSelectedMonth(range.min);
  document.querySelector('#jr-tabbar button:nth-of-type(1)').click(); await new Promise(r=>setTimeout(r,80));
  for (let i=0;i<20;i++) document.getElementById('jr-s01-prev').click();
  await new Promise(r=>setTimeout(r,120));
  return { m: JR.model.getSettings().data.settings.selectedMonth, min: range.min };
});
ok('월 하한에서 이전 20연타 — 하한 아래로 내려가지 않음', clamp.m === clamp.min, JSON.stringify(clamp));
const clampMax = await p.evaluate(async () => {
  const range = JR.model.monthRange(); JR.model.setSelectedMonth(range.max);
  document.querySelector('#jr-tabbar button:nth-of-type(1)').click(); await new Promise(r=>setTimeout(r,80));
  for (let i=0;i<20;i++) document.getElementById('jr-s01-next').click();
  await new Promise(r=>setTimeout(r,120));
  return { m: JR.model.getSettings().data.settings.selectedMonth, max: range.max };
});
ok('월 상한에서 다음 20연타 — 상한 위로 올라가지 않음', clampMax.m === clampMax.max, JSON.stringify(clampMax));

/* ═══ F. 카테고리 삭제 후 그 카테고리를 쓰던 기록 ═══ */
await p.evaluate(()=>{try{localStorage.clear();}catch(e){}}); await p.reload(); await p.waitForTimeout(400);
const delCat = await p.evaluate(async () => {
  const target = JR.model.getCategories().data.items[0];
  const add = JR.model.addExpense({ date: JR.model.today(), amount:'5000', categoryId: target.id, memo:'삭제될분류' });
  const cnt = JR.model.countByCategory(target.id);
  const del = JR.model.deleteCategory(target.id);
  await new Promise(r=>setTimeout(r,120));
  const items = JR.model.listByMonth(JR.model.today().slice(0,7)).data.items;
  const rows = Array.from(document.querySelectorAll('#jr-s01-list .jr-expense-row')).map(r=>r.textContent.replace(/\s+/g,' ').trim());
  document.querySelector('#jr-tabbar button:nth-of-type(2)').click();
  await new Promise(r=>setTimeout(r,120));
  const bc = JR.stats.byCategory(JR.model.today().slice(0,7));
  const statRows = Array.from(document.querySelectorAll('#jr-s03-list .jr-stat-row')).map(r=>({t:r.textContent.replace(/\s+/g,' ').trim(), del:r.className.indexOf('deleted')!==-1}));
  return { addOk:add.ok, cnt: cnt.ok?cnt.data.count:JSON.stringify(cnt), delOk:del.ok, delCode:del.code, n:items.length,
    rows, statRows, bcItems:((bc.data&&bc.data.items)||[]).map(i=>({n:i.categoryName,d:!!i.isDeletedCategory})) };
});
ok('카테고리 삭제 전 사용 건수 집계', delCat.cnt === 1, 'count=' + delCat.cnt);
ok('사용 중인 카테고리도 삭제 가능', delCat.delOk === true, JSON.stringify({ok:delCat.delOk,code:delCat.delCode}));
ok('삭제된 카테고리의 기록이 사라지지 않음(데이터 보존)', delCat.n === 1, 'n=' + delCat.n);
ok('S-01 행이 그대로 렌더됨', delCat.rows.length === 1 && delCat.rows[0].length > 0, JSON.stringify(delCat.rows));
ok('S-03 통계에 삭제된 카테고리 행 표시(isDeletedCategory)', delCat.bcItems.some(i=>i.d===true), JSON.stringify(delCat.bcItems));
ok('S-03 삭제 카테고리 행에 구분 클래스', delCat.statRows.some(r=>r.del===true), JSON.stringify(delCat.statRows));
const e113 = await p.evaluate(() => {
  const r = JR.model.addExpense({ date: JR.model.today(), amount:'1000', categoryId:'cat_gone_'+Date.now(), memo:'' });
  return { ok:r.ok, code:r.code, errs:((r.data&&r.data.errors)||[]).map(e=>e.code) };
});
ok('없는 카테고리로 저장 → E-112/E-113 계열 거부', e113.ok===false && (e113.errs.indexOf('E-113')!==-1 || e113.errs.indexOf('E-112')!==-1), JSON.stringify(e113));

/* ═══ G. 새로고침 「중」 상태 — 부팅 완료 전 연타 ═══ */
{
  const p2 = await ctx.newPage();
  const e2=[]; p2.on('pageerror',e=>e2.push(''+e)); p2.on('console',m=>{if(m.type()==='error')e2.push(m.text());});
  await p2.goto(APP, { waitUntil: 'domcontentloaded' });
  let clicked = 0;
  for (let i=0;i<12;i++){
    try { clicked += await p2.evaluate(()=>{ const t=document.getElementById('jr-tabbar'); if(t){const bb=t.querySelector('button'); if(bb){bb.click(); return 1;}} const a=document.getElementById('jr-s01-add'); if(a){a.click(); return 1;} return 0; }); } catch(e){}
  }
  await p2.waitForTimeout(900);
  const st = await p2.evaluate(()=>({ ready: !!(window.JR && JR.model.isReady()), screen: document.body.getAttribute('data-screen'),
    visible: Array.from(document.querySelectorAll('.jr-main')).filter(m=>!m.hidden).length,
    n: (window.JR ? JR.model.getExpenses().data.items.length : -1) }));
  ok('부팅 중 연타(도달 ' + clicked + '회) 후 앱 정상 기동 · 첫 화면 S-01', st.ready === true && st.screen === 's01', JSON.stringify(st));
  ok('부팅 중 연타 후 화면 1개만 표시', st.visible === 1, 'visible=' + st.visible);
  ok('부팅 중 연타 콘솔 에러 0', e2.length === 0, JSON.stringify(e2.slice(0,3)));
  await p2.close();
}

/* ═══ H. 백그라운드 전환 · 중복 탭 (INT-38) ═══ */
await p.evaluate(()=>{try{localStorage.clear();}catch(e){}}); await p.reload(); await p.waitForTimeout(400);
{
  const pb = await ctx.newPage();
  await pb.goto(APP); await pb.waitForTimeout(500);
  /* 실제 사용자 순서: 탭B 가 먼저 가려지고(onHidden 이 기준점 기록) → 탭A 가 쓰고 → 탭B 로 복귀 */
  await pb.evaluate(() => { Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
  await pb.waitForTimeout(150);
  await p.evaluate(() => { for (let i=0;i<3;i++) JR.model.addExpense({ date: JR.model.today(), amount:String(1000+i), categoryId: JR.model.getCategories().data.items[0].id, memo:'탭A'+i }); });
  await p.waitForTimeout(250);
  const bBefore = await pb.evaluate(()=>({ dom: document.querySelectorAll('#jr-s01-list .jr-expense-row').length, store: JSON.parse(localStorage.getItem('jr.v1.expenses')||'[]').length }));
  ok('중복 탭 — 탭A 저장분이 저장소에 3건', bBefore.store === 3, JSON.stringify(bBefore));
  await pb.evaluate(() => { Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'}); document.dispatchEvent(new Event('visibilitychange')); });
  await pb.waitForTimeout(500);
  const bAfter = await pb.evaluate(()=>({ dom: document.querySelectorAll('#jr-s01-list .jr-expense-row').length,
    model: JR.model.getExpenses().data.items.length,
    total: (document.getElementById('jr-s01-total')||{textContent:''}).textContent.trim(),
    toast: (document.getElementById('jr-toast')||{textContent:''}).textContent.trim() }));
  ok('중복 탭 — 복귀 시 model 재로드됨', bAfter.model === 3, JSON.stringify(bAfter));
  ok('중복 탭 — 복귀 시 화면(DOM)도 재렌더됨 (INT-38)', bAfter.dom === bAfter.model, 'DOM=' + bAfter.dom + ' model=' + bAfter.model + ' 총합="' + bAfter.total + '" toast="' + bAfter.toast + '"');
  await pb.close();
}

/* ═══ I. 저장소 차단(메모리 모드) 상태에서 전 기능 흐름 ═══ */
{
  const c3 = await b.newContext({ viewport:{width:390,height:844} });
  const p3 = await c3.newPage();
  const e3=[]; p3.on('pageerror',e=>e3.push(''+e)); p3.on('console',m=>{if(m.type()==='error')e3.push(m.text());});
  await p3.addInitScript(() => { try { Object.defineProperty(window,'localStorage',{ get(){ throw new Error('blocked'); } }); } catch(e){} });
  await p3.goto(APP); await p3.waitForTimeout(700);
  const flow = await p3.evaluate(async () => {
    const out = { mode: JR.store.mode(), ready: JR.model.isReady() };
    const c = JR.model.getCategories().data.items;
    out.cats = c.length;
    out.add = JR.model.addExpense({ date: JR.model.today(), amount:'3300', categoryId:c[0].id, memo:'메모리모드' }).ok;
    out.n = JR.model.getExpenses().data.items.length;
    out.catAdd = JR.model.addCategory('메모리분류').ok;
    out.stats = JR.stats.byCategory(JR.model.today().slice(0,7)).ok;
    out.export = JR.io.buildExport().ok;
    document.querySelector('#jr-tabbar button:nth-of-type(2)').click(); await new Promise(r=>setTimeout(r,100));
    out.s03rows = document.querySelectorAll('#jr-s03-list .jr-stat-row').length;
    document.querySelector('#jr-tabbar button:nth-of-type(3)').click(); await new Promise(r=>setTimeout(r,100));
    out.s04rows = document.querySelectorAll('#jr-s04-cat-list [data-act]').length;
    document.querySelector('#jr-tabbar button:nth-of-type(1)').click(); await new Promise(r=>setTimeout(r,100));
    out.s01rows = document.querySelectorAll('#jr-s01-list .jr-expense-row').length;
    out.banners = Array.from(document.querySelectorAll('.jr-banner .jr-banner__text')).map(x=>x.textContent.trim());
    return out;
  });
  ok('메모리 모드 — 기동 + 기본 카테고리 8종', flow.mode==='memory' && flow.ready===true && flow.cats===8, JSON.stringify({m:flow.mode,r:flow.ready,c:flow.cats}));
  ok('메모리 모드 — 지출 저장·조회', flow.add===true && flow.n===1, JSON.stringify({add:flow.add,n:flow.n}));
  ok('메모리 모드 — 카테고리 추가', flow.catAdd===true, String(flow.catAdd));
  ok('메모리 모드 — 통계·내보내기 동작', flow.stats===true && flow.export===true, JSON.stringify({s:flow.stats,e:flow.export}));
  ok('메모리 모드 — S-01/S-03/S-04 렌더', flow.s01rows===1 && flow.s03rows>=1 && flow.s04rows>=1, JSON.stringify({s01:flow.s01rows,s03:flow.s03rows,s04:flow.s04rows}));
  ok('메모리 모드 — E-201 배너 상시 노출', flow.banners.some(t=>/저장 기능이 꺼져 있어/.test(t)), JSON.stringify(flow.banners).slice(0,110));
  ok('메모리 모드 — 콘솔 에러 0', e3.length===0, JSON.stringify(e3.slice(0,3)));
  await c3.close();
}

/* ═══ J. INT-39 — 내보내기 대체 영역 소멸 ═══ */
await p.evaluate(()=>{try{localStorage.clear();}catch(e){}}); await p.reload(); await p.waitForTimeout(400);
const int39 = await p.evaluate(async () => {
  JR.model.addExpense({ date: JR.model.today(), amount:'9999', categoryId: JR.model.getCategories().data.items[0].id, memo:'비밀지출메모' });
  document.querySelector('#jr-tabbar button:nth-of-type(3)').click(); await new Promise(r=>setTimeout(r,120));
  document.getElementById('jr-s04-export').click(); await new Promise(r=>setTimeout(r,400));
  const fb = document.getElementById('jr-export-fallback');
  const ta = document.getElementById('jr-export-text');
  const shown = { hidden: fb.hidden, len: (ta.value||'').length, hasSecret: (ta.value||'').indexOf('비밀지출메모') !== -1 };
  const steps = [];
  for (const n of [1,2,3,1,3]) {
    document.querySelector('#jr-tabbar button:nth-of-type(' + n + ')').click(); await new Promise(r=>setTimeout(r,100));
    steps.push({ screen: document.body.getAttribute('data-screen'), fbHidden: fb.hidden, secretLen: (ta.value||'').length, secret: (ta.value||'').indexOf('비밀지출메모')!==-1 });
  }
  return { shown, steps };
});
ok('INT-10 — 내보내기 누르면 대체 영역 노출', int39.shown.hidden===false && int39.shown.hasSecret===true, JSON.stringify(int39.shown));
ok('INT-10/39 — S-04 를 벗어나면 대체 영역이 사라져야 함',
  int39.steps.filter(s=>s.screen!=='s04').every(s=>s.fbHidden===true), JSON.stringify(int39.steps));
ok('INT-39 — 다른 화면에서 전체 JSON 이 DOM 에 남지 않아야 함',
  int39.steps.filter(s=>s.screen!=='s04').every(s=>s.secret===false),
  JSON.stringify(int39.steps.map(s=>s.screen+':JSON잔존='+s.secret)));

/* ═══ K. 실제 마우스 연타 (JS click 아님) ═══ */
await p.evaluate(()=>{try{localStorage.clear();}catch(e){}}); await p.reload(); await p.waitForTimeout(400);
await p.click('#jr-s01-add'); await p.waitForTimeout(250);
await p.fill('#jr-amount','7700'); await p.click('#jr-cat-group button:nth-of-type(1)'); await p.waitForTimeout(200);
const box = await p.locator('#jr-s02-save').boundingBox();
if (box) { await p.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await p.mouse.click(box.x+box.width/2, box.y+box.height/2, { clickCount: 3, delay: 8 }).catch(()=>{}); }
await p.waitForTimeout(600);
const nAfterTriple = await p.evaluate(()=>JR.model.getExpenses().data.items.length);
ok('저장 버튼 실제 마우스 3연타 → 1건만 저장', nAfterTriple === 1, 'n=' + nAfterTriple);
for (let i=0;i<40;i++){ await p.evaluate(n=>{ const bb=document.querySelectorAll('#jr-tabbar button')[n]; if(bb) bb.click(); }, i%3); }
await p.waitForTimeout(500);
const after40 = await p.evaluate(()=>({ v: Array.from(document.querySelectorAll('.jr-main')).filter(m=>!m.hidden).length, s: document.body.getAttribute('data-screen'), r: JR.model.isReady(), n: JR.model.getExpenses().data.items.length }));
ok('탭 40연타 후 화면 1개 · 앱 정상 · 데이터 불변', after40.v===1 && after40.r===true && after40.n===1, JSON.stringify(after40));

/* ═══ L. 전체 삭제 2단계 — 취소 경로 전건 ═══ */
const wipe = await p.evaluate(async () => {
  const out = {};
  const click = async (sel) => { const e=document.querySelector(sel); if(e){e.click();} await new Promise(r=>setTimeout(r,160)); };
  await click('#jr-tabbar button:nth-of-type(3)');
  out.before = JR.model.getExpenses().data.items.length;
  await click('#jr-s04-wipe');
  out.dlg1 = document.querySelectorAll('#jr-dialog-overlay').length;
  out.dlg1txt = ((document.querySelector('#jr-dialog-overlay')||{}).textContent||'').replace(/\s+/g,' ').trim().slice(0,90);
  out.needEsc = true;
  return out;
});
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
const wipe2 = await p.evaluate(async () => {
  const out = {};
  const click = async (sel) => { const e=document.querySelector(sel); if(e){e.click();} await new Promise(r=>setTimeout(r,160)); };
  out.afterEsc = { dlg: document.querySelectorAll('#jr-dialog-overlay').length, n: JR.model.getExpenses().data.items.length };
  await click('#jr-s04-wipe');
  const btns1 = Array.from(document.querySelectorAll('#jr-dialog-overlay button'));
  out.btns1 = btns1.map(b=>b.textContent.trim());
  const confirm1 = btns1.filter(b=>/삭제|확인|계속/.test(b.textContent)).pop();
  if (confirm1) { confirm1.click(); await new Promise(r=>setTimeout(r,220)); }
  out.dlg2 = document.querySelectorAll('#jr-dialog-overlay').length;
  out.dlg2txt = ((document.querySelector('#jr-dialog-overlay')||{}).textContent||'').replace(/\s+/g,' ').trim().slice(0,90);
  out.afterStage1 = JR.model.getExpenses().data.items.length;
  const btns2 = Array.from(document.querySelectorAll('#jr-dialog-overlay button'));
  const cancel2 = btns2.filter(b=>/취소|아니/.test(b.textContent))[0];
  if (cancel2) { cancel2.click(); await new Promise(r=>setTimeout(r,220)); }
  out.afterCancel2 = { dlg: document.querySelectorAll('#jr-dialog-overlay').length, n: JR.model.getExpenses().data.items.length, cats: JR.model.getCategories().data.items.length };
  return out;
});
ok('F-09 1단계 대화상자 노출', wipe.dlg1 === 1, JSON.stringify({n:wipe.dlg1, t:wipe.dlg1txt}));
ok('F-09 1단계 Escape(실제 키) 취소 — 대화상자 닫힘 + 데이터 보존', wipe2.afterEsc.dlg===0 && wipe2.afterEsc.n===wipe.before, JSON.stringify(wipe2.afterEsc) + ' before=' + wipe.before);
ok('F-09 2단계 대화상자 노출 + 1단계만으로는 삭제 안 됨', wipe2.dlg2===1 && wipe2.afterStage1===wipe.before, JSON.stringify({dlg2:wipe2.dlg2, n:wipe2.afterStage1, t:wipe2.dlg2txt}));
ok('F-09 2단계 취소 — 데이터·카테고리 보존', wipe2.afterCancel2.n===wipe.before && wipe2.afterCancel2.cats>=8, JSON.stringify(wipe2.afterCancel2));

/* ═══ M. 초안 24시간 경계 — 23시간59분 / 24시간1분 ═══ */
for (const cse of [['23시간59분', (23*60+59)*60*1000, true], ['24시간1분', (24*60+1)*60*1000, false]]) {
  const label = cse[0], ageMs = cse[1], shouldRestore = cse[2];
  const c4 = await b.newContext({ viewport:{width:390,height:844} });
  const p4 = await c4.newPage();
  const e4=[]; p4.on('pageerror',e=>e4.push(''+e)); p4.on('console',m=>{if(m.type()==='error')e4.push(m.text());});
  await p4.goto(APP); await p4.waitForTimeout(600);
  const prep = await p4.evaluate(async (age) => {
    document.getElementById('jr-s01-add').click(); await new Promise(r=>setTimeout(r,200));
    const a = document.getElementById('jr-amount'); a.value='8800'; a.dispatchEvent(new Event('input',{bubbles:true}));
    const m = document.getElementById('jr-memo'); m.value='초안경계'; m.dispatchEvent(new Event('input',{bubbles:true}));
    const chip = document.querySelector('#jr-cat-group button'); if (chip) chip.click();
    await new Promise(r=>setTimeout(r,600));
    const raw = localStorage.getItem('jr.v1.draft');
    if (!raw) return { saved:false };
    return { saved:true, keys:Object.keys(JSON.parse(raw)) };
  }, ageMs);
  ok('초안 ' + label + ' — 준비: 초안 저장됨', prep.saved === true, JSON.stringify(prep));
  await p4.reload(); await p4.waitForTimeout(600);
  /* pagehide 핸들러가 새로고침 직전 초안을 새 savedAt 으로 다시 저장하므로,
     노후화는 반드시 「새로고침 이후」에 심어야 TTL 경로를 시험할 수 있습니다. */
  const aged = await p4.evaluate((age) => {
    const raw = localStorage.getItem('jr.v1.draft');
    if (!raw) return { aged:false };
    const o = JSON.parse(raw); o.savedAt = Date.now() - age;
    localStorage.setItem('jr.v1.draft', JSON.stringify(o));
    return { aged:true, savedAt:o.savedAt, now:Date.now(), diffMs: Date.now()-o.savedAt };
  }, ageMs);
  ok('초안 ' + label + ' — 준비: savedAt 노후화 완료', aged.aged===true, JSON.stringify(aged));
  const rest = await p4.evaluate(async () => {
    document.getElementById('jr-s01-add').click(); await new Promise(r=>setTimeout(r,400));
    return { amt: document.getElementById('jr-amount').value, memo: document.getElementById('jr-memo').value,
      toast: ((document.getElementById('jr-toast')||{}).textContent||'').trim(),
      draftLeft: localStorage.getItem('jr.v1.draft') !== null };
  });
  const restored = rest.memo === '초안경계';
  ok('초안 ' + label + ' 경과 → ' + (shouldRestore ? '복원되어야 함' : '폐기되어야 함'), restored === shouldRestore,
    'amt="' + rest.amt + '" memo="' + rest.memo + '" toast="' + rest.toast + '"');
  if (shouldRestore) ok('초안 24시간 이내 — E-602 문구', /다시 불러왔습니다/.test(rest.toast), 'toast="' + rest.toast + '"');
  else ok('초안 24시간 초과 — E-603 문구', /하루가 지나|지워졌습니다/.test(rest.toast), 'toast="' + rest.toast + '"');
  ok('초안 ' + label + ' 콘솔 에러 0', e4.length===0, JSON.stringify(e4.slice(0,2)));
  await c4.close();
}

/* ═══ N. 마감 ═══ */
ok('보강 시험 전체 콘솔 에러 0건', errs.length===0, errs.length?JSON.stringify(errs.slice(0,4)):'0');

console.log('===== 보강 사냥 · ' + ENG + ' · ' + new Date().toISOString() + ' =====');
R.forEach(r=>console.log(r));
console.log('---- PASS ' + nPass + ' / FAIL ' + nFail + ' ----');
if(nFail){ console.log('실패 항목:'); R.filter(x=>x.indexOf('FAIL')===0).forEach(x=>console.log('  '+x)); }
await b.close();
})();
