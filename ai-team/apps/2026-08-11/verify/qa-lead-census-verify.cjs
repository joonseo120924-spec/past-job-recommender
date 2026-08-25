const { chromium, firefox, webkit } = require('playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const E = { chromium, firefox, webkit };
(async () => {
  for (const name of ['chromium', 'firefox', 'webkit']) {
    const b = await E[name].launch();
    const p = await (await b.newContext()).newPage();
    await p.goto(APP);
    await p.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
    const r = await p.evaluate(() => {
      /* 인자를 제대로 넘겨 재확인 — 무인자 호출 탓이 아님을 증명 */
      const probes = {
        'ui.showErrors': () => JR.ui.showErrors([{ code: 'E-120', params: { over: 3 } }]),
        'ui.show': () => JR.ui.show('E-116', { name: '식비' }),
        'ui.inline': () => JR.ui.inline('amount', 'E-101', {}),
        'ui.banner': () => JR.ui.banner('E-303', {}),
        'ui.toast': () => JR.ui.toast('E-601', {}),
        'ui.toastText': () => JR.ui.toastText('가나다'),
        'ui.dismissBanner': () => JR.ui.dismissBanner('E-303'),
        'ui.unlock': () => JR.ui.unlock('save'),
        'ui.lock': () => JR.ui.lock('save2'),
        'ui.init': () => 'skip(재초기화 위험)',
        'err.log': () => JR.err.log('E-501', new Error('x')),
        'io.readFile': () => JR.io.readFile(null, function () {}),
        'model.shiftMonth': () => JR.model.shiftMonth('2026-08', 1)
      };
      const out = {};
      for (const k of Object.keys(probes)) {
        let v, t = null;
        try { v = probes[k](); } catch (e) { t = e.message; }
        out[k] = t ? ('throw:' + t) : (v === undefined ? 'undefined' : (typeof v === 'object' && v !== null && typeof v.ok === 'boolean' ? '{ok}' : typeof v + '(' + String(v).slice(0, 20) + ')'));
      }
      /* 총 개수 재계산 */
      let non = [], fn = 0;
      for (const m of ['err', 'store', 'model', 'stats', 'io', 'ui']) {
        for (const k of Object.keys(JR[m])) {
          if (typeof JR[m][k] !== 'function') continue;
          fn++;
        }
      }
      return { probes: out, 함수총수: fn };
    });
    console.log('--- ' + name + ' --- 함수총수=' + r.함수총수);
    Object.keys(r.probes).forEach(k => console.log('   ' + k.padEnd(18) + ' → ' + r.probes[k]));
    await b.close();
  }
  process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
