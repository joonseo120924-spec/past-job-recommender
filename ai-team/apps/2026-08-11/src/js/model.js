/* 한달정리 — JR.model
 * 기록 · 카테고리 · 설정 · 초안 · monthIndex(INT-25).
 * 정본: docs/기획-구조설계.md §1-2 · §2 · §4-1 · §4-2 · §4-6 · §5-4 · §6-3 · §6-6
 *     + docs/기획서.md INT-06 · INT-24 · INT-25 · INT-28 · INT-30
 * 의존: JR.err · JR.store  (+ 예외 1건: JR.stats.invalidate 역방향 호출)
 */
var JR = JR || {};
JR.model = (function () {
  'use strict';

  var E = JR.err;
  var S = JR.store;

  var K_META = 'jr.v1.meta';
  var K_EXPENSES = 'jr.v1.expenses';
  var K_CATEGORIES = 'jr.v1.categories';
  var K_SETTINGS = 'jr.v1.settings';
  var K_DRAFT = 'jr.v1.draft';
  var K_ROLLBACK = 'jr.v1.rollback';
  var K_REJECTED = 'jr.v1.rejected';

  var MIN_DATE = '2000-01-01';
  var MIN_MONTH = '2000-01';
  var MEMO_MAX = 100;
  var NAME_MAX = 12;
  var CATEGORY_MAX = 20;
  var AMOUNT_MAX = 999999999;
  var DRAFT_TTL_MS = 86400000;
  var MAX_REJECTED = 100;
  var DANGLING_LABEL = '미분류(삭제된 카테고리)';   /* INT-06 */

  var RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
  var RE_MONTH = /^\d{4}-\d{2}$/;
  var RE_DIGITS = /^[0-9]+$/;

  /* ---- 상태 ---- */
  var expenses = [];
  var categories = [];
  var settings = null;
  var monthIndex = {};          /* INT-25 · JR.model 내부 상태. 공개하지 않는다 */
  var ready = false;
  var readOnly = false;         /* E-307 */
  var subscribers = [];
  var _seq = 0;

  /* ---------- 순수 계산 (R-6 예외 · 원시값 반환) ---------- */

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function pad4(n) { return n < 10 ? '000' + n : n < 100 ? '00' + n : n < 1000 ? '0' + n : '' + n; }

  /* §1-2 — 오늘 날짜를 만드는 유일한 허용 방법. toISOString 금지 */
  function today() {
    var d = new Date();
    return pad4(d.getFullYear()) + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function minDate() { return MIN_DATE; }

  function maxDate() {
    var d = new Date(), y = d.getFullYear() + 1, m = d.getMonth() + 1, day = d.getDate();
    if (m === 2 && day === 29) { day = 28; }
    return pad4(y) + '-' + pad2(m) + '-' + pad2(day);
  }

  function countChars(s) {
    if (typeof s !== 'string') { return 0; }
    if (typeof Array.from === 'function') { return Array.from(s).length; }
    var n = 0, i = 0, c, d;
    while (i < s.length) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { i += 2; n++; continue; }
      }
      i++; n++;
    }
    return n;
  }

  function normName(s) {
    return String(s).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function shiftMonth(yyyymm, delta) {
    if (typeof yyyymm !== 'string' || !RE_MONTH.test(yyyymm)) { return yyyymm; }
    var y = parseInt(yyyymm.slice(0, 4), 10);
    var m = parseInt(yyyymm.slice(5, 7), 10);
    var d = (typeof delta === 'number' && isFinite(delta)) ? Math.trunc(delta) : 0;
    var t = y * 12 + (m - 1) + d;
    var ny = Math.floor(t / 12);
    var nm = t - ny * 12 + 1;
    return pad4(ny) + '-' + pad2(nm);
  }

  function monthRange() {
    return { min: MIN_MONTH, max: maxDate().slice(0, 7) };
  }

  /* ---------- 내부 유틸 ---------- */

  function newId(prefix) {
    _seq = (_seq + 1) % 1679616;
    return prefix + '_' +
           Date.now().toString(36) + '_' +
           _seq.toString(36) + '_' +
           Math.floor(Math.random() * 1679616).toString(36);
  }

  function uniqueId(prefix, list) {
    var i, j, id, dup;
    for (i = 0; i < 5; i++) {
      id = newId(prefix);
      dup = false;
      for (j = 0; j < list.length; j++) { if (list[j].id === id) { dup = true; break; } }
      if (!dup) { return id; }
    }
    return null;
  }

  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }

  function isRealDate(s) {
    var y = parseInt(s.slice(0, 4), 10), m = parseInt(s.slice(5, 7), 10), d = parseInt(s.slice(8, 10), 10);
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  /* §4-1 결정적 전순서. 어떤 두 기록에 대해서도 0을 반환하지 않는다 */
  function compareExpenseDesc(a, b) {
    if (a.date !== b.date) { return a.date < b.date ? 1 : -1; }
    if (a.createdAt !== b.createdAt) { return b.createdAt - a.createdAt; }
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  }

  function defaultCategories() {
    return [
      { id: 'c_d01', name: '식비', order: 0, isDefault: true },
      { id: 'c_d02', name: '교통', order: 1, isDefault: true },
      { id: 'c_d03', name: '주거/통신', order: 2, isDefault: true },
      { id: 'c_d04', name: '생활용품', order: 3, isDefault: true },
      { id: 'c_d05', name: '의료/건강', order: 4, isDefault: true },
      { id: 'c_d06', name: '문화/여가', order: 5, isDefault: true },
      { id: 'c_d07', name: '의류/미용', order: 6, isDefault: true },
      { id: 'c_d08', name: '기타', order: 7, isDefault: true }
    ];
  }

  function defaultSettings() {
    return { selectedMonth: today().slice(0, 7), dismissedNotices: [] };
  }

  function rebuildMonthIndex() {
    var i, k;
    monthIndex = {};
    for (i = 0; i < expenses.length; i++) {
      k = expenses[i].date.slice(0, 7);
      if (!Object.prototype.hasOwnProperty.call(monthIndex, k)) { monthIndex[k] = []; }
      monthIndex[k].push(i);
    }
  }

  /* INT-24 · INT-25 — 무효화와 인덱스 재구축은 여기 한 곳에서만 */
  function notifyChange(kind) {
    var i;
    if (kind !== 'settings') {
      rebuildMonthIndex();
      if (JR.stats && typeof JR.stats.invalidate === 'function') { JR.stats.invalidate(); }
    }
    for (i = 0; i < subscribers.length; i++) {
      try { subscribers[i](kind); } catch (e) { E.log('E-501', e); }
    }
  }

  function persist(nextExpenses, nextCategories, nextSettings) {
    return S.writeAll({
      expenses: nextExpenses,
      categories: nextCategories,
      settings: nextSettings
    });
  }

  function findExpense(id) {
    var i;
    for (i = 0; i < expenses.length; i++) { if (expenses[i].id === id) { return i; } }
    return -1;
  }

  function findCategory(id) {
    var i;
    for (i = 0; i < categories.length; i++) { if (categories[i].id === id) { return i; } }
    return -1;
  }

  /* ---------- 정규화 · 검증 ---------- */

  function stripLoneSurrogates(s) {
    var out = '', i = 0, c, d, removed = 0;
    while (i < s.length) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        d = (i + 1 < s.length) ? s.charCodeAt(i + 1) : -1;
        if (d >= 0xDC00 && d <= 0xDFFF) { out += s.charAt(i) + s.charAt(i + 1); i += 2; continue; }
        removed++; i++; continue;
      }
      if (c >= 0xDC00 && c <= 0xDFFF) { removed++; i++; continue; }
      out += s.charAt(i); i++;
    }
    return { text: out, removed: removed };
  }

  function stripControls(s) {
    var out = '', i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if ((c >= 0x0000 && c <= 0x001F) || c === 0x007F) { continue; }
      out += s.charAt(i);
    }
    return out;
  }

  function hasCombining(s) {
    var i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c === 0x200D || c === 0xFE0F) { return true; }
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { return true; }
      }
    }
    return false;
  }

  function pushErr(errors, field, code, params) {
    errors.push({ field: field, code: code, params: params || {} });
  }

  /* §5-4-3 — input.amount 는 문자열도 받는다. 파싱 규칙은 여기 한 곳뿐 */
  function validateExpense(input) {
    try {
      if (!input || typeof input !== 'object') { return E.fail('E-502', {}); }
      var errors = [], warnings = [];
      var rawDate = (typeof input.date === 'string') ? input.date : '';
      var rawAmount = (input.amount === null || input.amount === undefined) ? '' : String(input.amount);
      var rawCat = (typeof input.categoryId === 'string') ? input.categoryId : '';
      var rawMemo = (typeof input.memo === 'string') ? input.memo : '';
      var amountValue = null, memo, sur;

      /* --- 날짜 --- */
      var dateStr = rawDate.trim();
      if (dateStr === '') {
        pushErr(errors, 'date', 'E-108');
      } else if (!RE_DATE.test(dateStr)) {
        pushErr(errors, 'date', 'E-107');
      } else if (!isRealDate(dateStr)) {
        pushErr(errors, 'date', 'E-109');
      } else if (dateStr < MIN_DATE) {
        pushErr(errors, 'date', 'E-110');
      } else if (dateStr > maxDate()) {
        pushErr(errors, 'date', 'E-111', { max: maxDate() });
      }

      /* --- 금액 --- */
      var amtStr = rawAmount.replace(/,/g, '').replace(/\s+/g, '');
      if (amtStr === '') {
        pushErr(errors, 'amount', 'E-101');
      } else if (amtStr.indexOf('.') !== -1) {
        pushErr(errors, 'amount', 'E-105');
      } else if (!RE_DIGITS.test(amtStr)) {
        pushErr(errors, 'amount', 'E-102');
      } else {
        var n = Number(amtStr);
        if (!isFinite(n) || n > 9007199254740991) {
          pushErr(errors, 'amount', 'E-106');
        } else if (n < 1) {
          pushErr(errors, 'amount', 'E-103');
        } else if (n > AMOUNT_MAX) {
          pushErr(errors, 'amount', 'E-104');
        } else {
          amountValue = n;
        }
      }

      /* --- 카테고리 --- */
      if (rawCat === '') {
        pushErr(errors, 'categoryId', 'E-112');
      } else if (findCategory(rawCat) === -1) {
        pushErr(errors, 'categoryId', 'E-113');
      }

      /* --- 메모 (§2-1 정규화 순서 그대로) --- */
      memo = rawMemo.trim();
      sur = stripLoneSurrogates(memo);
      memo = sur.text;
      if (sur.removed > 0) { warnings.push('E-122'); }
      memo = stripControls(memo);
      var memoLen = countChars(memo);
      if (memoLen > MEMO_MAX) {
        if (hasCombining(memo)) {
          pushErr(errors, 'memo', 'E-121');
        } else {
          pushErr(errors, 'memo', 'E-120', { over: memoLen - MEMO_MAX });
        }
      }

      if (errors.length > 0) {
        return E.fail(errors[0].code, { errors: errors });
      }
      return E.ok({
        value: { date: dateStr, amount: amountValue, categoryId: rawCat, memo: memo },
        warnings: warnings
      });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  /* ---------- 부팅 · 복구 ---------- */

  function validExpenseRecord(o, seen) {
    if (!o || typeof o !== 'object') { return null; }
    if (typeof o.id !== 'string' || o.id === '') { return null; }
    if (Object.prototype.hasOwnProperty.call(seen, o.id)) { return null; }
    if (typeof o.date !== 'string' || !RE_DATE.test(o.date)) { return null; }
    if (!isInt(o.amount) || o.amount < 1 || o.amount > AMOUNT_MAX) { return null; }
    if (typeof o.categoryId !== 'string') { return null; }
    return {
      id: o.id,
      date: o.date,
      amount: o.amount,
      categoryId: o.categoryId,
      memo: (typeof o.memo === 'string') ? o.memo : '',
      createdAt: isInt(o.createdAt) && o.createdAt >= 0 ? o.createdAt : 0
    };
  }

  function validCategoryRecord(o, seen) {
    if (!o || typeof o !== 'object') { return null; }
    if (typeof o.id !== 'string' || o.id === '') { return null; }
    if (Object.prototype.hasOwnProperty.call(seen, o.id)) { return null; }
    if (typeof o.name !== 'string') { return null; }
    var len = countChars(o.name);
    if (len < 1 || len > NAME_MAX) { return null; }
    return {
      id: o.id,
      name: o.name,
      order: isInt(o.order) && o.order >= 0 ? o.order : -1,
      isDefault: (o.isDefault === true)
    };
  }

  function sanitizeList(arr, kind, rejected) {
    var out = [], seen = {}, i, rec;
    for (i = 0; i < arr.length; i++) {
      rec = (kind === 'expense') ? validExpenseRecord(arr[i], seen) : validCategoryRecord(arr[i], seen);
      if (rec === null) {
        if (rejected.length < MAX_REJECTED) { rejected.push(arr[i]); }
        continue;
      }
      seen[rec.id] = true;
      out.push(rec);
    }
    return out;
  }

  /* §6-3-1 키 단위 복구 */
  function loadKeyWithRecovery(key, fallback, notices) {
    var r = S.getJSON(key), raw, b;
    if (r.ok) {
      if (r.data.value === null) { return { value: null, used: 'none' }; }
      if (Object.prototype.toString.call(r.data.value) !== '[object Array]') {
        notices.push('E-304');
        b = S.getJSON(key + '.bak');
        if (b.ok && Object.prototype.toString.call(b.data.value) === '[object Array]') {
          notices.push('E-303');
          return { value: b.data.value, used: 'bak' };
        }
        return { value: fallback, used: 'default' };
      }
      return { value: r.data.value, used: 'main' };
    }
    /* 파싱 실패 — 원본 보관 후 백업본 시도 */
    raw = (r.data && typeof r.data.raw === 'string') ? r.data.raw : '';
    if (raw !== '') {
      var q = S.quarantine(key, raw);
      if (!q.ok) { notices.push('E-308'); }
    }
    notices.push('E-303');
    b = S.getJSON(key + '.bak');
    if (b.ok && Object.prototype.toString.call(b.data.value) === '[object Array]') {
      return { value: b.data.value, used: 'bak' };
    }
    return { value: fallback, used: 'default' };
  }

  function reorderByName(list) {
    var sorted = list.slice(), i;
    sorted.sort(function (a, b) {
      if (a.name !== b.name) { return a.name < b.name ? -1 : 1; }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    for (i = 0; i < sorted.length; i++) { sorted[i].order = i; }
    sorted.sort(function (a, b) { return a.order - b.order; });
    return sorted;
  }

  function orderIsSane(list) {
    var seen = {}, i, o;
    for (i = 0; i < list.length; i++) {
      o = list[i].order;
      if (!isInt(o) || o < 0 || o > list.length - 1) { return false; }
      if (Object.prototype.hasOwnProperty.call(seen, String(o))) { return false; }
      seen[String(o)] = true;
    }
    return true;
  }

  function sortByOrder(list) {
    var copy = list.slice();
    copy.sort(function (a, b) { return a.order - b.order; });
    return copy;
  }

  function saveRejected(items, source) {
    if (!items || items.length === 0) { return; }
    S.setJSON(K_REJECTED, { at: Date.now(), source: source, items: items.slice(0, MAX_REJECTED) });
  }

  function dedupe(list) {
    var out = [], seen = {}, i;
    for (i = 0; i < list.length; i++) {
      if (Object.prototype.hasOwnProperty.call(seen, list[i])) { continue; }
      seen[list[i]] = true;
      out.push(list[i]);
    }
    return out;
  }

  function quarantineForeign(notices) {
    var ks = S.keys(), i, k, v;
    if (!ks.ok) { return; }
    for (i = 0; i < ks.data.keys.length; i++) {
      k = ks.data.keys[i];
      if (k.indexOf('jr.v1.corrupt.') === 0) { continue; }
      v = S.getRaw(k);
      if (v.ok && typeof v.data.value === 'string' && v.data.value !== '') {
        if (!S.quarantine(k, v.data.value).ok) { notices.push('E-308'); }
      }
    }
    S.clearAppKeys();
  }

  function init() {
    try {
      var notices = [], noticeParams = {}, meta = null, r, rb, rejected = [];

      readOnly = false;
      ready = false;

      /* §6-4-2 — 중단된 가져오기 트랜잭션 자동 복구 1회 */
      rb = S.getJSON(K_ROLLBACK);
      if (rb.ok && rb.data.value && typeof rb.data.value === 'object') {
        var res = S.restore(rb.data.value);
        if (res.ok) { S.removeRaw(K_ROLLBACK); notices.push('E-410'); }
        else { notices.push('E-411'); }
      } else if (!rb.ok) {
        S.removeRaw(K_ROLLBACK);
      }

      /* --- meta 판정 (§3-2) --- */
      r = S.getJSON(K_META);
      if (!r.ok) {
        notices.push('E-302');
        quarantineForeign(notices);
        meta = null;
      } else if (r.data.value === null) {
        meta = null;                                  /* 신규 설치 */
      } else {
        meta = r.data.value;
        if (!meta || typeof meta !== 'object' || meta.appId !== 'jr-expense') {
          notices.push('E-302');
          quarantineForeign(notices);
          meta = null;
        } else if (isInt(meta.schema) && meta.schema > 1) {
          readOnly = true;
          expenses = [];
          categories = [];
          settings = defaultSettings();
          monthIndex = {};
          notices.push('E-307');
          return E.fail('E-307', {
            mode: S.mode(), notices: dedupe(notices), noticeParams: {},
            expenseCount: 0, categoryCount: 0
          });
        } else if (!isInt(meta.schema) || meta.schema < 1) {
          notices.push('E-302');
          quarantineForeign(notices);
          meta = null;
        }
      }

      /* --- expenses --- */
      var le = loadKeyWithRecovery(K_EXPENSES, [], notices);
      var rawExpenses = (le.value === null) ? [] : le.value;
      var beforeE = rawExpenses.length;
      expenses = sanitizeList(rawExpenses, 'expense', rejected);
      var droppedE = beforeE - expenses.length;

      /* --- categories --- */
      var lc = loadKeyWithRecovery(K_CATEGORIES, defaultCategories(), notices);
      var rawCategories = (lc.value === null) ? defaultCategories() : lc.value;
      var beforeC = rawCategories.length;
      categories = sanitizeList(rawCategories, 'category', rejected);
      var droppedC = beforeC - categories.length;

      var freshInstall = (meta === null && le.value === null && lc.value === null);

      if (droppedE + droppedC > 0) {
        notices.push('E-304');
        noticeParams['E-304'] = { count: droppedE + droppedC };
      }

      /* --- 정합성 보정 (§6-3-3) --- */
      if (categories.length === 0) {
        categories = defaultCategories();
        if (!freshInstall) { notices.push('E-305'); }
      } else if (!orderIsSane(categories)) {
        categories = reorderByName(categories);
        if (!freshInstall) { notices.push('E-306'); }
      } else {
        categories = sortByOrder(categories);
      }

      /* --- settings --- */
      var rs = S.getJSON(K_SETTINGS);
      var settingsBroken = false, settingsMissing = false;
      if (!rs.ok) {
        settingsBroken = true;
      } else if (rs.data.value === null) {
        settingsMissing = true;
      } else if (typeof rs.data.value !== 'object' ||
                 typeof rs.data.value.selectedMonth !== 'string' ||
                 !RE_MONTH.test(rs.data.value.selectedMonth)) {
        settingsBroken = true;
      }
      if (settingsBroken || settingsMissing) {
        settings = defaultSettings();
        if (settingsBroken) { notices.push('E-309'); }
      } else {
        var dn = [], di;
        if (Object.prototype.toString.call(rs.data.value.dismissedNotices) === '[object Array]') {
          for (di = 0; di < rs.data.value.dismissedNotices.length; di++) {
            if (typeof rs.data.value.dismissedNotices[di] === 'string') {
              dn.push(rs.data.value.dismissedNotices[di]);
            }
          }
          if (dn.length > 20) { dn = dn.slice(dn.length - 20); }
        }
        settings = { selectedMonth: rs.data.value.selectedMonth, dismissedNotices: dn };
        /* 범위 밖이면 경계값으로 보정 — 알리지 않음(§7-9) */
        var mr = monthRange();
        if (settings.selectedMonth < mr.min) { settings.selectedMonth = mr.min; }
        if (settings.selectedMonth > mr.max) { settings.selectedMonth = mr.max; }
      }

      saveRejected(rejected, 'load');

      /* --- 미완료 쓰기 감지 (§6-3-4) --- */
      if (meta && isInt(meta.lastWriteAt)) {
        var maxCreated = 0, i;
        for (i = 0; i < expenses.length; i++) {
          if (expenses[i].createdAt > maxCreated) { maxCreated = expenses[i].createdAt; }
        }
        if (maxCreated > meta.lastWriteAt) {
          notices.push('E-301');
          var w = persist(expenses, categories, settings);
          if (w.ok) { notices = notices.concat(w.data.codes); }
        }
      }

      /* --- 신규 설치 또는 복구가 일어났으면 정리된 상태를 기록한다 --- */
      if (meta === null || freshInstall || rejected.length > 0 || settingsBroken) {
        var w2 = persist(expenses, categories, settings);
        if (w2.ok) { notices = notices.concat(w2.data.codes); }
        else { notices.push(w2.code); }
      }

      rebuildMonthIndex();
      ready = true;

      return E.ok({
        mode: S.mode(),
        notices: dedupe(notices),
        noticeParams: noticeParams,
        expenseCount: expenses.length,
        categoryCount: categories.length
      });
    } catch (e) {
      E.log('E-501', e);
      expenses = [];
      categories = defaultCategories();
      settings = defaultSettings();
      monthIndex = {};
      ready = true;
      return E.ok({
        mode: S.mode(), notices: ['E-303'], noticeParams: {},
        expenseCount: 0, categoryCount: categories.length
      });
    }
  }

  function isReady() { return ready === true; }

  function subscribe(fn) {
    if (typeof fn !== 'function') { return E.fail('E-502', {}); }
    subscribers.push(fn);
    return E.ok({
      unsubscribe: function () {
        var i;
        for (i = 0; i < subscribers.length; i++) {
          if (subscribers[i] === fn) { subscribers.splice(i, 1); return; }
        }
      }
    });
  }

  /* ---------- 지출 기록 ---------- */

  function addExpense(input) {
    try {
      if (readOnly) { return E.fail('E-307', {}); }
      if (!input || typeof input !== 'object') { return E.fail('E-502', {}); }
      var v = validateExpense(input);
      if (!v.ok) { return v; }
      var id = uniqueId('e', expenses);
      if (id === null) { return E.fail('E-507', {}); }
      var expense = {
        id: id,
        date: v.data.value.date,
        amount: v.data.value.amount,
        categoryId: v.data.value.categoryId,
        memo: v.data.value.memo,
        createdAt: Date.now()
      };
      var next = expenses.slice();
      next.push(expense);
      var w = persist(next, categories, settings);
      if (!w.ok) { return E.fail(w.code, {}); }
      expenses = next;
      notifyChange('expense');
      return E.ok({ expense: expense, warnings: v.data.warnings.concat(w.data.codes) });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function updateExpense(id, input) {
    try {
      if (readOnly) { return E.fail('E-307', {}); }
      if (typeof id !== 'string' || !input || typeof input !== 'object') { return E.fail('E-502', {}); }
      var idx = findExpense(id);
      if (idx === -1) { return E.fail('E-119', {}); }
      var v = validateExpense(input);
      if (!v.ok) { return v; }
      var updated = {
        id: expenses[idx].id,
        date: v.data.value.date,
        amount: v.data.value.amount,
        categoryId: v.data.value.categoryId,
        memo: v.data.value.memo,
        createdAt: expenses[idx].createdAt
      };
      var next = expenses.slice();
      next[idx] = updated;
      var w = persist(next, categories, settings);
      if (!w.ok) { return E.fail(w.code, {}); }
      expenses = next;
      notifyChange('expense');
      return E.ok({ expense: updated, warnings: v.data.warnings.concat(w.data.codes) });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function deleteExpense(id) {
    try {
      if (readOnly) { return E.fail('E-307', {}); }
      if (typeof id !== 'string') { return E.fail('E-502', {}); }
      var idx = findExpense(id);
      if (idx === -1) { return E.fail('E-119', {}); }
      var deleted = expenses[idx];
      var next = expenses.slice();
      next.splice(idx, 1);
      var w = persist(next, categories, settings);
      if (!w.ok) { return E.fail(w.code, {}); }
      expenses = next;
      notifyChange('expense');
      return E.ok({ deleted: deleted });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function getExpense(id) {
    try {
      if (typeof id !== 'string') { return E.fail('E-502', {}); }
      if (readOnly) { return E.fail('E-119', {}); }
      var idx = findExpense(id);
      if (idx === -1) { return E.fail('E-119', {}); }
      return E.ok({ expense: expenses[idx] });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function getExpenses() {
    if (readOnly) { return E.ok({ items: [] }); }
    return E.ok({ items: expenses });
  }

  function listByMonth(yyyymm) {
    try {
      if (typeof yyyymm !== 'string') { return E.fail('E-502', {}); }
      if (readOnly) { return E.ok({ items: [], total: 0, count: 0 }); }
      var idx = Object.prototype.hasOwnProperty.call(monthIndex, yyyymm) ? monthIndex[yyyymm] : [];
      var items = [], i, total = 0;
      for (i = 0; i < idx.length; i++) { items.push(expenses[idx[i]]); }
      items.sort(compareExpenseDesc);
      for (i = 0; i < items.length; i++) { total += items[i].amount; }
      return E.ok({ items: items, total: total, count: items.length });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function availableMonths() {
    try {
      if (readOnly) { return E.ok({ months: [] }); }
      var out = [], k;
      for (k in monthIndex) {
        if (Object.prototype.hasOwnProperty.call(monthIndex, k)) { out.push(k); }
      }
      out.sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0; });
      return E.ok({ months: out });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function countByCategory(categoryId) {
    try {
      if (typeof categoryId !== 'string') { return E.fail('E-502', {}); }
      if (readOnly) { return E.ok({ count: 0 }); }
      var i, n = 0;
      for (i = 0; i < expenses.length; i++) { if (expenses[i].categoryId === categoryId) { n++; } }
      return E.ok({ count: n });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  /* ---------- 카테고리 ---------- */

  function getCategories() {
    /* 파트장 확정(개발-분할안 §5-2): 평상시·읽기전용 모두 `items` 를 씁니다.
     * INT-30 이 적은 `categories` 키는 같은 배열을 가리키는 별칭으로 함께 실어
     * 어느 문서를 본 호출부도 빈 목록을 그리지 않게 합니다. */
    var list = readOnly ? [] : categories;
    return E.ok({ items: list, categories: list });
  }

  function getCategoryMap() {
    var map = {}, i, list = readOnly ? [] : categories;
    for (i = 0; i < list.length; i++) { map[list[i].id] = list[i]; }
    return E.ok({ map: map });
  }

  function getCategoryName(categoryId) {
    try {
      if (typeof categoryId !== 'string') { return E.fail('E-502', {}); }
      var idx = readOnly ? -1 : findCategory(categoryId);
      if (idx === -1) { return E.ok({ name: DANGLING_LABEL, isDeletedCategory: true }); }
      return E.ok({ name: categories[idx].name, isDeletedCategory: false });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function nameError(name, selfId) {
    var trimmed = String(name).trim(), i, key;
    if (trimmed === '') { return { code: 'E-114', params: {} }; }
    if (countChars(trimmed) > NAME_MAX) { return { code: 'E-115', params: {} }; }
    key = normName(trimmed);
    for (i = 0; i < categories.length; i++) {
      if (selfId && categories[i].id === selfId) { continue; }
      if (normName(categories[i].name) === key) { return { code: 'E-116', params: { name: trimmed } }; }
    }
    return null;
  }

  function addCategory(name) {
    try {
      if (readOnly) { return E.fail('E-307', {}); }
      if (typeof name !== 'string') { return E.fail('E-502', {}); }
      var err = nameError(name, null);
      if (err) { return E.fail(err.code, { params: err.params, errors: [{ field: 'name', code: err.code, params: err.params }] }); }
      if (categories.length >= CATEGORY_MAX) { return E.fail('E-117', {}); }
      var id = uniqueId('c', categories);
      if (id === null) { return E.fail('E-507', {}); }
      var maxOrder = -1, i;
      for (i = 0; i < categories.length; i++) { if (categories[i].order > maxOrder) { maxOrder = categories[i].order; } }
      var category = { id: id, name: String(name).trim(), order: maxOrder + 1, isDefault: false };
      var next = categories.slice();
      next.push(category);
      var w = persist(expenses, next, settings);
      if (!w.ok) { return E.fail(w.code, {}); }
      categories = next;
      notifyChange('category');
      return E.ok({ category: category });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function renameCategory(id, name) {
    try {
      if (readOnly) { return E.fail('E-307', {}); }
      if (typeof id !== 'string' || typeof name !== 'string') { return E.fail('E-502', {}); }
      var idx = findCategory(id);
      if (idx === -1) { return E.fail('E-124', {}); }
      var err = nameError(name, id);
      if (err) { return E.fail(err.code, { params: err.params, errors: [{ field: 'name', code: err.code, params: err.params }] }); }
      var updated = {
        id: categories[idx].id,
        name: String(name).trim(),
        order: categories[idx].order,
        isDefault: categories[idx].isDefault      /* 이름을 바꿔도 유지 (§2-2) */
      };
      var next = categories.slice();
      next[idx] = updated;
      var w = persist(expenses, next, settings);
      if (!w.ok) { return E.fail(w.code, {}); }
      categories = next;
      notifyChange('category');
      return E.ok({ category: updated });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function deleteCategory(id) {
    try {
      if (readOnly) { return E.fail('E-307', {}); }
      if (typeof id !== 'string') { return E.fail('E-502', {}); }
      var idx = findCategory(id);
      if (idx === -1) { return E.fail('E-124', {}); }
      if (categories.length <= 1) { return E.fail('E-118', {}); }
      var c = countByCategory(id);
      var orphaned = c.ok ? c.data.count : 0;
      var next = categories.slice();
      next.splice(idx, 1);
      next = sortByOrder(next);
      var i;
      for (i = 0; i < next.length; i++) {
        next[i] = { id: next[i].id, name: next[i].name, order: i, isDefault: next[i].isDefault };
      }
      var w = persist(expenses, next, settings);
      if (!w.ok) { return E.fail(w.code, {}); }
      categories = next;
      notifyChange('category');
      return E.ok({ orphanedExpenseCount: orphaned });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  /* ---------- 설정 · 초안 · 전체 조작 ---------- */

  function getSettings() {
    if (readOnly) { return E.ok({ settings: defaultSettings() }); }
    return E.ok({ settings: settings });
  }

  function setSelectedMonth(yyyymm) {
    try {
      if (readOnly) { return E.fail('E-307', {}); }
      if (typeof yyyymm !== 'string' || !RE_MONTH.test(yyyymm)) { return E.fail('E-125', {}); }
      var mr = monthRange();
      if (yyyymm < mr.min || yyyymm > mr.max) { return E.fail('E-125', {}); }
      var next = { selectedMonth: yyyymm, dismissedNotices: settings.dismissedNotices };
      var w = persist(expenses, categories, next);
      if (!w.ok) { return E.fail(w.code, {}); }
      settings = next;
      notifyChange('settings');
      return E.ok({ selectedMonth: yyyymm });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function dismissNotice(noticeKey) {
    try {
      if (readOnly) { return E.ok({}); }
      if (typeof noticeKey !== 'string' || noticeKey === '') { return E.fail('E-502', {}); }
      var list = settings.dismissedNotices.slice(), i;
      for (i = 0; i < list.length; i++) { if (list[i] === noticeKey) { return E.ok({}); } }
      list.push(noticeKey);
      while (list.length > 20) { list.splice(0, 1); }
      var next = { selectedMonth: settings.selectedMonth, dismissedNotices: list };
      var w = persist(expenses, categories, next);
      if (!w.ok) { settings = next; return E.ok({}); }
      settings = next;
      notifyChange('settings');
      return E.ok({});
    } catch (e) {
      E.log('E-501', e);
      return E.ok({});
    }
  }

  function isNoticeDismissed(noticeKey) {
    if (typeof noticeKey !== 'string' || !settings) { return false; }
    var i;
    for (i = 0; i < settings.dismissedNotices.length; i++) {
      if (settings.dismissedNotices[i] === noticeKey) { return true; }
    }
    return false;
  }

  function saveDraft(draft) {
    try {
      if (readOnly) { return E.fail('E-307', {}); }
      if (!draft || typeof draft !== 'object') { return E.fail('E-502', {}); }
      var payload = {
        mode: (draft.mode === 'edit') ? 'edit' : 'add',
        targetId: (typeof draft.targetId === 'string') ? draft.targetId : null,
        date: (typeof draft.date === 'string') ? draft.date : '',
        amount: (draft.amount === null || draft.amount === undefined) ? '' : String(draft.amount),
        categoryId: (typeof draft.categoryId === 'string') ? draft.categoryId : '',
        memo: (typeof draft.memo === 'string') ? draft.memo : '',
        savedAt: Date.now()
      };
      var w = S.setJSON(K_DRAFT, payload);
      if (!w.ok) { return E.fail('E-606', {}); }
      return E.ok({});
    } catch (e) {
      E.log('E-606', e);
      return E.fail('E-606', {});
    }
  }

  function loadDraft() {
    try {
      var r = S.getJSON(K_DRAFT), d;
      if (!r.ok) { S.removeRaw(K_DRAFT); return E.ok({ draft: null, code: null }); }
      d = r.data.value;
      if (d === null || typeof d !== 'object') { return E.ok({ draft: null, code: null }); }
      if (!isInt(d.savedAt)) { S.removeRaw(K_DRAFT); return E.ok({ draft: null, code: 'E-603' }); }
      if (Date.now() - d.savedAt > DRAFT_TTL_MS) { S.removeRaw(K_DRAFT); return E.ok({ draft: null, code: 'E-603' }); }
      if (d.mode === 'edit' && (typeof d.targetId !== 'string' || findExpense(d.targetId) === -1)) {
        S.removeRaw(K_DRAFT);
        return E.ok({ draft: null, code: 'E-603' });
      }
      return E.ok({ draft: d, code: null });
    } catch (e) {
      E.log('E-501', e);
      return E.ok({ draft: null, code: null });
    }
  }

  function clearDraft() {
    S.removeRaw(K_DRAFT);
    return E.ok({});
  }

  function wipeAll() {
    try {
      if (readOnly) { return E.fail('E-307', {}); }
      var nextCategories = defaultCategories();
      var nextSettings = { selectedMonth: today().slice(0, 7), dismissedNotices: settings ? settings.dismissedNotices : [] };
      var w = persist([], nextCategories, nextSettings);
      if (!w.ok) { return E.fail('E-202', {}); }
      expenses = [];
      categories = nextCategories;
      settings = nextSettings;
      S.removeRaw(K_DRAFT);
      S.removeRaw(K_REJECTED);
      notifyChange('bulk');
      return E.ok({ categoryCount: categories.length });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  /* JR.io 전용. UI 가 직접 부르지 않습니다 (§5-4-5) */
  function replaceAll(bundle) {
    var prevE = expenses, prevC = categories, prevS = settings;
    try {
      if (readOnly) { return E.fail('E-307', {}); }
      if (!bundle || typeof bundle !== 'object') { return E.fail('E-502', {}); }
      var nextE = (Object.prototype.toString.call(bundle.expenses) === '[object Array]') ? bundle.expenses : [];
      var nextC = (Object.prototype.toString.call(bundle.categories) === '[object Array]') ? bundle.categories : [];
      var sel = (bundle.settings && typeof bundle.settings.selectedMonth === 'string' &&
                 RE_MONTH.test(bundle.settings.selectedMonth))
        ? bundle.settings.selectedMonth : today().slice(0, 7);
      var nextS = { selectedMonth: sel, dismissedNotices: [] };

      var w = persist(nextE, nextC, nextS);
      if (!w.ok) {
        expenses = prevE; categories = prevC; settings = prevS;
        notifyChange('bulk');                       /* INT-24 실패 경로도 무효화 */
        return E.fail('E-410', {});
      }
      expenses = nextE;
      categories = nextC;
      settings = nextS;
      notifyChange('bulk');
      return E.ok({ expenseCount: expenses.length, categoryCount: categories.length });
    } catch (e) {
      E.log('E-411', e);
      expenses = prevE; categories = prevC; settings = prevS;
      notifyChange('bulk');
      return E.fail('E-411', {});
    }
  }

  return {
    /* 부팅·상태 */
    init: init,
    isReady: isReady,
    subscribe: subscribe,
    /* 순수 계산 (R-6) */
    today: today,
    minDate: minDate,
    maxDate: maxDate,
    countChars: countChars,
    normName: normName,
    shiftMonth: shiftMonth,
    monthRange: monthRange,
    /* 지출 기록 */
    validateExpense: validateExpense,
    addExpense: addExpense,
    updateExpense: updateExpense,
    deleteExpense: deleteExpense,
    getExpense: getExpense,
    getExpenses: getExpenses,
    listByMonth: listByMonth,
    availableMonths: availableMonths,
    countByCategory: countByCategory,
    /* 카테고리 */
    getCategories: getCategories,
    getCategoryMap: getCategoryMap,
    getCategoryName: getCategoryName,
    addCategory: addCategory,
    renameCategory: renameCategory,
    deleteCategory: deleteCategory,
    /* 설정·초안·전체 */
    getSettings: getSettings,
    setSelectedMonth: setSelectedMonth,
    dismissNotice: dismissNotice,
    isNoticeDismissed: isNoticeDismissed,
    saveDraft: saveDraft,
    loadDraft: loadDraft,
    clearDraft: clearDraft,
    wipeAll: wipeAll,
    replaceAll: replaceAll
  };
})();
