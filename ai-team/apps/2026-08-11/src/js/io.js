/* 한달정리 — JR.io
 * 내보내기 · 가져오기 · 다운로드 폴백 3단.
 * 정본: docs/기획-구조설계.md §5-6 · §6-4 · §6-7
 *     + docs/기획서.md INT-10 · INT-24(JR.stats 호출 금지) · INT-27(MAX_IMPORT_CHARS 파생 · V-3-1 · E-413)
 * 의존: JR.err · JR.store · JR.model.   JR.stats · JR.ui 호출 절대 금지.
 */
var JR = JR || {};
JR.io = (function () {
  'use strict';

  var E = JR.err;
  var S = JR.store;

  var EXPORT_SCHEMA = 1;
  /* INT-27 — 독립 상수 4000000 폐기. LIMIT_CHARS 에서 파생시킨다 */
  var MAX_IMPORT_CHARS = Math.floor(S.LIMIT_CHARS / 4);

  var K_ROLLBACK = 'jr.v1.rollback';
  var K_REJECTED = 'jr.v1.rejected';

  var AMOUNT_MAX = 999999999;
  var NAME_MAX = 12;
  var CATEGORY_MAX = 20;
  var MAX_REJECTED = 100;
  var RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
  var RE_MONTH = /^\d{4}-\d{2}$/;

  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /* ---------- 내보내기 ---------- */

  function buildFilename() {
    var d = new Date();
    return 'jr-backup-' + JR.model.today() + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.json';
  }

  function buildExport() {
    try {
      var ex = JR.model.getExpenses();
      var ca = JR.model.getCategories();
      var st = JR.model.getSettings();
      var expensesList = (ex.ok && isArray(ex.data.items)) ? ex.data.items : [];
      var categoriesList = (ca.ok && isArray(ca.data.items)) ? ca.data.items : [];
      var selectedMonth = (st.ok && st.data.settings) ? st.data.settings.selectedMonth : JR.model.today().slice(0, 7);

      var payload = {
        app: 'jr-expense',
        kind: 'backup',
        schema: EXPORT_SCHEMA,
        exportedAt: Date.now(),
        exportedDate: JR.model.today(),
        counts: { expenses: expensesList.length, categories: categoriesList.length },
        data: {
          expenses: expensesList,
          categories: categoriesList,
          /* dismissedNotices 는 기기별 상태이므로 내보내지 않는다 (§5-6-1) */
          settings: { selectedMonth: selectedMonth }
        }
      };
      var json;
      try {
        json = JSON.stringify(payload);
      } catch (e1) {
        E.log('E-402', e1);
        return E.fail('E-402', {});
      }
      if (typeof json !== 'string') { return E.fail('E-402', {}); }
      return E.ok({
        json: json,
        filename: buildFilename(),
        expenseCount: expensesList.length,
        categoryCount: categoriesList.length
      });
    } catch (e) {
      E.log('E-402', e);
      return E.fail('E-402', {});
    }
  }

  function canDownload() {
    var a;
    try {
      a = document.createElement('a');
      if (!('download' in a)) { return E.ok({ supported: false, method: 'none' }); }
      if (typeof Blob === 'function' && window.URL && typeof window.URL.createObjectURL === 'function') {
        return E.ok({ supported: true, method: 'anchor-blob' });
      }
      return E.ok({ supported: true, method: 'anchor-data' });
    } catch (e) {
      E.log('E-401', e);
      return E.ok({ supported: false, method: 'none' });
    }
  }

  /* §6-7 3단 폴백. INT-10 — 성공했을 때도 data.text 에 JSON 전문을 함께 돌려준다 */
  function download(json, filename) {
    var a, url;
    if (typeof json !== 'string' || typeof filename !== 'string') { return E.fail('E-502', {}); }
    try {
      if (typeof Blob === 'function' && window.URL && window.URL.createObjectURL) {
        a = document.createElement('a');
        if ('download' in a) {
          url = window.URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () {
            try { window.URL.revokeObjectURL(url); } catch (e0) { E.log('E-401', e0); }
          }, 0);
          return E.ok({ method: 'anchor-blob', text: json });
        }
      }
    } catch (e) { E.log('E-401', e); }
    try {
      a = document.createElement('a');
      if ('download' in a) {
        a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return E.ok({ method: 'anchor-data', text: json });
      }
    } catch (e2) { E.log('E-401', e2); }
    return E.fail('E-401', { text: json });
  }

  /* ---------- 가져오기 ---------- */

  function importSupported() {
    var i;
    if (typeof FileReader !== 'function') { return false; }
    try {
      i = document.createElement('input');
      i.type = 'file';
      return i.type === 'file';
    } catch (e) { return false; }
  }

  /* 콜백 방식 (§5-6-2). 결과 형태는 다른 함수의 반환값과 같다 */
  function readFile(file, done) {
    var cb = (typeof done === 'function') ? done : function () {};
    var reader;
    try {
      if (!importSupported()) { cb(E.fail('E-412', {})); return; }
      if (!file) { cb(E.fail('E-403', {})); return; }
      reader = new FileReader();
      reader.onerror = function () { cb(E.fail('E-403', {})); };
      reader.onload = function () {
        var text = reader.result;
        if (typeof text !== 'string') { cb(E.fail('E-403', {})); return; }
        if (text.length > MAX_IMPORT_CHARS) { cb(E.fail('E-408', {})); return; }
        cb(E.ok({ text: text }));
      };
      reader.readAsText(file);
    } catch (e) {
      E.log('E-403', e);
      cb(E.fail('E-403', {}));
    }
  }

  /* §6-3-2 레코드 검증 규칙 (source:'import') — 데이터 계층과 같은 기준 */
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
      createdAt: (isInt(o.createdAt) && o.createdAt >= 0) ? o.createdAt : 0
    };
  }

  function validCategoryRecord(o, seen) {
    if (!o || typeof o !== 'object') { return null; }
    if (typeof o.id !== 'string' || o.id === '') { return null; }
    if (Object.prototype.hasOwnProperty.call(seen, o.id)) { return null; }
    if (typeof o.name !== 'string') { return null; }
    var len = JR.model.countChars(o.name);
    if (len < 1 || len > NAME_MAX) { return null; }
    return { id: o.id, name: o.name, order: 0, isDefault: (o.isDefault === true) };
  }

  function parseImport(text) {
    try {
      if (typeof text !== 'string') { return E.fail('E-502', {}); }

      /* V-3 */
      if (text.length > MAX_IMPORT_CHARS) { return E.fail('E-408', {}); }

      /* V-3-1 (INT-27) — 확인 대화상자보다 앞에서 용량을 사전 검사 */
      if (S.mode() !== S.MODE_MEMORY) {
        var u = S.usage();
        if (u.ok && (u.data.usedChars + 2 * text.length) > S.LIMIT_CHARS) {
          return E.fail('E-413', {});
        }
      }

      /* V-4 */
      var obj;
      try { obj = JSON.parse(text); }
      catch (e1) { return E.fail('E-404', {}); }

      /* V-5 */
      if (!obj || typeof obj !== 'object' || isArray(obj)) { return E.fail('E-405', {}); }
      if (obj.app !== 'jr-expense' || obj.kind !== 'backup') { return E.fail('E-405', {}); }

      /* V-6 */
      if (!isInt(obj.schema) || obj.schema > 1) { return E.fail('E-406', {}); }

      /* V-7 */
      if (!obj.data || typeof obj.data !== 'object') { return E.fail('E-407', {}); }
      if (!isArray(obj.data.expenses) || !isArray(obj.data.categories)) { return E.fail('E-407', {}); }

      /* V-8 · 레코드 단위 검증 */
      var rejected = [], seenE = {}, seenC = {}, i, rec;
      var validExpenses = [], validCategories = [];
      for (i = 0; i < obj.data.expenses.length; i++) {
        rec = validExpenseRecord(obj.data.expenses[i], seenE);
        if (rec === null) {
          if (rejected.length < MAX_REJECTED) { rejected.push(obj.data.expenses[i]); }
          continue;
        }
        seenE[rec.id] = true;
        validExpenses.push(rec);
      }
      var rejectedExpenseCount = obj.data.expenses.length - validExpenses.length;

      for (i = 0; i < obj.data.categories.length; i++) {
        rec = validCategoryRecord(obj.data.categories[i], seenC);
        if (rec === null) {
          if (rejected.length < MAX_REJECTED) { rejected.push(obj.data.categories[i]); }
          continue;
        }
        seenC[rec.id] = true;
        validCategories.push(rec);
      }
      if (validCategories.length === 0) { return E.fail('E-407', {}); }

      /* V-9 */
      if (isInt(obj.counts && obj.counts.expenses) && obj.counts.expenses !== obj.data.expenses.length) {
        return E.fail('E-407', {});
      }

      /* V-11 · 이름 중복 — 뒤에 나온 것을 버림 (§2-6 기준) */
      var deduped = [], nameSeen = {}, key;
      for (i = 0; i < validCategories.length; i++) {
        key = JR.model.normName(validCategories[i].name);
        if (Object.prototype.hasOwnProperty.call(nameSeen, key)) { continue; }
        nameSeen[key] = true;
        deduped.push(validCategories[i]);
      }
      var rejectedCategoryCount = obj.data.categories.length - deduped.length;

      /* V-10 · 20개 초과분은 뒤에서부터 버림 */
      if (deduped.length > CATEGORY_MAX) {
        rejectedCategoryCount += (deduped.length - CATEGORY_MAX);
        deduped = deduped.slice(0, CATEGORY_MAX);
      }

      /* order 는 파일 값을 무시하고 배열 등장 순서대로 0..n-1 재부여 (§4-2) */
      for (i = 0; i < deduped.length; i++) { deduped[i].order = i; }

      var selectedMonth = (obj.data.settings && typeof obj.data.settings.selectedMonth === 'string' &&
                           RE_MONTH.test(obj.data.settings.selectedMonth))
        ? obj.data.settings.selectedMonth : JR.model.today().slice(0, 7);

      var curE = JR.model.getExpenses();
      var curC = JR.model.getCategories();

      var payload = {
        app: 'jr-expense',
        kind: 'backup',
        schema: obj.schema,
        exportedDate: (typeof obj.exportedDate === 'string') ? obj.exportedDate : '',
        rejected: rejected,
        rejectedCount: rejectedExpenseCount + rejectedCategoryCount,
        data: {
          expenses: validExpenses,
          categories: deduped,
          settings: { selectedMonth: selectedMonth }
        }
      };

      var summary = {
        currentExpenseCount: (curE.ok && isArray(curE.data.items)) ? curE.data.items.length : 0,
        currentCategoryCount: (curC.ok && isArray(curC.data.items)) ? curC.data.items.length : 0,
        incomingExpenseCount: validExpenses.length,
        incomingCategoryCount: deduped.length,
        rejectedExpenseCount: rejectedExpenseCount,
        rejectedCategoryCount: rejectedCategoryCount,
        exportedDate: payload.exportedDate
      };

      return E.ok({ payload: payload, summary: summary });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-404', {});
    }
  }

  /* §6-4-2 트랜잭션. JR.stats 를 부르지 않는다(INT-24) */
  function applyImport(payload) {
    try {
      if (!payload || typeof payload !== 'object' || !payload.data) { return E.fail('E-502', {}); }

      /* 1. 스냅샷 */
      var sn = S.snapshot();
      var snap = (sn.ok && sn.data.snap) ? sn.data.snap : null;
      if (snap === null) { return E.fail('E-410', {}); }

      /* 2. 롤백 기록 */
      var wr = S.setJSON(K_ROLLBACK, snap);
      if (!wr.ok) { return E.fail('E-410', {}); }

      /* 3. 교체 */
      var rep = JR.model.replaceAll(payload.data);
      if (!rep.ok) {
        /* 4. 되돌리기 */
        var back = S.restore(snap);
        if (back.ok) {
          S.removeRaw(K_ROLLBACK);              /* INT-27 5항 — 성공 시 삭제 */
          return E.fail('E-410', {});
        }
        return E.fail('E-411', {});             /* rollback 키는 남긴다 */
      }

      /* 5. 롤백 삭제. invalidate 는 replaceAll 이 이미 수행함(INT-24) */
      S.removeRaw(K_ROLLBACK);
      if (isArray(payload.rejected) && payload.rejected.length > 0) {
        S.setJSON(K_REJECTED, { at: Date.now(), source: 'import', items: payload.rejected });
      }
      return E.ok({
        expenseCount: rep.data.expenseCount,
        categoryCount: rep.data.categoryCount,
        rejectedCount: isInt(payload.rejectedCount) ? payload.rejectedCount : 0
      });
    } catch (e) {
      E.log('E-411', e);
      return E.fail('E-411', {});
    }
  }

  return {
    EXPORT_SCHEMA: EXPORT_SCHEMA,
    MAX_IMPORT_CHARS: MAX_IMPORT_CHARS,
    buildExport: buildExport,
    canDownload: canDownload,
    download: download,
    readFile: readFile,
    parseImport: parseImport,
    applyImport: applyImport
  };
})();
