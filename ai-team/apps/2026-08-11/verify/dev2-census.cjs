/* ④ tech-lead — Q-066 판정에 따른 `verify/ok.cjs` 대체 도구 (전 표면 census)
 *
 * ok.cjs 가 기준선을 네 번 틀리게 만든 원인은 두 가지였습니다.
 *   (1) 인자를 모르는 함수를 「미호출(인자 불명)」로 **조용히** 빼고도 「개수: N」을 출력했습니다.
 *   (2) JR.ui 를 세지 않으면서 그 사실을 출력에 적지 않았습니다.
 * 이 도구는 그 둘을 구조적으로 막습니다.
 *   - 표면 키를 런타임에서 열거하고, ARGS 에 없는 키가 하나라도 있으면 **FAIL 로 중단**합니다.
 *   - 범위(모듈 명단)를 매 출력 줄에 함께 적습니다. INT-41 의 재발 방지 규칙과 같은 취지입니다.
 * 정본 기준선: docs/기획서.md §7-12 INT-41 (전 표면 28 · 계약 범위 5모듈 18)
 */
const { reporter, launch, freshPage } = require('./dev2-lib.cjs');

/* INT-41 계약 범위 5모듈 비-{ok} 정본 명단 18개 */
const INT41_CONTRACT18 = [
  'err.get', 'err.slot', 'err.format', 'err.log',
  'store.mode',
  'model.isReady', 'model.today', 'model.minDate', 'model.maxDate', 'model.countChars',
  'model.normName', 'model.shiftMonth', 'model.monthRange', 'model.isNoticeDismissed',
  'stats.allocatePercents', 'stats.formatAmount', 'stats.invalidate',
  'io.readFile'
];
const INT41_UI10 = ['ui.init', 'ui.show', 'ui.showErrors', 'ui.toast', 'ui.toastText',
  'ui.inline', 'ui.banner', 'ui.dismissBanner', 'ui.lock', 'ui.unlock'];

(async () => {
  const R = reporter('④ 전 표면 census — Q-066 대체 도구 (ok.cjs 폐기)');
  const b = await launch();
  const pg = await freshPage(b);

  const res = await pg.evaluate(() => {
    /* 인자 표. 표면 키 전체를 덮지 못하면 이 스크립트는 실패로 끝납니다. */
    const ARGS = {
      /* --- err --- */
      'err.MESSAGES': null, 'err.BANNER_KIND': null, 'err.BANNER_PRIORITY': null,
      'err.get': ['E-101'], 'err.slot': ['E-101'], 'err.format': ['{a}', { a: 1 }],
      'err.ok': [{}], 'err.fail': ['E-101', {}], 'err.log': ['E-501', 'census'],
      /* --- store (읽기) --- */
      'store.LIMIT_CHARS': null, 'store.MODE_PERSIST': null, 'store.MODE_MEMORY': null,
      'store.init': [], 'store.mode': [], 'store.getRaw': ['jr.v1.meta'],
      'store.keys': [], 'store.getJSON': ['jr.v1.meta'], 'store.usage': [], 'store.snapshot': [],
      /* --- model (읽기) --- */
      'model.isReady': [], 'model.today': [], 'model.minDate': [], 'model.maxDate': [],
      'model.countChars': ['abc'], 'model.normName': [' 커피 '], 'model.shiftMonth': ['2026-08', 1],
      'model.monthRange': [], 'model.isNoticeDismissed': ['E-203'],
      'model.getExpenses': [], 'model.listByMonth': ['2026-08'], 'model.availableMonths': [],
      'model.countByCategory': ['c_d01'], 'model.getCategories': [], 'model.getCategoryMap': [],
      'model.getCategoryName': ['c_d01'], 'model.getSettings': [], 'model.getExpense': ['nope'],
      'model.loadDraft': [], 'model.subscribe': [function () {}],
      'model.validateExpense': [{ date: '2026-08-11', amount: '1000', categoryId: 'c_d01', memo: '' }],
      /* --- stats --- */
      'stats.allocatePercents': [[10, 20], 30], 'stats.formatAmount': [12500],
      'stats.monthTotal': ['2026-08'], 'stats.byCategory': ['2026-08'], 'stats.invalidate': [],
      /* --- io --- */
      'io.EXPORT_SCHEMA': null, 'io.MAX_IMPORT_CHARS': null,
      'io.buildExport': [], 'io.canDownload': [], 'io.parseImport': ['{}'],
      'io.readFile': [null, function () {}], 'io.download': ['{"a":1}', 'census.json'],
      'io.applyImport': [null],
      /* --- ui (계약 범위 밖 · INT-41 이 명단으로 못박음) --- */
      'ui.MSG': null, 'ui.TOAST_MS': null,
      'ui.show': ['E-601'], 'ui.showErrors': [{ ok: false, code: 'E-601', data: {} }],
      'ui.toast': ['E-601'], 'ui.toastText': ['census'], 'ui.inline': ['memo', 'E-120', { over: 1 }],
      'ui.banner': ['E-203', { percent: 82 }], 'ui.dismissBanner': ['E-203'],
      'ui.lock': ['census'], 'ui.unlock': ['census'],
      /* --- 상태를 바꾸는 것은 맨 뒤 --- */
      'model.setSelectedMonth': ['2026-08'], 'model.dismissNotice': ['E-203'],
      'model.saveDraft': [{ date: '2026-08-11' }], 'model.clearDraft': [],
      'model.addExpense': [{ date: '2026-08-11', amount: '1000', categoryId: 'c_d01', memo: '' }],
      'model.updateExpense': ['nope', { date: '2026-08-11', amount: '1000', categoryId: 'c_d01', memo: '' }],
      'model.deleteExpense': ['nope'],
      'model.addCategory': ['census'], 'model.renameCategory': ['nope', 'census2'],
      'model.deleteCategory': ['nope'],
      'store.setRaw': ['jr.__census', '1'], 'store.setJSON': ['jr.__census2', { a: 1 }],
      'store.removeRaw': ['jr.__census'],
      'store.writeAll': [{ expenses: [], categories: [{ id: 'c_d01', name: '식비', order: 0, isDefault: true }], settings: { selectedMonth: '2026-08', dismissedNotices: [] } }],
      'store.restore': [{}], 'store.quarantine': ['jr.__census2', 'raw'],
      'store.clearAppKeys': [], 'store.wipeAll': [{ expenses: [], categories: [], settings: {} }],
      'model.replaceAll': [{ expenses: [], categories: [{ id: 'c_d01', name: '식비', order: 0, isDefault: true }], settings: { selectedMonth: '2026-08' } }],
      'model.wipeAll': [], 'model.init': [], 'ui.init': [{}]
    };

    const MODULES = ['err', 'store', 'model', 'stats', 'io', 'ui'];
    const surface = [];
    MODULES.forEach(m => Object.keys(JR[m]).forEach(fn => surface.push(m + '.' + fn)));
    const missing = surface.filter(k => !(k in ARGS));
    const extra = Object.keys(ARGS).filter(k => surface.indexOf(k) === -1);

    const out = [];
    /* ARGS 선언 순서대로 호출 — 상태 변경 함수를 뒤에 둔 순서가 그대로 유지됩니다 */
    Object.keys(ARGS).forEach(key => {
      if (surface.indexOf(key) === -1) { return; }
      const mod = key.split('.')[0], fn = key.split('.')[1];
      const v = JR[mod][fn];
      if (typeof v !== 'function') { out.push({ key, kind: '상수' }); return; }
      let r;
      try { r = v.apply(null, ARGS[key]); }
      catch (e) { out.push({ key, kind: '예외발생', detail: String(e).slice(0, 120) }); return; }
      const isOk = r !== null && typeof r === 'object' && typeof r.ok === 'boolean';
      out.push({ key, kind: isOk ? '{ok}' : '비-{ok}', ret: Object.prototype.toString.call(r) });
    });
    return { surface, missing, extra, out };
  });

  const consts = res.out.filter(o => o.kind === '상수').map(o => o.key);
  const thrown = res.out.filter(o => o.kind === '예외발생');
  const nonOk = res.out.filter(o => o.kind === '비-{ok}').map(o => o.key);
  const okFns = res.out.filter(o => o.kind === '{ok}').map(o => o.key);

  R.ok(res.missing.length === 0,
    '표면 전건이 인자 표에 있음 (ok.cjs 의 「미호출(인자 불명)」 사각 제거)',
    '누락=' + JSON.stringify(res.missing));
  R.note('사라진 표면 키(ARGS 에만 있고 JR 에 없음): ' + JSON.stringify(res.extra));
  R.note('범위 = err·store·model·stats·io·ui 6모듈 전부. 표면 키 ' + res.surface.length +
    ' = 함수 ' + (nonOk.length + okFns.length) + ' + 상수 ' + consts.length);

  R.ok(res.surface.length === 85, 'INT-41 표면 키 85', '실측=' + res.surface.length);
  R.ok(consts.length === 10, 'INT-41 상수 10', '실측=' + consts.length + ' ' + consts.join(','));
  R.ok(nonOk.length + okFns.length === 75, 'INT-41 함수 75', '실측=' + (nonOk.length + okFns.length));
  R.ok(nonOk.length === 28, 'INT-41 전 표면 비-{ok} 28', '실측=' + nonOk.length + ' → ' + nonOk.join(' '));
  R.ok(thrown.length === 0, '규약 위반(예외를 던진 함수) 0', JSON.stringify(thrown));

  const contract = nonOk.filter(k => k.indexOf('ui.') !== 0).sort();
  const want = INT41_CONTRACT18.slice().sort();
  R.ok(JSON.stringify(contract) === JSON.stringify(want),
    'INT-41 계약 범위 18 — **숫자가 아니라 명단 1:1 대조**',
    '실측=' + contract.join(' ') + ' / 정본과의 차이=' +
    JSON.stringify({ 없어야하는데있음: contract.filter(k => want.indexOf(k) === -1), 있어야하는데없음: want.filter(k => contract.indexOf(k) === -1) }));

  const uiNon = nonOk.filter(k => k.indexOf('ui.') === 0).sort();
  R.ok(JSON.stringify(uiNon) === JSON.stringify(INT41_UI10.slice().sort()),
    'INT-41 JR.ui 10 (계약 범위 밖 — 고치지 않습니다)', '실측=' + uiNon.join(' '));

  const f = R.finish();
  await b.close();
  process.exit(f === 0 ? 0 : 1);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });
