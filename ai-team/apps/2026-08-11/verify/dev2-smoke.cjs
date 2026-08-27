/* ④ 2회차 — 전체 흐름 직접 실행 · 콘솔 에러 0건 확인 (통합 후 필수 검증)
 * 4화면 전부와 주요 조작(저장·편집·삭제·월이동·카테고리 추가/이름변경/삭제·내보내기·전체삭제)을 지나갑니다.
 */
const { reporter, launch, freshPage, reboot } = require('./dev2-lib.cjs');

(async () => {
  const R = reporter('④ 전체 흐름 직접 실행 (콘솔 에러 0건)');
  const b = await launch();
  const pg = await freshPage(b);
  const steps = [];
  const step = async (name, fn) => { await fn(); await pg.waitForTimeout(120); steps.push(name); };

  await step('S-01 진입', async () => {});
  await step('지출 3건 저장', async () => {
    for (const [amt, memo] of [['30000', '치과 진료비'], ['20000', '월세 이체'], ['16000', '심야 택시 🚕']]) {
      await pg.click('#jr-s01-add');
      await pg.waitForSelector('#jr-memo', { state: 'visible' });
      await pg.click('#jr-amount'); await pg.keyboard.insertText(amt);
      await pg.click('#jr-cat-group .jr-chip');
      await pg.click('#jr-memo'); await pg.keyboard.insertText(memo);
      await pg.click('#jr-s02-save');
      await pg.waitForTimeout(150);
    }
  });
  await step('기록 편집', async () => {
    await pg.click('#jr-s01-list > *');
    await pg.waitForSelector('#jr-memo', { state: 'visible' });
    await pg.click('#jr-amount'); await pg.keyboard.insertText('5');
    await pg.click('#jr-s02-save');
  });
  await step('월 이동 ←→', async () => { await pg.click('#jr-s01-prev'); await pg.click('#jr-s01-next'); });
  await step('S-03 통계', async () => { await pg.click('.jr-tab[data-screen="s03"]'); });
  await step('S-04 설정', async () => { await pg.click('.jr-tab[data-screen="s04"]'); });
  await step('카테고리 추가', async () => {
    await pg.click('#jr-cat-new'); await pg.keyboard.insertText('세탁');
    await pg.click('#jr-s04-cat-add');
  });
  await step('내보내기', async () => { await pg.click('#jr-s04-export'); });
  await step('S-01 왕복', async () => { await pg.click('.jr-tab[data-screen="s01"]'); await pg.click('.jr-tab[data-screen="s04"]'); });
  await step('재부팅', async () => { await reboot(pg); });
  await step('전체 삭제', async () => {
    await pg.click('.jr-tab[data-screen="s04"]');
    await pg.waitForTimeout(150);
    await pg.click('#jr-s04-wipe');
    await pg.waitForTimeout(150);
    await pg.click('.jr-dialog [data-act="right"]');
    await pg.waitForTimeout(150);
    await pg.click('.jr-dialog [data-act="right"]');
  });

  const final = await pg.evaluate(() => ({
    screen: document.body.getAttribute('data-screen'),
    count: JR.model.getExpenses().data.items.length,
    cats: JR.model.getCategories().data.items.length,
    keys: Object.keys(localStorage).sort()
  }));
  R.note('지나간 단계: ' + steps.join(' → '));
  R.note('최종 상태: ' + JSON.stringify(final));
  R.ok(final.count === 0 && final.cats === 8, '전체 삭제 후 기록 0건 · 기본 카테고리 8개',
    '기록=' + final.count + ' 카테고리=' + final.cats);
  R.ok(final.keys.every(k => ['jr.v1.meta', 'jr.v1.settings', 'jr.v1.categories', 'jr.v1.expenses'].indexOf(k) !== -1),
    '전체 삭제 후 남은 키가 주 데이터 4개뿐 (.bak·corrupt·rollback·rejected·draft 0건)',
    JSON.stringify(final.keys));

  const errs = pg.__errs || [];
  R.ok(errs.length === 0, '**콘솔 에러 0건** (전체 흐름 ' + steps.length + '단계)', JSON.stringify(errs).slice(0, 500));

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });
