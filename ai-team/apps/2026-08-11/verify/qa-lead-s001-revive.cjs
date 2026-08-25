/* ⑤ 파트장 — QA-S-001 「부활」 주장의 도달 조건을 정확히 특정한다 */
const { chromium, firefox, webkit } = require('playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const engines = { chromium, firefox, webkit };
(async () => {
  const engName = process.argv[2] || 'chromium';
  const browser = await engines[engName].launch();
  const out = [];
  for (const scen of ['A-무조건', 'B-메인키손상', 'C-메인키비배열']) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(APP);
    await page.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
    const memos = ['치과 진료비 180000', '월세 이체 700000', '심야 택시 23000'];
    for (let i = 0; i < 3; i++) {
      await page.click('#jr-s01-add');
      await page.fill('#jr-amount', String((i + 1) * 11000));
      await page.fill('#jr-memo', memos[i]);
      await page.click('.jr-chip');
      await page.click('#jr-s02-save');
      await page.waitForTimeout(100);
    }
    // 전체 삭제
    await page.evaluate(() => JR.model.wipeAll());
    const resid = await page.evaluate(() => {
      const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o;
    });
    // 시나리오별 후속 사건
    if (scen === 'B-메인키손상') {
      await page.evaluate(() => localStorage.setItem('jr.v1.expenses', '[{"id":"e1",'));   // 쓰기 중단 흉내
    } else if (scen === 'C-메인키비배열') {
      await page.evaluate(() => localStorage.setItem('jr.v1.expenses', '{}'));
    }
    await page.reload();
    await page.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      model: JR.model.getExpenses().data.items.map(e => e.memo),
      dom: (document.querySelector('#jr-s01-list') || {}).textContent || '',
      total: ((document.querySelector('#jr-s01-total') || {}).textContent || '').trim(),
      banner: Array.prototype.map.call(document.querySelectorAll('.jr-banner, [id*=banner]'), n => n.textContent.trim()).filter(Boolean)
    }));
    const revivedInDom = memos.filter(m => after.dom.indexOf(m.split(' ')[0]) >= 0);
    out.push({
      시나리오: scen,
      전체삭제후_잔존키: Object.keys(resid).filter(k => /\.bak|corrupt/.test(k)),
      잔존물에_메모원문: Object.keys(resid).filter(k => /\.bak|corrupt/.test(k)).some(k => memos.some(m => resid[k].indexOf(m.split(' ')[0]) >= 0)),
      재부팅후_model: after.model,
      재부팅후_화면부활: revivedInDom,
      총합: after.total,
      배너: after.banner.slice(0, 2),
      pageerror: errs
    });
    await page.screenshot({ path: __dirname + `/shots/lead-s001-${engName}-${scen}.png` });
    await ctx.close();
  }
  console.log('=== QA-S-001 도달조건 특정 · engine=' + engName + ' ===');
  out.forEach(o => console.log(JSON.stringify(o, null, 1)));
  await browser.close();
  process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
