/* ④ 2단계 재현 — QA-S-001 (S1) 「전체 삭제」 잔존·부활 · Q-067 판정 이행
 * 검증 기준 = ⑤ 통합요청서 §2 2단계 3줄 + ④ 가 새로 찾은 rollback 경로
 */
const { reporter, launch, freshPage, reboot } = require('./dev2-lib.cjs');

const SEED = `(async()=>{})`;

async function seed(pg) {
  return pg.evaluate(() => {
    const cid = JR.model.getCategories().data.items[0].id;
    JR.model.addExpense({ date: '2026-08-10', amount: '30000', categoryId: cid, memo: '가족 병원비' });
    JR.model.addExpense({ date: '2026-08-11', amount: '20000', categoryId: cid, memo: '아이 학원비' });
    JR.model.addExpense({ date: '2026-08-12', amount: '16000', categoryId: cid, memo: '변호사 상담' });
    /* .bak 이 실제로 만들어지도록 한 번 더 씁니다(2회째 쓰기부터 이전 값이 .bak 에 들어갑니다) */
    JR.model.setSelectedMonth('2026-08');
    return { count: JR.model.getExpenses().data.items.length,
      total: JR.stats.monthTotal('2026-08').data.total };
  });
}
const dump = pg => pg.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); }
  return out;
});

(async () => {
  const R = reporter('④ 2단계 — 「전체 삭제」 종단 경로 (QA-S-001 · Q-067)');
  const b = await launch();
  const MEMOS = ['가족 병원비', '아이 학원비', '변호사 상담'];
  const leaks = (all) => Object.keys(all).filter(k => MEMOS.some(m => String(all[k]).indexOf(m) !== -1));

  /* 시나리오 1 — 전체 삭제만 */
  let pg = await freshPage(b);
  const s = await seed(pg);
  const beforeAll = await dump(pg);
  R.note('심기: ' + s.count + '건 · 총합 ' + s.total + '원 · 삭제 전 .bak 보유 키=' +
    JSON.stringify(Object.keys(beforeAll).filter(k => /\.bak$/.test(k))));
  await pg.evaluate(() => JR.model.wipeAll());
  const after1 = await dump(pg);
  R.ok(leaks(after1).length === 0,
    '⑤-1 전체 삭제 후 localStorage 전 키에 삭제한 메모 원문 0건',
    '남은 키=' + JSON.stringify(Object.keys(after1)) + ' / 메모가 남은 키=' + JSON.stringify(leaks(after1)));

  /* 시나리오 2 — 전체 삭제 → 메인 키 손상 → 재부팅 */
  pg = await freshPage(b);
  await seed(pg);
  await pg.evaluate(() => JR.model.wipeAll());
  await pg.evaluate(() => localStorage.setItem('jr.v1.expenses', '{깨진 JSON'));
  await reboot(pg);
  const r2 = await pg.evaluate(() => ({
    rows: document.querySelectorAll('#jr-s01-list .jr-expense-row, #jr-s01-list li, #jr-s01-list .jr-expense-item').length,
    listText: (document.getElementById('jr-s01-list') || {}).textContent || '',
    total: (document.getElementById('jr-s01-total') || {}).textContent || '',
    modelCount: JR.model.getExpenses().data.items.length
  }));
  R.ok(r2.modelCount === 0 && !/병원비|학원비|상담/.test(r2.listText),
    '⑤-2 전체 삭제 → 메인 키 손상 → 재부팅 → 화면 0행 (되돌림 전: 3행 · 66,000원)',
    'model 건수=' + r2.modelCount + ' 총합표시="' + r2.total + '" 목록에 메모 노출=' + /병원비|학원비|상담/.test(r2.listText));
  R.ok(/0\s*원/.test(r2.total) || r2.total.indexOf('0원') !== -1,
    '⑤-2 총합 0원', '총합표시="' + r2.total + '"');

  /* 시나리오 3 — 전체 삭제 → 메인 키가 비-배열 → 재부팅 */
  pg = await freshPage(b);
  await seed(pg);
  await pg.evaluate(() => JR.model.wipeAll());
  await pg.evaluate(() => localStorage.setItem('jr.v1.expenses', '{"not":"array"}'));
  await reboot(pg);
  const r3 = await pg.evaluate(() => ({ modelCount: JR.model.getExpenses().data.items.length,
    total: (document.getElementById('jr-s01-total') || {}).textContent || '' }));
  R.ok(r3.modelCount === 0, '⑤-2 전체 삭제 → 메인 키 비-배열 → 재부팅 → 부활 없음',
    'model 건수=' + r3.modelCount + ' 총합="' + r3.total + '"');

  /* 시나리오 4 — ④ 가 새로 찾은 경로: jr.v1.rollback 이 남으면 다음 부팅에서 통째로 부활한다 */
  pg = await freshPage(b);
  await seed(pg);
  await pg.evaluate(() => {
    /* 가져오기 트랜잭션이 중단된 상태를 만듭니다 (model.init 이 자동 복구하는 바로 그 키) */
    JR.store.setJSON('jr.v1.rollback', JR.store.snapshot().data.snap);
  });
  await pg.evaluate(() => JR.model.wipeAll());
  const after4 = await dump(pg);
  await reboot(pg);
  const r4 = await pg.evaluate(() => JR.model.getExpenses().data.items.length);
  R.ok(leaks(after4).length === 0 && r4 === 0,
    '④ 신규 — jr.v1.rollback 잔존 경로도 닫힘 (model.init 의 트랜잭션 자동 복구가 되살리지 못함)',
    '삭제 직후 메모가 남은 키=' + JSON.stringify(leaks(after4)) + ' · 재부팅 후 model 건수=' + r4);

  /* 회귀 — 평상시 저장 경로의 .bak 은 그대로 동작해야 함 */
  pg = await freshPage(b);
  await seed(pg);
  const bak = await pg.evaluate(() => ({
    bakKeys: Object.keys(localStorage).filter(k => /\.bak$/.test(k)),
    expBak: localStorage.getItem('jr.v1.expenses.bak')
  }));
  R.ok(bak.bakKeys.indexOf('jr.v1.expenses.bak') !== -1 && bak.expBak !== null,
    '⑤-3 회귀 금지 — 평상시 저장 경로의 .bak 백업은 그대로 동작',
    '.bak 키=' + JSON.stringify(bak.bakKeys));

  /* 회귀 — 손상 시 .bak 복구(E-303)가 여전히 동작 */
  await pg.evaluate(() => localStorage.setItem('jr.v1.expenses', '{깨진 JSON'));
  await reboot(pg);
  const rec = await pg.evaluate(() => JR.model.getExpenses().data.items.length);
  R.ok(rec > 0, '⑤-3 회귀 금지 — 평상시 손상 복구(.bak → E-303)는 그대로 동작',
    '복구된 건수=' + rec + '건 (전체 삭제를 하지 않은 경우)');

  const errs = pg.__errs || [];
  R.ok(errs.length === 0, '콘솔·페이지 오류 0건', JSON.stringify(errs).slice(0, 400));

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });
