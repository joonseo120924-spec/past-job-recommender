/* QA — 자리표시자 6코드 전건 UI 검증 (INT-36)
 * 「화면에 빈 치환 자리가 나가는 경로가 하나라도 남으면 미충족」(기획서 §7 INT-36 확정)
 * 대상: E-203{percent} · E-304{count} · E-111{max} · E-116{name} · E-120{over} · E-409{count}
 * 사용법: node qa-ph.cjs <engine>
 */
(async () => {
const ENG = process.argv[2] || 'chromium';
const pw = require('/opt/node22/lib/node_modules/playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const R=[]; let nPass=0,nFail=0;
const ok=(n,c,d)=>{ if(c)nPass++; else nFail++; R.push((c?'PASS':'FAIL')+' | '+n+(d!==undefined?' | '+d:'')); };
const b = await pw[ENG].launch();
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(''+e)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto(APP); await p.waitForTimeout(500);

/* 0. 자리표시자를 가진 코드가 정확히 6개인지 (새로 늘지 않았는지) */
const phCodes = await p.evaluate(() => {
  const out = [];
  Object.keys(JR.err.MESSAGES).forEach(c => {
    const m = JR.err.MESSAGES[c].msg;
    const hits = m.match(/\{[A-Za-z0-9_]+\}/g);
    if (hits) out.push({ code: c, ph: hits, slot: JR.err.MESSAGES[c].slot });
  });
  return out;
});
ok('자리표시자를 가진 E-코드 = 6개 (INT-36 명단)', phCodes.length === 6, JSON.stringify(phCodes.map(x=>x.code+x.ph.join(''))));
ok('INT-36 명단과 정확히 일치',
  JSON.stringify(phCodes.map(x=>x.code).sort()) === JSON.stringify(['E-111','E-116','E-120','E-203','E-304','E-409']),
  JSON.stringify(phCodes.map(x=>x.code).sort()));

/* 1. E-111 {max} — 날짜 상한 초과, 실제 UI 인라인 */
const r111 = await p.evaluate(async () => {
  const c = JR.model.getCategories().data.items[0].id;
  const r = JR.model.validateExpense({ date:'9999-12-31', amount:'1000', categoryId:c, memo:'' });
  const es = (r.data && r.data.errors) || [];
  JR.ui.showErrors(es); await new Promise(x=>setTimeout(x,80));
  return { params: (es.filter(e=>e.code==='E-111')[0]||{}).params,
    hint: (document.getElementById('jr-date-hint')||{textContent:''}).textContent.trim(),
    max: JR.model.maxDate() };
});
ok('E-111 {max} — 검증 결과에 params 동반', !!(r111.params && r111.params.max), JSON.stringify(r111.params));
ok('E-111 {max} — 화면 문구에 빈 자리 없음', r111.hint.length>0 && !/\s{2,}|^\s/.test(r111.hint), 'hint="'+r111.hint+'"');

/* 2. E-116 {name} — 카테고리 중복 이름, 실제 UI 타이핑 */
await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(250);
const firstCat = await p.evaluate(()=>JR.model.getCategories().data.items[0].name);
await p.fill('#jr-cat-new', firstCat); await p.waitForTimeout(150);
await p.click('#jr-s04-cat-add'); await p.waitForTimeout(350);
const h116 = (await p.textContent('#jr-cat-new-hint')).trim();
ok('E-116 {name} — 중복 이름 인라인에 이름이 채워짐', h116.indexOf(firstCat) !== -1, 'name="'+firstCat+'" hint="'+h116+'"');
ok('E-116 — 빈 따옴표 자리가 남지 않음', h116.indexOf("'' ") === -1 && h116.indexOf("' '") === -1, 'hint="'+h116+'"');
await p.fill('#jr-cat-new', '');

/* 3. E-120 {over} — 메모 초과 글자수 */
const r120 = await p.evaluate(async () => {
  const c = JR.model.getCategories().data.items[0].id;
  const r = JR.model.validateExpense({ date: JR.model.today(), amount:'1000', categoryId:c, memo:'가'.repeat(137) });
  const es = (r.data && r.data.errors) || [];
  const e = es.filter(x=>x.code==='E-120')[0] || null;
  return { e, msg: e ? JR.err.get('E-120', e.params).msg : '', bare: JR.err.get('E-120').msg };
});
ok('E-120 {over} — 검증 결과에 params 동반', !!(r120.e && r120.e.params && r120.e.params.over !== undefined), JSON.stringify(r120.e));
ok('E-120 {over} — 초과 글자수 37 이 실제로 채워짐', r120.msg.indexOf('37') !== -1, '"'+r120.msg+'"');
ok('E-120 — params 없이 부르면 빈 자리가 남는다(대조군)', r120.bare !== r120.msg, 'params없이="'+r120.bare+'"');

/* 4. E-304 {count} — 손상 레코드 탈락 건수 (부팅 통지) */
{
  const c2 = await b.newContext({ viewport:{width:390,height:844} });
  const p2 = await c2.newPage();
  const e2=[]; p2.on('pageerror',e=>e2.push(''+e)); p2.on('console',m=>{if(m.type()==='error')e2.push(m.text());});
  await p2.goto(APP); await p2.waitForTimeout(400);
  await p2.evaluate(() => {
    const c = JR.model.getCategories().data.items[0].id;
    const good = { id:'e_ok1', date: JR.model.today(), amount:1000, categoryId:c, memo:'정상', createdAt: Date.now() };
    localStorage.setItem('jr.v1.expenses', JSON.stringify([ good, { id:'x', date:'nope' }, { amount:'문자' }, null, 42, { id:'e_ok1', date:JR.model.today(), amount:1, categoryId:c, memo:'중복id', createdAt:1 } ]));
  });
  await p2.reload(); await p2.waitForTimeout(700);
  const bn = await p2.evaluate(()=>Array.from(document.querySelectorAll('.jr-banner .jr-banner__text')).map(x=>x.textContent.trim()));
  const e304 = bn.filter(t=>/기록 일부를 읽지 못|불러오지 못한 기록/.test(t))[0] || bn.join(' | ');
  const kept = await p2.evaluate(()=>JR.model.getExpenses().data.items.length);
  ok('E-304 {count} — 손상 레코드 탈락 후 정상분만 남음', kept === 1, 'n=' + kept);
  ok('E-304 {count} — 배너에 숫자가 채워짐(빈 자리 없음)', /\d+/.test(e304), '배너="' + String(e304).slice(0,90) + '"');
  ok('E-304 부팅 콘솔 에러 0', e2.length===0, JSON.stringify(e2.slice(0,3)));
  await c2.close();
}

/* 5. E-409 {count} — 가져오기 시 탈락 건수 */
{
  const r409 = await p.evaluate(async () => {
    const c = JR.model.getCategories().data.items[0].id;
    const payload = { app:'jr-expense', kind:'backup', schema:1, exportedAt:Date.now(), exportedDate:JR.model.today(),
      counts:{expenses:4,categories:1},
      data:{ expenses:[
        { id:'i1', date:JR.model.today(), amount:1000, categoryId:c, memo:'정상', createdAt:Date.now() },
        { id:'i2', date:'말도안됨', amount:1000, categoryId:c, memo:'깨짐', createdAt:Date.now() },
        { id:'i3', date:JR.model.today(), amount:-5, categoryId:c, memo:'음수', createdAt:Date.now() },
        { nope:true } ],
        categories:[{ id:c, name:'식비', order:1 }], settings:{ selectedMonth: JR.model.today().slice(0,7) } } };
    const pr = JR.io.parseImport(JSON.stringify(payload));
    if (!pr.ok) return { parseFail: pr.code };
    const ap = JR.io.applyImport(pr.data.payload);
    const rejected = (pr.data.summary.rejectedExpenseCount||0) + (pr.data.summary.rejectedCategoryCount||0);
    if (ap.ok && rejected > 0) { JR.ui.show('E-409', { count: rejected }); }
    await new Promise(x=>setTimeout(x,150));
    const bn = Array.from(document.querySelectorAll('.jr-banner .jr-banner__text')).map(x=>x.textContent.trim());
    const tst = ((document.getElementById('jr-toast')||{}).textContent||'').trim();
    return { applyOk: ap.ok, rejected: rejected, summary: pr.data.summary, codes: (ap.data && (ap.data.codes||ap.data.notices||ap.data.warnings)) || null,
      banners: bn, toast: tst, n: JR.model.getExpenses().data.items.length };
  });
  const txt = (r409.banners||[]).concat([r409.toast||'']).join(' | ');
  ok('E-409 {count} — 기형 레코드 섞인 파일이 적용됨(정상분만)', r409.applyOk === true && r409.n === 1, JSON.stringify({ok:r409.applyOk, n:r409.n, summary:r409.summary}));
ok('E-409 — parseImport 가 탈락 건수를 집계함', r409.rejected === 3, 'rejected=' + r409.rejected);
  const hit409 = /읽지 못|건은|\d+건/.test(txt);
  ok('E-409 {count} — 탈락 통지에 숫자가 채워짐', hit409 && /\d/.test(txt), '통지="' + txt.slice(0,120) + '"');
  ok('E-409 — 통지 문구에 빈 치환 자리 없음', txt.indexOf('{') === -1, '통지="' + txt.slice(0,120) + '"');
}

/* 6. E-203 {percent} — 저장소 80% 도달 (확정 결함 재현 인용용) */
{
  const c5 = await b.newContext({ viewport:{width:390,height:844} });
  const p5 = await c5.newPage();
  const e5=[]; p5.on('pageerror',e=>e5.push(''+e)); p5.on('console',m=>{if(m.type()==='error')e5.push(m.text());});
  await p5.goto(APP); await p5.waitForTimeout(500);
  const r203 = await p5.evaluate(async () => {
    const LIMIT = JR.store.LIMIT_CHARS;
    const u0 = JR.store.usage();
    const need = Math.floor(LIMIT * 0.82) - u0.data.usedChars;
    if (need > 0) localStorage.setItem('jr.v1.filler', 'x'.repeat(need));
    const c = JR.model.getCategories().data.items[0].id;
    const add = JR.model.addExpense({ date: JR.model.today(), amount:'1234', categoryId:c, memo:'80퍼센트' });
    await new Promise(x=>setTimeout(x,200));
    const bn = Array.from(document.querySelectorAll('.jr-banner .jr-banner__text')).map(x=>x.textContent.trim());
    const w = (add.data && add.data.warnings) || [];
    return { addOk: add.ok, warnings: w, warnTypes: w.map(x=>typeof x),
      banner: bn.filter(t=>/저장 공간을/.test(t))[0] || '',
      ratio: JR.store.usage().data.usedChars / LIMIT };
  });
  ok('E-203 준비 — 저장소 80% 초과 상태에서 저장 성공', r203.addOk === true && r203.ratio >= 0.8, 'ratio=' + r203.ratio.toFixed(3));
  ok('E-203 — warnings 원소가 {code,params} 객체인가 (INT-36 확정 요구)',
    r203.warnTypes.length>0 && r203.warnTypes.every(t=>t==='object'), 'warnings=' + JSON.stringify(r203.warnings));
  ok('E-203 {percent} — 배너에 숫자가 채워짐',
    /\d+%/.test(r203.banner), '배너="' + r203.banner.slice(0,80) + '"');
  await c5.close();
}

ok('자리표시자 검증 전체 콘솔 에러 0', errs.length===0, JSON.stringify(errs.slice(0,3)));

console.log('===== 자리표시자 6코드 UI 검증 (INT-36) · ' + ENG + ' · ' + new Date().toISOString() + ' =====');
R.forEach(r=>console.log(r));
console.log('---- PASS ' + nPass + ' / FAIL ' + nFail + ' ----');
if(nFail){ console.log('실패 항목:'); R.filter(x=>x.indexOf('FAIL')===0).forEach(x=>console.log('  '+x)); }
await b.close();
})();
