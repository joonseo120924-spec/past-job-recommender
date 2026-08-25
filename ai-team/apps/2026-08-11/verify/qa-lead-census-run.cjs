/* ⑤ 파트장 — 비-{ok} 런타임 전수 census. ui 를 루프 안에 넣는다(ok.cjs 사각 제거). */
const { chromium } = require('playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(APP);
  await p.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
  const res = await p.evaluate(() => {
    const MODS = ['err', 'store', 'model', 'stats', 'io', 'ui'];   /* ui 포함 — 여기가 ok.cjs 의 사각이었다 */
    const rows = [];
    for (const m of MODS) {
      const mod = JR[m];
      for (const k of Object.keys(mod)) {
        const v = mod[k];
        if (typeof v !== 'function') { rows.push({ fn: m + '.' + k, kind: '상수', ret: typeof v }); continue; }
        let r, threw = null;
        try { r = v(); } catch (e) { threw = e.message; }
        const isOk = (r !== null && typeof r === 'object' && typeof r.ok === 'boolean');
        rows.push({
          fn: m + '.' + k, kind: threw ? '예외' : (isOk ? '{ok}' : '비-{ok}'),
          ret: threw ? ('throw: ' + threw) : (r === undefined ? 'undefined' : (r === null ? 'null' : (typeof r === 'object' ? 'Object/' + Object.prototype.toString.call(r) : typeof r + '(' + String(r).slice(0, 24) + ')')))
        });
      }
    }
    return rows;
  });
  const fns = res.filter(r => r.kind !== '상수');
  const non = fns.filter(r => r.kind === '비-{ok}');
  const thr = fns.filter(r => r.kind === '예외');
  console.log('=== 런타임 전수 census (무인자 호출) ===');
  console.log('표면 총 ' + res.length + ' (함수 ' + fns.length + ' · 상수 ' + (res.length - fns.length) + ')');
  console.log('\n--- 비-{ok} ' + non.length + '개 ---');
  non.forEach(r => console.log('  ' + r.fn.padEnd(24) + ' → ' + r.ret));
  console.log('\n--- 예외 발생 ' + thr.length + '개 (무인자 호출이라 판정 보류) ---');
  thr.forEach(r => console.log('  ' + r.fn.padEnd(24) + ' → ' + r.ret.slice(0, 70)));
  console.log('\n--- {ok} ' + fns.filter(r => r.kind === '{ok}').length + '개 ---');
  console.log('  ' + fns.filter(r => r.kind === '{ok}').map(r => r.fn).join(', '));
  console.log('\npageerror=' + JSON.stringify(errs));
  await b.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
