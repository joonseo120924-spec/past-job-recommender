/* QA(보안) — 「전체 삭제」 잔존물과 부활 가능성.
 * 대화상자 문구: "삭제 후에는 어떤 방법으로도 복구할 수 없습니다."
 * 이 약속이 실제로 지켜지는지 저장소를 바이트 단위로 확인하고, 되살아나는지 시험한다.
 * 사용: node verify/qa-sec-wipe.cjs [engine]
 */
(async () => {
const PW = require('/opt/node22/lib/node_modules/playwright');
const ENGINE = process.argv[2] || 'chromium';
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b = await PW[ENGINE].launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
const R = []; const ok = (n, c, d) => R.push((c ? 'PASS' : '**FAIL**') + ' | ' + n + (d ? ' | ' + d : ''));
const SECRET = '병원비-정신건강의학과';
await p.goto(APP); await p.waitForTimeout(700);
const MONTH = await p.evaluate(() => JR.model.today().slice(0, 7));

/* 1. UI 로만 데이터를 만든다 (가져오기 없이 — 순수 사용자 시나리오) */
async function addExpense(amount, memo) {
  await p.click('#jr-tabbar .jr-tab[data-screen="s01"]').catch(() => {});
  await p.waitForTimeout(150);
  await p.click('#jr-s01-add'); await p.waitForTimeout(250);
  await p.fill('#jr-amount', amount);
  await p.fill('#jr-memo', memo);
  await p.click('#jr-cat-group .jr-chip');
  await p.click('#jr-s02-save'); await p.waitForTimeout(400);
}
await addExpense('120000', SECRET);
await addExpense('4500', '커피');
const before = await p.evaluate(() => Object.keys(localStorage).map(k => k + ' = ' + (localStorage.getItem(k) || '')));
console.log('=== 삭제 전 저장소 전문 ===');
before.forEach(l => console.log('  ' + l.slice(0, 220)));

/* 2. 전체 삭제 (UI 2단계 확인) */
await p.click('#jr-tabbar .jr-tab[data-screen="s04"]'); await p.waitForTimeout(300);
await p.click('#jr-s04-wipe'); await p.waitForTimeout(300);
const d1 = await p.evaluate(() => (document.getElementById('jr-dialog-title') || {}).textContent);
let bt = await p.$$('#jr-dialog-overlay button'); await bt[bt.length - 1].click(); await p.waitForTimeout(300);
const d2 = await p.evaluate(() => (document.getElementById('jr-dialog-title') || {}).textContent);
bt = await p.$$('#jr-dialog-overlay button'); await bt[bt.length - 1].click(); await p.waitForTimeout(800);
console.log('1단계 문구:', d1);
console.log('2단계 문구:', d2);
ok('2단계 확인 문구가 "복구할 수 없습니다" 를 약속한다', /복구할 수 없습니다/.test(d2 || ''), String(d2));

const after = await p.evaluate(() => Object.keys(localStorage).map(k => k + ' = ' + (localStorage.getItem(k) || '')));
console.log('=== 삭제 후 저장소 전문 ===');
after.forEach(l => console.log('  ' + l.slice(0, 220)));
const residue = after.filter(l => l.indexOf(SECRET) >= 0 || l.indexOf('120000') >= 0);
ok('전체 삭제 후 저장소에 삭제된 지출이 한 바이트도 남지 않는다',
   residue.length === 0, '잔존 키/값=' + JSON.stringify(residue.map(r => r.slice(0, 200))));
await p.screenshot({ path: 'shots/qa-sec-wipe-' + ENGINE + '.png' });

/* 3. 잔존물이 실제로 화면에 되살아나는가 */
const resurrect = await p.evaluate(() => {
  /* 사용자가 손댈 필요도 없는 흔한 손상 시나리오: 주 키가 깨진 채 다음 부팅 */
  localStorage.setItem('jr.v1.expenses', '{{깨짐');
  return Object.keys(localStorage).sort();
});
await p.reload(); await p.waitForTimeout(900);
const revived = await p.evaluate(() => ({
  items: JR.model.getExpenses().data.items.map(e => e.memo + '/' + e.amount),
  rows: Array.from(document.querySelectorAll('#jr-s01-list .jr-expense-row')).map(r => r.textContent.replace(/\s+/g, ' ').trim()),
  total: (document.getElementById('jr-s01-total') || {}).textContent,
  banner: Array.from(document.querySelectorAll('.jr-banner')).map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 50))
}));
console.log('부팅 후 상태:', JSON.stringify(revived, null, 1));
ok('삭제된 지출이 다음 부팅에서 되살아나지 않는다',
   !revived.items.some(i => i.indexOf(SECRET) === 0),
   '되살아난 기록=' + JSON.stringify(revived.items) + ' / 화면=' + JSON.stringify(revived.rows) + ' / 합계=' + revived.total);
await p.screenshot({ path: 'shots/qa-sec-wipe-revived-' + ENGINE + '.png' });

/* 4. 삭제 후 새로 내보내기를 하면 삭제분이 섞이는가 */
const exported = await p.evaluate(() => JR.io.buildExport().data.json);
ok('삭제 후 내보내기 파일에 삭제분이 섞이지 않는다', exported.indexOf('병원비') === -1,
   '내보내기 길이=' + exported.length + ' 발췌=' + exported.slice(0, 200));

console.log('');
console.log('=== 결과 ===');
R.forEach(r => console.log(r));
console.log('FAIL:', R.filter(r => r.indexOf('**FAIL**') === 0).length, '/', R.length);
console.log('콘솔에러·pageerror:', errs.length, errs.slice(0, 12));
await b.close();
})();
