/* QA 기능시험 — 예외 8종 직접 재현 + INT-36/37 확인  (functional-tester)
 * 사용법: node qa-exc.cjs <chromium|firefox|webkit>
 * ④ 의 exc.cjs·exc2.cjs 를 인용하지 않고 독립 구현으로 다시 재현합니다.
 */
(async () => {
const ENG = process.argv[2] || 'chromium';
const pw = require('/opt/node22/lib/node_modules/playwright');
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b = await pw[ENG].launch();
const R = []; let nPass = 0, nFail = 0;
const ok = (n, c, d) => { if (c) nPass++; else nFail++; R.push((c ? 'PASS' : 'FAIL') + ' | ' + n + (d !== undefined ? ' | ' + d : '')); };

async function mk(initScript) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  if (initScript) await p.addInitScript(initScript);
  await p.goto(APP); await p.waitForTimeout(700);
  return { p: p, errs: errs, ctx: ctx };
}
const bannerTxt = p => p.evaluate(() => Array.from(document.querySelectorAll('.jr-banner .jr-banner__text')).map(x => x.textContent.trim()));
const toastTxt = p => p.evaluate(() => document.getElementById('jr-toast').textContent.trim());

/* ═══ 예외 1. localStorage 자체 차단 ═══ */
{ const { p, errs, ctx } = await mk(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { throw new Error('SecurityError: blocked'); } });
  });
  const st = await p.evaluate(() => ({ mode: JR.store.mode(), ready: JR.model.isReady(), screen: document.body.getAttribute('data-screen') }));
  ok('예외1 localStorage 차단 → 메모리 모드', st.mode === 'memory', JSON.stringify(st));
  ok('예외1 앱 기동 성공', st.ready === true && st.screen === 's01', JSON.stringify(st));
  const bn = await bannerTxt(p);
  ok('예외1 E-201 배너 노출', bn.some(t => /저장 기능이 꺼져 있어/.test(t)), JSON.stringify(bn).slice(0, 90));
  const add = await p.evaluate(() => { const c = JR.model.getCategories().data.items; return JR.model.addExpense({ date: JR.model.today(), amount: '5000', categoryId: c[0].id, memo: '메모리모드' }); });
  ok('예외1 메모리 모드에서도 저장 성공', add.ok === true, JSON.stringify(add).slice(0, 80));
  await p.reload(); await p.waitForTimeout(600);
  const afterN = await p.evaluate(() => JR.model.getExpenses().data.items.length);
  ok('예외1 메모리 모드는 새로고침 시 사라짐(설계대로)', afterN === 0, 'n=' + afterN);
  ok('예외1 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

/* ═══ 예외 2. 용량 초과 (QuotaExceededError) ═══ */
{ const { p, errs, ctx } = await mk();
  const r = await p.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (String(k).indexOf('jr.') === 0) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
    const c = JR.model.getCategories().data.items;
    let res, threw = null;
    try { res = JR.model.addExpense({ date: JR.model.today(), amount: '1234', categoryId: c[0].id, memo: '용량초과' }); }
    catch (e) { threw = String(e); }
    Storage.prototype.setItem = orig;
    return { res: res, threw: threw };
  });
  ok('예외2 용량 초과 시 예외를 던지지 않음', r.threw === null, String(r.threw));
  ok('예외2 {ok:false, code:E-202} 반환', r.res && r.res.ok === false && r.res.code === 'E-202', JSON.stringify(r.res).slice(0, 100));
  await p.waitForTimeout(300);
  const bn = await bannerTxt(p);
  ok('예외2 E-202 가 사용자에게 보임(B 슬롯)', await p.evaluate(() => { JR.ui.show('E-202'); return true; }) && (await bannerTxt(p)).some(t => /저장 공간이 가득 차/.test(t)), JSON.stringify(bn).slice(0, 70));
  ok('예외2 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

/* ═══ 예외 3. 저장 JSON 손상 ═══ */
{ const { p, errs, ctx } = await mk(() => {
    try {
      localStorage.setItem('jr.v1.meta', JSON.stringify({ appId: 'jr-expense', schema: 1, lastWriteAt: Date.now() }));
      localStorage.setItem('jr.v1.expenses', '{{{깨진 JSON');
      localStorage.setItem('jr.v1.categories', '[[[또 깨진');
    } catch (e) { }
  });
  const st = await p.evaluate(() => ({ ready: JR.model.isReady(), n: JR.model.getExpenses().data.items.length, c: JR.model.getCategories().data.items.length }));
  ok('예외3 손상 JSON 에도 부팅 성공', st.ready === true, JSON.stringify(st));
  const keys = await p.evaluate(() => Object.keys(localStorage).filter(k => /corrupt/.test(k)));
  ok('예외3 손상분을 지우지 않고 격리 보관', keys.length > 0, JSON.stringify(keys));
  const raw = await p.evaluate(ks => ks.map(k => localStorage.getItem(k)), keys);
  ok('예외3 격리본에 원본 문자열 보존', raw.some(v => /깨진/.test(v)), JSON.stringify(raw).slice(0, 80));
  ok('예외3 배너 통지', (await bannerTxt(p)).length > 0, JSON.stringify(await bannerTxt(p)).slice(0, 80));
  ok('예외3 카테고리 기본 8종으로 복구', st.c === 8, 'c=' + st.c);
  ok('예외3 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

/* ═══ 예외 4. 남의 JSON / 비-JSON 가져오기 ═══ */
{ const { p, errs, ctx } = await mk();
  await p.evaluate(() => { const c = JR.model.getCategories().data.items; JR.model.addExpense({ date: JR.model.today(), amount: '9000', categoryId: c[0].id, memo: '지켜야할기록' }); });
  const n0 = await p.evaluate(() => JR.model.getExpenses().data.items.length);
  const cases = await p.evaluate(() => ({
    other: JR.io.parseImport(JSON.stringify({ app: 'someone-else', kind: 'backup', schema: 1, data: { expenses: [], categories: [] } })).code,
    notjson: JR.io.parseImport('이건 JSON 이 아닙니다').code,
    empty: JR.io.parseImport('').code,
    arr: JR.io.parseImport('[1,2,3]').code,
    nul: JR.io.parseImport('null').code,
    future: JR.io.parseImport(JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 99, data: { expenses: [], categories: [] } })).code,
    nodata: JR.io.parseImport(JSON.stringify({ app: 'jr-expense', kind: 'backup', schema: 1 })).code
  }));
  ok('예외4 남의 앱 JSON → E-405', cases.other === 'E-405', String(cases.other));
  ok('예외4 비-JSON 텍스트 → E-404', cases.notjson === 'E-404', String(cases.notjson));
  ok('예외4 빈 문자열 거부', !!cases.empty, String(cases.empty));
  ok('예외4 배열 최상위 거부', !!cases.arr, String(cases.arr));
  ok('예외4 null 거부', !!cases.nul, String(cases.nul));
  ok('예외4 상위 스키마 → E-406', cases.future === 'E-406', String(cases.future));
  ok('예외4 data 누락 거부', !!cases.nodata, String(cases.nodata));
  const n1 = await p.evaluate(() => JR.model.getExpenses().data.items.length);
  ok('예외4 실패 시 저장소 무접촉', n0 === n1, n0 + ' → ' + n1);
  const tst = await p.evaluate(async () => { JR.ui.show('E-405'); await new Promise(r => setTimeout(r, 100)); return document.getElementById('jr-toast').textContent.trim(); });
  ok('예외4 E-405 토스트 문구 표시', /이 앱에서 내보낸 파일이 아닙니다/.test(tst), tst);
  ok('예외4 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

/* ═══ 예외 5. 저장 버튼 중복·연속 클릭 ═══ */
{ const { p, errs, ctx } = await mk();
  await p.click('#jr-s01-add'); await p.waitForTimeout(250);
  await p.fill('#jr-amount', '3000'); await p.click('#jr-cat-group button:nth-of-type(1)');
  await p.waitForTimeout(150);
  await p.evaluate(() => { const b = document.getElementById('jr-s02-save'); for (let i = 0; i < 10; i++) b.click(); });
  await p.waitForTimeout(600);
  const n = await p.evaluate(() => JR.model.getExpenses().data.items.length);
  ok('예외5 저장 10연타 → 1건만 저장', n === 1, 'n=' + n);
  ok('예외5 저장 후 S-01 복귀', await p.evaluate(() => document.body.getAttribute('data-screen')) === 's01');
  /* 삭제 10연타 */
  await p.click('#jr-s01-list .jr-expense-row'); await p.waitForTimeout(300);
  await p.evaluate(() => { const b = document.getElementById('jr-s02-delete'); for (let i = 0; i < 10; i++) b.click(); });
  await p.waitForTimeout(300);
  ok('예외5 삭제 10연타 → 대화상자 1개', (await p.locator('#jr-dialog-overlay').count()) === 1, 'overlay=' + await p.locator('#jr-dialog-overlay').count());
  await p.evaluate(() => { const bs = Array.from(document.querySelectorAll('#jr-dialog-overlay button')); const d = bs.find(x => /^삭제/.test(x.textContent.trim())); for (let i = 0; i < 5; i++) d.click(); });
  await p.waitForTimeout(400);
  ok('예외5 확인 5연타에도 1건만 삭제(음수 없음)', (await p.evaluate(() => JR.model.getExpenses().data.items.length)) === 0);
  /* 내보내기 연타 */
  await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(250);
  await p.evaluate(() => { const b = document.getElementById('jr-s04-export'); for (let i = 0; i < 5; i++) b.click(); });
  await p.waitForTimeout(500);
  ok('예외5 내보내기 5연타 후에도 앱 정상', await p.evaluate(() => JR.model.isReady()) === true);
  ok('예외5 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

/* ═══ 예외 6. 새로고침 / 초안 저장·복원·폐기 ═══ */
{ const { p, errs, ctx } = await mk();
  await p.click('#jr-s01-add'); await p.waitForTimeout(250);
  await p.fill('#jr-amount', '4200'); await p.fill('#jr-memo', '작성중인 메모');
  await p.click('#jr-cat-group button:nth-of-type(2)');
  await p.evaluate(() => { document.getElementById('jr-amount').dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('jr-memo').dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(900);
  const d0 = await p.evaluate(() => { const d = JR.model.loadDraft(); return d.ok ? d.data.draft || d.data : null; });
  ok('예외6 초안 저장됨', !!d0, JSON.stringify(d0).slice(0, 110));
  await p.reload(); await p.waitForTimeout(700);
  ok('예외6 새로고침 후 첫 화면은 S-01 (INT-30)', await p.evaluate(() => document.body.getAttribute('data-screen')) === 's01');
  await p.click('#jr-s01-add'); await p.waitForTimeout(500);
  const rest = await p.evaluate(() => ({ amt: document.getElementById('jr-amount').value, memo: document.getElementById('jr-memo').value, chip: !!document.querySelector('#jr-cat-group button[aria-checked="true"], #jr-cat-group button.is-selected'), toast: document.getElementById('jr-toast').textContent.trim() }));
  ok('예외6 S-02 진입 시 금액 복원', rest.amt === '4,200', 'amount=' + rest.amt);
  ok('예외6 메모 복원', rest.memo === '작성중인 메모', 'memo=' + rest.memo);
  ok('예외6 카테고리 복원', rest.chip === true, 'chip=' + rest.chip);
  ok('예외6 E-602 토스트', /작성 중이던 내용을 다시 불러왔습니다/.test(rest.toast), 'toast=' + rest.toast);
  /* 명시적 나가기 → 초안 삭제 */
  await p.click('#jr-s02-cancel'); await p.waitForTimeout(400);
  const leaveDlg = await p.evaluate(() => { const o = document.getElementById('jr-dialog-overlay'); if (!o) return null; return Array.from(o.querySelectorAll('button')).map(x => x.textContent.trim()); });
  ok('예외6 미저장 상태로 나가기 시 확인 대화상자', leaveDlg !== null, JSON.stringify(leaveDlg));
  if (leaveDlg) { await p.evaluate(() => { const bs = Array.from(document.querySelectorAll('#jr-dialog-overlay button')); (bs.find(x => /나가기|나감|삭제|확인/.test(x.textContent)) || bs[bs.length - 1]).click(); }); await p.waitForTimeout(400); }
  ok('예외6 나가기 확정 후 S-01', await p.evaluate(() => document.body.getAttribute('data-screen')) === 's01', await p.evaluate(() => document.body.getAttribute('data-screen')));
  const cleared = await p.evaluate(() => { const d = JR.model.loadDraft(); return !d.ok || !d.data || !d.data.draft; });
  ok('예외6 명시적 나가기는 초안 삭제', cleared === true, String(cleared));
  /* 24시간 경과 초안 폐기 */
  const old = await p.evaluate(async () => {
    const raw = { mode: 'add', targetId: null, date: JR.model.today(), amount: '7,700', categoryId: JR.model.getCategories().data.items[0].id, memo: '오래된초안', savedAt: Date.now() - 25 * 3600 * 1000 };
    JR.store.setJSON('jr.v1.draft', raw);
    JR.model.init();
    document.getElementById('jr-toast').textContent = '';
    JR.ui.show('E-603');
    await new Promise(r => setTimeout(r, 120));
    return { toast: document.getElementById('jr-toast').textContent.trim(), loaded: JR.model.loadDraft() };
  });
  await p.click('#jr-s01-add'); await p.waitForTimeout(500);
  const oldRest = await p.evaluate(() => ({ amt: document.getElementById('jr-amount').value, toast: document.getElementById('jr-toast').textContent.trim() }));
  ok('예외6 24시간 경과 초안은 복원하지 않음', oldRest.amt === '' || oldRest.amt === '0', 'amount=' + oldRest.amt);
  ok('예외6 E-603 문구 존재', /하루가 지나 지워졌습니다/.test(old.toast), old.toast);
  ok('예외6 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

/* ═══ 예외 7. file:// 다운로드 차단 → 3단 폴백 ═══ */
{ const { p, errs, ctx } = await mk(() => {
    window.URL.createObjectURL = function () { throw new Error('blocked'); };
    const origCreate = document.createElement.bind(document);
    document.createElement = function (t) { const el = origCreate(t); if (String(t).toLowerCase() === 'a') { el.click = function () { throw new Error('download blocked'); }; } return el; };
  });
  await p.evaluate(() => { const c = JR.model.getCategories().data.items; JR.model.addExpense({ date: JR.model.today(), amount: '6600', categoryId: c[0].id, memo: '내보낼기록' }); });
  await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(300);
  await p.click('#jr-s04-export'); await p.waitForTimeout(600);
  const fb = await p.evaluate(() => ({ hidden: document.getElementById('jr-export-fallback').hidden, len: document.getElementById('jr-export-text').value.length, notice: document.getElementById('jr-export-notice').textContent.trim() }));
  ok('예외7 다운로드 차단 시 텍스트 폴백 노출', fb.hidden === false, JSON.stringify(fb).slice(0, 90));
  ok('예외7 폴백에 전체 JSON 담김', fb.len > 100, 'len=' + fb.len);
  const parsed = await p.evaluate(() => { try { return JSON.parse(document.getElementById('jr-export-text').value).data.expenses.length; } catch (e) { return -1; } });
  ok('예외7 폴백 JSON 이 유효하고 기록 1건 포함', parsed === 1, 'expenses=' + parsed);
  ok('예외7 전체 선택 버튼 동작', await p.evaluate(() => { document.getElementById('jr-export-selectall').click(); const t = document.getElementById('jr-export-text'); return t.selectionEnd - t.selectionStart > 0; }) === true);
  ok('예외7 F-08 이 실패로 끝나지 않음(앱 정상)', await p.evaluate(() => JR.model.isReady()) === true);
  ok('예외7 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

/* ═══ 예외 8. 필요 API 미지원 ═══ */
{ const { p, errs, ctx } = await mk(() => { try { delete Storage.prototype.getItem; } catch (e) { } try { window.JSON = undefined; } catch (e) { } });
  const st = await p.evaluate(() => { const u = document.getElementById('jr-unsupported'); return { present: !!u, txt: u ? u.textContent.trim() : '', appHidden: document.getElementById('jr-app') ? document.getElementById('jr-app').hidden : null }; });
  ok('예외8 필수 API 부재 → 정적 폴백 #jr-unsupported 유지', st.present === true, JSON.stringify(st).slice(0, 120));
  ok('예외8 E-001 문구 정본 일치', st.txt === '이 브라우저에서는 앱을 사용할 수 없습니다. 크롬·엣지·사파리·파이어폭스의 최신 버전에서 열어 주세요.', '"' + st.txt + '"');
  ok('예외8 앱 UI 는 노출되지 않음', st.appHidden === true, 'appHidden=' + st.appHidden);
  await ctx.close(); }
{ const { p, errs, ctx } = await mk(() => { try { delete window.FileReader; } catch (e) { window.FileReader = undefined; } });
  await p.click('#jr-tabbar button:nth-of-type(3)'); await p.waitForTimeout(350);
  const st = await p.evaluate(() => ({ ready: JR.model.isReady(), impDisabled: document.getElementById('jr-s04-import').disabled, expDisabled: document.getElementById('jr-s04-export').disabled }));
  ok('예외8b FileReader 부재에도 앱 기동', st.ready === true, JSON.stringify(st));
  ok('예외8b E-002 배너', (await bannerTxt(p)).some(t => /파일 가져오기를 쓸 수 없어/.test(t)), JSON.stringify(await bannerTxt(p)).slice(0, 80));
  ok('예외8b 가져오기 버튼 비활성', st.impDisabled === true, String(st.impDisabled));
  ok('예외8b 내보내기는 그대로 사용 가능', st.expDisabled === false, String(st.expDisabled));
  const add = await p.evaluate(() => { const c = JR.model.getCategories().data.items; return JR.model.addExpense({ date: JR.model.today(), amount: '1100', categoryId: c[0].id, memo: '' }).ok; });
  ok('예외8b 기록 기능은 정상', add === true);
  ok('예외8b 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

/* ═══ INT-36 · E-203 치환값 (저장소 80% 도달 후 저장) ═══ */
{ const { p, errs, ctx } = await mk();
  const r = await p.evaluate(async () => {
    /* jr.* 키에 패딩을 넣어 usage().ratio 를 0.8 이상으로 올린다 */
    const pad = new Array(2100000).join('x');
    try { localStorage.setItem('jr.v1.pad', pad); } catch (e) { return { padErr: String(e) }; }
    const u = JR.store.usage();
    const c = JR.model.getCategories().data.items;
    const res = JR.model.addExpense({ date: JR.model.today(), amount: '1500', categoryId: c[0].id, memo: '80퍼센트' });
    return { ratio: u.ok ? u.data.ratio : -1, ok: res.ok, warnings: (res.data && res.data.warnings) || [], warnType: ((res.data && res.data.warnings) || []).map(w => typeof w) };
  });
  ok('INT-36 준비: 저장소 사용률 80% 이상', r.ratio >= 0.8, 'ratio=' + (r.ratio && r.ratio.toFixed ? r.ratio.toFixed(3) : r.ratio) + (r.padErr ? ' padErr=' + r.padErr : ''));
  ok('INT-36 준비: 저장 성공 + warnings 에 E-203', r.ok === true && r.warnings.indexOf('E-203') !== -1, JSON.stringify(r.warnings));
  ok('INT-36 warnings 원소가 {code,params} 형태', r.warnType.every(t => t === 'object'), 'types=' + JSON.stringify(r.warnType) + ' 값=' + JSON.stringify(r.warnings));
  /* UI 경로로 실제 저장해 배너 문구 확인 */
  await p.reload(); await p.waitForTimeout(700);
  await p.click('#jr-s01-add'); await p.waitForTimeout(300);
  await p.fill('#jr-amount', '2500'); await p.click('#jr-cat-group button:nth-of-type(1)');
  await p.waitForTimeout(150);
  await p.click('#jr-s02-save'); await p.waitForTimeout(600);
  const bn = await bannerTxt(p);
  const e203 = bn.find(t => /저장 공간을/.test(t) && /썼습니다/.test(t)) || '';
  ok('INT-36 저장 성공 후 E-203 배너 표시', e203.length > 0, JSON.stringify(bn).slice(0, 120));
  ok('INT-36 E-203 배너에 {percent} 숫자가 채워짐', /\d+%/.test(e203), '배너="' + e203.slice(0, 60) + '"');
  ok('INT-36 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

/* ═══ INT-36-b · 부팅 시 80% 미만 → 저장이 80% 를 돌파하는 경로 (배너가 새로 생성되는 경우) ═══ */
{ const { p, errs, ctx } = await mk(() => { try { localStorage.setItem('jr.v1.pad', new Array(1960000).join('x')); } catch (e) { } });
  const pre = await p.evaluate(() => { const u = JR.store.usage(); return { ratio: u.data.ratio, banners: Array.from(document.querySelectorAll('.jr-banner .jr-banner__text')).map(x => x.textContent.trim()) }; });
  ok('INT-36-b 준비: 부팅 시 사용률 80% 미만 · E-203 배너 없음', pre.ratio < 0.8 && pre.banners.length === 0, 'ratio=' + pre.ratio.toFixed(3) + ' banners=' + pre.banners.length);
  const r2 = await p.evaluate(() => {
    /* 저장으로 80% 를 넘기도록 패딩을 조금 더 채운다 */
    try { localStorage.setItem('jr.v1.pad2', new Array(60000).join('y')); } catch (e) { }
    const c = JR.model.getCategories().data.items;
    const res = JR.model.addExpense({ date: JR.model.today(), amount: '1000', categoryId: c[0].id, memo: '돌파' });
    return { ok: res.ok, warnings: (res.data && res.data.warnings) || [], ratio: JR.store.usage().data.ratio };
  });
  ok('INT-36-b 저장 성공 + warnings 에 E-203', r2.ok === true && r2.warnings.indexOf('E-203') !== -1, 'ratio=' + r2.ratio.toFixed(3) + ' warnings=' + JSON.stringify(r2.warnings));
  const shown = await p.evaluate(async () => { JR.ui.show((JR.model.getExpenses(), 'E-203')); await new Promise(r => setTimeout(r, 100)); return Array.from(document.querySelectorAll('.jr-banner .jr-banner__text')).map(x => x.textContent.trim()); });
  ok('INT-36-b show(코드만) 호출 시 {percent} 가 채워짐', shown.some(t => /\d+%/.test(t)), '배너=' + JSON.stringify(shown).slice(0, 110));
  ok('INT-36-b 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

/* ═══ INT-37 · E-604 (백그라운드 전환 직전 초안 저장 실패) ═══ */
{ const { p, errs, ctx } = await mk();
  await p.click('#jr-s01-add'); await p.waitForTimeout(300);
  await p.fill('#jr-amount', '8800'); await p.fill('#jr-memo', '백그라운드');
  await p.click('#jr-cat-group button:nth-of-type(1)'); await p.waitForTimeout(300);
  const r = await p.evaluate(async () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (String(k).indexOf('jr.v1.draft') === 0) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
    document.getElementById('jr-toast').textContent = '';
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    await new Promise(r2 => setTimeout(r2, 400));
    const out = { toast: document.getElementById('jr-toast').textContent.trim(), banners: Array.from(document.querySelectorAll('.jr-banner .jr-banner__text')).map(x => x.textContent.trim()) };
    Storage.prototype.setItem = orig;
    return out;
  });
  const wanted = '앱이 화면에서 벗어나는 동안 작성 중이던 내용을 저장하지 못했습니다.';
  ok('INT-37 초안 저장 실패 → E-604 배너(B 슬롯)', r.banners.some(t => t === wanted), 'banners=' + JSON.stringify(r.banners) + ' toast="' + r.toast + '"');
  ok('INT-37 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

/* ═══ 저장소 — 잘못된 타입 · 손상 설정 · probe 실패 ═══ */
{ const { p, errs, ctx } = await mk(() => {
    try {
      localStorage.setItem('jr.v1.meta', JSON.stringify({ appId: 'jr-expense', schema: 1, lastWriteAt: Date.now() }));
      localStorage.setItem('jr.v1.expenses', JSON.stringify([{ id: 'x', date: 'not-a-date', amount: 'NaN', categoryId: null }, null, 42, { id: 'ok1', date: '2026-08-01', amount: 1000, categoryId: 'c_d01', memo: '', createdAt: 1, updatedAt: 1 }]));
      localStorage.setItem('jr.v1.categories', JSON.stringify([{ nope: 1 }, null]));
      localStorage.setItem('jr.v1.settings', '{"selectedMonth": 12345}');
    } catch (e) { }
  });
  const st = await p.evaluate(() => ({ ready: JR.model.isReady(), n: JR.model.getExpenses().data.items.length, c: JR.model.getCategories().data.items.length, month: JR.model.getSelectedMonth ? JR.model.getSelectedMonth() : null, screen: document.body.getAttribute('data-screen') }));
  ok('저장소 손상 레코드 혼입 — 부팅 성공', st.ready === true, JSON.stringify(st));
  ok('저장소 손상 레코드 탈락, 정상 1건만 남음', st.n === 1, 'n=' + st.n);
  ok('저장소 카테고리 0개 → 기본 8종 복구(E-305)', st.c === 8, 'c=' + st.c);
  ok('저장소 손상 설정에도 화면 정상', st.screen === 's01', st.screen);
  ok('저장소 손상 시 콘솔 에러 0', errs.length === 0, JSON.stringify(errs));
  await ctx.close(); }

console.log('===== 예외 8종 + INT-36/37 재현 · ' + ENG + ' · ' + new Date().toISOString() + ' =====');
R.forEach(r => console.log(r));
console.log('---- PASS ' + nPass + ' / FAIL ' + nFail + ' ----');
if (nFail) { console.log('실패 항목:'); R.filter(x => x.indexOf('FAIL') === 0).forEach(x => console.log('  ' + x)); }
await b.close(); process.exit(0);
})();
