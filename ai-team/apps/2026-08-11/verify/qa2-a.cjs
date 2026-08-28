/* ⑤ 파트장 재시험 A — 결함 12건 전건. ⑤ 통합요청서 §2 의 검증 기준을 ⑤ 가 다시 짠 것입니다.
 * ④ 의 verify/dev2-*.cjs 를 부르지 않습니다. 단언 문구·판정식 전부 신규입니다. */
const { reporter, launch, fresh, reboot, dumpAll, digits, importMutated, ENGINE } = require('./qa2-lib.cjs');

const MEMO = ['갑상선초음파비', '둘째학원비잔액', '이혼상담수임료'];   /* 잔존 탐지용 고유 문자열 */

async function seed3(pg) {
  return pg.evaluate((memos) => {
    const cid = JR.model.getCategories().data.items[0].id;
    const amts = ['30000', '20000', '16000'];
    const ds = ['2026-08-10', '2026-08-11', '2026-08-12'];
    for (let i = 0; i < 3; i++) {
      JR.model.addExpense({ date: ds[i], amount: amts[i], categoryId: cid, memo: memos[i] });
    }
    JR.model.setSelectedMonth('2026-08');           /* 2회째 쓰기 → .bak 생성 */
    return { n: JR.model.getExpenses().data.items.length, total: JR.stats.monthTotal('2026-08').data.total };
  }, MEMO);
}

(async () => {
  const R = reporter('⑤ 재시험 A — 결함 12건');
  const b = await launch();

  /* ───────── D1 QA-S-001 (S1) 「전체 삭제」 잔존·부활 ───────── */
  let pg = await fresh(b);
  let s = await seed3(pg);
  const before = await dumpAll(pg);
  R.ok(s.n === 3 && s.total === 66000, 'D1 전제 — 3건 66,000원 심어짐', 'n=' + s.n + ' total=' + s.total);
  R.ok(Object.keys(before).some(k => /\.bak$/.test(k)), 'D1 전제 — 삭제 전 .bak 이 실제로 존재',
       JSON.stringify(Object.keys(before).filter(k => /\.bak$/.test(k))));
  await pg.evaluate(() => JR.model.wipeAll());
  const after = await dumpAll(pg);
  const leaked = Object.keys(after).filter(k => MEMO.some(m => String(after[k]).indexOf(m) !== -1));
  R.ok(leaked.length === 0, 'D1-1 전체 삭제 후 어떤 키에도 지운 메모 원문이 남지 않음',
       '남은 키=' + JSON.stringify(Object.keys(after)) + ' 원문잔존키=' + JSON.stringify(leaked));
  const residue = Object.keys(after).filter(k => /\.bak$|corrupt|rollback|rejected|draft/.test(k));
  R.ok(residue.length === 0, 'D1-2 복구용 잔존 키(.bak·corrupt·rollback·rejected·draft) 0개', JSON.stringify(residue));

  /* 부활 시나리오 2종 — 화면 총합 문자열을 숫자만 남겨 엄격 비교 */
  for (const [tag, poison] of [['메인키 손상', '{깨진 JSON'], ['메인키 비-배열', '{"not":"array"}']]) {
    pg = await fresh(b); await seed3(pg);
    await pg.evaluate(() => JR.model.wipeAll());
    await pg.evaluate(p => localStorage.setItem('jr.v1.expenses', p), poison);
    await reboot(pg);
    const r = await pg.evaluate(() => ({
      n: JR.model.getExpenses().data.items.length,
      total: (document.getElementById('jr-s01-total') || {}).textContent || '',
      list: (document.getElementById('jr-s01-list') || {}).textContent || ''
    }));
    R.ok(r.n === 0 && digits(r.total) === '0' && !MEMO.some(m => r.list.indexOf(m) !== -1),
      'D1-3 전체 삭제 → ' + tag + ' → 재부팅 → 0건 · 총합 숫자가 정확히 "0"',
      'model=' + r.n + ' 총합원문="' + r.total + '" 숫자만="' + digits(r.total) + '" 메모노출=' + MEMO.some(m => r.list.indexOf(m) !== -1));
  }

  /* 회귀 — 평상시 .bak 과 손상 복구는 살아 있어야 함 */
  pg = await fresh(b); await seed3(pg);
  const nb = await dumpAll(pg);
  R.ok(Object.keys(nb).indexOf('jr.v1.expenses.bak') !== -1, 'D1-R1 회귀 — 평상시 저장 경로의 .bak 유지',
       JSON.stringify(Object.keys(nb).filter(k => /\.bak$/.test(k))));
  await pg.evaluate(() => localStorage.setItem('jr.v1.expenses', '{깨진 JSON'));
  await reboot(pg);
  const rec = await pg.evaluate(() => JR.model.getExpenses().data.items.length);
  R.ok(rec === 3, 'D1-R2 회귀 — 손상 시 .bak 복구가 3건을 되살림', '복구=' + rec + '건');

  /* ───────── D2 QA-S-002 (S1) id='__proto__' 중복 가드 ───────── */
  pg = await fresh(b);
  let r2 = await importMutated(pg, `
    var mk=function(o){return Object.assign({id:'x',date:'2026-08-10',amount:1000,categoryId:cid,memo:'',createdAt:1754870400000},o)};
    f.data.expenses=[mk({id:'__proto__',memo:'프로토A'}),mk({id:'__proto__',memo:'프로토B'}),
                     mk({id:'dup1',memo:'대조A'}),mk({id:'dup1',memo:'대조B'}),
                     mk({id:'constructor',memo:'대조C'}),mk({id:'constructor',memo:'대조D'}),
                     mk({id:'정상',memo:'건강검진비'})];`);
  const cnt = id => r2.expenses.filter(e => e.id === id).length;
  R.ok(r2.applied, 'D2 전제 — 가져오기 적용됨', 'parsed=' + r2.parsed + ' applied=' + r2.applied);
  R.ok(cnt('__proto__') === 1, "D2-1 id='__proto__' 2건 → 저장 1건", JSON.stringify(r2.expenses.map(e => e.id)));
  R.ok(cnt('dup1') === 1 && cnt('constructor') === 1 && cnt('정상') === 1,
       'D2-2 대조군 dup1·constructor·정상 각 1건 (회귀 금지)', 'dup1=' + cnt('dup1') + ' constructor=' + cnt('constructor'));
  /* S1 본체 — 고른 것만 지워지는가 */
  const del = await pg.evaluate(() => {
    const one = (id) => {
      const before = JR.model.getExpenses().data.items.map(e => e.id);
      const t = JR.model.getExpenses().data.items.filter(e => e.id === id)[0];
      if (!t) { return { id: id, missing: true }; }
      const d = JR.model.deleteExpense(t.id);
      const after = JR.model.getExpenses().data.items.map(e => e.id);
      return { id: id, ok: d.ok, gone: before.length - after.length, stillThere: after.indexOf(id) !== -1, before: before, after: after };
    };
    return { normal: one('정상'), proto: one('__proto__') };
  });
  R.ok(!del.normal.missing && del.normal.ok && del.normal.gone === 1 && !del.normal.stillThere,
       'D2-3 **S1 본체 (1)** — 평범한 id 를 고르면 그 1건만 사라짐',
       '삭제전=' + JSON.stringify(del.normal.before) + ' 삭제후=' + JSON.stringify(del.normal.after));
  R.ok(!del.proto.missing && del.proto.ok && del.proto.gone === 1 && !del.proto.stillThere,
       "D2-4 **S1 본체 (2)** — id='__proto__' 를 고르면 그 1건만 사라짐",
       '삭제전=' + JSON.stringify(del.proto.before) + ' 삭제후=' + JSON.stringify(del.proto.after));

  /* ───────── D3 QA-S-003 (S2) name='__proto__' 이름 중복 ───────── */
  pg = await fresh(b);
  let r3 = await importMutated(pg, `
    f.data.categories=[{id:'c1',name:'__proto__',order:0,isDefault:false},
                       {id:'c2',name:'__proto__',order:1,isDefault:false},
                       {id:'c3',name:'커피',order:2,isDefault:false},
                       {id:'c4',name:'커피',order:3,isDefault:false},
                       {id:'c5',name:'constructor',order:4,isDefault:false},
                       {id:'c6',name:'constructor',order:5,isDefault:false}];
    f.data.expenses=[];`);
  const nm = n => r3.cats.filter(c => c.name === n).length;
  R.ok(nm('__proto__') === 1, "D3-1 name='__proto__' 2건 → 카테고리 1개", JSON.stringify(r3.cats.map(c => c.name)));
  R.ok(nm('커피') === 1 && nm('constructor') === 1, 'D3-2 대조군 회귀 0', JSON.stringify(r3.cats.map(c => c.name)));

  /* ───────── D4 QA-S-004 (S2) categoryId='__proto__' 통계 귀속 ───────── */
  pg = await fresh(b);
  await importMutated(pg, `
    f.data.categories=[{id:'__proto__',name:'세탁',order:0,isDefault:false}];
    var mk=function(o){return Object.assign({id:'y',date:'2026-08-10',amount:1000,categoryId:'__proto__',memo:'',createdAt:1754870400000},o)};
    f.data.expenses=[mk({id:'e1',amount:2000}),mk({id:'e2',amount:3000}),mk({id:'e3',amount:4000})];`);
  const r4 = await pg.evaluate(() => {
    const m = JR.model.getCategoryMap();
    const proto = Object.getPrototypeOf(m.data.map);
    const bc = JR.stats.byCategory('2026-08');
    return {
      protoIsNull: proto === null,
      protoIsObject: proto === Object.prototype,
      globalPolluted: ({}).세탁 !== undefined || ({}).name === '세탁',
      bcOk: bc.ok, bcCode: bc.ok ? null : bc.code,
      rows: bc.ok ? bc.data.items.map(i => i.categoryName + '/' + i.amount + '/' + i.percent) : [],
      sum: bc.ok ? bc.data.items.reduce((a, i) => a + i.amount, 0) : -1,
      total: JR.stats.monthTotal('2026-08').data.total
    };
  });
  R.ok(r4.protoIsNull && !r4.globalPolluted, 'D4-1 getCategoryMap 프로토타입이 교체 불가(null) · 전역 오염 없음',
       'proto=' + (r4.protoIsNull ? 'null' : (r4.protoIsObject ? 'Object.prototype' : '교체됨')) + ' 전역오염=' + r4.globalPolluted);
  R.ok(r4.bcOk && r4.rows.length === 1 && /세탁/.test(r4.rows[0]) && r4.sum === 9000 && r4.total === 9000,
       'D4-2 통계 1행 · 금액 9,000원이 「세탁」에 귀속 (「미분류」로 새지 않음)',
       'ok=' + r4.bcOk + ' code=' + r4.bcCode + ' rows=' + JSON.stringify(r4.rows) + ' 합=' + r4.sum + ' total=' + r4.total);

  /* ───────── D5 QA-S-005 (S2) 가져오기 날짜 실재 ───────── */
  pg = await fresh(b);
  const r5 = await importMutated(pg, `
    var mk=function(o){return Object.assign({id:'d',date:'2026-08-10',amount:1000,categoryId:cid,memo:'',createdAt:1754870400000},o)};
    f.data.expenses=[mk({id:'d1',date:'2026-02-30'}),mk({id:'d2',date:'2026-04-31'}),
                     mk({id:'d3',date:'2026-13-01'}),mk({id:'d4',date:'2023-02-29'}),
                     mk({id:'ok1',date:'2024-02-29'}),mk({id:'ok2',date:'2026-08-10'})];`);
  const dates = r5.expenses.map(e => e.date);
  R.ok(['2026-02-30', '2026-04-31', '2026-13-01', '2023-02-29'].every(d => dates.indexOf(d) === -1),
       'D5-1 달력에 없는 날짜 4종 전부 거부', '저장된 날짜=' + JSON.stringify(dates));
  R.ok(dates.indexOf('2024-02-29') !== -1 && dates.indexOf('2026-08-10') !== -1,
       'D5-2 회귀 — 윤년 2024-02-29 와 평범한 날짜는 통과', JSON.stringify(dates));
  R.ok(r5.rejectedCount === 4, 'D5-3 거부 4건이 기존 rejected 경로로 셈됨 (새 E-코드 없음)', 'rejectedCount=' + r5.rejectedCount);

  /* ───────── D6 E-605 (S2) 복귀 재렌더 ─────────
   * 이 환경(headless·Xvfb 모두)에서는 배경 탭이 실제로 hidden 이 되지 않습니다.
   * 그래서 두 조각으로 나눠 측정합니다.
   *   D6-A 조치의 본체(model.init 이 구독자에게 알리는가)를 **스텁 없이** 실경로로 측정
   *   D6-B 종단(실제 탭 전환 → boot.onVisible) 은 **확인 불가**로 남깁니다 — 사유를 적습니다
   * ④ 는 document.visibilityState 를 defineProperty 로 덮어써서 통과시켰습니다(dev2-step3-e605.cjs:38).
   * 그것은 브라우저의 가시성 전환을 흉내 낸 것이지 실제 전환이 아닙니다. */
  {
    const ctx = await b.newContext();
    const APP2 = require('./qa2-lib.cjs').APP;
    const A = await ctx.newPage(); await A.goto(APP2);
    await A.waitForFunction(() => window.JR && JR.model && JR.model.isReady());
    const B = await ctx.newPage(); await B.goto(APP2);
    await B.waitForFunction(() => window.JR && JR.model && JR.model.isReady());
    const b0 = await B.evaluate(() => ({ rows: document.querySelectorAll('#jr-s01-list .jr-expense-row').length,
                                         total: (document.getElementById('jr-s01-total') || {}).textContent || '' }));
    const sum = await A.evaluate(() => {
      const cid = JR.model.getCategories().data.items[0].id;
      let t = 0;
      ['11000', '22000', '33000'].forEach((amt, i) => {
        JR.model.addExpense({ date: '2026-08-1' + i, amount: amt, categoryId: cid, memo: '탭A-' + i });
        t += Number(amt);
      });
      JR.model.setSelectedMonth('2026-08');
      return t;
    });
    R.ok(b0.rows === 0, 'D6 전제 — 탭A 저장 전 탭B 화면은 0행', 'rows=' + b0.rows + ' 총합="' + b0.total + '"');
    /* D6-A — boot.onVisible 이 하는 일을 스텁 없이 그대로 실행: model.init() 만 부릅니다.
     * 되돌림 전에는 이 호출로 model 만 갱신되고 DOM 은 0행 그대로였습니다. */
    await B.evaluate(() => { JR.model.init(); JR.stats.invalidate(); });
    await B.waitForTimeout(200);
    const b1 = await B.evaluate(() => ({
      n: JR.model.getExpenses().data.items.length,
      rows: document.querySelectorAll('#jr-s01-list .jr-expense-row').length,
      list: (document.getElementById('jr-s01-list') || {}).textContent || '',
      total: (document.getElementById('jr-s01-total') || {}).textContent || ''
    }));
    R.ok(b1.n === 3, 'D6-A0 전제 — model.init() 후 탭B 의 model 이 3건', 'n=' + b1.n);
    R.ok(b1.rows === 3 && /탭A-0/.test(b1.list) && /탭A-2/.test(b1.list),
         'D6-A1 **스텁 없이** model.init() 만으로 DOM 이 3행 다시 그려짐 (되돌림 전: 0행)', 'rows=' + b1.rows);
    R.ok(digits(b1.total) === String(sum), 'D6-A2 화면 총합이 실제 합계와 일치 (되돌림 전: "0원")',
         '화면="' + b1.total + '" 숫자만=' + digits(b1.total) + ' 기대=' + sum);
    /* D6-B — 실제 탭 전환 */
    await A.bringToFront(); await B.waitForTimeout(200);
    const visB = await B.evaluate(() => document.visibilityState);
    R.unknown('D6-B 실제 탭 전환(boot.onVisible) 종단 확인',
      '이 환경에서 배경 탭의 document.visibilityState 가 hidden 이 되지 않음(측정=' + visB + ') — headless·Xvfb 모두. 종단은 실기기 확인 필요');
    await ctx.close();
  }

  /* ───────── D7 E-123 (S2) 메모 상한 단일 기준 — 실타이핑 ───────── */
  pg = await fresh(b);
  const attr = await pg.evaluate(() => document.getElementById('jr-memo').getAttribute('maxlength'));
  R.ok(attr === null, 'D7-0 index.html maxlength 속성 없음', 'maxlength=' + attr);
  await pg.evaluate(() => { JR.ui.init && 0; document.querySelector('#jr-s01-add').click(); });
  await pg.waitForTimeout(120);
  /* 실타이핑 — 프로그램적 value 대입은 maxlength 를 우회하므로 결함을 재현하지 못합니다.
   * 브라우저의 실제 편집 명령(insertText)으로 넣습니다. */
  const typeMemo = async (text) => {
    await pg.evaluate(() => {
      const m = document.getElementById('jr-memo');
      m.value = ''; m.dispatchEvent(new Event('input', { bubbles: true }));
      const t = document.getElementById('jr-toast'); if (t) { t.textContent = ''; }
    });
    await pg.click('#jr-memo');
    await pg.keyboard.insertText(text);
    await pg.waitForTimeout(80);
    return pg.evaluate(() => ({
      cp: JR.model.countChars(document.getElementById('jr-memo').value),
      utf16: document.getElementById('jr-memo').value.length,
      counter: (document.getElementById('jr-memo-counter') || {}).textContent || '',
      toast: (document.getElementById('jr-toast') || {}).textContent || ''
    }));
  };
  const emo100 = await typeMemo('😀'.repeat(100));
  R.ok(emo100.cp === 100 && emo100.utf16 === 200, 'D7-1 이모지 100자가 코드포인트 100 으로 들어감 (되돌림 전: 50)',
       JSON.stringify(emo100));
  R.ok(emo100.counter === '100/100', 'D7-2 카운터 100/100', '카운터=' + emo100.counter);
  R.ok(emo100.toast === '', 'D7-3 정확히 100자에서는 자르지 않았으므로 E-123 을 부르지 않음', '토스트="' + emo100.toast + '"');
  const emo101 = await typeMemo('😀'.repeat(101));
  R.ok(emo101.cp === 100 && /뒷부분을 잘랐습니다/.test(emo101.toast),
       'D7-4 101자째에서 잘림 + E-123 토스트', JSON.stringify(emo101));
  const emo60 = await typeMemo('😀'.repeat(60));
  R.ok(emo60.cp === 60 && emo60.counter === '60/100',
       'D7-4b ②INT-43(6) 이모지 60자 시점 카운터 60/100 (되돌림 전: 50/100 에서 입력이 막힘)', JSON.stringify(emo60));
  const paste = await typeMemo('가'.repeat(5000));
  R.ok(paste.cp === 100 && /뒷부분을 잘랐습니다/.test(paste.toast), 'D7-5 5,000자 붙여넣기도 100 으로 잘림 + E-123',
       JSON.stringify(paste));
  const guard = await pg.evaluate(() => {
    const cid = JR.model.getCategories().data.items[0].id;
    const over = JR.model.validateExpense({ date: '2026-08-10', amount: '1000', categoryId: cid, memo: '가'.repeat(101) });
    const exact = JR.model.validateExpense({ date: '2026-08-10', amount: '1000', categoryId: cid, memo: '가'.repeat(100) });
    return { over: over.ok ? 'ok' : (over.data && over.data.errors ? over.data.errors[0].code : over.code), exact: exact.ok };
  });
  R.ok(guard.over === 'E-120' && guard.exact === true, 'D7-6 회귀 — 저장 시점 2차 방어선(E-120) 유지', JSON.stringify(guard));

  /* ───────── D8 QA-S-006 (S3) 가져오기 memo 상한 ───────── */
  pg = await fresh(b);
  const r8 = await importMutated(pg, `
    var mk=function(o){return Object.assign({id:'m',date:'2026-08-10',amount:1000,categoryId:cid,memo:'',createdAt:1754870400000},o)};
    f.data.expenses=[mk({id:'m1',memo:'가'.repeat(5000)}),mk({id:'m2',memo:'나'.repeat(100)}),mk({id:'m3',memo:'짧은메모'})];`);
  const m1 = r8.expenses.filter(e => e.id === 'm1');
  R.ok(m1.length === 0, 'D8-1 memo 5,000자 레코드는 저장되지 않음 (잘라서 저장도 아님)',
       'm1=' + JSON.stringify(m1) + ' 저장된 id=' + JSON.stringify(r8.expenses.map(e => e.id)));
  R.ok(r8.expenses.filter(e => e.id === 'm2' && e.memoLen === 100).length === 1 &&
       r8.expenses.filter(e => e.id === 'm3').length === 1,
       'D8-2 회귀 — 정확히 100자·짧은 메모는 그대로 저장', JSON.stringify(r8.expenses.map(e => e.id + ':' + e.memoLen)));

  /* ───────── D9 QA-S-007 (S3) restore 네임스페이스 ───────── */
  pg = await fresh(b);
  const r9 = await pg.evaluate(() => {
    localStorage.removeItem('완전히무관한키');
    const beforeV = localStorage.getItem('완전히무관한키');
    const snap = JR.store.snapshot().data.snap;
    const mutated = {};
    Object.keys(snap).forEach(k => { mutated[k] = snap[k]; });
    mutated['완전히무관한키'] = '침입값';
    mutated['jr.other.ns'] = '침입값2';
    const rr = JR.store.restore(mutated);
    return { ok: rr.ok, code: rr.ok ? null : rr.code, beforeV: beforeV,
             afterV: localStorage.getItem('완전히무관한키'),
             afterNs: localStorage.getItem('jr.other.ns'),
             jrKept: localStorage.getItem('jr.v1.settings') !== null };
  });
  R.ok(r9.afterV === null && r9.afterNs === null, 'D9-1 restore 가 jr.v1. 밖 키를 쓰지 않음',
       '전=' + r9.beforeV + ' 후=' + r9.afterV + ' / jr.other.ns=' + r9.afterNs);
  R.ok(r9.ok && r9.jrKept, 'D9-2 회귀 — jr.v1. 키 복원은 그대로', 'ok=' + r9.ok + ' settings유지=' + r9.jrKept);

  /* ───────── D10 E-203 (S3) {percent} — 실제 UI 저장 경로 ───────── */
  pg = await fresh(b);
  const r10 = await pg.evaluate(() => {
    const lim = JR.store.LIMIT_CHARS, cur = JR.store.usage().data.usedChars;
    JR.store.setRaw('jr.v1.pad', 'x'.repeat(Math.max(0, Math.floor(lim * 0.82) - cur - 200)));
    const cid = JR.model.getCategories().data.items[0].id;
    const r = JR.model.addExpense({ date: '2026-08-10', amount: '5000', categoryId: cid, memo: '' });
    const w = r.data ? r.data.warnings : [];
    return { saved: r.ok, types: (w || []).map(x => typeof x), codes: (w || []).map(x => x && x.code),
             hasParams: (w || []).every(x => x && typeof x === 'object' && x.params !== undefined),
             percent: Math.floor(JR.store.usage().data.ratio * 100), w: JSON.stringify(w) };
  });
  R.ok(r10.saved, 'D10 전제 — 저장 성공', 'ok=' + r10.saved);
  R.ok(r10.types.length > 0 && r10.types.every(t => t === 'object') && r10.codes.indexOf('E-203') !== -1 && r10.hasParams,
       'D10-1 warnings 원소가 {code,params} 객체이고 E-203 을 담고 있음 (되돌림 전: "string")', r10.w);
  const uiBanner = await pg.evaluate(() => {
    /* 실제 화면 경로: ui 가 warnings[0] 을 그대로 show 에 넘기는지 */
    const cid = JR.model.getCategories().data.items[0].id;
    document.getElementById('jr-s01-add').click();
    document.getElementById('jr-date').value = '2026-08-10';
    document.getElementById('jr-date').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('jr-amount').value = '5000';
    document.getElementById('jr-amount').dispatchEvent(new Event('input', { bubbles: true }));
    const chip = document.querySelector('#jr-cat-group .jr-chip, #jr-cat-group button');
    if (chip) { chip.click(); }
    document.getElementById('jr-s02-save').click();
    const bn = document.querySelector('.jr-banner__text');
    const tn = document.getElementById('jr-toast');
    return { banner: bn ? bn.textContent : '', toast: tn ? tn.textContent : '',
             percent: Math.floor(JR.store.usage().data.ratio * 100) };
  });
  const expect10 = '저장 공간을 ' + uiBanner.percent + '% 썼습니다';
  R.ok(uiBanner.banner.indexOf(expect10) !== -1,
       'D10-2 실제 저장 버튼 경로의 배너에 사용률 숫자가 채워짐', '기대="' + expect10 + '" 실측="' + uiBanner.banner + '"');
  R.ok(!/썼습니다/.test(uiBanner.banner) || !/공간을\s*%/.test(uiBanner.banner),
       'D10-3 「저장 공간을 % 썼습니다」(빈 치환 자리)가 화면에 없음', '배너="' + uiBanner.banner + '"');

  /* ───────── D12 QA-F-001 (S3) 내보내기 대체 영역 ───────── */
  pg = await fresh(b);
  const probe = () => pg.evaluate(() => {
    const fb = document.getElementById('jr-export-fallback');
    const ta = document.getElementById('jr-export-text');
    return { hidden: fb.hasAttribute('hidden'), h: fb.getBoundingClientRect().height, len: ta ? ta.value.length : -1 };
  });
  await pg.evaluate(() => {
    const cid = JR.model.getCategories().data.items[0].id;
    JR.model.addExpense({ date: '2026-08-10', amount: '1000', categoryId: cid, memo: '내보내기메모원문' });
    document.querySelector('#jr-tabbar [data-screen="s04"], #jr-tabbar button:nth-child(3)').click();
  });
  await pg.waitForTimeout(100);
  const p1 = await probe();
  await pg.evaluate(() => document.getElementById('jr-s04-export').click());
  await pg.waitForTimeout(200);
  const p2 = await probe();
  await pg.evaluate(() => document.querySelector('#jr-tabbar [data-screen="s01"], #jr-tabbar button:nth-child(1)').click());
  await pg.waitForTimeout(100);
  const p3 = await probe();
  await pg.evaluate(() => document.querySelector('#jr-tabbar [data-screen="s04"], #jr-tabbar button:nth-child(3)').click());
  await pg.waitForTimeout(100);
  const p4 = await probe();
  R.ok(p1.hidden === true && p1.len === 0, 'D12-1 누르기 전 접혀 있고 비어 있음', JSON.stringify(p1));
  R.ok(p2.hidden === false && p2.len > 0, 'D12-2 회귀 — 내보내기를 누르면 열리고 내용이 들어감', JSON.stringify(p2));
  R.ok(p3.hidden === true && p3.len === 0, 'D12-3 다른 화면으로 나가면 접히고 DOM 잔존도 없음', JSON.stringify(p3));
  R.ok(p4.hidden === true && p4.len === 0, 'D12-4 **재진입 시 누르지도 않은 JSON 전문이 뜨지 않음**', JSON.stringify(p4));

  const errs = (pg.__errs || []);
  R.ok(errs.length === 0, 'A 스크립트 전 구간 콘솔·페이지 오류 0건', JSON.stringify(errs).slice(0, 400));

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH ' + e.stack); process.exit(2); });
