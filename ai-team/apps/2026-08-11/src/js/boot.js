/* 한달정리 — 부팅 시퀀스
 * 정본: docs/기획-구조설계.md §5-9 · §6-8 · §6-8-3
 *     + docs/기획서.md INT-14 · INT-30(3) · INT-15
 * 이 파일에는 렌더 코드가 없습니다. DOM 접근은 INT-14 의 정적 요소 제거와
 * INT-30(3) 의 #jr-app hidden 해제뿐이며, 나머지는 JR.ui 호출로만 나갑니다.
 */
var JR = JR || {};
(function () {
  'use strict';

  /* §6-8-1 필수 API 감지 — 하나라도 없으면 앱 전체를 띄우지 않는다 */
  function requiredApisPresent() {
    try {
      if (typeof JSON !== 'object' || typeof JSON.parse !== 'function' || typeof JSON.stringify !== 'function') { return false; }
      if (typeof window.addEventListener !== 'function') { return false; }
      if (typeof document.querySelector !== 'function') { return false; }
      if (typeof Object.keys !== 'function') { return false; }
      if (typeof Object.create !== 'function') { return false; }   /* INT-42(4) */
      if (typeof [].forEach !== 'function') { return false; }
      if (typeof [].indexOf !== 'function') { return false; }
      if (typeof [].filter !== 'function') { return false; }
      if (typeof [].map !== 'function') { return false; }
      if (typeof ''.trim !== 'function') { return false; }
      if (typeof Date.now !== 'function') { return false; }
      return true;
    } catch (e) { return false; }
  }

  function removeElement(id) {
    var el = document.getElementById(id);
    if (el && el.parentNode) { el.parentNode.removeChild(el); }
  }

  function optionalApiMissing() {
    var missing = false;
    try {
      if (typeof FileReader !== 'function') { missing = true; }
      else {
        var i = document.createElement('input');
        i.type = 'file';
        if (i.type !== 'file') { missing = true; }
      }
    } catch (e) { missing = true; }
    return missing;
  }

  function bannerOnly(codes) {
    var i, out = [];
    for (i = 0; i < codes.length; i++) {
      if (JR.err.slot(codes[i]) === 'B') { out.push(codes[i]); }
    }
    return out;
  }

  function highestBanner(codes) {
    var i, j;
    for (i = 0; i < JR.err.BANNER_PRIORITY.length; i++) {
      for (j = 0; j < codes.length; j++) {
        if (codes[j] === JR.err.BANNER_PRIORITY[i]) { return codes[j]; }
      }
    }
    return codes.length > 0 ? codes[0] : null;
  }

  /* §7-8 — 배너는 가장 심각한 것 하나만. 나머지 코드는 슬롯대로 표시 */
  function presentNotices(codes, params) {
    var banners = bannerOnly(codes);
    var top = highestBanner(banners);
    var i, code;
    for (i = 0; i < codes.length; i++) {
      code = codes[i];
      if (JR.err.slot(code) === 'B') { continue; }
      JR.ui.show(code, params[code]);
    }
    if (top !== null) { JR.ui.show(top, params[top]); }
  }

  function start() {
    var notices = [], noticeParams = {}, readOnly = false;
    var storeR, modelR, usageR, i;

    if (!requiredApisPresent()) {
      /* E-001 — 정적 HTML 이 그대로 남습니다. #jr-app 도 감춰진 채로 둡니다 */
      return;
    }
    removeElement('jr-unsupported');

    /* 1 */
    storeR = JR.store.init();
    /* 2 */
    if (storeR.ok && storeR.data.codes) {
      for (i = 0; i < storeR.data.codes.length; i++) { notices.push(storeR.data.codes[i]); }
    }

    /* 3 */
    modelR = JR.model.init();
    if (modelR.data && modelR.data.notices) {
      for (i = 0; i < modelR.data.notices.length; i++) { notices.push(modelR.data.notices[i]); }
    }
    if (modelR.data && modelR.data.noticeParams) { noticeParams = modelR.data.noticeParams; }

    /* 4 */
    if (!modelR.ok && modelR.code === 'E-307') { readOnly = true; }

    if (!readOnly) {
      /* 5 */
      usageR = JR.store.usage();
      if (usageR.ok && usageR.data.ratio >= 0.8 && JR.store.mode() !== JR.store.MODE_MEMORY) {
        notices.push('E-203');
        noticeParams['E-203'] = { percent: Math.floor(usageR.data.ratio * 100) };
      }
      /* 6 */
      if (optionalApiMissing()) { notices.push('E-002'); }
    }

    /* 7 — 초기 렌더. 이 시점 전에는 상호작용 요소를 렌더하지 않습니다 */
    removeElement('jr-loading');
    var app = document.getElementById('jr-app');
    if (app && app.hasAttribute('hidden')) { app.removeAttribute('hidden'); }

    var bootState = {
      mode: JR.store.mode(),
      notices: dedupe(notices),
      expenseCount: (modelR.data && typeof modelR.data.expenseCount === 'number') ? modelR.data.expenseCount : 0,
      categoryCount: (modelR.data && typeof modelR.data.categoryCount === 'number') ? modelR.data.categoryCount : 0,
      readOnly: readOnly
    };

    if (JR.ui && typeof JR.ui.init === 'function') {
      JR.ui.init(bootState);
    } else {
      JR.err.log('E-501', 'JR.ui.init 이 없습니다');
      return;
    }

    /* 8 */
    if (typeof JR.ui.show === 'function') {
      presentNotices(bootState.notices, noticeParams);
    }

    /* 9 */
    registerLifecycleEvents();
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

  /* §6-8-3 — 다른 탭이 데이터를 바꿨는지 복귀 시 판정 */
  var lastSeenWriteAt = null;

  function readWriteAt() {
    var r = JR.store.getJSON('jr.v1.meta');
    if (r.ok && r.data.value && typeof r.data.value === 'object') { return r.data.value.lastWriteAt; }
    return null;
  }

  function onHidden() {
    lastSeenWriteAt = readWriteAt();
  }

  function onVisible() {
    var now = readWriteAt();
    if (lastSeenWriteAt === null) { lastSeenWriteAt = now; return; }
    if (now !== lastSeenWriteAt) {
      JR.model.init();
      if (JR.stats && typeof JR.stats.invalidate === 'function') { JR.stats.invalidate(); }
      lastSeenWriteAt = now;
      if (JR.ui && typeof JR.ui.show === 'function') { JR.ui.show('E-605'); }
    }
  }

  function registerLifecycleEvents() {
    lastSeenWriteAt = readWriteAt();
    if (typeof document.visibilityState === 'string') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') { onHidden(); }
        else if (document.visibilityState === 'visible') { onVisible(); }
      }, false);
    }
    window.addEventListener('pagehide', function () { onHidden(); }, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, false);
  } else {
    start();
  }
})();
