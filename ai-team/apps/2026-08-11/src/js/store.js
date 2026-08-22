/* 한달정리 — JR.store
 * localStorage 입출력 · 메모리 폴백 · 용량 · 손상 격리.
 * 정본: docs/기획-구조설계.md §3 · §5-3 · §6-1 · §6-2
 * 의존: JR.err
 * 이 모듈은 jr. 로 시작하는 키만 다루며, 도메인 개념(Expense/Category)을 모른다.
 */
var JR = JR || {};
JR.store = (function () {
  'use strict';

  var E = JR.err;

  /* 파트장 확정(개발-분할안 §2-2): 실측 상한 5,242,880 자이나 file:// origin 이
   * 폴더를 가리지 않고 공유되므로 보수적 절반을 유지한다. 올리지 않는다. */
  var LIMIT_CHARS = 2500000;
  var MODE_PERSIST = 'persist';
  var MODE_MEMORY = 'memory';

  var PREFIX = 'jr.';
  var K_META = 'jr.v1.meta';
  var K_EXPENSES = 'jr.v1.expenses';
  var K_CATEGORIES = 'jr.v1.categories';
  var K_SETTINGS = 'jr.v1.settings';
  var K_DRAFT = 'jr.v1.draft';
  var K_ROLLBACK = 'jr.v1.rollback';
  var K_REJECTED = 'jr.v1.rejected';
  var K_CORRUPT_PREFIX = 'jr.v1.corrupt.';
  var MAX_CORRUPT = 3;

  var mode = MODE_MEMORY;
  var mem = {};
  var initialized = false;

  /* ---------- 저장소 추상화 ---------- */

  function probeStorage() {
    var ls, k = 'jr.__probe';
    try { ls = window.localStorage; }
    catch (e) { return false; }
    if (!ls) { return false; }
    try {
      ls.setItem(k, '1');
      if (ls.getItem(k) !== '1') { return false; }
      ls.removeItem(k);
      return true;
    } catch (e2) { return false; }
  }

  function isQuotaError(e) {
    if (!e) { return false; }
    return e.name === 'QuotaExceededError' ||
           e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
           e.code === 22 || e.code === 1014;
  }

  function memKeys() {
    var out = [], k;
    for (k in mem) { if (Object.prototype.hasOwnProperty.call(mem, k)) { out.push(k); } }
    return out;
  }

  function rawKeys() {
    var out = [], i, k;
    if (mode === MODE_MEMORY) {
      out = memKeys();
    } else {
      for (i = 0; i < window.localStorage.length; i++) {
        k = window.localStorage.key(i);
        if (typeof k === 'string') { out.push(k); }
      }
    }
    var filtered = [];
    for (i = 0; i < out.length; i++) {
      if (out[i].indexOf(PREFIX) === 0) { filtered.push(out[i]); }
    }
    filtered.sort();
    return filtered;
  }

  function backendGet(key) {
    if (mode === MODE_MEMORY) {
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    }
    var v = window.localStorage.getItem(key);
    return (v === undefined) ? null : v;
  }

  function backendSet(key, value) {
    if (mode === MODE_MEMORY) { mem[key] = value; return; }
    window.localStorage.setItem(key, value);
  }

  function backendRemove(key) {
    if (mode === MODE_MEMORY) { delete mem[key]; return; }
    window.localStorage.removeItem(key);
  }

  function switchToMemory(seed) {
    var i, ks;
    if (mode === MODE_MEMORY) { return; }
    ks = rawKeys();
    mode = MODE_MEMORY;
    if (seed) {
      for (i = 0; i < ks.length; i++) {
        try { mem[ks[i]] = window.localStorage.getItem(ks[i]); } catch (e) { E.log('E-205', e); }
      }
    }
  }

  /* ---------- 공개 API ---------- */

  function init() {
    if (initialized) { return E.ok({ mode: mode, codes: [] }); }
    initialized = true;
    var codes = [];
    if (probeStorage()) {
      mode = MODE_PERSIST;
    } else {
      mode = MODE_MEMORY;
      mem = {};
      codes.push('E-201');
    }
    return E.ok({ mode: mode, codes: codes });
  }

  /* 상태 조회 예외 (R-6-1) — 원시값 그대로 */
  function getMode() { return mode; }

  function getRaw(key) {
    try {
      if (typeof key !== 'string') { return E.fail('E-501', {}); }
      return E.ok({ value: backendGet(key) });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function setRaw(key, value) {
    try {
      if (typeof key !== 'string' || typeof value !== 'string') { return E.fail('E-501', {}); }
      try {
        backendSet(key, value);
      } catch (eq) {
        if (isQuotaError(eq)) { return E.fail('E-202', {}); }
        E.log('E-501', eq);
        return E.fail('E-501', {});
      }
      /* §6-2 read-back 검증 — 조용히 실패하는 환경 방어 */
      if (backendGet(key) !== value) {
        switchToMemory(true);
        try { backendSet(key, value); } catch (e2) { E.log('E-205', e2); }
        return E.fail('E-205', {});
      }
      return E.ok({ chars: key.length + value.length });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function removeRaw(key) {
    try {
      if (typeof key !== 'string') { return E.fail('E-501', {}); }
      backendRemove(key);
      return E.ok({});
    } catch (e) {
      E.log('E-501', e);
      return E.ok({});
    }
  }

  function keys() {
    try {
      return E.ok({ keys: rawKeys() });
    } catch (e) {
      E.log('E-501', e);
      return E.ok({ keys: [] });
    }
  }

  function getJSON(key) {
    var r = getRaw(key), raw;
    if (!r.ok) { return r; }
    raw = r.data.value;
    if (raw === null) { return E.ok({ value: null }); }
    try {
      return E.ok({ value: JSON.parse(raw) });
    } catch (e) {
      E.log('E-303', key);
      return E.fail('E-303', { raw: raw });
    }
  }

  function setJSON(key, obj) {
    var text;
    try {
      text = JSON.stringify(obj);
      if (typeof text !== 'string') { return E.fail('E-402', {}); }
    } catch (e) {
      E.log('E-402', e);
      return E.fail('E-402', {});
    }
    return setRaw(key, text);
  }

  function usage() {
    var used = 0, ks, i, v;
    try {
      ks = rawKeys();
      for (i = 0; i < ks.length; i++) {
        v = backendGet(ks[i]);
        used += ks[i].length + (v === null ? 0 : v.length);
      }
    } catch (e) { E.log('E-501', e); }
    return E.ok({ usedChars: used, limitChars: LIMIT_CHARS, ratio: used / LIMIT_CHARS });
  }

  /* 복구 사다리 (§6-2) — jr.v1.rollback 은 어느 단계에서도 지우지 않는다(INT-27) */
  function relieveStep(step) {
    var ks, i, removed = false;
    if (step === 1) {
      ks = rawKeys();
      for (i = 0; i < ks.length; i++) {
        if (ks[i].indexOf(K_CORRUPT_PREFIX) === 0) { backendRemove(ks[i]); removed = true; }
      }
      return removed;
    }
    if (step === 2) {
      if (backendGet(K_REJECTED) !== null) { backendRemove(K_REJECTED); return true; }
      return false;
    }
    if (step === 3) {
      if (backendGet(K_EXPENSES + '.bak') !== null) { backendRemove(K_EXPENSES + '.bak'); removed = true; }
      if (backendGet(K_CATEGORIES + '.bak') !== null) { backendRemove(K_CATEGORIES + '.bak'); removed = true; }
      return removed;
    }
    if (step === 4) {
      if (backendGet(K_DRAFT) !== null) { backendRemove(K_DRAFT); return true; }
      return false;
    }
    return false;
  }

  /* §3-4 쓰기 순서를 이 함수 하나가 전부 수행 */
  function writeAll(bundle) {
    var codes = [], sExp, sCat, sSet, prevExp, prevCat, step, r, u;
    try {
      if (!bundle || typeof bundle !== 'object') { return E.fail('E-501', {}); }

      /* 1~2단계: 메모리 구성 + 직렬화 (여기서 실패해도 저장소는 무해) */
      try {
        sExp = JSON.stringify(bundle.expenses);
        sCat = JSON.stringify(bundle.categories);
        sSet = JSON.stringify(bundle.settings);
      } catch (e1) {
        E.log('E-501', e1);
        return E.fail('E-501', {});
      }
      if (typeof sExp !== 'string' || typeof sCat !== 'string' || typeof sSet !== 'string') {
        return E.fail('E-501', {});
      }

      prevExp = backendGet(K_EXPENSES);
      prevCat = backendGet(K_CATEGORIES);

      /* 3단계: 데이터 키 (expenses -> categories -> settings)
       * 실패하면 §6-2 복구 사다리를 1단계씩 올리며 최대 4회 재시도. 5단계는 중단. */
      r = null;
      for (step = 0; step <= 4; step++) {
        r = writeDataKeys(sExp, sCat, sSet);
        if (r.ok) { break; }
        if (r.code === 'E-205') { return E.fail('E-205', {}); }
        if (r.code !== 'E-202') { return r; }
        if (step === 4) { return E.fail('E-202', {}); }
        relieveStep(step + 1);
      }
      if (!r || !r.ok) { return E.fail('E-202', {}); }

      /* 4단계: 백업본(이전 값). 실패해도 데이터는 이미 안전하다 */
      if (mode !== MODE_MEMORY) {
        if (!writeBak(prevExp, prevCat)) {
          backendRemove(K_EXPENSES + '.bak');
          backendRemove(K_CATEGORIES + '.bak');
          codes.push('E-204');
        }
      }

      /* 5단계: 마지막에 meta */
      writeMeta();

      /* 예방: 사용률 80% 경고. 메모리 모드에서는 발생시키지 않는다(§6-1 5) */
      if (mode !== MODE_MEMORY) {
        u = usage();
        if (u.ok && u.data.ratio >= 0.8) { codes.push('E-203'); }
      }
      return E.ok({ codes: codes });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function writeDataKeys(sExp, sCat, sSet) {
    var r;
    r = setRaw(K_EXPENSES, sExp); if (!r.ok) { return r; }
    r = setRaw(K_CATEGORIES, sCat); if (!r.ok) { return r; }
    r = setRaw(K_SETTINGS, sSet); if (!r.ok) { return r; }
    return E.ok({});
  }

  function writeBak(prevExp, prevCat) {
    var a, b;
    if (prevExp === null && prevCat === null) { return true; }
    a = (prevExp === null) ? E.ok({}) : setRaw(K_EXPENSES + '.bak', prevExp);
    if (!a.ok) { return false; }
    b = (prevCat === null) ? E.ok({}) : setRaw(K_CATEGORIES + '.bak', prevCat);
    return !!b.ok;
  }

  function writeMeta() {
    var cur = null, meta, r = getJSON(K_META);
    if (r.ok && r.data.value && typeof r.data.value === 'object') { cur = r.data.value; }
    meta = {
      schema: 1,
      appId: 'jr-expense',
      createdAt: (cur && typeof cur.createdAt === 'number') ? cur.createdAt : Date.now(),
      lastWriteAt: Date.now(),
      writeCount: (cur && typeof cur.writeCount === 'number') ? cur.writeCount + 1 : 1
    };
    setJSON(K_META, meta);
    return meta;
  }

  function snapshot() {
    var snap = {}, ks, i, v;
    try {
      ks = rawKeys();
      for (i = 0; i < ks.length; i++) {
        if (ks[i].indexOf('jr.v1.') !== 0) { continue; }
        if (ks[i] === K_ROLLBACK) { continue; }
        v = backendGet(ks[i]);
        if (v !== null) { snap[ks[i]] = v; }
      }
      return E.ok({ snap: snap });
    } catch (e) {
      E.log('E-501', e);
      return E.ok({ snap: snap });
    }
  }

  function restore(snap) {
    var ks, i, k, r;
    try {
      if (!snap || typeof snap !== 'object') { return E.fail('E-411', {}); }
      ks = rawKeys();
      for (i = 0; i < ks.length; i++) {
        k = ks[i];
        if (k.indexOf('jr.v1.') !== 0) { continue; }
        if (k === K_ROLLBACK) { continue; }
        if (k.indexOf(K_CORRUPT_PREFIX) === 0) { continue; }
        if (!Object.prototype.hasOwnProperty.call(snap, k)) { backendRemove(k); }
      }
      for (k in snap) {
        if (!Object.prototype.hasOwnProperty.call(snap, k)) { continue; }
        if (typeof snap[k] !== 'string') { continue; }
        r = setRaw(k, snap[k]);
        if (!r.ok) { return E.fail('E-411', {}); }
      }
      return E.ok({});
    } catch (e) {
      E.log('E-411', e);
      return E.fail('E-411', {});
    }
  }

  function quarantine(key, raw) {
    var savedKey, ks, i, corrupt = [], r;
    try {
      if (typeof key !== 'string' || typeof raw !== 'string') { return E.fail('E-308', {}); }
      savedKey = K_CORRUPT_PREFIX + Date.now();
      /* 같은 밀리초 충돌 방지 */
      while (backendGet(savedKey) !== null) { savedKey = savedKey + '0'; }
      r = setRaw(savedKey, raw);
      if (!r.ok) { return E.fail('E-308', {}); }

      ks = rawKeys();
      for (i = 0; i < ks.length; i++) {
        if (ks[i].indexOf(K_CORRUPT_PREFIX) === 0) { corrupt.push(ks[i]); }
      }
      corrupt.sort();
      while (corrupt.length > MAX_CORRUPT) {
        backendRemove(corrupt[0]);
        corrupt.splice(0, 1);
      }
      return E.ok({ savedKey: savedKey });
    } catch (e) {
      E.log('E-308', e);
      return E.fail('E-308', {});
    }
  }

  function clearAppKeys() {
    var ks, i, removed = 0;
    try {
      ks = rawKeys();
      for (i = 0; i < ks.length; i++) {
        if (ks[i].indexOf('jr.v1.') !== 0) { continue; }
        if (ks[i].indexOf(K_CORRUPT_PREFIX) === 0) { continue; }
        backendRemove(ks[i]);
        removed++;
      }
      return E.ok({ removed: removed });
    } catch (e) {
      E.log('E-501', e);
      return E.ok({ removed: removed });
    }
  }

  return {
    LIMIT_CHARS: LIMIT_CHARS,
    MODE_PERSIST: MODE_PERSIST,
    MODE_MEMORY: MODE_MEMORY,
    init: init,
    mode: getMode,
    getRaw: getRaw,
    setRaw: setRaw,
    removeRaw: removeRaw,
    keys: keys,
    getJSON: getJSON,
    setJSON: setJSON,
    usage: usage,
    writeAll: writeAll,
    snapshot: snapshot,
    restore: restore,
    quarantine: quarantine,
    clearAppKeys: clearAppKeys
  };
})();
