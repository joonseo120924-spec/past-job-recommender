/* ④ 6단계 재현 — E-604 (S3) 초안 저장 실패를 B 슬롯 배너로
 * 되돌림 전: `show('E-604')` 호출 지점 0건 — 정의와 배너 분류 배열에만 있고 실제로 뜨는 것은 E-606 토스트뿐.
 * 저장 실패는 **실제 localStorage 할당량을 채워** 만듭니다 (스텁·모의 없음).
 */
const { reporter, launch, freshPage } = require('./dev2-lib.cjs');

(async () => {
  const R = reporter('④ 6단계 — E-604 배너');
  const b = await launch();
  const pg = await freshPage(b);

  /* 1) S-02 로 들어가 폼을 더럽힙니다 */
  await pg.click('#jr-s01-add');
  await pg.waitForSelector('#jr-memo', { state: 'visible' });
  await pg.click('#jr-amount');
  await pg.keyboard.insertText('12000');
  await pg.click('#jr-cat-group .jr-chip');
  await pg.evaluate(() => {
    const el = document.getElementById('jr-memo');
    el.value = '작성 중이던 내용';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  /* 2) 실제 저장소 할당량을 채웁니다 — jr. 밖 키라 앱 usage 에는 안 잡히고 브라우저 quota 만 걸립니다 */
  const fill = await pg.evaluate(() => {
    let filled = 0, n = 0;
    for (let mb = 5; mb >= 1; mb--) {
      try { localStorage.setItem('quota_filler', 'x'.repeat(mb * 1000000)); filled = mb; break; }
      catch (e) { /* 다음 크기로 */ }
    }
    /* 큰 덩어리 → 작은 덩어리 순으로 빈틈까지 채웁니다.
     * 초안은 200자 남짓이라 여유가 조금이라도 남으면 저장에 성공해 버립니다. */
    [100000, 10000, 1000, 100, 10].forEach(sz => {
      for (let i = 0; i < 2000; i++) {
        try { localStorage.setItem('qf_' + sz + '_' + i, 'y'.repeat(sz)); n++; }
        catch (e) { break; }
      }
    });
    let throws = false;
    try { localStorage.setItem('jr.__quotatest', 'z'.repeat(300)); localStorage.removeItem('jr.__quotatest'); }
    catch (e) { throws = true; }
    const probe = JR.model.saveDraft({ mode: 'add', date: '2026-08-11', amount: '1', categoryId: 'c_d01', memo: '탐침' });
    return { filledMB: filled, blocks: n, quotaReached: throws, saveDraftProbe: probe.ok ? 'ok(실패하지 않음)' : probe.code };
  });
  R.note('저장소 채움: ' + JSON.stringify(fill));
  R.ok(fill.quotaReached, '전제 — 브라우저 localStorage 할당량에 실제로 도달함 (스텁 없음)',
    JSON.stringify(fill));

  /* 3) 화면이 가려지는 순간 */
  await pg.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pg.waitForTimeout(200);

  const hidden = await pg.evaluate(() => ({
    bannerText: (document.querySelector('.jr-banner') || { textContent: '' }).textContent || '',
    toastText: (document.getElementById('jr-toast') || {}).textContent || ''
  }));
  R.note('가려진 순간: 배너="' + hidden.bannerText.trim() + '" 토스트="' + hidden.toastText.trim() + '"');
  R.ok(/화면에서 벗어나는 동안 작성 중이던 내용을 저장하지 못했습니다/.test(hidden.bannerText),
    '⑤-6단계 초안 저장 실패가 **B 슬롯 배너 E-604** 로 뜸 (되돌림 전: show(\'E-604\') 호출 0건)',
    '배너="' + hidden.bannerText.trim() + '"');

  /* 4) 복귀 후에도 남아 있는가 — 이것이 배너로 옮긴 이유 */
  await pg.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pg.waitForTimeout(300);
  const back = await pg.evaluate(() => ({
    bannerText: (document.querySelector('.jr-banner') || { textContent: '' }).textContent || '',
    visible: !!document.querySelector('.jr-banner')
  }));
  R.ok(back.visible && /저장하지 못했습니다/.test(back.bannerText),
    '⑤-6단계 **복귀 후에도 배너가 남아 있음** (토스트였다면 전달되지 않았을 정보)',
    '복귀 후 배너="' + back.bannerText.trim() + '"');

  /* 5) 회귀 — 평상시(가려지지 않은) 실패는 여전히 E-606 토스트 */
  const pg2 = await freshPage(b);
  await pg2.click('#jr-s01-add');
  await pg2.waitForSelector('#jr-memo', { state: 'visible' });
  await pg2.click('#jr-amount');
  await pg2.keyboard.insertText('9000');
  await pg2.click('#jr-cat-group .jr-chip');
  const normal = await pg2.evaluate(() => {
    for (let mb = 5; mb >= 1; mb--) {
      try { localStorage.setItem('quota_filler', 'x'.repeat(mb * 1000000)); break; } catch (e) { /* 다음 */ }
    }
    [100000, 10000, 1000, 100, 10].forEach(sz => {
      for (let i = 0; i < 2000; i++) {
        try { localStorage.setItem('qf_' + sz + '_' + i, 'y'.repeat(sz)); } catch (e) { break; }
      }
    });
    const el = document.getElementById('jr-memo');
    el.value = '평상시 실패 — 화면이 가려지지 않은 상태에서의 초안 저장 실패 경로';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));   /* 저장 시점 1·2 — 가려지는 순간이 아님 */
    return { probe: JR.model.saveDraft({ mode: 'add', date: '2026-08-11', amount: '1', categoryId: 'c_d01',
      memo: '탐침'.repeat(200) }).code || 'ok(실패하지 않음)' };
  });
  await pg2.waitForTimeout(200);
  Object.assign(normal, await pg2.evaluate(() => ({
    toast: (document.getElementById('jr-toast') || {}).textContent || '',
    banner: (document.querySelector('.jr-banner') || { textContent: '' }).textContent || ''
  })));
  R.note('평상시 실패: saveDraft 탐침=' + normal.probe + ' 토스트="' + normal.toast.trim() + '" 배너="' + normal.banner.trim() + '"');
  R.ok(/자동으로 저장되지 않습니다/.test(normal.toast) && !/화면에서 벗어나는 동안/.test(normal.banner),
    '회귀 금지 — 가려지는 순간이 **아닌** 실패는 E-606 토스트 그대로, E-604 배너를 띄우지 않음',
    '토스트="' + normal.toast.trim() + '" 배너="' + normal.banner.trim() + '"');

  const errs = (pg.__errs || []).concat(pg2.__errs || []);
  R.ok(errs.length === 0, '콘솔·페이지 오류 0건', JSON.stringify(errs).slice(0, 400));

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });
