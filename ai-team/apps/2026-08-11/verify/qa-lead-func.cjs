/* ⑤ 파트장 — 기능 시험 표본 재현 + 나머지 기준선 전수 확인 */
const { chromium } = require('playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
let P = 0, F = 0; const L = [];
const ok = (c, n, d) => { c ? (P++, L.push('PASS | ' + n + ' | ' + d)) : (F++, L.push('**FAIL** | ' + n + ' | ' + d)); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(APP);
  await p.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());

  /* ── 기준선 재확인: E-코드 64 · 배너 15 ── */
  const base = await p.evaluate(() => {
    const M = JR.err.MESSAGES, ks = Object.keys(M);
    const slots = {}; ks.forEach(k => { const s = M[k].slot; slots[s] = (slots[s] || 0) + 1; });
    const ph = ks.filter(k => /\{[A-Za-z0-9_]+\}/.test(M[k].msg));
    return { total: ks.length, slots, banner: JR.err.BANNER_PRIORITY.length,
             bslot: ks.filter(k => M[k].slot === 'B').length, ph, phCount: ph.length };
  });
  ok(base.total === 64, '기준선 E-코드 총수 = 64', 'total=' + base.total + ' slots=' + JSON.stringify(base.slots));
  ok(base.banner === 15 && base.bslot === 15, '기준선 BANNER_PRIORITY 15단 = B슬롯 15개 일대일',
     'BANNER_PRIORITY=' + base.banner + ' B슬롯=' + base.bslot);
  ok(base.phCount === 6, '기준선 자리표시자 보유 코드 = 6개 (INT-36 명단)', JSON.stringify(base.ph));

  /* ── QA-F-002 계열: 비-{ok} 는 별도 census 스크립트에서 28 확정 ── */

  /* ── E-203 {percent} ── */
  const e203 = await p.evaluate(() => ({
    params없이: JR.err.get('E-203').msg,
    params주고: JR.err.get('E-203', { percent: 82 }).msg,
    대조군_E120_params없이: JR.err.get('E-120').msg
  }));
  ok(e203.params없이.indexOf('%') < 0 || /\d+\s*%/.test(e203.params없이),
     'E-203 params 없이 호출해도 숫자가 채워짐', JSON.stringify(e203.params없이));

  /* ── E-203 실제 UI 경로: 저장소 80% 채운 뒤 저장 → 배너 문구 ── */
  const e203ui = await p.evaluate(() => {
    /* 사용률 80% 를 실제로 만든 뒤 저장 → writeAll 이 codes 에 E-203 을 담는다 */
    const lim = JR.store.LIMIT_CHARS;
    const cur = JR.store.usage().data.usedChars;
    const pad = 'x'.repeat(Math.max(0, Math.floor(lim * 0.82) - cur - 100));
    JR.store.setRaw('jr.v1.pad', pad);
    const v = JR.model.validateExpense({ date: JR.model.today(), amount: '5000', categoryId: JR.model.getCategories().data.items[0].id, memo: '' });
    const r = JR.model.addExpense(v.data ? v.data.expense || v.data : {});
    return { addOk: r.ok, code: r.code, warnings: r.data ? r.data.warnings : null,
             warningsType: r.data && r.data.warnings ? r.data.warnings.map(w => typeof w) : null,
             usage: JR.store.usage().data };
  });
  const w = e203ui.warnings;
  ok(!!(w && w.length && typeof w[0] === 'object' && w[0].code),
     'INT-36 warnings 원소가 {code,params} 객체', JSON.stringify(e203ui.warnings) + ' types=' + JSON.stringify(e203ui.warningsType));

  /* 화면에 실제로 나가는 문구 */
  const bannerText = await p.evaluate(() => { JR.ui.show('E-203'); return document.body.innerText.match(/저장 공간을[^\n]*/); });
  ok(!!(bannerText && /\d/.test(bannerText[0])), 'E-203 배너 문구에 숫자가 채워짐', JSON.stringify(bannerText && bannerText[0]));

  /* ── INT-39 / QA-F-001 : 내보내기 대체 영역 ── */
  const p2 = await (await b.newContext()).newPage();
  await p2.goto(APP);
  await p2.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
  await p2.click('#jr-s01-add'); await p2.fill('#jr-amount', '12500'); await p2.fill('#jr-memo', '점심 김치찌개');
  await p2.click('.jr-chip'); await p2.click('#jr-s02-save'); await p2.waitForTimeout(150);
  await p2.click('[data-screen="s04"]'); await p2.waitForTimeout(150);
  const snap = async tag => p2.evaluate(t => {
    const el = document.getElementById('jr-export-fallback');
    const ta = document.getElementById('jr-export-text');
    const r = el ? el.getBoundingClientRect() : { height: 0 };
    return { tag: t, hidden: el ? el.hasAttribute('hidden') : null, 높이: Math.round(r.height),
             JSON길이: ta ? (ta.value || '').length : 0, 메모노출: ta ? (ta.value || '').indexOf('점심 김치찌개') >= 0 : false };
  }, tag);
  const st = [await snap('① S-04 진입(누르기 전)')];
  const exp = await p2.$('#jr-s04-export, #jr-export, [id*=export]');
  if (exp) { await exp.click(); await p2.waitForTimeout(250); }
  st.push(await snap('② 내보내기 누른 직후'));
  await p2.click('[data-screen="s01"]'); await p2.waitForTimeout(200);
  st.push(await snap('③ S-01 로 이탈'));
  await p2.click('[data-screen="s04"]'); await p2.waitForTimeout(200);
  st.push(await snap('④ S-04 재진입 (안 눌렀음)'));
  await p2.screenshot({ path: __dirname + '/shots/lead-int39-s04재진입.png' });
  const s4 = st[3];
  ok(s4.hidden === true && s4.JSON길이 === 0,
     'INT-10/39 S-04 재진입 시 대체 영역이 접혀 있고 비어 있음',
     JSON.stringify(st));

  ok(errs.length === 0, 'pageerror 0건', JSON.stringify(errs.slice(0, 3)));
  console.log('=== ⑤ 파트장 기능 표본 재현 ===');
  L.forEach(l => console.log(l));
  console.log('PASS=' + P + ' FAIL=' + F);
  console.log('원자료 e203: ' + JSON.stringify(e203));
  console.log('원자료 e203ui: ' + JSON.stringify(e203ui).slice(0, 400));
  await b.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
