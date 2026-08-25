/* ⑤ 파트장 — E-123 / maxlength 의 실사용 피해를 직접 잰다 (두 실무자 모두 「발생 0건」까지만 적음) */
const { chromium } = require('playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  await p.goto(APP);
  await p.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
  await p.click('#jr-s01-add'); await p.waitForTimeout(150);
  const 이모지100 = '🧾'.repeat(100);            /* 코드포인트 100 = 계약상 정확히 상한 */
  const 한글100 = '가'.repeat(100);
  const out = {};
  for (const [name, text] of [['한글 100자', 한글100], ['이모지 100자(코드포인트 기준 상한)', 이모지100]]) {
    await p.fill('#jr-memo', '');
    await p.fill('#jr-memo', text);
    out[name] = await p.evaluate(t => {
      const el = document.getElementById('jr-memo');
      return {
        입력하려던_코드포인트: Array.from(t).length,
        실제들어간_코드포인트: Array.from(el.value).length,
        실제들어간_UTF16길이: el.value.length,
        countChars판정: JR.model.countChars(el.value),
        검증결과: JR.model.validateExpense({ date: JR.model.today(), amount: '1000',
                    categoryId: JR.model.getCategories().data.items[0].id, memo: el.value }).ok
      };
    }, text);
  }
  console.log('=== E-123 / maxlength 단일기준 위반의 실피해 ===');
  console.log(JSON.stringify(out, null, 1));
  console.log('maxlength 속성값 =', await p.getAttribute('#jr-memo', 'maxlength'));
  await b.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
