/* ④ 4단계 재현 — 메모 100자 단일 기준 (E-123 · S2) + QA-S-006 (S3)
 * 검증 기준 = ⑤ 통합요청서 §2 4단계 3줄 + ② INT-43(6) 1줄 + INT-43(5) 3경로
 */
const { reporter, launch, freshPage, importMutated, MK } = require('./dev2-lib.cjs');

(async () => {
  const R = reporter('④ 4단계 — 메모 100자 단일 기준 (INT-43)');
  const b = await launch();

  const pg = await freshPage(b);
  await pg.click('#jr-s01-add');
  await pg.waitForSelector('#jr-memo', { state: 'visible' });

  const attr = await pg.getAttribute('#jr-memo', 'maxlength');
  R.ok(attr === null, 'INT-43(4)-2 index.html:86 maxlength 속성 삭제됨', 'maxlength=' + attr);

  const typeMemo = async (text) => {
    await pg.evaluate(() => { const m = document.getElementById('jr-memo'); m.value = ''; m.dispatchEvent(new Event('input', { bubbles: true })); });
    await pg.evaluate(() => { const t = document.getElementById('jr-toast'); if (t) { t.textContent = ''; } });
    await pg.click('#jr-memo');
    await pg.keyboard.insertText(text);
    await pg.waitForTimeout(60);
    return pg.evaluate(() => ({
      utf16: document.getElementById('jr-memo').value.length,
      cp: JR.model.countChars(document.getElementById('jr-memo').value),
      counter: document.getElementById('jr-memo-counter').textContent,
      toast: (document.getElementById('jr-toast') || {}).textContent || ''
    }));
  };

  const emo100 = await typeMemo('\u{1F600}'.repeat(100));
  R.note('이모지 100자 실타이핑: ' + JSON.stringify(emo100));
  R.ok(emo100.cp === 100, '⑤-4단계-1 이모지 100자 입력 → 100자 그대로 들어감 (되돌림 전: 50)',
    'countChars=' + emo100.cp + ' (UTF-16 길이=' + emo100.utf16 + ')');
  R.ok(emo100.counter === '100/100', '카운터가 100/100', '카운터=' + emo100.counter);
  R.ok(emo100.toast === '' , '100자 정확히에서는 자르지 않았으므로 E-123 을 부르지 않음 (② INT-43(4)-3)',
    '토스트="' + emo100.toast + '"');

  const emo60 = await typeMemo('\u{1F600}'.repeat(60));
  R.ok(emo60.counter === '60/100', '②-INT-43(6) 이모지 60자 시점 카운터 60/100 · 61번째가 실제로 입력됨 (되돌림 전: 50/100 에서 입력 막힘)',
    '카운터=' + emo60.counter + ' countChars=' + emo60.cp);

  const han101 = await typeMemo('가'.repeat(101));
  R.note('한글 101자 실타이핑: ' + JSON.stringify(han101));
  R.ok(han101.cp === 100 && /뒷부분을 잘랐습니다/.test(han101.toast),
    '⑤-4단계-2 101자째 입력 → 잘림 + E-123 토스트 (되돌림 전: 통지 없음)',
    'countChars=' + han101.cp + ' 토스트="' + han101.toast + '"');

  /* 붙여넣기(=input 이벤트) 경로 — ② INT-43(5) */
  const paste = await pg.evaluate(async () => {
    const m = document.getElementById('jr-memo');
    m.value = ''; m.dispatchEvent(new Event('input', { bubbles: true }));
    const t = document.getElementById('jr-toast'); if (t) { t.textContent = ''; }
    m.value = 'P'.repeat(5000);
    m.dispatchEvent(new Event('input', { bubbles: true }));
    return { cp: JR.model.countChars(m.value), toast: (document.getElementById('jr-toast') || {}).textContent || '' };
  });
  R.ok(paste.cp === 100 && /뒷부분을 잘랐습니다/.test(paste.toast),
    '②-INT-43(5) 5,000자 붙여넣기(input 발생)도 그 자리에서 100 코드포인트로 잘림 + E-123',
    'countChars=' + paste.cp + ' 토스트="' + paste.toast + '"');

  /* 저장 시점 2차 방어선이 그대로인가 (E-120/E-121 회귀 금지) */
  const guard = await pg.evaluate(() => {
    const cid = JR.model.getCategories().data.items[0].id;
    const r = JR.model.validateExpense({ date: JR.model.today(), amount: '1000', categoryId: cid, memo: '가'.repeat(101) });
    const r2 = JR.model.validateExpense({ date: JR.model.today(), amount: '1000', categoryId: cid, memo: '가'.repeat(100) });
    return { over: r.ok ? 'ok(막지 못함)' : r.code, exact: r2.ok };
  });
  R.ok(guard.over === 'E-120' && guard.exact === true,
    '회귀 금지 — 저장 시점 model.js 2차 방어선(E-120)이 그대로',
    '101자→' + guard.over + ' / 100자→' + (guard.exact ? '통과' : '거부'));

  /* QA-S-006 — 가져오기 memo 5,000자 */
  const pg2 = await freshPage(b);
  const imp = await importMutated(pg2, MK +
    "f.data.expenses=[mk({id:'m1',memo:'M'.repeat(5000)}),mk({id:'m2',memo:'정상 메모'}),mk({id:'m3',memo:'가'.repeat(100)})];f.counts={expenses:3,categories:f.data.categories.length};");
  const maxLen = imp.expenses.length ? Math.max.apply(null, imp.expenses.map(e => e.memoLen)) : -1;
  R.ok(imp.expenses.filter(e => e.id === 'm1').length === 0,
    '⑤-4단계-3 가져오기 memo 5,000자 → 레코드 거부 (되돌림 전: 5,000자 저장)',
    '저장된 id=' + JSON.stringify(imp.expenses.map(e => e.id)) + ' 최대 메모 길이=' + maxLen);
  R.ok(imp.expenses.filter(e => e.id === 'm2').length === 1 && imp.expenses.filter(e => e.id === 'm3').length === 1,
    '회귀 금지 — 정상 메모·정확히 100자 메모는 그대로 저장', 'rejectedCount=' + imp.rejectedCount);
  R.ok(imp.rejectedCount === 1, '거부 건이 기존 rejected 경로(E-409 {count})로 셈됨 · 새 E-코드 없음',
    'rejectedCount=' + imp.rejectedCount);

  const errs = (pg.__errs || []).concat(pg2.__errs || []);
  R.ok(errs.length === 0, '콘솔·페이지 오류 0건', JSON.stringify(errs).slice(0, 400));

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });
