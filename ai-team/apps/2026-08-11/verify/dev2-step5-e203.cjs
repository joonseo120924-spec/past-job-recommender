/* ④ 5단계 재현 — E-203 {percent} (S3 · INT-36)
 * 검증 기준 = ⑤ 통합요청서 §2 5단계 3줄
 */
const { reporter, launch, freshPage } = require('./dev2-lib.cjs');

/* 실제 화면으로 지출 1건을 저장합니다 (S-01 → S-02 → 저장) */
async function saveViaUI(pg, memo) {
  await pg.click('#jr-s01-add');
  await pg.waitForSelector('#jr-memo', { state: 'visible' });
  await pg.click('#jr-amount');
  await pg.keyboard.insertText('1000');
  await pg.click('#jr-cat-group .jr-chip');
  await pg.evaluate((m) => {
    const el = document.getElementById('jr-memo');
    el.value = m;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, memo);
  await pg.click('#jr-s02-save');
  await pg.waitForTimeout(250);
}

(async () => {
  const R = reporter('④ 5단계 — E-203 {percent} (INT-36)');
  const b = await launch();
  const pg = await freshPage(b);

  /* **실제 UI 경로로 저장합니다.** JR.model.addExpense 를 직접 부르면 ui.onSave 를 타지 않아
   * 배너가 뜨지 않습니다 — 되돌림 대상인 결함은 바로 그 ui.onSave 의 전달 경로입니다. */
  const pre = await pg.evaluate(() => {
    localStorage.setItem('jr.v1.filler', 'x'.repeat(2050000));   /* 저장소를 80% 이상 채움 */
    const u = JR.store.usage().data;
    /* addExpense 의 반환 형태만 따로 봅니다 (화면 저장은 아래에서 UI 로 합니다) */
    return { ratio: u.ratio, percent: Math.floor(u.ratio * 100) };
  });
  await saveViaUI(pg, '용량 경고 시험');
  const r = await pg.evaluate((percent) => {
    const cid = JR.model.getCategories().data.items[0].id;
    const res = JR.model.addExpense({ date: JR.model.today(), amount: '1000', categoryId: cid, memo: '반환형태 확인' });
    const w = res.ok ? res.data.warnings : [];
    return { percent: percent, saved: res.ok, warnTypes: w.map(x => typeof x), warnDump: JSON.stringify(w),
      hasCode: w.length > 0 && typeof w[0] === 'object' && typeof w[0].code === 'string' };
  }, pre.percent);
  R.note('저장소 사용률 = ' + r.percent + '% · warnings = ' + r.warnDump);
  R.ok(r.saved, '전제 — 저장 성공', 'ok=' + r.saved);
  R.ok(r.warnTypes.length > 0 && r.warnTypes.every(t => t === 'object') && r.hasCode,
    "⑤-5단계-2 warnings 원소 typeof === 'object' && .code 존재 (되돌림 전: \"string\")",
    'types=' + JSON.stringify(r.warnTypes) + ' ' + r.warnDump);

  await pg.waitForTimeout(150);
  const banner = await pg.evaluate(() => (document.querySelector('.jr-banner') || document.getElementById('jr-banner') || { textContent: '' }).textContent || document.body.innerText);
  R.ok(new RegExp('저장 공간을 ' + r.percent + '% 썼습니다').test(banner),
    '⑤-5단계-1 배너에 「저장 공간을 ' + r.percent + '% 썼습니다」 (되돌림 전: 「% 썼습니다」)',
    '배너 발췌="' + (banner.match(/저장 공간을[^.]*\./) || ['(없음)'])[0] + '"');
  R.ok(!/저장 공간을 % 썼습니다/.test(banner), '빈 치환 자리가 화면으로 나가지 않음', '「저장 공간을 % 썼습니다」 미검출');

  /* ⑤-5단계-3 나머지 5개 자리표시자 코드 회귀 0 */
  const ph = await pg.evaluate(() => ({
    'E-111': JR.err.get('E-111', { max: 1000 }).msg,
    'E-116': JR.err.get('E-116', { name: '커피' }).msg,
    'E-120': JR.err.get('E-120', { over: 3 }).msg,
    'E-203': JR.err.get('E-203', { percent: 82 }).msg,
    'E-304': JR.err.get('E-304', { count: 5 }).msg,
    'E-409': JR.err.get('E-409', { count: 2 }).msg,
    빈자리남은코드: Object.keys(JR.err.MESSAGES).filter(c => /\{[A-Za-z0-9_]+\}/.test(JR.err.MESSAGES[c].msg))
  }));
  const empty = Object.keys(ph).filter(k => k !== '빈자리남은코드' && /\{[A-Za-z0-9_]+\}|(^|[^0-9])% 썼|없어 제외|  /.test('') === false && /\{[A-Za-z0-9_]+\}/.test(ph[k]));
  R.ok(empty.length === 0, '⑤-5단계-3 E-111·E-116·E-120·E-203·E-304·E-409 치환 회귀 0',
    '치환 안 된 코드=' + JSON.stringify(empty));
  R.ok(ph.빈자리남은코드.length === 6, '자리표시자 보유 코드가 여전히 정확히 6개 (기준선 불변)',
    JSON.stringify(ph.빈자리남은코드));
  R.note('E-111=' + ph['E-111'] + ' | E-116=' + ph['E-116'] + ' | E-120=' + ph['E-120']);
  R.note('E-203=' + ph['E-203'] + ' | E-304=' + ph['E-304'] + ' | E-409=' + ph['E-409']);

  /* 회귀 — E-122 도 객체로 나가고 화면에 그대로 뜨는가 */
  const pg2 = await freshPage(b);
  await saveViaUI(pg2, '외톨이대리쌍\uD800 포함');
  const w122 = await pg2.evaluate(() => {
    const cid = JR.model.getCategories().data.items[0].id;
    const res = JR.model.addExpense({ date: JR.model.today(), amount: '1000', categoryId: cid, memo: '외톨이대리쌍\uD800 포함2' });
    return { ok: res.ok, warnings: JSON.stringify(res.ok ? res.data.warnings : res.code) };
  });
  await pg2.waitForTimeout(150);
  const t122 = await pg2.evaluate(() => (document.getElementById('jr-toast') || {}).textContent || '');
  R.ok(/"code":"E-122"/.test(w122.warnings) && /표시할 수 없는 문자/.test(t122),
    '회귀 금지 — E-122 도 {code,params} 로 나가고 토스트가 그대로 뜸',
    'warnings=' + w122.warnings + ' 토스트="' + t122 + '"');

  const errs = (pg.__errs || []).concat(pg2.__errs || []);
  R.ok(errs.length === 0, '콘솔·페이지 오류 0건', JSON.stringify(errs).slice(0, 400));

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });
