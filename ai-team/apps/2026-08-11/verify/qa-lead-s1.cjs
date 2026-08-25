/* ⑤ 파트장 독립 재현 — 보안 S1 2건. 실무자 스크립트 미사용. 새로 작성. */
const { chromium, firefox, webkit } = require('playwright');
const path = require('path');
const APP = 'file://' + '/home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const SHOTS = __dirname + '/shots';
const engines = { chromium, firefox, webkit };
let pass = 0, fail = 0;
const lines = [];
function ok(cond, name, detail) {
  if (cond) { pass++; lines.push('PASS | ' + name + ' | ' + detail); }
  else { fail++; lines.push('**FAIL** | ' + name + ' | ' + detail); }
}

(async () => {
  const engName = process.argv[2] || 'chromium';
  const browser = await engines[engName].launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('pageerror', e => consoleErrs.push('PAGEERROR ' + e.message));
  await page.goto(APP);
  await page.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());

  /* ===================== QA-S-001 : 전체 삭제 후 잔존·부활 ===================== */
  // 1) 실제 사용자 조작으로 지출 3건 저장
  const memos = ['치과 진료비', '월세 이체', '심야 택시'];
  for (let i = 0; i < 3; i++) {
    await page.click('#jr-s01-add');
    await page.fill('#jr-amount', String((i + 1) * 11000));
    await page.fill('#jr-memo', memos[i]);
    await page.click('.jr-chip');
    await page.click('#jr-s02-save');
    await page.waitForTimeout(120);
  }
  const before = await page.evaluate(() => ({
    model: JR.model.getExpenses().data.items.length,
    dom: document.querySelectorAll('#jr-s01-list .jr-item, #jr-s01-list li').length,
    keys: JR.store.keys().data ? JR.store.keys().data.keys : Object.keys(localStorage)
  }));
  ok(before.model === 3, 'S-001 준비: 지출 3건 저장됨', JSON.stringify(before.model));

  // 2) 전체 삭제 (wipeAll) 를 실제로 실행
  const wiped = await page.evaluate(() => {
    const r = JR.model.wipeAll();
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
    return { ok: r.ok, keys: Object.keys(ls), ls };
  });
  const residual = wiped.keys.filter(k => /\.bak$|corrupt/i.test(k));
  const leakedMemos = [];
  for (const k of residual) { for (const m of memos) { if ((wiped.ls[k] || '').indexOf(m) >= 0) leakedMemos.push(k + '::' + m); } }
  ok(residual.length === 0, 'S-001 ① 전체 삭제 후 .bak/corrupt 잔존물 없음', 'residual=' + JSON.stringify(residual));
  ok(leakedMemos.length === 0, 'S-001 ② 잔존물에 삭제한 메모 원문 없음', JSON.stringify(leakedMemos));

  await page.screenshot({ path: SHOTS + `/lead-s001-${engName}-wipe.png` });

  // 3) 재부팅(새로고침) 후 화면에 되살아나는가
  await page.reload();
  await page.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    model: JR.model.getExpenses().data.items.length,
    domText: (document.querySelector('#jr-s01-list') || {}).textContent || '',
    total: (document.querySelector('#jr-s01-total') || {}).textContent || ''
  }));
  const revived = memos.filter(m => after.domText.indexOf(m) >= 0);
  ok(after.model === 0 && revived.length === 0, 'S-001 ③ 재부팅 후 삭제한 지출이 화면에 되살아나지 않음',
     'model=' + after.model + ' 되살아난메모=' + JSON.stringify(revived) + ' 총합=' + JSON.stringify(after.total.trim().slice(0,40)));
  await page.screenshot({ path: SHOTS + `/lead-s001-${engName}-after-reload.png` });

  /* ===================== QA-S-002 : __proto__ id 중복 → 엉뚱한 기록 삭제 ===================== */
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  page2.on('pageerror', e => consoleErrs.push('PAGEERROR2 ' + e.message));
  await page2.goto(APP);
  await page2.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
  const diag = await page2.evaluate(() => ({ cats: JR.model.getCategories(), mode: JR.store.mode() }));
  console.log('진단 categories=' + JSON.stringify(diag).slice(0, 300));

  // 기준선 대조군: 평범한 중복 id 는 걸러지는가
  const proto = await page2.evaluate(() => {
    /* 진짜 내보내기 파일을 만든 뒤 사용자가 손으로 편집한 것처럼 레코드만 바꾼다 */
    const ex = JR.io.buildExport();
    const file = JSON.parse(ex.data.json);
    const cid = file.data.categories[0].id;
    const mk = (id, memo, amt) => ({ id: id, date: '2026-08-10', amount: amt, categoryId: cid, memo: memo,
      createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' });
    file.data.expenses = [ mk('__proto__', '건강검진비', 400000), mk('__proto__', '아이 학원비', 250000),
                           mk('dup1', '일반중복A', 1000), mk('dup1', '일반중복B', 2000) ];
    file.counts = { expenses: 4, categories: file.data.categories.length };
    const txt = JSON.stringify(file);
    const p = JR.io.parseImport(txt);
    const a = p.ok ? JR.io.applyImport(p.data.payload) : null;
    const list = JR.model.getExpenses().data.items;
    return {
      parsed: p.ok, parseCode: p.ok ? null : p.code, applied: !!(a && a.ok),
      ids: list.map(e => e.id), memos: list.map(e => e.memo),
      protoCount: list.filter(e => e.id === '__proto__').length,
      dupCount: list.filter(e => e.id === 'dup1').length
    };
  });
  console.log('원자료 S-002 즉시: ' + JSON.stringify(proto));
  ok(proto.dupCount === 1, 'S-002 기준선(대조군): 평범한 id 중복은 1건으로 거부됨', 'dup1 저장수=' + proto.dupCount);
  ok(proto.protoCount === 1, 'S-002 ① id="__proto__" 중복도 1건으로 거부됨',
     '__proto__ 저장수=' + proto.protoCount + ' ids=' + JSON.stringify(proto.ids));

  // 실피해: 사용자가 「아이 학원비」를 지우면 무엇이 지워지는가
  const harm = await page2.evaluate(() => {
    const before = JR.model.getExpenses().data.items.map(e => e.memo);
    const target = JR.model.getExpenses().data.items.filter(e => e.memo === '아이 학원비')[0];
    const r = JR.model.deleteExpense(target.id);
    const after = JR.model.getExpenses().data.items.map(e => e.memo);
    return { before, after, deletedOk: r.ok, 지운다고고른것: '아이 학원비',
             실제사라진것: before.filter(m => after.indexOf(m) < 0),
             아직남은것: after };
  });
  ok(harm.실제사라진것.length === 1 && harm.실제사라진것[0] === '아이 학원비',
     'S-002 ② 사용자가 고른 기록만 삭제됨',
     '고른것="아이 학원비" 실제사라진것=' + JSON.stringify(harm.실제사라진것) + ' 남은것=' + JSON.stringify(harm.아직남은것));
  await page2.screenshot({ path: SHOTS + `/lead-s002-${engName}.png` });

  ok(consoleErrs.length === 0, '콘솔에러·pageerror 0건', JSON.stringify(consoleErrs.slice(0, 3)));

  console.log('=== ⑤ 파트장 독립 재현 · engine=' + engName + ' ===');
  lines.forEach(l => console.log(l));
  console.log('PASS=' + pass + ' FAIL=' + fail);
  console.log('원자료 S-002: ' + JSON.stringify(proto));
  console.log('원자료 실피해: ' + JSON.stringify(harm));
  await browser.close();
  process.exit(0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
