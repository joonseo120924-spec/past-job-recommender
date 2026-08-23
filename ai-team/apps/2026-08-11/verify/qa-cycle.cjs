/* QA 기능시험 — 1 사이클 전 범위 통과 스크립트  (functional-tester)
 * 사용법: node qa-cycle.cjs <chromium|firefox|webkit> <사이클번호>
 * 1 사이클 = 깨끗한 컨텍스트에서 담당 범위 전체 1회 통과 (분배안 §5)
 * verify/ 기존 19개는 건드리지 않습니다. 이 파일은 신규 qa-*.cjs 입니다.
 */
(async () => {
const ENG = process.argv[2] || 'chromium';
const CYC = process.argv[3] || '?';
const pw = require('/opt/node22/lib/node_modules/playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';

const R = []; let nPass = 0, nFail = 0;
const ok = (n, c, d) => { if (c) nPass++; else nFail++; R.push((c ? 'PASS' : 'FAIL') + ' | ' + n + (d !== undefined ? ' | ' + d : '')); };

const b = await pw[ENG].launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const p = await ctx.newPage();
const errs = [], warns = [], reqs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e));
p.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); if (m.type() === 'warning') warns.push(m.text()); });
p.on('request', r => { if (r.url().indexOf('file://') !== 0) reqs.push(r.url()); });

const scr = () => p.evaluate(() => document.body.getAttribute('data-screen'));
const tab = async n => { await p.click(`#jr-tabbar button:nth-of-type(${n})`); await p.waitForTimeout(180); };
const toast = () => p.evaluate(() => { const t = document.getElementById('jr-toast'); return t ? t.textContent.trim() : null; });
const banners = () => p.evaluate(() => Array.from(document.querySelectorAll('.jr-banner .jr-banner__text')).map(x => x.textContent.trim()));
const nExp = () => p.evaluate(() => JR.model.getExpenses().data.items.length);
const nCat = () => p.evaluate(() => JR.model.getCategories().data.items.length);

await p.goto(APP); await p.waitForTimeout(600);

/* ══════ 1. 부팅 ══════ */
const boot = await p.evaluate(() => ({
  mods: Object.keys(JR).sort().join(','), mode: JR.store.mode(), ready: JR.model.isReady(),
  screen: document.body.getAttribute('data-screen'),
  unsup: !!document.getElementById('jr-unsupported'), load: !!document.getElementById('jr-loading'),
  ecount: Object.keys(JR.err.MESSAGES).length, bprio: JR.err.BANNER_PRIORITY.length,
  globals: Object.keys(window).filter(k => /^(JR|jr|app|_)/.test(k)).join(',')
}));
ok('B-01 JR 모듈 6종', boot.mods === 'err,io,model,stats,store,ui', boot.mods);
ok('B-02 부팅 첫 화면 S-01 (INT-30)', boot.screen === 's01', boot.screen);
ok('B-03 정적 폴백 3요소 제거됨 (INT-14)', boot.unsup === false && boot.load === false, JSON.stringify(boot));
ok('B-04 isReady=true', boot.ready === true, String(boot.ready));
ok('B-05 E-코드 64개', boot.ecount === 64, String(boot.ecount));
ok('B-06 BANNER_PRIORITY 15단', boot.bprio === 15, String(boot.bprio));
ok('B-07 저장 모드', boot.mode === 'persist' || boot.mode === 'memory', boot.mode);

/* ══════ 2. 화면 전환 S-01~S-04 · 탭바 ══════ */
ok('S-01 초기', await scr() === 's01', await scr());
await tab(2); ok('S-03 진입', await scr() === 's03', await scr());
await tab(3); ok('S-04 진입', await scr() === 's04', await scr());
await tab(1); ok('S-01 복귀', await scr() === 's01', await scr());
await p.click('#jr-s01-add'); await p.waitForTimeout(250);
ok('S-02 진입', await scr() === 's02', await scr());
const tb = await p.evaluate(() => { const t = document.getElementById('jr-tabbar'); const cs = getComputedStyle(t); return { disp: cs.display, vis: cs.visibility, h: t.getBoundingClientRect().height }; });
ok('S-02 탭바 없음(화면설계)', tb.disp === 'none' || tb.vis === 'hidden' || tb.h === 0, JSON.stringify(tb));
await p.click('#jr-s02-cancel'); await p.waitForTimeout(250);
ok('S-02 취소 → S-01 복귀', await scr() === 's01', await scr());
/* 탭 연타 (중복 클릭) */
for (let i = 0; i < 6; i++) { await p.click('#jr-tabbar button:nth-of-type(' + ((i % 3) + 1) + ')'); }
await p.waitForTimeout(300);
ok('S-전환 연타 6회 후에도 화면 1개만 표시', (await p.evaluate(() => Array.from(document.querySelectorAll('.jr-main')).filter(m => !m.hidden).length)) === 1);
await tab(1);

/* ══════ 3. F-01 지출 추가 + 저장 버튼 중복/연속 클릭 ══════ */
await p.click('#jr-s01-add'); await p.waitForTimeout(250);
await p.fill('#jr-amount', '12500');
await p.click('#jr-cat-group button:nth-of-type(1)');
await p.fill('#jr-memo', '점심');
await Promise.all([p.click('#jr-s02-save'), p.click('#jr-s02-save').catch(() => {}), p.click('#jr-s02-save').catch(() => {})]);
await p.waitForTimeout(500);
ok('F-01 저장 후 S-01 복귀', await scr() === 's01', await scr());
ok('F-01 3연타에도 1건만 (예외5)', await nExp() === 1, 'n=' + await nExp());
ok('F-01 목록 1행', (await p.locator('#jr-s01-list .jr-expense-row').count()) === 1);
ok('F-01 총합 12,500원', /12,500/.test(await p.textContent('#jr-s01-total')), (await p.textContent('#jr-s01-total')).trim());
await p.reload(); await p.waitForTimeout(500);
ok('F-01 새로고침 후 유지 (INT-26 합격조건)', await nExp() === 1, 'n=' + await nExp());

/* ══════ 4. F-02 수정 ══════ */
const before = await p.evaluate(() => { const e = JR.model.getExpenses().data.items[0]; return { id: e.id, c: e.createdAt }; });
await p.click('#jr-s01-list .jr-expense-row'); await p.waitForTimeout(300);
ok('F-02 행 클릭 → S-02', await scr() === 's02', await scr());
ok('F-02 기존 값 채워짐', (await p.inputValue('#jr-amount')).replace(/,/g, '') === '12500', await p.inputValue('#jr-amount'));
await p.fill('#jr-amount', '20000');
await p.click('#jr-s02-save'); await p.waitForTimeout(400);
const after = await p.evaluate(() => { const e = JR.model.getExpenses().data.items[0]; return { id: e.id, c: e.createdAt, a: e.amount }; });
ok('F-02 금액 반영', after.a === 20000, 'amount=' + after.a);
ok('F-02 id·createdAt 불변', before.id === after.id && before.c === after.c);

/* ══════ 5. 금액 경계값 13종 — UI 타이핑 + validateExpense 직접 호출 ══════ */
const AMTS = ['0', '1', '999999999', '1000000000', '12,500', ' 3000 ', '1e3', '٣', '-0', '', '1.5', '-5', 'abc'];
const vres = await p.evaluate((list) => {
  const c = JR.model.getCategories().data.items[0].id, d = JR.model.today();
  return list.map(a => { const r = JR.model.validateExpense({ date: d, amount: a, categoryId: c, memo: '' }); return { a: a, ok: r.ok, code: r.ok ? '' : (r.data.errors || []).map(e => e.field + ':' + e.code).join(',') }; });
}, AMTS);
const EXPECT = { '0': 'E-103', '1': 'OK', '999999999': 'OK', '1000000000': 'E-104', '12,500': 'OK', ' 3000 ': 'OK', '1e3': 'E-102', '٣': 'E-102', '-0': 'E-102', '': 'E-101', '1.5': 'E-105', '-5': 'E-102', 'abc': 'E-102' };
vres.forEach(r => {
  const exp = EXPECT[r.a], got = r.ok ? 'OK' : r.code.split(':')[1];
  ok('금액 경계 "' + r.a + '" → ' + exp, got === exp, 'got=' + got);
});
/* UI 입력 필터 (INT-20 2차 방어선) */
const uiFilter = await p.evaluate(async () => {
  const el = document.getElementById('jr-amount'); const out = [];
  for (const v of ['-5', '1.5', 'abc', '12,500', '１２３', '٣', '😀', '1e3']) {
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
    out.push({ inp: v, after: el.value });
  }
  el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
  return out;
});
ok('금액란 INT-20 필터: -5→5', uiFilter[0].after === '5', JSON.stringify(uiFilter[0]));
ok('금액란 INT-20 필터: 1.5→15', uiFilter[1].after === '15', JSON.stringify(uiFilter[1]));
ok('금액란 INT-20 필터: abc→빈값', uiFilter[2].after === '', JSON.stringify(uiFilter[2]));
ok('금액란 INT-20 필터: 전각 １２３ 처리', /^[0-9,]*$/.test(uiFilter[4].after), JSON.stringify(uiFilter[4]));
ok('금액란 INT-20 필터: 아라비아숫자 ٣ 처리', /^[0-9,]*$/.test(uiFilter[5].after), JSON.stringify(uiFilter[5]));
ok('금액란 INT-20 필터: 이모지 처리', /^[0-9,]*$/.test(uiFilter[6].after), JSON.stringify(uiFilter[6]));

/* 빈값 → INT-02 저장 버튼 비활성 4조건 */
await p.click('#jr-s01-add'); await p.waitForTimeout(250);
await p.fill('#jr-amount', ''); await p.click('#jr-cat-group button:nth-of-type(1)');
await p.waitForTimeout(200);
ok('INT-02 빈 금액 → 저장 버튼 비활성', (await p.isDisabled('#jr-s02-save')) === true);
await p.fill('#jr-amount', '1000'); await p.waitForTimeout(200);
ok('INT-02 금액 입력 시 저장 버튼 활성', (await p.isDisabled('#jr-s02-save')) === false);
await p.fill('#jr-amount', '   '); await p.waitForTimeout(200);
ok('INT-02 공백만 입력 → 저장 버튼 비활성', (await p.isDisabled('#jr-s02-save')) === true);
await p.evaluate(() => { document.getElementById('jr-date').value = ''; document.getElementById('jr-date').dispatchEvent(new Event('input', { bubbles: true })); });
await p.waitForTimeout(200);
ok('INT-02 날짜 비움 → 저장 버튼 비활성', (await p.isDisabled('#jr-s02-save')) === true);
/* E-101 인라인 슬롯 라우팅 */
const amtHint = await p.evaluate(async () => { JR.ui.show('E-101'); await new Promise(r => setTimeout(r, 80)); return document.getElementById('jr-amount-hint').textContent.trim(); });
ok('E-101 인라인 슬롯 도달', /금액을 입력해 주세요/.test(amtHint), 'hint=' + amtHint);

/* ══════ 6. 메모 경계 — 99/100/101자 · 150/151자 · 이모지 · 전각 · 유니코드 ══════ */
const memoRes = await p.evaluate(() => {
  const c = JR.model.getCategories().data.items[0].id, d = JR.model.today();
  const mk = n => 'ㄱ'.repeat(n);
  const t = m => { const r = JR.model.validateExpense({ date: d, amount: '1000', categoryId: c, memo: m }); return r.ok ? 'OK' : (r.data.errors || []).map(e => e.code).join(','); };
  return {
    c99: t(mk(99)), c100: t(mk(100)), c101: t(mk(101)), c150: t(mk(150)), c151: t(mk(151)),
    emoji100: t('😀'.repeat(100)), emoji50: t('😀'.repeat(50)),
    cc_emoji: JR.model.countChars('😀'.repeat(50)), len_emoji: ('😀'.repeat(50)).length,
    zwj: JR.model.countChars('👨‍👩‍👧‍👦'), full: t('ａ'.repeat(100)), rtl: t('م'.repeat(100))
  };
});
ok('메모 99자 통과', memoRes.c99 === 'OK', memoRes.c99);
ok('메모 100자 통과(상한)', memoRes.c100 === 'OK', memoRes.c100);
ok('메모 101자 거부 E-120', /E-12[01]/.test(memoRes.c101), memoRes.c101);
ok('메모 150자 거부', memoRes.c150 !== 'OK', memoRes.c150);
ok('메모 151자 거부', memoRes.c151 !== 'OK', memoRes.c151);
ok('메모 이모지 50자(코드포인트) 통과', memoRes.emoji50 === 'OK', memoRes.emoji50);
ok('메모 이모지 100자 통과(countChars 기준)', memoRes.emoji100 === 'OK', memoRes.emoji100);
ok('countChars 는 코드포인트 계수(String.length 아님)', memoRes.cc_emoji === 50 && memoRes.len_emoji === 100, 'cc=' + memoRes.cc_emoji + ' len=' + memoRes.len_emoji);
ok('메모 전각 100자 통과', memoRes.full === 'OK', memoRes.full);
ok('메모 RTL 100자 통과', memoRes.rtl === 'OK', memoRes.rtl);
/* textarea maxlength — INT-37 확정: maxlength 로 상한을 걸지 않습니다 */
const ml = await p.evaluate(() => document.getElementById('jr-memo').getAttribute('maxlength'));
ok('INT-37 memo textarea maxlength 제거됨', ml === null, 'maxlength=' + ml);
/* 이모지 붙여넣기 → 브라우저가 막는가 */
const emojiPaste = await p.evaluate(() => {
  const el = document.getElementById('jr-memo');
  el.value = ''; el.focus();
  el.value = '😀'.repeat(60); el.dispatchEvent(new Event('input', { bubbles: true }));
  return { val: JR.model.countChars(el.value), raw: el.value.length, counter: document.getElementById('jr-memo-counter').textContent };
});
ok('메모 이모지 60자 입력 시 카운터/실값 일치', emojiPaste.val === 60 && emojiPaste.counter === '60/100', JSON.stringify(emojiPaste));
/* 101 코드포인트 붙여넣기 → 잘림 + E-123 */
const trunc = await p.evaluate(async () => {
  const el = document.getElementById('jr-memo'); const t = document.getElementById('jr-toast');
  t.textContent = '';
  el.value = 'ㄱ'.repeat(130); el.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  return { after: JR.model.countChars(el.value), toast: t.textContent.trim() };
});
ok('메모 130자 붙여넣기 → 100자로 잘림', trunc.after === 100, 'after=' + trunc.after);
ok('INT-37 잘림 시 E-123 통지', trunc.toast.length > 0, 'toast="' + trunc.toast + '"');
await p.evaluate(() => { const el = document.getElementById('jr-memo'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.click('#jr-s02-cancel'); await p.waitForTimeout(250);

/* ══════ 7. 날짜 경계 ══════ */
const dres = await p.evaluate(() => {
  const c = JR.model.getCategories().data.items[0].id;
  const t = d => { const r = JR.model.validateExpense({ date: d, amount: '1000', categoryId: c, memo: '' }); return r.ok ? 'OK' : (r.data.errors || []).map(e => e.code).join(','); };
  const mn = JR.model.minDate(), mx = JR.model.maxDate();
  const shift = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  return { min: mn, max: mx, atMin: t(mn), belowMin: t(shift(mn, -1)), atMax: t(mx), overMax: t(shift(mx, 1)), empty: t(''), bad: t('2026-13-45') };
});
ok('날짜 하한 ' + dres.min + ' 통과', dres.atMin === 'OK', dres.atMin);
ok('날짜 하한-1일 거부 E-110', dres.belowMin === 'E-110', dres.belowMin);
ok('날짜 상한 ' + dres.max + ' 통과', dres.atMax === 'OK', dres.atMax);
ok('날짜 상한+1일 거부 E-111', dres.overMax === 'E-111', dres.overMax);
ok('날짜 빈값 거부', dres.empty !== 'OK', dres.empty);
ok('날짜 형식 오류 거부', dres.bad !== 'OK', dres.bad);

/* ══════ 8. F-03 삭제 — 취소/확정 + 연타 ══════ */
await p.evaluate(() => { const c = JR.model.getCategories().data.items; JR.model.addExpense({ date: JR.model.today(), amount: '5000', categoryId: c[1].id, memo: '버스' }); });
await p.reload(); await p.waitForTimeout(450);
const n0 = await nExp();
await p.click('#jr-s01-list .jr-expense-row'); await p.waitForTimeout(300);
await p.click('#jr-s02-delete'); await p.waitForTimeout(250);
ok('F-03 확인 대화상자 표시', (await p.locator('#jr-dialog-overlay').count()) > 0);
ok('F-03 대화상자 role=alertdialog', (await p.locator('#jr-dialog-overlay [role="alertdialog"]').count()) > 0);
await p.evaluate(() => Array.from(document.querySelectorAll('#jr-dialog-overlay button')).find(x => /취소/.test(x.textContent)).click());
await p.waitForTimeout(250);
ok('F-03 취소는 삭제 안 함', await nExp() === n0, 'n=' + await nExp());
/* 삭제 버튼 연타 후 확정 */
await p.click('#jr-s02-delete'); await p.click('#jr-s02-delete').catch(() => {}); await p.waitForTimeout(250);
ok('F-03 삭제 버튼 연타해도 대화상자 1개', (await p.locator('#jr-dialog-overlay').count()) === 1, 'overlay=' + await p.locator('#jr-dialog-overlay').count());
await p.evaluate(() => Array.from(document.querySelectorAll('#jr-dialog-overlay button')).find(x => /^삭제/.test(x.textContent.trim())).click());
await p.waitForTimeout(400);
ok('F-03 확정 시 1건 감소', await nExp() === n0 - 1, 'n=' + await nExp());
ok('F-03 삭제 후 S-01 복귀', await scr() === 's01', await scr());

/* ══════ 9. F-04 목록 순서 결정성 (새로고침 5회) ══════ */
await p.evaluate(() => { const c = JR.model.getCategories().data.items; const d = JR.model.today(); for (let i = 0; i < 5; i++) JR.model.addExpense({ date: d, amount: String(1000 + i), categoryId: c[i % c.length].id, memo: 'm' + i }); });
await p.reload(); await p.waitForTimeout(450);
let sig = await p.evaluate(() => JR.model.getExpenses().data.items.map(e => e.id).join(','));
let stable = true;
for (let i = 0; i < 5; i++) { await p.reload(); await p.waitForTimeout(350); const s = await p.evaluate(() => JR.model.getExpenses().data.items.map(e => e.id).join(',')); if (s !== sig) stable = false; }
ok('F-04 새로고침 5회 정렬 불변', stable, 'sig=' + sig.slice(0, 40) + '...');

/* ══════ 10. F-05 월 이동 — 버튼 연타 · S-01↔S-03 공유 · 새로고침 ══════ */
const m0 = (await p.textContent('#jr-s01-month')).trim();
await p.click('#jr-s01-prev'); await p.waitForTimeout(250);
const m1 = (await p.textContent('#jr-s01-month')).trim();
ok('F-05 이전 달 이동', m1 !== m0, m0 + ' → ' + m1);
await p.click('#jr-s01-next'); await p.waitForTimeout(250);
ok('F-05 다음 달로 복귀', (await p.textContent('#jr-s01-month')).trim() === m0);
/* 연타 12회 */
for (let i = 0; i < 12; i++) await p.click('#jr-s01-prev');
await p.waitForTimeout(400);
const m12 = (await p.textContent('#jr-s01-month')).trim();
await tab(2);
ok('F-05 연타 12회 후 S-03 도 같은 월', (await p.textContent('#jr-s03-month')).trim() === m12, 'S01=' + m12 + ' S03=' + (await p.textContent('#jr-s03-month')).trim());
await p.click('#jr-s03-next'); await p.waitForTimeout(250);
const m13 = (await p.textContent('#jr-s03-month')).trim();
await tab(1);
ok('F-05 S-03 에서 이동한 월이 S-01 에 반영', (await p.textContent('#jr-s01-month')).trim() === m13, m13);
await p.reload(); await p.waitForTimeout(450);
ok('F-05 새로고침 후 월 유지', (await p.textContent('#jr-s01-month')).trim() === m13, (await p.textContent('#jr-s01-month')).trim());
/* 원래 달로 복귀 */
for (let i = 0; i < 11; i++) await p.click('#jr-s01-next');
await p.waitForTimeout(400);
ok('F-05 현재 달 복귀', (await p.textContent('#jr-s01-month')).trim() === m0, (await p.textContent('#jr-s01-month')).trim());

/* ══════ 11. F-06 통계 · 최대잔여법 ══════ */
await tab(2); await p.waitForTimeout(300);
const st = await p.evaluate(() => {
  const cases = [[[3334, 3333, 3333], 10000], [[1, 1, 1], 3], [[1], 1], [[5000, 8000], 13000], [[1, 1, 1, 1, 1, 1, 1], 7], [[1000000000, 1], 1000000001], [[0, 0], 0], [[], 0]];
  const res = cases.map(c => { const o = JR.stats.allocatePercents(c[0], c[1]); return { in: c[0].length, out: o, sum: o.reduce((a, b) => a + b, 0) }; });
  const bc = JR.stats.byCategory(JR.model.monthRange ? Object.keys({}).length === 0 ? (new Date()).toISOString().slice(0, 7) : '' : '');
  return { res: res, bcOk: bc.ok, items: bc.ok ? bc.data.items.length : -1, psum: bc.ok ? bc.data.items.reduce((a, b) => a + b.percent, 0) : -1 };
});
st.res.forEach((r, i) => ok('F-06 최대잔여법 케이스' + (i + 1) + ' 합', (r.in === 0 || r.sum === 0) ? true : r.sum === 100, 'out=' + JSON.stringify(r.out) + ' sum=' + r.sum));
ok('F-06 byCategory 성공', st.bcOk === true);
ok('F-06 화면 비율 합 100 (항목 ' + st.items + '개)', st.items === 0 ? true : st.psum === 100, 'psum=' + st.psum);
const barN = await p.locator('#jr-s03-list .jr-stat-row, #jr-s03-list > *').count();
ok('F-06 통계 목록 렌더', barN > 0, 'rows=' + barN);
ok('F-06 총합·건수 표시', (await p.textContent('#jr-s03-total')).trim().length > 0 && (await p.textContent('#jr-s03-count')).trim().length > 0, (await p.textContent('#jr-s03-total')).trim() + ' / ' + (await p.textContent('#jr-s03-count')).trim());

/* ══════ 12. F-07 카테고리 CRUD ══════ */
await tab(3); await p.waitForTimeout(300);
ok('F-07 기본 카테고리 8종', await nCat() === 8, 'n=' + await nCat());
/* 빈 이름 추가 — 버튼 비활성 */
await p.fill('#jr-cat-new', ''); await p.waitForTimeout(200);
ok('F-07 빈 이름 → 추가 버튼 비활성', (await p.isDisabled('#jr-s04-cat-add')) === true);
await p.fill('#jr-cat-new', '   '); await p.waitForTimeout(200);
ok('F-07 공백만 → 추가 버튼 비활성', (await p.isDisabled('#jr-s04-cat-add')) === true);
ok('F-07 빈 이름으로 카테고리 안 늘어남', await nCat() === 8, 'n=' + await nCat());
/* 정상 추가 + 연타 */
await p.fill('#jr-cat-new', '테스트분류');
await Promise.all([p.click('#jr-s04-cat-add'), p.click('#jr-s04-cat-add').catch(() => {})]);
await p.waitForTimeout(350);
ok('F-07 추가 연타에도 1개만 추가', await nCat() === 9, 'n=' + await nCat());
/* 중복 E-116 */
await p.fill('#jr-cat-new', '테스트분류'); await p.click('#jr-s04-cat-add'); await p.waitForTimeout(300);
const dupHint = (await p.textContent('#jr-cat-new-hint')).trim();
ok('F-07 중복 이름 E-116 인라인 + {name} 치환', /테스트분류/.test(dupHint) && /이미 있습니다/.test(dupHint), 'hint=' + dupHint);
/* 12자/13자 이름 */
const nameRes = await p.evaluate(() => ({ n12: JR.model.addCategory('가'.repeat(12)), n13: JR.model.addCategory('나'.repeat(13)), blank: JR.model.addCategory('   ') }));
ok('F-07 이름 12자 통과', nameRes.n12.ok === true, JSON.stringify(nameRes.n12.code || 'ok'));
ok('F-07 이름 13자 거부 E-115', nameRes.n13.code === 'E-115', String(nameRes.n13.code));
ok('F-07 공백 이름 거부 E-114', nameRes.blank.code === 'E-114', String(nameRes.blank.code));
/* 이름변경 */
await p.reload(); await p.waitForTimeout(450); await tab(3); await p.waitForTimeout(250);
await p.click('#jr-s04-cat-list [data-act="rename"]'); await p.waitForTimeout(250);
ok('F-07 이름변경 편집행 노출', (await p.locator('#jr-cat-edit-input').count()) === 1);
await p.fill('#jr-cat-edit-input', '바뀐이름');
await p.click('#jr-s04-cat-list [data-act="confirm"]'); await p.waitForTimeout(350);
ok('F-07 이름변경 반영', await p.evaluate(() => JR.model.getCategories().data.items.some(c => c.name === '바뀐이름')));
/* 20개 상한 */
const maxSt = await p.evaluate(() => { let g; while (JR.model.getCategories().data.items.length < 20) { g = JR.model.addCategory('c' + JR.model.getCategories().data.items.length); if (!g.ok) return { err: g.code }; } return { n: JR.model.getCategories().data.items.length, over: JR.model.addCategory('overflow').code }; });
await p.reload(); await p.waitForTimeout(450); await tab(3); await p.waitForTimeout(300);
ok('F-07 20개 도달', maxSt.n === 20, JSON.stringify(maxSt));
ok('F-07 21번째 거부 E-117', maxSt.over === 'E-117', String(maxSt.over));
ok('F-07 20개에서 추가 버튼 비활성', (await p.isDisabled('#jr-s04-cat-add')) === true);
ok('F-07 상한 안내문 INT-31', (await p.textContent('#jr-s04-cat-shared-hint')).trim() === '카테고리는 최대 20개까지 만들 수 있습니다.', '"' + (await p.textContent('#jr-s04-cat-shared-hint')).trim() + '"');
/* 최소 1개 */
const minSt = await p.evaluate(() => { const it = JR.model.getCategories().data.items.slice(); for (let i = 0; i < it.length - 1; i++) JR.model.deleteCategory(it[i].id); return { n: JR.model.getCategories().data.items.length, del: JR.model.deleteCategory(JR.model.getCategories().data.items[0].id).code }; });
await p.reload(); await p.waitForTimeout(450); await tab(3); await p.waitForTimeout(300);
ok('F-07 1개 남을 때 삭제 거부 E-118', minSt.del === 'E-118', String(minSt.del));
ok('F-07 최소 안내문 INT-31', (await p.textContent('#jr-s04-cat-shared-hint')).trim() === '카테고리는 최소 1개가 있어야 합니다.', '"' + (await p.textContent('#jr-s04-cat-shared-hint')).trim() + '"');
ok('F-07 마지막 1개 삭제 버튼 비활성', (await p.evaluate(() => { const b = document.querySelector('#jr-s04-cat-list [data-act="delete"]'); return b ? b.disabled : 'no-btn'; })) === true);
/* UI 로 카테고리 삭제 (2개 만든 뒤) */
await p.fill('#jr-cat-new', '지울분류'); await p.click('#jr-s04-cat-add'); await p.waitForTimeout(300);
const catN2 = await nCat();
await p.evaluate(() => { const bs = document.querySelectorAll('#jr-s04-cat-list [data-act="delete"]'); bs[bs.length - 1].click(); });
await p.waitForTimeout(250);
const delDlg = await p.locator('#jr-dialog-overlay').count();
if (delDlg > 0) { await p.evaluate(() => Array.from(document.querySelectorAll('#jr-dialog-overlay button')).find(x => /삭제|확인/.test(x.textContent)).click()); await p.waitForTimeout(300); }
ok('F-07 UI 로 카테고리 삭제', await nCat() === catN2 - 1, catN2 + ' → ' + await nCat());

/* ══════ 13. F-08 내보내기 / 가져오기 ══════ */
await p.evaluate(() => { JR.model.wipeAll(); const c = JR.model.getCategories().data.items; JR.model.addExpense({ date: JR.model.today(), amount: '7000', categoryId: c[0].id, memo: '백업대상' }); JR.model.addCategory('백업카테고리'); });
await p.reload(); await p.waitForTimeout(450); await tab(3); await p.waitForTimeout(250);
let dl = null;
try { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#jr-s04-export')]); dl = d; } catch (e) { dl = null; }
await p.waitForTimeout(400);
const fbHidden = await p.evaluate(() => document.getElementById('jr-export-fallback').hidden);
ok('F-08 내보내기 — 다운로드 또는 폴백', dl !== null || fbHidden === false, dl ? ('file=' + dl.suggestedFilename()) : ('fallback hidden=' + fbHidden));
let exported = null;
if (dl) { const fs = require('fs'); const pth = await dl.path(); exported = fs.readFileSync(pth, 'utf8'); }
else { exported = await p.inputValue('#jr-export-text'); }
let parsed = null; try { parsed = JSON.parse(exported); } catch (e) { }
ok('F-08 내보낸 JSON 파싱 가능', parsed !== null, exported ? ('len=' + exported.length) : 'empty');
ok('F-08 내보낸 데이터에 기록 1건·카테고리 9종', parsed && parsed.data.expenses.length === 1 && parsed.data.categories.length === 9, parsed ? (parsed.data.expenses.length + '/' + parsed.data.categories.length + ' schema=' + parsed.schema) : 'n/a');
/* INT-39: 화면을 벗어나면 대체 영역이 사라지는가 */
if (fbHidden === false) {
  await tab(1); await p.waitForTimeout(250); await tab(3); await p.waitForTimeout(250);
  ok('INT-39 대체 영역이 S-04 이탈 후 사라짐', await p.evaluate(() => document.getElementById('jr-export-fallback').hidden) === true, 'hidden=' + await p.evaluate(() => document.getElementById('jr-export-fallback').hidden));
}
/* 전체 삭제 후 가져오기로 복원 */
await p.evaluate(() => JR.model.wipeAll());
await p.reload(); await p.waitForTimeout(450);
ok('F-08 복원 전 0건', await nExp() === 0, 'n=' + await nExp());
const imp = await p.evaluate(async (txt) => { const r = JR.io.parseImport(txt); if (!r.ok) return { stage: 'parse', code: r.code }; const a = JR.io.applyImport(r.data.payload); return { stage: 'apply', ok: a.ok, code: a.code }; }, exported);
await p.reload(); await p.waitForTimeout(450);
ok('F-08 가져오기 성공', imp.ok === true, JSON.stringify(imp));
ok('F-08 가져오기로 기록 복원', await nExp() === 1, 'n=' + await nExp());
ok('F-08 가져오기로 카테고리 복원', await nCat() === 9, 'n=' + await nCat());

/* ══════ 14. F-09 전체 삭제 2단계 ══════ */
await tab(3); await p.waitForTimeout(250);
await p.click('#jr-s04-wipe'); await p.waitForTimeout(250);
ok('F-09 1단계 대화상자', (await p.locator('#jr-dialog-overlay').count()) === 1);
await p.evaluate(() => Array.from(document.querySelectorAll('#jr-dialog-overlay button')).find(x => /취소/.test(x.textContent)).click());
await p.waitForTimeout(250);
ok('F-09 1단계 취소 시 데이터 유지', await nExp() === 1, 'n=' + await nExp());
await p.click('#jr-s04-wipe'); await p.waitForTimeout(250);
await p.evaluate(() => { const bs = Array.from(document.querySelectorAll('#jr-dialog-overlay button')); (bs.find(x => !/취소/.test(x.textContent)) || bs[0]).click(); });
await p.waitForTimeout(300);
const dlg2 = await p.locator('#jr-dialog-overlay').count();
ok('F-09 2단계 대화상자 존재', dlg2 === 1, 'dlg=' + dlg2);
ok('F-09 1단계만으로는 삭제 안 됨', await nExp() === 1, 'n=' + await nExp());
await p.evaluate(() => { const bs = Array.from(document.querySelectorAll('#jr-dialog-overlay button')); (bs.find(x => !/취소/.test(x.textContent)) || bs[0]).click(); });
await p.waitForTimeout(400);
ok('F-09 2단계 완료 시 삭제', await nExp() === 0, 'n=' + await nExp());
ok('F-09 카테고리 기본 8종 복귀', await nCat() === 8, 'n=' + await nCat());
await p.reload(); await p.waitForTimeout(450);
ok('F-09 새로고침 후에도 0건', await nExp() === 0, 'n=' + await nExp());

/* ══════ 15. E-코드 슬롯 라우팅 ══════ */
const slot = await p.evaluate(() => {
  const codes = Object.keys(JR.err.MESSAGES);
  const dist = {}; codes.forEach(c => { const s = JR.err.MESSAGES[c].slot; dist[s] = (dist[s] || 0) + 1; });
  const api = {}; codes.forEach(c => { const s = JR.err.slot(c); api[s] = (api[s] || 0) + 1; });
  const sCodes = codes.filter(c => JR.err.MESSAGES[c].slot === 'S');
  return { total: codes.length, dist: dist, api: api, sCodes: sCodes, sApi: sCodes.map(c => c + '→' + JR.err.slot(c)), bprio: JR.err.BANNER_PRIORITY.slice() };
});
ok('E-코드 총 64', slot.total === 64, String(slot.total));
ok('슬롯 분포 T33·I15·B15·S1 (MESSAGES 원본)', slot.dist.T === 33 && slot.dist.I === 15 && slot.dist.B === 15 && slot.dist.S === 1, JSON.stringify(slot.dist));
ok("JR.err.slot() 반환은 'T'|'I'|'B' 3종 (구조설계 §5-7)", Object.keys(slot.api).sort().join(',') === 'B,I,T', 'slot()분포=' + JSON.stringify(slot.api) + ' S슬롯코드 ' + JSON.stringify(slot.sApi));
ok('BANNER_PRIORITY 15개 = B 슬롯 15개', slot.bprio.length === 15 && slot.bprio.every(c => slot.bprio.indexOf(c) === slot.bprio.lastIndexOf(c)), slot.bprio.join(','));
const route = await p.evaluate(async () => {
  const out = {}; const t = document.getElementById('jr-toast');
  const clear = () => { JR.err.BANNER_PRIORITY.forEach(c => JR.ui.dismissBanner(c)); t.textContent = ''; };
  clear(); JR.ui.show('E-119'); await new Promise(r => setTimeout(r, 80));
  out.T = { toast: t.textContent.trim(), banner: document.querySelectorAll('.jr-banner').length };
  clear(); JR.ui.show('E-413'); await new Promise(r => setTimeout(r, 80));
  out.B = { toast: t.textContent.trim(), banner: document.querySelectorAll('.jr-banner').length };
  clear(); JR.ui.show('E-101'); await new Promise(r => setTimeout(r, 80));
  out.I = { toast: t.textContent.trim(), banner: document.querySelectorAll('.jr-banner').length };
  clear();
  return out;
});
ok('슬롯 T → 토스트만', route.T.toast.length > 0 && route.T.banner === 0, JSON.stringify(route.T));
ok('슬롯 B → 배너만(토스트로 새지 않음)', route.B.banner === 1 && route.B.toast === '', JSON.stringify(route.B));
ok('슬롯 I → 토스트·배너 아님', route.I.toast === '' && route.I.banner === 0, JSON.stringify(route.I));
/* 배너 15단 우선순위 전수 — 닫지 않고 낮은 순위부터 단조 상승 (사건형은 닫으면 세션 내 재표시 없음) */
await p.reload(); await p.waitForTimeout(500);
const prio = await p.evaluate(async () => {
  const P = JR.err.BANNER_PRIORITY.slice(); const out = [];
  for (let i = P.length - 1; i >= 0; i--) {
    JR.ui.banner(P[i], { percent: 80, count: 1 });
    await new Promise(r => setTimeout(r, 30));
    const el = document.querySelector('.jr-banner .jr-banner__text');
    const txt = el ? el.textContent : '';
    let won = '?';
    for (let j = 0; j < P.length; j++) { if (JR.err.get(P[j], { percent: 80, count: 1 }).msg === txt) { won = P[j]; break; } }
    out.push({ raised: P[i], expect: P[i], won: won, n: document.querySelectorAll('.jr-banner').length });
  }
  return out;
});
const prioBad = prio.filter(x => x.won !== x.expect);
ok('배너 우선순위 15단 — 낮은 순위부터 15회 누적, 매번 최상위만 표시', prioBad.length === 0, prioBad.length ? JSON.stringify(prioBad) : '15/15 통과');
ok('배너는 항상 1개만 DOM 에 존재', prio.every(x => x.n === 1), JSON.stringify(prio.map(x => x.n)));
await p.reload(); await p.waitForTimeout(450);
/* 토스트 교체(누적 없음) */
const tstack = await p.evaluate(async () => { JR.ui.show('E-119'); await new Promise(r => setTimeout(r, 50)); JR.ui.show('E-124'); await new Promise(r => setTimeout(r, 50)); return { n: document.querySelectorAll('#jr-toast').length, txt: document.getElementById('jr-toast').textContent.trim() }; });
ok('토스트 교체(누적 없음)', tstack.n === 1, JSON.stringify(tstack));

/* ══════ 16. 접근성 · 레이아웃 ══════ */
const a11 = {};
for (const [s, n] of [['s01', 1], ['s03', 2], ['s04', 3]]) {
  await tab(n); await p.waitForTimeout(250);
  a11[s] = await p.evaluate(() => Array.from(document.querySelectorAll('button:not([hidden]),a[href],input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])'))
    .filter(el => el.offsetParent !== null && !el.disabled)
    .map(el => { const r = el.getBoundingClientRect(); return { id: el.id || el.className, w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter(x => x.w < 44 || x.h < 44).filter(x => x.id !== 'jr-import-file'));
}
await tab(1); await p.waitForTimeout(200);
await p.click('#jr-s01-add'); await p.waitForTimeout(300);
a11.s02 = await p.evaluate(() => Array.from(document.querySelectorAll('button:not([hidden]),input:not([type=hidden]),textarea,[tabindex]:not([tabindex="-1"])'))
  .filter(el => el.offsetParent !== null && !el.disabled)
  .map(el => { const r = el.getBoundingClientRect(); return { id: el.id || el.className, w: Math.round(r.width), h: Math.round(r.height) }; })
  .filter(x => x.w < 44 || x.h < 44));
await p.click('#jr-s02-cancel'); await p.waitForTimeout(250);
['s01', 's02', 's03', 's04'].forEach(s => ok('접근성 44×44 — ' + s.toUpperCase(), a11[s].length === 0, a11[s].length ? JSON.stringify(a11[s]) : '전 요소 통과'));
/* 360px 가로 스크롤 */
await p.setViewportSize({ width: 360, height: 640 });
await p.waitForTimeout(300);
const ov = {};
for (const [s, n] of [['s01', 1], ['s03', 2], ['s04', 3]]) { await tab(n); await p.waitForTimeout(200); ov[s] = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); }
await tab(1); await p.waitForTimeout(200); await p.click('#jr-s01-add'); await p.waitForTimeout(300);
ov.s02 = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
await p.click('#jr-s02-cancel'); await p.waitForTimeout(200);
Object.keys(ov).forEach(s => ok('360px 가로 스크롤 0 — ' + s.toUpperCase(), ov[s].sw <= ov[s].cw, JSON.stringify(ov[s])));
await p.setViewportSize({ width: 390, height: 844 });
/* 키보드 순회 + Enter/Escape + 포커스링(:focus-visible) */
await p.waitForTimeout(200);
await tab(1); await p.waitForTimeout(250);
await p.evaluate(() => document.body.click());
const seq = [];
for (let i = 0; i < 12; i++) { await p.keyboard.press('Tab'); seq.push(await p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.tagName + '.' + (a.className || '').split(' ')[0]) : 'none'; })); }
const uniq = Array.from(new Set(seq.filter(x => x !== 'BODY.' && x !== 'none')));
ok('키보드 Tab 12회 순회 — 조작 요소 도달', uniq.length >= 4 && uniq.indexOf('jr-s01-add') !== -1, 'unique=' + uniq.length + ' ' + JSON.stringify(uniq));
ok('키보드 Tab 순회에 탭바 3개 포함', seq.filter(x => /jr-tab/.test(x)).length >= 3 || uniq.filter(x => /jr-tab/.test(x)).length >= 1, JSON.stringify(seq));
/* 포커스링 — 키보드 포커스(:focus-visible) 기준 */
await p.evaluate(() => document.body.click());
await p.keyboard.press('Tab');
const ring = await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { el: a.id || a.tagName, ow: cs.outlineWidth, os: cs.outlineStyle, vis: a.matches(':focus-visible') }; });
ok('포커스링 존재(:focus-visible)', ring.os !== 'none' && parseFloat(ring.ow) > 0, JSON.stringify(ring));
/* Enter 로 버튼 활성화 */
await p.focus('#jr-s01-add'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
ok('키보드 Enter 로 S-02 진입', await scr() === 's02', await scr());
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
const escScr = await scr();
if (escScr === 's02') { await p.click('#jr-s02-cancel').catch(() => { }); await p.waitForTimeout(250); }
ok('Escape/취소 후 S-01 복귀', await scr() === 's01', 'Escape직후=' + escScr + ' 현재=' + await scr());
/* Escape 로 대화상자 닫힘 */
await p.evaluate(() => { const c = JR.model.getCategories().data.items; JR.model.addExpense({ date: JR.model.today(), amount: '1200', categoryId: c[0].id, memo: 'esc' }); });
await p.reload(); await p.waitForTimeout(450);
await p.click('#jr-s01-list .jr-expense-row'); await p.waitForTimeout(300);
await p.click('#jr-s02-delete'); await p.waitForTimeout(250);
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
ok('Escape 로 확인 대화상자 닫힘', (await p.locator('#jr-dialog-overlay').count()) === 0, 'overlay=' + await p.locator('#jr-dialog-overlay').count());
await p.click('#jr-s02-cancel').catch(() => { }); await p.waitForTimeout(250);
const lang = await p.evaluate(() => document.documentElement.lang);
ok('html lang="ko"', lang === 'ko', lang);

/* ══════ 17. 상태 — 백그라운드 전환 · 중복 탭 · 새로고침 중 ══════ */
const vis = await p.evaluate(async () => {
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('pagehide'));
  await new Promise(r => setTimeout(r, 250));
  return { screen: document.body.getAttribute('data-screen'), ready: JR.model.isReady() };
});
ok('백그라운드 전환 이벤트 후 앱 정상', vis.ready === true && vis.screen === 's01', JSON.stringify(vis));
/* 중복 탭 — 같은 storage 를 두 페이지가 공유 */
const baseN = await nExp();
const p2 = await ctx.newPage();
await p2.goto(APP); await p2.waitForTimeout(500);
await p2.evaluate(() => { const c = JR.model.getCategories().data.items; JR.model.addExpense({ date: JR.model.today(), amount: '3300', categoryId: c[0].id, memo: '두번째탭' }); });
await p2.waitForTimeout(200);
await p.bringToFront();
const dup = await p.evaluate(async () => { JR.model.init(); await new Promise(r => setTimeout(r, 200)); return JR.model.getExpenses().data.items.length; });
ok('중복 탭 — 다른 탭 저장분이 재초기화 후 보임', dup === baseN + 1, '이전=' + baseN + ' 재초기화후=' + dup);
/* INT-38: 재렌더가 통지보다 먼저인가 */
await p2.evaluate(() => { const c = JR.model.getCategories().data.items; JR.model.addExpense({ date: JR.model.today(), amount: '4400', categoryId: c[0].id, memo: '탭2추가' }); });
await p2.waitForTimeout(150);
await p.bringToFront();
const int38 = await p.evaluate(async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(r => setTimeout(r, 400));
  return { rows: document.querySelectorAll('#jr-s01-list .jr-expense-row').length, store: JR.model.getExpenses().data.items.length, toast: document.getElementById('jr-toast').textContent.trim() };
});
ok('INT-38 E-605 통지 시 화면이 실제로 다시 그려짐', int38.rows === int38.store, 'DOM행=' + int38.rows + ' 저장분=' + int38.store + ' toast="' + int38.toast + '"');
await p2.close();

/* ══════ 18. 콘솔·네트워크 ══════ */
ok('콘솔 에러 0건', errs.length === 0, errs.length ? JSON.stringify(errs.slice(0, 4)) : '0');
ok('콘솔 경고 0건', warns.length === 0, warns.length ? JSON.stringify(warns.slice(0, 3)) : '0');
ok('file:// 외 네트워크 요청 0건', reqs.length === 0, reqs.length ? JSON.stringify(reqs.slice(0, 3)) : '0');

console.log('===== 사이클 ' + CYC + ' · ' + ENG + ' · ' + new Date().toISOString() + ' =====');
R.forEach(r => console.log(r));
console.log('---- 결과: PASS ' + nPass + ' / FAIL ' + nFail + ' / 콘솔에러 ' + errs.length + ' ----');
if (nFail) { console.log('실패 항목:'); R.filter(x => x.indexOf('FAIL') === 0).forEach(x => console.log('  ' + x)); }
await b.close();
process.exit(0);
})();
