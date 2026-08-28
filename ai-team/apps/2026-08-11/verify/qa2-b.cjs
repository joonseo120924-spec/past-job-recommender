/* ⑤ 파트장 재시험 B — E-604 · Y-A(E-304) · ④ 가 요구 밖으로 넓힌 2건 · 신규 탐침 · 기준선 회귀 */
const { reporter, launch, fresh, reboot, dumpAll, digits, ENGINE, APP } = require('./qa2-lib.cjs');

/* 남은 공간을 끝까지 채웁니다 — 큰 덩어리로만 채우면 초안(작은 값)은 여전히 써져서
 * 실패 경로에 닿지 못합니다. 1바이트까지 조여야 실제 저장 실패가 만들어집니다. */
const TIGHT = `(function(){var n=0,bytes=0,sizes=[524288,65536,8192,1024,128,16,1];
for(var s=0;s<sizes.length;s++){for(;;){try{localStorage.setItem('PAD'+(n++),new Array(sizes[s]+1).join('x'));bytes+=sizes[s];}catch(e){break;}}}
var tiny=false;try{localStorage.setItem('TINY','x');}catch(e){tiny=true;}
return {blocks:n,mb:(bytes/1048576).toFixed(2),reached:tiny};})()`;

const bannerText = pg => pg.evaluate(() => {
  const n = document.querySelector('.jr-banner__text');
  return n ? n.textContent : '';
});

(async () => {
  const R = reporter('⑤ 재시험 B — E-604 · Y-A · 범위확대 · 기준선');
  const b = await launch();

  /* ───────── B1 E-604 (S3) — 화면이 가려지는 순간의 초안 저장 실패 ─────────
   * pagehide 는 **속성 스텁 없이** 실제 이벤트를 발생시켜 실제 리스너를 태웁니다.
   * (④ 는 dev2-step6 에서 document.visibilityState 를 defineProperty 로 덮었습니다 — 그것은 흉내입니다) */
  {
    const pg = await fresh(b);
    const fill = await pg.evaluate(TIGHT);
    R.ok(fill.reached, 'B1 전제 — 실제 localStorage 할당량에 도달 (스텁 없음)', JSON.stringify(fill));
    /* S-02 로 들어가 초안을 더럽힙니다 */
    await pg.evaluate(() => {
      document.getElementById('jr-s01-add').click();
      const a = document.getElementById('jr-amount');
      a.value = '12345'; a.dispatchEvent(new Event('input', { bubbles: true }));
      const m = document.getElementById('jr-memo');
      m.value = '작성중이던내용'; m.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await pg.waitForTimeout(80);
    const pre = await bannerText(pg);
    /* 실제 pagehide 이벤트 — 속성 덮어쓰기 없음 */
    await pg.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await pg.waitForTimeout(150);
    const post = await pg.evaluate(() => ({
      banner: (document.querySelector('.jr-banner__text') || {}).textContent || '',
      kindEvent: !!document.querySelector('.jr-banner--event'),
      toast: (document.getElementById('jr-toast') || {}).textContent || ''
    }));
    R.ok(/화면에서 벗어나는 동안 작성 중이던 내용을 저장하지 못했습니다/.test(post.banner),
      'B1-1 pagehide(실제 이벤트) 초안 저장 실패가 **B 슬롯 배너 E-604** 로 뜸 (되돌림 전: show(E-604) 호출 0건)',
      '전="' + pre + '" 후="' + post.banner + '"');
    /* 화면 조작을 계속해도 배너가 남는가 — 복귀 후 전달 가능성 */
    await pg.evaluate(() => document.getElementById('jr-memo').dispatchEvent(new Event('input', { bubbles: true })));
    await pg.waitForTimeout(100);
    const stay = await bannerText(pg);
    R.ok(/화면에서 벗어나는 동안/.test(stay), 'B1-2 그 뒤에도 배너가 남아 있음 (토스트였다면 사라졌을 정보)', '"' + stay + '"');

    /* 회귀 — 가려지는 순간이 아닌 실패는 E-606 토스트, E-604 배너 아님 */
    const pg2 = await fresh(b);
    await pg2.evaluate(TIGHT);
    await pg2.evaluate(() => {
      document.getElementById('jr-s01-add').click();
      const a = document.getElementById('jr-amount');
      a.value = '999'; a.dispatchEvent(new Event('input', { bubbles: true }));
      const m = document.getElementById('jr-memo');
      m.value = '초안'; m.dispatchEvent(new Event('input', { bubbles: true }));
      m.dispatchEvent(new Event('change', { bubbles: true }));   /* blur/change 경로 = leaving 아님 */
    });
    await pg2.waitForTimeout(150);
    const norm = await pg2.evaluate(() => ({
      toast: (document.getElementById('jr-toast') || {}).textContent || '',
      banner: (document.querySelector('.jr-banner__text') || {}).textContent || ''
    }));
    R.ok(/자동으로 저장되지 않습니다/.test(norm.toast) && !/화면에서 벗어나는 동안/.test(norm.banner),
      'B1-3 회귀 — 가려지는 순간이 아닌 실패는 E-606 토스트 그대로 (E-604 배너 아님)', JSON.stringify(norm));
  }

  /* ───────── B2 Y-A — E-304 의 {count} 가 빈칸으로 화면에 나가는가 ───────── */
  {
    const pg = await fresh(b);
    const keysBefore = await pg.evaluate(() => Object.keys(localStorage));
    R.ok(keysBefore.every(k => !/\.bak$/.test(k)), 'B2 전제 — 신규 설치라 .bak 이 없음', JSON.stringify(keysBefore));
    await pg.evaluate(() => localStorage.setItem('jr.v1.expenses', '{"not":"array"}'));
    await reboot(pg);
    const t = await bannerText(pg);
    const n = await pg.evaluate(() => JR.model.getExpenses().data.items.length);
    R.ok(!/가운데\s+건을/.test(t) && !/가운데건을/.test(t.replace(/\s+/g, ' ')),
      'B2-1 **Y-A** E-304 배너에 빈 치환 자리가 나가지 않음 (INT-36: 하나라도 남으면 미충족)',
      '배너="' + t + '" model건수=' + n);
    R.ok(!/\{count\}/.test(t), 'B2-2 배너에 치환되지 않은 {count} 리터럴도 없음', '배너="' + t + '"');
  }

  /* ───────── B3 ④ 범위확대 (1) — model.js 부팅 복구 경로의 날짜 실재 검증 ───────── */
  {
    const pg = await fresh(b);
    await pg.evaluate(() => {
      const cid = JR.model.getCategories().data.items[0].id;
      JR.model.addExpense({ date: '2026-08-10', amount: '1000', categoryId: cid, memo: '정상기록' });
      const arr = JSON.parse(localStorage.getItem('jr.v1.expenses'));
      arr.push({ id: 'bad1', date: '2026-02-30', amount: 5000, categoryId: cid, memo: '없는날짜', createdAt: 1754870400000 });
      arr.push({ id: 'bad2', date: '2026-04-31', amount: 7000, categoryId: cid, memo: '없는날짜2', createdAt: 1754870400000 });
      localStorage.setItem('jr.v1.expenses', JSON.stringify(arr));
      localStorage.removeItem('jr.v1.expenses.bak');
    });
    await reboot(pg);
    const r = await pg.evaluate(() => ({
      dates: JR.model.getExpenses().data.items.map(e => e.date),
      n: JR.model.getExpenses().data.items.length,
      banner: (document.querySelector('.jr-banner__text') || {}).textContent || ''
    }));
    R.ok(r.dates.indexOf('2026-02-30') === -1 && r.dates.indexOf('2026-04-31') === -1 && r.dates.indexOf('2026-08-10') !== -1,
      'B3-1 부팅 복구 경로가 달력에 없는 날짜를 제외하고 정상 기록은 지킴', JSON.stringify(r.dates));
    R.ok(!/가운데\s+건을/.test(r.banner), 'B3-2 그때 뜨는 E-304 배너에는 건수가 채워져 있음', '배너="' + r.banner + '"');
  }

  /* ───────── B4 ④ 범위확대 (2) — wipeAll 이 rollback 정리 · 복구 사다리는 rollback 보존(INT-27(5)) ───────── */
  {
    const pg = await fresh(b);
    const r = await pg.evaluate(() => {
      const cid = JR.model.getCategories().data.items[0].id;
      JR.model.addExpense({ date: '2026-08-10', amount: '50000', categoryId: cid, memo: '롤백대상메모' });
      JR.store.setJSON('jr.v1.rollback', JR.store.snapshot().data.snap);
      const had = localStorage.getItem('jr.v1.rollback') !== null;
      JR.model.wipeAll();
      return { had: had, after: localStorage.getItem('jr.v1.rollback'),
               leak: Object.keys(localStorage).filter(k => String(localStorage.getItem(k)).indexOf('롤백대상메모') !== -1) };
    });
    await reboot(pg);
    const n = await pg.evaluate(() => JR.model.getExpenses().data.items.length);
    R.ok(r.had && r.after === null && r.leak.length === 0 && n === 0,
      'B4-1 wipeAll 이 jr.v1.rollback 을 정리해 다음 부팅에서 되살아나지 않음',
      '삭제전보유=' + r.had + ' 삭제후=' + r.after + ' 원문잔존=' + JSON.stringify(r.leak) + ' 재부팅후=' + n + '건');
    /* INT-27(5) 불변식 — 복구 사다리(relieveStep)는 rollback 을 지우지 않아야 합니다 */
    const pg2 = await fresh(b);
    await pg2.evaluate(t => { window.FILL = new Function('return ' + t); }, TIGHT);
    const inv = await pg2.evaluate(() => {
      const cid = JR.model.getCategories().data.items[0].id;
      JR.model.addExpense({ date: '2026-08-10', amount: '1000', categoryId: cid, memo: 'x' });
      JR.store.setJSON('jr.v1.rollback', { 'jr.v1.settings': localStorage.getItem('jr.v1.settings') });
      /* 할당량을 채워 쓰기를 실패시키면 복구 사다리가 1~4단계까지 올라갑니다 */
      const filled = FILL().reached;
      const w = JR.model.addExpense({ date: '2026-08-11', amount: '2000', categoryId: cid, memo: 'y' });
      return { filled: filled, writeOk: w.ok, code: w.ok ? null : w.code,
               rollbackKept: localStorage.getItem('jr.v1.rollback') !== null };
    });
    R.ok(inv.filled && inv.rollbackKept,
      'B4-2 INT-27(5) 불변식 유지 — 복구 사다리는 rollback 을 지우지 않음 (wipeAll 만 예외)',
      JSON.stringify(inv));
  }

  /* ───────── B5 신규 탐침 — wipeAll 이 실패했을 때 화면이 하는 말 ─────────
   * 조치 후 wipeAll 은 「전부 지운 뒤」 persist 실패를 판정합니다(되돌림 전에는 지우기 전에 반환).
   * E-202 문구는 「이전 기록은 그대로 있습니다」입니다. 실제 상태와 맞는지 봅니다. */
  {
    const pg = await fresh(b);
    await pg.evaluate(t => { window.FILL = new Function('return ' + t); }, TIGHT);
    const r = await pg.evaluate(() => {
      const cid = JR.model.getCategories().data.items[0].id;
      JR.model.addExpense({ date: '2026-08-10', amount: '77000', categoryId: cid, memo: '삭제대상메모' });
      const beforeN = JR.model.getExpenses().data.items.length;
      /* jr. 밖 키로 할당량을 채웁니다 — wipeAll 의 삭제 루프는 jr. 접두만 지웁니다 */
      const filled = FILL().reached;
      const w = JR.model.wipeAll();
      const jrKeys = Object.keys(localStorage).filter(k => k.indexOf('jr.') === 0);
      return { filled: filled, beforeN: beforeN, wipeOk: w.ok, code: w.ok ? null : w.code,
               afterN: JR.model.getExpenses().data.items.length,
               jrKeys: jrKeys,
               memoStillStored: Object.keys(localStorage).some(k => String(localStorage.getItem(k)).indexOf('삭제대상메모') !== -1) };
    });
    await pg.waitForTimeout(150);
    const bt = await bannerText(pg);
    R.note('B5 실측: ' + JSON.stringify(r) + ' / 배너="' + bt + '"');
    if (!r.filled) {
      R.unknown('B5 wipeAll 실패 경로', '이 엔진에서 jr. 밖 키로 할당량을 채우지 못함');
    } else if (r.wipeOk) {
      R.note('B5 — 이 엔진에서는 할당량을 채워도 wipeAll 이 성공했습니다. 실패 경로 미도달');
      R.unknown('B5 wipeAll 실패 경로', '할당량을 채웠으나 wipeAll 이 성공해 E-202 경로에 도달하지 못함');
    } else {
      /* 실패 경로에 도달했습니다 — 화면의 말과 실제 상태가 맞는가 */
      R.ok(!(r.code === 'E-202' && r.afterN === 0 && /이전 기록은 그대로 있습니다/.test(bt)),
        'B5-1 wipeAll 실패 시 화면 문구가 실제 상태와 어긋나지 않음',
        'code=' + r.code + ' 삭제전=' + r.beforeN + '건 삭제후=' + r.afterN + '건 원문잔존=' + r.memoStillStored +
        ' 남은jr키=' + JSON.stringify(r.jrKeys) + ' 배너="' + bt + '"');
    }
  }

  /* ───────── B6 기준선 회귀 — 공개 표면·E-코드가 이번 조치로 흔들리지 않았는가 ───────── */
  {
    const pg = await fresh(b);
    const base = await pg.evaluate(() => {
      const M = JR.err.MESSAGES, ks = Object.keys(M);
      const slots = {}; ks.forEach(k => { slots[M[k].slot] = (slots[M[k].slot] || 0) + 1; });
      const ph = ks.filter(k => /\{[A-Za-z0-9_]+\}/.test(M[k].msg));
      const mods = ['err', 'store', 'model', 'stats', 'io', 'ui'];
      let surface = 0, fns = 0, consts = 0;
      mods.forEach(m => Object.keys(JR[m]).forEach(k => {
        surface++; if (typeof JR[m][k] === 'function') { fns++; } else { consts++; }
      }));
      const uiFns = Object.keys(JR.ui).filter(k => typeof JR.ui[k] === 'function').sort();
      const uiConsts = Object.keys(JR.ui).filter(k => typeof JR.ui[k] !== 'function').sort();
      return { total: ks.length, banner: JR.err.BANNER_PRIORITY.length, bslot: slots.B, ph: ph, phN: ph.length,
               surface: surface, fns: fns, consts: consts, uiFns: uiFns, uiConsts: uiConsts };
    });
    R.ok(base.total === 64, 'B6-1 E-코드 총수 64 불변', '실측=' + base.total);
    R.ok(base.banner === 15 && base.bslot === 15, 'B6-2 BANNER_PRIORITY 15 = B슬롯 15 일대일',
         'priority=' + base.banner + ' B슬롯=' + base.bslot);
    R.ok(base.phN === 6, 'B6-3 자리표시자 보유 코드 6개 불변', JSON.stringify(base.ph));
    R.ok(base.surface === 85 && base.fns === 75 && base.consts === 10,
         'B6-4 INT-41 공개 표면 85(함수 75 · 상수 10) 불변 — 조치가 API 를 늘리지 않음',
         '표면=' + base.surface + ' 함수=' + base.fns + ' 상수=' + base.consts);
    R.ok(base.uiFns.length === 10, 'B6-5 INT-41 JR.ui 함수 10개 불변 (MSG·TOAST_MS 는 상수)',
         '함수=' + JSON.stringify(base.uiFns) + ' 상수=' + JSON.stringify(base.uiConsts));
    /* 자리표시자 전수 — 값을 주면 전부 채워지는가 */
    const filled = await pg.evaluate(() => {
      const M = JR.err.MESSAGES;
      const sample = { count: 3, percent: 82, max: '2027-08-27', name: '커피', n: 3, limit: 100 };
      const bad = [];
      Object.keys(M).forEach(k => {
        const m = M[k].msg;
        const need = (m.match(/\{([A-Za-z0-9_]+)\}/g) || []).map(x => x.slice(1, -1));
        if (!need.length) { return; }
        const p = {}; need.forEach(x => { p[x] = sample[x] !== undefined ? sample[x] : 7; });
        const out = JR.err.get(k, p).msg;
        if (/\{[A-Za-z0-9_]+\}/.test(out) || need.some(x => out.indexOf(String(p[x])) === -1)) { bad.push(k + '→' + out); }
      });
      return bad;
    });
    R.ok(filled.length === 0, 'B6-6 자리표시자 6종 모두 값을 주면 채워짐 (치환 엔진 회귀 0)', JSON.stringify(filled));
  }

  /* ───────── B7 goScreen 부작용 — 내보내기 결과가 엉뚱한 때 지워지지 않는가 ───────── */
  {
    const pg = await fresh(b);
    const r = await pg.evaluate(() => {
      const cid = JR.model.getCategories().data.items[0].id;
      JR.model.addExpense({ date: '2026-08-10', amount: '1000', categoryId: cid, memo: 'export' });
      document.querySelector('#jr-tabbar [data-screen="s04"]').click();
      document.getElementById('jr-s04-export').click();
      const afterExport = document.getElementById('jr-export-text').value.length;
      /* 같은 화면에서 카테고리를 추가하면 renderS04 가 다시 돕니다 — 방금 누른 결과가 살아 있어야 합니다 */
      const inp = document.getElementById('jr-cat-new');
      if (inp) { inp.value = '새카테고리'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      const addBtn = document.getElementById('jr-s04-cat-add');
      if (addBtn) { addBtn.click(); }
      const afterRender = document.getElementById('jr-export-text').value.length;
      const hidden = document.getElementById('jr-export-fallback').hasAttribute('hidden');
      return { afterExport: afterExport, afterRender: afterRender, hidden: hidden };
    });
    await pg.waitForTimeout(100);
    R.ok(r.afterExport > 0, 'B7 전제 — 내보내기 결과가 열림', JSON.stringify(r));
    R.ok(r.afterRender === r.afterExport && r.hidden === false,
      'B7-1 같은 화면 재렌더(카테고리 추가)로 방금 누른 내보내기 결과가 지워지지 않음', JSON.stringify(r));
  }

  /* ───────── B8 가져오기 되돌리기(snapshot→restore) 왕복 회귀 ───────── */
  {
    const pg = await fresh(b);
    const r = await pg.evaluate(() => {
      const cid = JR.model.getCategories().data.items[0].id;
      JR.model.addExpense({ date: '2026-08-10', amount: '1000', categoryId: cid, memo: '왕복' });
      const snap = JR.store.snapshot().data.snap;
      JR.model.wipeAll();
      const mid = JR.model.getExpenses().data.items.length;
      const rr = JR.store.restore(snap);
      JR.model.init();
      return { mid: mid, restoreOk: rr.ok, after: JR.model.getExpenses().data.items.length };
    });
    R.ok(r.mid === 0 && r.restoreOk && r.after === 1,
      'B8-1 회귀 — snapshot → restore 왕복(가져오기 되돌리기)이 그대로 동작', JSON.stringify(r));
  }

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH ' + e.stack); process.exit(2); });
