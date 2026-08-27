/* ④ tech-lead — ② 계약 판정(INT-42 · INT-43) **상호 검토용 실행 재현**
 * ② 는 이 환경에서 브라우저·Node 를 실행할 수 없어 전부 정적 판독/경로 추적이었습니다.
 * 이 스크립트는 ② 가 「추적한 것이지 재현한 것이 아니다」라고 명기한 두 항목을 실제로 돌립니다.
 *   A. INT-42(3) — stats.js:96 을 두고 model.js:782 만 고쳤을 때의 중복 행 결함
 *   B. INT-43(3)(6) — maxlength 가 이모지를 UTF-16 으로 막고 카운터는 코드포인트로 세는 오표시
 * 이 스크립트는 src/ 를 고치지 않습니다. A 는 getCategoryMap 을 페이지 안에서만 갈아 끼워
 * 「가정된 중간 상태」를 만들어 관찰합니다.
 */
const { reporter, launch, freshPage } = require('./dev2-lib.cjs');

(async () => {
  const R = reporter('④ ② 판정 상호 검토 — INT-42(3) · INT-43 실행 재현');
  const b = await launch();

  /* ---------- A. INT-42(3) stats.js:96 ---------- */
  const pg = await freshPage(b);
  /* stats.js:96 이 이미 조치되었는지 소스에서 읽습니다. 아래 「버킷 루프 복제」가
   * 소스와 **같은 선택**을 해야 복제가 복제로서 뜻이 있습니다. */
  const statsFixed = /var buckets = Object\.create\(null\)/.test(
    require('fs').readFileSync(__dirname + '/../src/js/stats.js', 'utf8'));

  const A = await pg.evaluate((statsFixed) => {
    const f = JSON.parse(JR.io.buildExport().data.json);
    f.data.categories = f.data.categories.concat([{ id: '__proto__', name: '세탁', order: 90, isDefault: false }]);
    const mk = (i) => ({ id: 'p' + i, date: '2026-08-1' + i, amount: 1000 * (i + 1), categoryId: '__proto__', memo: '', createdAt: 1754870400000 });
    f.data.expenses = [mk(1), mk(2), mk(3)];
    f.counts = { expenses: 3, categories: f.data.categories.length };
    const pr = JR.io.parseImport(JSON.stringify(f));
    const ap = pr.ok ? JR.io.applyImport(pr.data.payload) : null;

    const b0 = JR.stats.byCategory('2026-08');
    const before = b0.ok ? { ok: true, total: b0.data.total, n: b0.data.items.length,
      rows: b0.data.items.map(x => x.categoryName + '/' + x.amount + '원/' + x.percent + '%') }
      : { ok: false, code: b0.code };

    /* ── ② 가 추적한 「중간 상태」를 그대로 만든다 ──
       model.js:782 만 Object.create(null) 로 고치고 stats.js:96 buckets 는 {} 인 상태 */
    const realMap = JR.model.getCategoryMap;
    JR.model.getCategoryMap = function () {
      const m = Object.create(null);
      const items = JR.model.getCategories().data.items;
      for (let i = 0; i < items.length; i++) { m[items[i].id] = items[i]; }
      return JR.err.ok({ map: m });
    };
    JR.stats.invalidate();
    const b1 = JR.stats.byCategory('2026-08');
    const mid = b1.ok ? { ok: true, total: b1.data.total, n: b1.data.items.length,
      rows: b1.data.items.map(x => x.categoryName + '/' + x.amount + '원/' + x.percent + '%') }
      : { ok: false, code: b1.code };

    /* stats.js 의 버킷 루프만 그대로 옮겨 무엇이 일어나는지 눈으로 본다 */
    const m2 = JR.model.getCategoryMap().data.map;
    const list = JR.model.listByMonth('2026-08').data.items;
    const buckets = statsFixed ? Object.create(null) : {};   /* 소스와 같은 선택 */
    const order = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const key = Object.prototype.hasOwnProperty.call(m2, e.categoryId) ? e.categoryId : '__deleted__';
      if (!Object.prototype.hasOwnProperty.call(buckets, key)) { buckets[key] = { categoryId: key, amount: 0, count: 0 }; order.push(key); }
      buckets[key].amount += e.amount; buckets[key].count += 1;
    }
    const bucketProtoReplaced = statsFixed
      ? Object.getPrototypeOf(buckets) !== null
      : Object.getPrototypeOf(buckets) !== Object.prototype;

    JR.model.getCategoryMap = realMap;
    JR.stats.invalidate();

    return { applied: !!(ap && ap.ok), expenseCount: JR.model.getExpenses().data.items.length,
      before, mid, orderLen: order.length, order, bucketProtoReplaced,
      bucketAmount: buckets['__proto__'] ? buckets['__proto__'].amount : null };
  }, statsFixed);

  R.note('입력: categoryId="__proto__" 인 지출 3건(2,000+3,000+4,000=9,000원) · id="__proto__" 카테고리 「세탁」 1개');
  R.note('A-1 현재 코드(둘 다 미조치): ' + JSON.stringify(A.before));
  R.note('A-2 ② 가 추적한 중간 상태(map 만 null-proto · buckets 는 {}): ' + JSON.stringify(A.mid));
  R.note('A-3 그 상태의 버킷 루프 실측: order.length=' + A.orderLen + ' order=' + JSON.stringify(A.order) +
    ' buckets 프로토타입 교체됨=' + A.bucketProtoReplaced + ' 마지막 버킷 금액=' + A.bucketAmount);
  /* 이 스크립트는 **조치 전과 후 모두** 돌아갑니다.
   * stats.js 가 이미 조치되었으면 A-2·A-3 은 「더 이상 재현되지 않아야 한다」로 판정을 뒤집습니다.
   * 조치 전 원문 출력은 docs/개발-수정보고-2회차.md §1 에 그대로 실어 두었습니다. */
  R.note('stats.js:96 조치 여부 = ' + (statsFixed ? '조치됨(1단계 완료)' : '미조치(되돌림 시점 코드)'));

  R.ok(A.applied && A.expenseCount === 3, '재현 전제 — 지출 3건이 실제로 저장됨', 'count=' + A.expenseCount);

  if (!statsFixed) {
    R.ok(A.before.ok && A.before.n === 1 && /미분류/.test(A.before.rows[0]),
      'A-1 (조치 전) QA-S-004 · S2 — 금액이 「미분류」로 잘못 귀속됨', JSON.stringify(A.before.rows || A.before));
    R.ok(A.orderLen === 3 && A.bucketProtoReplaced,
      'A-2 (조치 전) **② 의 stats.js:96 주장 재현됨** — 지출 1건마다 버킷이 새로 생기고 order 가 반복됨',
      'order.length=' + A.orderLen + ' · buckets 프로토타입 교체=' + A.bucketProtoReplaced);
    R.ok(A.mid.ok === false && A.mid.code === 'E-501',
      'A-3 (조치 전) **② 판정을 넘어서는 결과** — 중복 행에 그치지 않고 byCategory 가 E-501 로 실패',
      JSON.stringify(A.mid));
  } else {
    R.ok(A.before.ok && A.before.n === 1 && /세탁/.test(A.before.rows[0]),
      'A-1 (조치 후) 금액이 카테고리 이름 그대로 집계됨 — 「미분류」로 새지 않음', JSON.stringify(A.before.rows));
    R.ok(A.orderLen === 1 && !A.bucketProtoReplaced,
      'A-2 (조치 후) 버킷이 1개만 생기고 프로토타입이 교체되지 않음 — ② 가 경고한 중복 행이 생기지 않음',
      'order.length=' + A.orderLen + ' · buckets 프로토타입 교체=' + A.bucketProtoReplaced);
    R.ok(A.mid.ok === true && A.mid.n === 1,
      'A-3 (조치 후) byCategory 가 E-501 로 실패하지 않음', JSON.stringify(A.mid));
  }

  /* ---------- B. INT-43 이모지 상한 ---------- */
  const pg2 = await freshPage(b);
  await pg2.click('#jr-s01-add');
  await pg2.waitForSelector('#jr-memo', { state: 'visible' });
  const attr = await pg2.getAttribute('#jr-memo', 'maxlength');
  await pg2.click('#jr-memo');
  await pg2.keyboard.insertText('가'.repeat(100));
  const han = await pg2.evaluate(() => ({ len: document.getElementById('jr-memo').value.length,
    cp: JR.model.countChars(document.getElementById('jr-memo').value),
    counter: document.getElementById('jr-memo-counter').textContent }));
  await pg2.evaluate(() => { document.getElementById('jr-memo').value = ''; });
  await pg2.click('#jr-memo');
  await pg2.keyboard.insertText('\u{1F600}'.repeat(100));
  const emo = await pg2.evaluate(() => ({ len: document.getElementById('jr-memo').value.length,
    cp: JR.model.countChars(document.getElementById('jr-memo').value),
    counter: document.getElementById('jr-memo-counter').textContent }));
  /* ② 가 (6) 으로 더한 기준 — 이모지 60자 시점 */
  await pg2.evaluate(() => { document.getElementById('jr-memo').value = ''; });
  await pg2.click('#jr-memo');
  await pg2.keyboard.insertText('\u{1F600}'.repeat(60));
  const e60 = await pg2.evaluate(() => ({ cp: JR.model.countChars(document.getElementById('jr-memo').value),
    counter: document.getElementById('jr-memo-counter').textContent }));

  R.note('B maxlength 속성값 = ' + attr);
  R.note('B 한글 100자 실타이핑: ' + JSON.stringify(han));
  R.note('B 이모지 100자 실타이핑: ' + JSON.stringify(emo));
  R.note('B 이모지 60자 실타이핑: ' + JSON.stringify(e60));
  R.ok(emo.cp === 100, 'B-1 이모지 100자가 계약 상한(코드포인트 100)만큼 들어감', 'countChars=' + emo.cp);
  R.ok(e60.counter === '60/100', 'B-2 (② 가 INT-43(6) 으로 더한 기준) 이모지 60자 시점 카운터가 60/100', '카운터=' + e60.counter);
  R.ok(attr === null, 'B-3 index.html:86 maxlength 속성이 제거되어 있음', 'maxlength=' + attr);

  const errs = (pg.__errs || []).concat(pg2.__errs || []);
  R.ok(errs.length === 0, '콘솔·페이지 오류 0건', JSON.stringify(errs).slice(0, 300));

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });
