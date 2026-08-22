var JR = JR || {};
/* JR.ui — 렌더 · 이벤트 바인딩 · 슬롯 4종 · MSG · lock/unlock
   소유: frontend-dev (개발-분할안 §4-2)
   정본: docs/디자인가이드.md · docs/기획서.md §7 INT-01~33 · docs/기획-구조설계.md §7
   금지: HTML 문자열 주입 · 외부 URL · 문구 창작 (DOM 은 textContent · createElement 로만) */
JR.ui = (function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  var MSG = {
    SAVE_OK:        '저장했습니다',
    DELETE_OK:      '삭제했습니다',
    CAT_ADD_OK:     '카테고리를 추가했습니다',
    CAT_RENAME_OK:  '카테고리 이름을 바꿨습니다',
    CAT_DELETE_OK:  '카테고리를 삭제했습니다',
    EXPORT_OK:      '내보내기를 완료했습니다',
    IMPORT_OK:      '가져오기를 완료했습니다',
    WIPE_OK:        '모두 삭제했습니다',
    CAT_MAX_HINT:   '카테고리는 최대 20개까지 만들 수 있습니다.',
    CAT_MIN_HINT:   '카테고리는 최소 1개가 있어야 합니다.'
  };

  var TOAST_MS = 3000;                       /* INT-33 · 단일 상수 */

  var DELETED_LABEL = '미분류(삭제된 카테고리)';
  var AMOUNT_HINT = '1원 ~ 999,999,999원까지 입력할 수 있습니다.';
  var EXPORT_NOTICE_OK = '파일을 저장했습니다. 저장된 파일이 보이지 않으면 아래 내용을 복사해 보관하세요.';
  var EXPORT_NOTICE_FAIL = '파일 저장이 지원되지 않는 환경입니다. 아래 내용을 직접 복사해 보관하세요.';
  var CAT_EMPTY_S02 = '설정에서 카테고리를 먼저 추가해 주세요.';

  /* 배너 — §7-8 · INT-32 */
  var BANNER_PRIORITY = ['E-307', 'E-411', 'E-202', 'E-205', 'E-201', 'E-303', 'E-305',
                         'E-304', 'E-410', 'E-413', 'E-302', 'E-301', 'E-604', 'E-203', 'E-002'];
  var BANNER_EVENT = ['E-203', 'E-301', 'E-302', 'E-303', 'E-304', 'E-305', 'E-410', 'E-413', 'E-604'];
  var BANNER_BLOCK = ['E-307', 'E-411'];
  var SCROLL_TOP_BANNERS = ['E-410', 'E-411', 'E-413'];   /* INT-32 */

  /* T 슬롯 우선순위 — INT-29 */
  var TOAST_PRIORITY = ['E-113', 'E-121', 'E-120', 'E-123', 'E-122', 'E-119', 'E-124', 'E-117', 'E-118'];

  var ICONS = {
    info:  [['circle', { cx: 12, cy: 12, r: 9 }],
            ['line', { x1: 12, y1: 11, x2: 12, y2: 16 }],
            ['circle', { cx: 12, cy: 8, r: 1, fill: 'currentColor', stroke: 'none' }]],
    check: [['circle', { cx: 12, cy: 12, r: 9 }],
            ['path', { d: 'M8 12l2.5 2.5L16 9' }]],
    block: [['path', { d: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z' }],
            ['line', { x1: 12, y1: 8, x2: 12, y2: 13 }],
            ['circle', { cx: 12, cy: 16, r: 1, fill: 'currentColor', stroke: 'none' }]],
    warn:  [['path', { d: 'M12 3.5L22 20H2L12 3.5z' }],
            ['line', { x1: 12, y1: 10, x2: 12, y2: 14 }],
            ['circle', { cx: 12, cy: 17, r: 1, fill: 'currentColor', stroke: 'none' }]]
  };

  var state = {
    booted: false,
    screen: 's01',
    month: '',
    readOnly: false,
    mode: 'add',
    targetId: null,
    selectedCategoryId: null,
    originScreen: 's01',
    baseline: null,
    editingCategoryId: null,
    nameSlot: 'new',
    e606Shown: false,
    importPayload: null,
    historyPushed: false,
    importSupported: true
  };

  var locks = {};
  var toastTimer = null;
  var toastClearTimer = null;
  var notices = [];          /* [{code, params, at, closedEvent, closedState}] */
  var bannerNode = null;
  var dialogNode = null;
  var dialogOpener = null;
  var dialogLeftAction = null;

  /* ──────────────────────────── 작은 도구 ──────────────────────────── */

  function $(id) { return document.getElementById(id); }

  function clearNode(node) {
    if (!node) { return; }
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }

  function tpl(id) {
    var t = $(id);
    return t.content.firstElementChild.cloneNode(true);
  }

  function makeIcon(name, size, cls) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (cls) { svg.setAttribute('class', cls); }
    var shapes = ICONS[name] || [];
    for (var i = 0; i < shapes.length; i++) {
      var node = document.createElementNS(SVGNS, shapes[i][0]);
      var attrs = shapes[i][1];
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) { node.setAttribute(k, String(attrs[k])); }
      }
      svg.appendChild(node);
    }
    return svg;
  }

  function has(list, v) {
    for (var i = 0; i < list.length; i++) { if (list[i] === v) { return true; } }
    return false;
  }

  function dataOf(r) { return (r && r.data) ? r.data : {}; }

  function messageOf(code, params) {
    var g = (JR.err && JR.err.get) ? JR.err.get(code, params) : null;
    var msg = (g && g.msg) ? g.msg : '';
    if (params && msg.indexOf('{') !== -1 && JR.err && JR.err.format) {
      msg = JR.err.format(msg, params);
    }
    return msg;
  }

  function amountText(n) {
    var s = (JR.stats && JR.stats.formatAmount) ? JR.stats.formatAmount(n) : String(n);
    return s + '원';                              /* 단위 접미사는 frontend-dev 가 붙입니다 (§4-5) */
  }

  function monthLabel(yyyymm) {
    if (!yyyymm || yyyymm.length < 7) { return ''; }
    return yyyymm.slice(0, 4) + '년 ' + String(Number(yyyymm.slice(5, 7))) + '월';
  }

  function groupDigits(digits) {
    var out = '', c = 0;
    for (var i = digits.length - 1; i >= 0; i--) {
      out = digits.charAt(i) + out;
      c++;
      if (c % 3 === 0 && i > 0) { out = ',' + out; }
    }
    return out;
  }

  function codePoints(s) {
    var arr = [];
    var i = 0;
    while (i < s.length) {
      var cp = s.codePointAt ? s.codePointAt(i) : s.charCodeAt(i);
      var size = (cp > 0xFFFF) ? 2 : 1;
      arr.push(s.substr(i, size));
      i += size;
    }
    return arr;
  }

  function countChars(s) {
    if (JR.model && JR.model.countChars) { return JR.model.countChars(s); }
    return codePoints(s).length;
  }

  function truncateChars(s, max) {
    var arr = codePoints(s);
    if (arr.length <= max) { return s; }
    return arr.slice(0, max).join('');
  }

  function categoryItems() {
    var r = JR.model.getCategories();
    if (!r || !r.ok) { return []; }
    var d = dataOf(r);
    return d.items || d.categories || [];
  }

  function categoryName(id) {
    var r = JR.model.getCategoryName(id);
    if (r && r.ok && r.data && r.data.name) { return r.data.name; }
    return DELETED_LABEL;
  }

  function scrollTop() {
    if (window.scrollTo) { window.scrollTo(0, 0); }
  }

  /* ──────────────────────────── 잠금 (§6-5) ──────────────────────────── */

  function lock(actionKey) {
    if (locks[actionKey]) { return false; }
    locks[actionKey] = true;
    return true;
  }

  function unlock(actionKey) { locks[actionKey] = false; }

  /* ──────────────────────────── T 슬롯 ──────────────────────────── */

  function showToastText(text) {
    var t = $('jr-toast');
    if (!t) { return; }
    if (toastClearTimer) { clearTimeout(toastClearTimer); toastClearTimer = null; }
    t.textContent = text;
    t.classList.add('jr-toast--visible');
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () {
      t.classList.remove('jr-toast--visible');
      toastClearTimer = setTimeout(function () { t.textContent = ''; }, 250);
    }, TOAST_MS);
  }

  function toast(code, params) {
    showToastText(messageOf(code, params));
  }

  /* ──────────────────────────── I 슬롯 (§5-1) ──────────────────────────── */

  function slotElFor(field) {
    if (field === 'date') { return $('jr-date-hint'); }
    if (field === 'amount') { return $('jr-amount-hint'); }
    if (field === 'categoryId') { return $('jr-cat-hint'); }
    if (field === 'name') {
      return state.nameSlot === 'edit' ? $('jr-cat-edit-hint') : $('jr-cat-new-hint');
    }
    return null;
  }

  function inputElFor(field) {
    if (field === 'date') { return $('jr-date'); }
    if (field === 'amount') { return $('jr-amount'); }
    if (field === 'name') {
      return state.nameSlot === 'edit' ? $('jr-cat-edit-input') : $('jr-cat-new');
    }
    return null;
  }

  function setSlot(el, kind, text, iconName) {
    if (!el) { return; }
    clearNode(el);
    el.className = 'jr-slot jr-slot--' + kind;
    if (iconName) { el.appendChild(makeIcon(iconName, 16, 'jr-slot__icon')); }
    if (text) { el.appendChild(document.createTextNode(text)); }
  }

  function resetSlot(field) {
    var el = slotElFor(field);
    var input = inputElFor(field);
    if (input) { input.removeAttribute('aria-invalid'); }
    if (!el) { return; }
    if (field === 'date') {
      setSlot(el, 'neutral', '2000-01-01 ~ ' + JR.model.maxDate() + ' 사이 날짜만 입력할 수 있습니다.', null);
    } else if (field === 'amount') {
      setSlot(el, 'neutral', AMOUNT_HINT, null);
    } else if (field === 'categoryId') {
      /* INT-04 — 미선택 동안 상시 중립 안내(E-112 문구), 아이콘은 이 자리 한 곳뿐 (§5-1) */
      if (!state.selectedCategoryId && categoryItems().length > 0) {
        setSlot(el, 'neutral', messageOf('E-112'), 'info');
      } else {
        setSlot(el, 'empty', '', null);
      }
    } else {
      setSlot(el, 'empty', '', null);
    }
  }

  function inline(field, code, params) {
    var el = slotElFor(field);
    if (!el) {
      if (JR.err && JR.err.log) { JR.err.log('E-599', 'no I slot for field: ' + field); }
      return;
    }
    if (code === null || code === undefined) { resetSlot(field); return; }
    setSlot(el, 'error', messageOf(code, params), 'warn');
    var input = inputElFor(field);
    if (input) { input.setAttribute('aria-invalid', 'true'); }
  }

  function clearAllInline() {
    resetSlot('date');
    resetSlot('amount');
    resetSlot('categoryId');
    resetSlot('name');
  }

  /* ──────────────────────────── B 슬롯 (§4-11 · §7-8) ──────────────────────────── */

  function bannerKind(code) {
    if (has(BANNER_BLOCK, code)) { return 'block'; }
    if (has(BANNER_EVENT, code)) { return 'event'; }
    return 'state';
  }

  function findNotice(code) {
    for (var i = 0; i < notices.length; i++) { if (notices[i].code === code) { return notices[i]; } }
    return null;
  }

  function pickNotice() {
    for (var i = 0; i < BANNER_PRIORITY.length; i++) {
      var n = findNotice(BANNER_PRIORITY[i]);
      if (n && !n.closedEvent && !n.closedState) { return n; }
    }
    /* 우선순위 목록 밖의 코드는 등록 순서대로 */
    for (var j = 0; j < notices.length; j++) {
      if (!notices[j].closedEvent && !notices[j].closedState) { return notices[j]; }
    }
    return null;
  }

  function renderBanner() {
    if (bannerNode && bannerNode.parentNode) { bannerNode.parentNode.removeChild(bannerNode); }
    bannerNode = null;
    var n = pickNotice();
    if (!n) { return; }
    var kind = bannerKind(n.code);
    var node = tpl('jr-tpl-banner');
    node.classList.add('jr-banner--' + kind);
    node.setAttribute('role', kind === 'block' ? 'alert' : 'status');

    var iconHost = node.querySelector('.jr-banner__icon');
    clearNode(iconHost);
    iconHost.appendChild(makeIcon(kind === 'block' ? 'block' : (kind === 'event' ? 'check' : 'info'), 24, null));

    node.querySelector('.jr-banner__text').textContent = messageOf(n.code, n.params);

    if (kind !== 'block') {                      /* 차단형은 닫기 버튼을 DOM 에 만들지 않습니다 */
      var close = tpl('jr-tpl-banner-close');
      close.addEventListener('click', function () { dismissBanner(n.code); });
      node.appendChild(close);
    }

    var app = $('jr-app');
    document.body.insertBefore(node, app);
    bannerNode = node;
  }

  function banner(code, params) {
    var n = findNotice(code);
    if (!n) {
      n = { code: code, params: params, at: Date.now(), closedEvent: false, closedState: false };
      notices.push(n);
    } else {
      n.params = params || n.params;
    }
    renderBanner();
    if (has(SCROLL_TOP_BANNERS, code)) { scrollTop(); }   /* INT-32 */
  }

  function dismissBanner(code) {
    var n = findNotice(code);
    if (!n) { return; }
    var kind = bannerKind(code);
    if (kind === 'block') { return; }
    if (kind === 'event') {
      n.closedEvent = true;
      if (JR.model && JR.model.dismissNotice) { JR.model.dismissNotice(code + ':' + n.at); }
    } else {
      n.closedState = true;                     /* 화면을 옮기면 다시 나타납니다 */
    }
    renderBanner();
  }

  function reopenStateBanners() {
    for (var i = 0; i < notices.length; i++) { notices[i].closedState = false; }
    renderBanner();
  }

  /* ──────────────────────────── show (INT-15) ──────────────────────────── */

  function show(code, params, field) {
    var s = JR.err.slot(code);
    if (s === 'I') { return inline(field || JR.err.get(code).field, code, params); }
    if (s === 'B') { return banner(code, params); }
    return toast(code, params);
  }

  function showErrors(result) {
    /* INT-29 — I 는 전부, T 는 우선순위 1건만 */
    var d = dataOf(result);
    var errors = d.errors;
    if (!errors || !errors.length) {
      show(result.code, d.params);
      return;
    }
    var tCodes = [];
    for (var i = 0; i < errors.length; i++) {
      var e = errors[i];
      var slot = JR.err.slot(e.code);
      if (slot === 'I') {
        inline(e.field || JR.err.get(e.code).field, e.code, e.params);
      } else if (slot === 'B') {
        banner(e.code, e.params);
      } else {
        tCodes.push(e);
      }
    }
    if (tCodes.length) { toastOne(tCodes); }
  }

  function toastOne(list) {
    var best = null, bestRank = 1e9;
    for (var i = 0; i < list.length; i++) {
      var rank = 1e9;
      for (var j = 0; j < TOAST_PRIORITY.length; j++) {
        if (TOAST_PRIORITY[j] === list[i].code) { rank = j; break; }
      }
      if (rank < bestRank) { best = list[i]; bestRank = rank; }
    }
    if (bestRank === 1e9) {                       /* 목록 밖 — 코드 문자열 오름차순 첫 번째 */
      best = list[0];
      for (var k = 1; k < list.length; k++) { if (list[k].code < best.code) { best = list[k]; } }
    }
    toast(best.code, best.params);
  }

  /* ──────────────────────────── 대화상자 (§4-13) ──────────────────────────── */

  function focusables(root) {
    var all = root.querySelectorAll('button, [href], input, select, textarea, [tabindex]');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (!all[i].disabled && all[i].getAttribute('tabindex') !== '-1') { out.push(all[i]); }
    }
    return out;
  }

  function closeDialog() {
    if (!dialogNode) { return; }
    if (dialogNode.parentNode) { dialogNode.parentNode.removeChild(dialogNode); }
    dialogNode = null;
    dialogLeftAction = null;
    if (dialogOpener && dialogOpener.focus) { dialogOpener.focus(); }
    dialogOpener = null;
  }

  function openDialog(opts) {
    closeDialog();
    dialogOpener = document.activeElement;
    var node = tpl('jr-tpl-dialog');
    node.querySelector('#jr-dialog-title').textContent = opts.title;
    var desc = node.querySelector('#jr-dialog-desc');
    if (opts.desc) { desc.textContent = opts.desc; } else { desc.parentNode.removeChild(desc); }

    var left = node.querySelector('[data-act="left"]');
    var right = node.querySelector('[data-act="right"]');
    left.textContent = opts.left;
    right.textContent = opts.right;
    right.className = 'jr-btn jr-btn--' + (opts.rightVariant || 'danger');

    dialogLeftAction = function () {
      closeDialog();
      if (opts.onLeft) { opts.onLeft(); }
    };
    left.addEventListener('click', dialogLeftAction);
    right.addEventListener('click', function () {
      if (opts.keepOpen) { opts.onRight(node, right); return; }
      closeDialog();
      if (opts.onRight) { opts.onRight(); }
    });

    node.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' || ev.keyCode === 27) {
        ev.preventDefault();
        if (dialogLeftAction) { dialogLeftAction(); }
        return;
      }
      if (ev.key === 'Tab' || ev.keyCode === 9) {
        var list = focusables(node);
        if (!list.length) { return; }
        var first = list[0], last = list[list.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    });

    document.body.appendChild(node);
    dialogNode = node;
    left.focus();
    return node;
  }

  /* ──────────────────────────── 화면 전환 ──────────────────────────── */

  var SCREENS = ['s01', 's02', 's03', 's04'];

  function goScreen(id) {
    state.screen = id;
    document.body.setAttribute('data-screen', id);
    for (var i = 0; i < SCREENS.length; i++) {
      var el = $('jr-screen-' + SCREENS[i]);
      if (SCREENS[i] === id) { el.removeAttribute('hidden'); } else { el.setAttribute('hidden', ''); }
    }
    var tabs = $('jr-tabbar').querySelectorAll('.jr-tab');
    for (var j = 0; j < tabs.length; j++) {
      var active = tabs[j].getAttribute('data-screen') === id;
      if (active) { tabs[j].classList.add('jr-tab--active'); tabs[j].setAttribute('aria-current', 'page'); }
      else { tabs[j].classList.remove('jr-tab--active'); tabs[j].removeAttribute('aria-current'); }
    }
    $('jr-tabbar').hidden = (id === 's02');
    reopenStateBanners();
    render();
    focusFirst(id);
    scrollTop();
  }

  function focusFirst(id) {
    var target = null;
    if (id === 's01') { target = $('jr-s01-prev'); }
    else if (id === 's02') { target = $('jr-date'); }
    else if (id === 's03') { target = $('jr-s03-prev'); }
    else if (id === 's04') {
      var firstBtn = $('jr-s04-cat-list').querySelector('[data-act="rename"]');
      target = firstBtn || $('jr-s04-cat-title');
    }
    if (target && target.focus) { target.focus(); }
  }

  function render() {
    if (state.screen === 's01') { renderS01(); }
    else if (state.screen === 's02') { renderS02(); }
    else if (state.screen === 's03') { renderS03(); }
    else if (state.screen === 's04') { renderS04(); }
  }

  /* ──────────────────────────── 월 이동 ──────────────────────────── */

  function updateMonthBar(prefix) {
    $('jr-' + prefix + '-month').textContent = monthLabel(state.month);
    var range = JR.model.monthRange();
    $('jr-' + prefix + '-prev').disabled = (state.month <= range.min);
    $('jr-' + prefix + '-next').disabled = (state.month >= range.max);
  }

  function shiftMonth(delta) {
    var next = JR.model.shiftMonth(state.month, delta);
    var range = JR.model.monthRange();
    if (next < range.min || next > range.max) { return; }
    state.month = next;
    JR.model.setSelectedMonth(next);
    render();
  }

  /* ──────────────────────────── S-01 ──────────────────────────── */

  function emptyState(title, body) {
    var node = tpl('jr-tpl-empty-state');
    var t = node.querySelector('.jr-empty-state__title');
    if (title) { t.textContent = title; } else { t.parentNode.removeChild(t); }
    node.querySelector('.jr-empty-state__body').textContent = body;
    return node;
  }

  function renderS01() {
    updateMonthBar('s01');
    var list = $('jr-s01-list');
    clearNode(list);
    $('jr-s01-add').disabled = state.readOnly || categoryItems().length === 0;

    var r = JR.model.listByMonth(state.month);
    var d = dataOf(r);
    var items = d.items || [];
    $('jr-s01-card').hidden = false;
    $('jr-s01-total').textContent = amountText(d.total || 0);

    if (state.readOnly) { return; }              /* INT-09 — 목록·빈 상태 문구 모두 렌더하지 않음 */

    if (items.length === 0) {
      var months = dataOf(JR.model.availableMonths()).months || [];
      if (months.length === 0) {
        $('jr-s01-card').hidden = true;
        list.appendChild(emptyState('아직 기록이 없어요', '첫 지출을 기록해 보세요.'));
      } else {
        list.appendChild(emptyState(null, '이 달에는 기록이 없습니다.'));
      }
      return;
    }

    for (var i = 0; i < items.length; i++) {
      list.appendChild(expenseRow(items[i]));
    }
  }

  function expenseRow(e) {
    var row = tpl('jr-tpl-expense-row');
    row.querySelector('.jr-expense-row__category').textContent = categoryName(e.categoryId);
    var memo = row.querySelector('.jr-expense-row__memo');
    if (e.memo) { memo.textContent = e.memo; } else { memo.parentNode.removeChild(memo); }
    row.querySelector('.jr-expense-row__day').textContent = String(Number(e.date.slice(8, 10))) + '일';
    row.querySelector('.jr-expense-row__amount').textContent = amountText(e.amount);
    row.addEventListener('click', function () { openEdit(e.id); });
    return row;
  }

  /* ──────────────────────────── S-03 ──────────────────────────── */

  function renderS03() {
    updateMonthBar('s03');
    var r = JR.stats.byCategory(state.month);
    var d = dataOf(r);
    $('jr-s03-total').textContent = amountText(d.total || 0);
    $('jr-s03-count').textContent = '총 ' + String(d.count || 0) + '건';

    var list = $('jr-s03-list');
    clearNode(list);
    if (state.readOnly) { return; }

    var items = d.items || [];
    if (items.length === 0) {
      list.appendChild(emptyState(null, '이 달에는 기록이 없어 통계를 표시할 수 없습니다.'));
      return;
    }
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var node = tpl('jr-tpl-stat-row');
      if (it.isDeletedCategory) { node.classList.add('jr-stat-row--deleted'); }
      node.querySelector('.jr-stat-row__name').textContent = it.categoryName;
      node.querySelector('.jr-stat-row__value').textContent = amountText(it.amount) + ' (' + String(it.percent) + '%)';
      node.querySelector('.jr-bar-fill').style.width = String(it.percent) + '%';
      list.appendChild(node);
    }
  }

  /* ──────────────────────────── S-02 ──────────────────────────── */

  function formValues() {
    return {
      date: $('jr-date').value,
      amount: $('jr-amount').value,
      categoryId: state.selectedCategoryId || '',
      memo: $('jr-memo').value
    };
  }

  function isDirty() {
    if (!state.baseline) { return false; }
    var v = formValues();
    return v.date !== state.baseline.date || v.amount !== state.baseline.amount ||
           v.categoryId !== state.baseline.categoryId || v.memo !== state.baseline.memo;
  }

  function updateSaveEnabled() {
    /* INT-02 — 비활성 조건은 4가지뿐 */
    var v = formValues();
    var amountEmpty = v.amount.replace(/[,\s]/g, '') === '';
    var noCategory = !v.categoryId || categoryItems().length === 0;
    $('jr-s02-save').disabled = (v.date === '' || amountEmpty || noCategory || !!locks.save);
  }

  function updateMemoCounter() {
    var n = countChars($('jr-memo').value);
    $('jr-memo-counter').textContent = String(n) + '/100';
  }

  function renderChips() {
    var group = $('jr-cat-group');
    clearNode(group);
    var items = categoryItems();
    var none = state.readOnly || items.length === 0;
    group.hidden = none;
    $('jr-cat-empty').hidden = !none;
    if (none) { return; }

    var selectedIndex = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === state.selectedCategoryId) { selectedIndex = i; }
    }
    for (var j = 0; j < items.length; j++) {
      var chip = tpl('jr-tpl-chip');
      chip.textContent = items[j].name;
      chip.setAttribute('data-id', items[j].id);
      var checked = items[j].id === state.selectedCategoryId;
      chip.setAttribute('aria-checked', checked ? 'true' : 'false');
      chip.setAttribute('tabindex', (checked || (selectedIndex === -1 && j === 0)) ? '0' : '-1');
      group.appendChild(chip);
    }
  }

  function selectChip(id) {
    state.selectedCategoryId = id;
    renderChips();
    resetSlot('categoryId');
    updateSaveEnabled();
    saveDraft();
  }

  function renderS02() {
    $('jr-s02-title').textContent = state.mode === 'edit' ? '지출 수정' : '지출 추가';
    renderChips();
    updateSaveEnabled();
    updateMemoCounter();

    var slot = $('jr-s02-delete-slot');
    clearNode(slot);
    if (state.mode === 'edit') {                 /* 추가 모드에서는 DOM 에 없음 */
      var btn = tpl('jr-tpl-s02-delete');
      btn.addEventListener('click', onDeleteExpense);
      slot.appendChild(btn);
    }
  }

  function openAdd() {
    state.originScreen = state.screen;
    state.mode = 'add';
    state.targetId = null;
    state.selectedCategoryId = null;
    $('jr-date').value = JR.model.today();
    $('jr-date').setAttribute('min', JR.model.minDate());
    $('jr-date').setAttribute('max', JR.model.maxDate());
    $('jr-amount').value = '';
    $('jr-memo').value = '';
    clearAllInline();
    state.baseline = formValues();
    enterS02();
  }

  function openEdit(id) {
    var r = JR.model.getExpense(id);
    if (!r || !r.ok) {                           /* INT-19 */
      show(r ? r.code : 'E-119');
      render();
      return;
    }
    var e = r.data.expense;
    state.originScreen = state.screen;
    state.mode = 'edit';
    state.targetId = e.id;
    /* 삭제된 카테고리를 참조하는 기록은 「선택 없음」으로 엽니다 — 칩에 아무것도 안 켜졌는데
       저장이 활성인 불일치를 막습니다. 이 상태에서는 INT-04 안내(E-112)가 뜨고 저장이 비활성입니다.
       S-02 를 연 뒤 카테고리가 사라지는 경합 경로의 방어선 E-113 은 그대로 남습니다. */
    state.selectedCategoryId = null;
    var cats = categoryItems();
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].id === e.categoryId) { state.selectedCategoryId = e.categoryId; break; }
    }
    $('jr-date').value = e.date;
    $('jr-date').setAttribute('min', JR.model.minDate());
    $('jr-date').setAttribute('max', JR.model.maxDate());
    $('jr-amount').value = groupDigits(String(e.amount));
    $('jr-memo').value = e.memo || '';
    clearAllInline();
    state.baseline = formValues();
    enterS02();
  }

  function enterS02() {
    restoreDraft();
    pushS02History();
    goScreen('s02');
  }

  function pushS02History() {
    state.historyPushed = false;
    try {
      if (window.history && window.history.pushState) {
        window.history.pushState({ jr: 's02' }, '', window.location.href);
        state.historyPushed = true;
      }
    } catch (err) {
      if (JR.err && JR.err.log) { JR.err.log('E-501', err); }
    }
  }

  function leaveS02(popped) {
    var target = state.originScreen === 's03' ? 's03' : 's01';
    state.baseline = null;
    state.mode = 'add';
    state.targetId = null;
    if (state.historyPushed && !popped) {
      state.historyPushed = false;
      try { window.history.back(); return; } catch (err) { /* 폴백: 아래에서 직접 전환 */ }
    }
    state.historyPushed = false;
    goScreen(target);
  }

  function confirmLeave(popped) {
    if (!isDirty()) { JR.model.clearDraft(); leaveS02(popped); return; }
    if (popped) { pushS02History(); }
    openDialog({
      title: '지금 나가면 입력한 내용이 사라집니다. 나갈까요?',
      left: '계속 입력',
      right: '나가기',
      rightVariant: 'danger',
      onRight: function () { JR.model.clearDraft(); leaveS02(false); }
    });
  }

  /* 초안 — §6-6 · INT-12 · INT-28 */

  function saveDraft() {
    if (state.screen !== 's02' || !state.baseline) { return; }
    if (!isDirty()) { return; }
    var v = formValues();
    var r = JR.model.saveDraft({
      mode: state.mode, targetId: state.targetId,
      date: v.date, amount: v.amount, categoryId: v.categoryId, memo: v.memo
    });
    if (r && !r.ok && !state.e606Shown) {
      state.e606Shown = true;                    /* 세션당 1회 */
      show(r.code, dataOf(r).params);
    }
  }

  function restoreDraft() {
    var r = JR.model.loadDraft();
    if (!r || !r.ok) { return; }
    var d = dataOf(r);
    if (d.code === 'E-603') { JR.model.clearDraft(); show('E-603'); return; }
    var draft = d.draft;
    if (!draft) { return; }
    if (draft.mode !== state.mode) { return; }   /* INT-28 — 지우지 않고 그대로 둡니다 */
    if (state.mode === 'edit' && draft.targetId !== state.targetId) { return; }
    if (d.code !== null && d.code !== undefined) { return; }

    $('jr-date').value = draft.date || '';
    $('jr-amount').value = draft.amount || '';
    $('jr-memo').value = draft.memo || '';
    state.selectedCategoryId = draft.categoryId || null;
    show('E-602');
  }

  /* 저장 · 삭제 */

  function onSave() {
    if (!lock('save')) { toast('E-601'); return; }
    $('jr-s02-save').disabled = true;
    clearAllInline();
    var v = formValues();
    var r = (state.mode === 'edit') ? JR.model.updateExpense(state.targetId, v) : JR.model.addExpense(v);
    if (!r || !r.ok) {                            /* INT-17 — S-02 에 머뭅니다 */
      unlock('save');
      updateSaveEnabled();
      if (r) { showErrors(r); }
      return;
    }
    JR.model.clearDraft();
    unlock('save');
    var warnings = dataOf(r).warnings || [];
    if (warnings.length) { show(warnings[0]); } else { showToastText(MSG.SAVE_OK); }
    state.baseline = null;
    state.historyPushed = state.historyPushed;
    leaveS02(false);
  }

  function onDeleteExpense() {
    openDialog({
      title: '이 기록을 삭제할까요?',
      desc: '삭제한 기록은 복구할 수 없습니다.',
      left: '취소',
      right: '삭제',
      rightVariant: 'danger',
      onRight: function () {
        if (!lock('delete')) { toast('E-601'); return; }
        var r = JR.model.deleteExpense(state.targetId);
        unlock('delete');
        JR.model.clearDraft();
        if (r && r.ok) { showToastText(MSG.DELETE_OK); }
        else if (r && r.code !== 'E-119') { show(r.code, dataOf(r).params); }
        leaveS02(false);
      }
    });
  }

  /* ──────────────────────────── S-04 ──────────────────────────── */

  function renderS04() {
    var list = $('jr-s04-cat-list');
    clearNode(list);
    var items = state.readOnly ? [] : categoryItems();

    for (var i = 0; i < items.length; i++) {
      if (items[i].id === state.editingCategoryId) { list.appendChild(categoryEditRow(items[i])); }
      else { list.appendChild(categoryRow(items[i], items.length)); }
    }

    var hint = $('jr-s04-cat-shared-hint');
    if (items.length >= 20) { setSlot(hint, 'neutral', MSG.CAT_MAX_HINT, null); }
    else if (items.length === 1) { setSlot(hint, 'neutral', MSG.CAT_MIN_HINT, null); }
    else { setSlot(hint, 'empty', '', null); }

    var newInput = $('jr-cat-new');
    var addBtn = $('jr-s04-cat-add');
    newInput.disabled = state.readOnly || items.length >= 20;
    addBtn.disabled = state.readOnly || items.length >= 20 ||
                      newInput.value.replace(/\s/g, '') === '' || !!locks['category-add'];

    $('jr-s04-export').disabled = state.readOnly || !!locks.export;
    $('jr-s04-import').disabled = state.readOnly || !!locks['import'] || !state.importSupported;
    $('jr-s04-wipe').disabled = state.readOnly;
  }

  function categoryRow(cat, total) {
    var row = tpl('jr-tpl-category-row');
    row.querySelector('.jr-category-row__name').textContent = cat.name;
    var rename = row.querySelector('[data-act="rename"]');
    var del = row.querySelector('[data-act="delete"]');
    rename.disabled = state.readOnly;
    del.disabled = state.readOnly || total <= 1;   /* INT-31 */
    rename.addEventListener('click', function () {
      state.editingCategoryId = cat.id;
      state.nameSlot = 'edit';
      renderS04();
      var input = $('jr-cat-edit-input');
      if (input) { input.focus(); input.select(); }
    });
    del.addEventListener('click', function () { askDeleteCategory(cat); });
    return row;
  }

  function categoryEditRow(cat) {
    var node = tpl('jr-tpl-category-edit');
    var input = node.querySelector('#jr-cat-edit-input');
    input.value = cat.name;
    var confirm = node.querySelector('[data-act="confirm"]');
    var cancel = node.querySelector('[data-act="cancel"]');

    function sync() { confirm.disabled = input.value.replace(/\s/g, '') === ''; }
    input.addEventListener('input', sync);
    sync();

    confirm.addEventListener('click', function () {
      state.nameSlot = 'edit';
      var r = JR.model.renameCategory(cat.id, input.value);
      if (!r || !r.ok) { if (r) { showErrors(r); } return; }
      state.editingCategoryId = null;
      state.nameSlot = 'new';
      showToastText(MSG.CAT_RENAME_OK);
      renderS04();
    });
    cancel.addEventListener('click', function () {
      state.editingCategoryId = null;
      state.nameSlot = 'new';
      renderS04();
    });
    return node;
  }

  function askDeleteCategory(cat) {
    var n = dataOf(JR.model.countByCategory(cat.id)).count || 0;
    var title = (n === 0)
      ? "'" + cat.name + "' 카테고리를 삭제할까요?"
      : "'" + cat.name + "' 카테고리를 사용하는 기록이 " + String(n) + "건 있습니다. 카테고리를 삭제해도 기록은 남지만, 해당 기록에서는 카테고리가 '" + DELETED_LABEL + "'로 표시됩니다.";
    openDialog({
      title: title,
      left: '취소',
      right: '삭제',
      rightVariant: 'danger',
      onRight: function () {
        var r = JR.model.deleteCategory(cat.id);
        if (!r || !r.ok) { if (r) { show(r.code, dataOf(r).params); } return; }
        showToastText(MSG.CAT_DELETE_OK);
        renderS04();
      }
    });
  }

  function onAddCategory() {
    state.nameSlot = 'new';
    if (!lock('category-add')) { toast('E-601'); return; }
    var input = $('jr-cat-new');
    var r = JR.model.addCategory(input.value);
    unlock('category-add');
    if (!r || !r.ok) { if (r) { showErrors(r); } renderS04(); return; }
    input.value = '';
    resetSlot('name');
    showToastText(MSG.CAT_ADD_OK);
    renderS04();
  }

  /* 내보내기 — INT-10 */

  function onExport() {
    if (!lock('export')) { toast('E-601'); return; }
    var b = JR.io.buildExport();
    if (!b || !b.ok) {
      unlock('export');
      if (b) { show(b.code, dataOf(b).params); }
      renderS04();
      return;
    }
    var d = JR.io.download(b.data.json, b.data.filename);
    var section = $('jr-export-fallback');
    section.removeAttribute('hidden');            /* ① hidden 해제 → ② 내용 삽입 (§5-2) */
    if (d && d.ok) {
      $('jr-export-notice').textContent = EXPORT_NOTICE_OK;
      $('jr-export-text').value = b.data.json;
      showToastText(MSG.EXPORT_OK);
    } else {
      $('jr-export-notice').textContent = EXPORT_NOTICE_FAIL;
      $('jr-export-text').value = (d && d.data && d.data.text) ? d.data.text : b.data.json;
      if (d) { show(d.code, dataOf(d).params); }
    }
    unlock('export');
    renderS04();
  }

  /* 가져오기 — INT-13 · INT-32 */

  function onImportClick() {
    var input = $('jr-import-file');
    input.value = '';
    input.click();
  }

  function onImportFile() {
    var input = $('jr-import-file');
    if (!input.files || !input.files.length) { return; }
    if (!lock('import')) { toast('E-601'); return; }
    renderS04();
    JR.io.readFile(input.files[0], function (r) {
      if (!r || !r.ok) {
        unlock('import');
        if (r) { show(r.code, dataOf(r).params); }
        renderS04();
        return;
      }
      var p = JR.io.parseImport(r.data.text);
      if (!p || !p.ok) {
        unlock('import');
        if (p) { show(p.code, dataOf(p).params); }
        renderS04();
        return;
      }
      askImport(p.data.payload, p.data.summary);
    });
  }

  function askImport(payload, summary) {
    openDialog({
      title: '가져오기를 진행하면 현재 기기에 저장된 기록 ' + String(summary.currentExpenseCount) +
             '건과 카테고리 ' + String(summary.currentCategoryCount) +
             '개가 모두 사라지고, 선택한 파일의 데이터로 바뀝니다. 이 작업은 되돌릴 수 없습니다.',
      left: '취소',
      right: '가져오기',
      rightVariant: 'danger',
      keepOpen: true,
      onLeft: function () { unlock('import'); renderS04(); },
      onRight: function (node, rightBtn) {
        rightBtn.textContent = '가져오는 중…';
        rightBtn.disabled = true;
        var r = JR.io.applyImport(payload);
        closeDialog();
        unlock('import');
        if (!r || !r.ok) {
          if (r) { show(r.code, dataOf(r).params); }
          renderS04();
          return;
        }
        var rejected = dataOf(r).rejectedCount || 0;
        if (rejected > 0) { show('E-409', { count: rejected }); }
        else { showToastText(MSG.IMPORT_OK); }
        syncMonthFromSettings();
        goScreen('s01');
      }
    });
  }

  /* 전체 삭제 */

  function onWipe() {
    openDialog({
      title: '모든 기록과 카테고리를 삭제할까요? 삭제하면 되돌릴 수 없습니다.',
      left: '취소',
      right: '다음',
      rightVariant: 'primary',
      onRight: function () {
        openDialog({
          title: '정말 삭제할까요? 마지막 확인입니다. 삭제 후에는 어떤 방법으로도 복구할 수 없습니다.',
          left: '취소',
          right: '모두 삭제',
          rightVariant: 'danger',
          onRight: function () {
            if (!lock('wipe')) { toast('E-601'); return; }
            var r = JR.model.wipeAll();
            unlock('wipe');
            if (!r || !r.ok) { if (r) { show(r.code, dataOf(r).params); } return; }
            showToastText(MSG.WIPE_OK);
            syncMonthFromSettings();
            goScreen('s01');
          }
        });
      }
    });
  }

  /* ──────────────────────────── 이벤트 바인딩 ──────────────────────────── */

  function bind() {
    $('jr-s01-prev').addEventListener('click', function () { shiftMonth(-1); });
    $('jr-s01-next').addEventListener('click', function () { shiftMonth(1); });
    $('jr-s03-prev').addEventListener('click', function () { shiftMonth(-1); });
    $('jr-s03-next').addEventListener('click', function () { shiftMonth(1); });
    $('jr-s01-add').addEventListener('click', openAdd);

    var tabs = $('jr-tabbar').querySelectorAll('.jr-tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var target = btn.getAttribute('data-screen');
          if (target === state.screen) { return; }
          goScreen(target);
        });
      })(tabs[i]);
    }

    /* S-02 */
    $('jr-s02-cancel').addEventListener('click', function () { confirmLeave(false); });
    $('jr-s02-save').addEventListener('click', onSave);

    var date = $('jr-date');
    date.addEventListener('input', function () { updateSaveEnabled(); });
    date.addEventListener('change', function () { updateSaveEnabled(); saveDraft(); });
    date.addEventListener('blur', saveDraft);

    var amount = $('jr-amount');
    amount.addEventListener('input', function () {          /* INT-20 */
      var digits = amount.value.replace(/[^0-9]/g, '');
      amount.value = groupDigits(digits);
      if (amount.setSelectionRange) {
        try { amount.setSelectionRange(amount.value.length, amount.value.length); }
        catch (err) { if (JR.err && JR.err.log) { JR.err.log('E-501', err); } }
      }
      updateSaveEnabled();
    });
    amount.addEventListener('change', saveDraft);
    amount.addEventListener('blur', saveDraft);

    var memo = $('jr-memo');
    memo.addEventListener('input', function () {
      if (countChars(memo.value) > 100) { memo.value = truncateChars(memo.value, 100); }
      updateMemoCounter();
    });
    memo.addEventListener('change', saveDraft);
    memo.addEventListener('blur', saveDraft);

    var group = $('jr-cat-group');
    group.addEventListener('click', function (ev) {
      var chip = ev.target.closest ? ev.target.closest('.jr-chip') : null;
      if (!chip) { return; }
      selectChip(chip.getAttribute('data-id'));
      chip.focus();
    });
    group.addEventListener('keydown', function (ev) {
      var chips = group.querySelectorAll('.jr-chip');
      if (!chips.length) { return; }
      var idx = -1;
      for (var k = 0; k < chips.length; k++) { if (chips[k] === document.activeElement) { idx = k; } }
      if (idx === -1) { return; }
      var next = -1;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') { next = (idx + 1) % chips.length; }
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { next = (idx - 1 + chips.length) % chips.length; }
      else if (ev.key === 'Home') { next = 0; }
      else if (ev.key === 'End') { next = chips.length - 1; }
      if (next === -1) { return; }
      ev.preventDefault();
      selectChip(chips[next].getAttribute('data-id'));
      var fresh = group.querySelectorAll('.jr-chip');
      if (fresh[next]) { fresh[next].focus(); }
    });

    /* S-04 */
    var newInput = $('jr-cat-new');
    newInput.addEventListener('input', function () { state.nameSlot = 'new'; renderS04(); });
    newInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !$('jr-s04-cat-add').disabled) { ev.preventDefault(); onAddCategory(); }
    });
    $('jr-s04-cat-add').addEventListener('click', onAddCategory);
    $('jr-s04-export').addEventListener('click', onExport);
    $('jr-export-selectall').addEventListener('click', function () {
      var ta = $('jr-export-text');
      ta.focus();
      ta.select();
    });
    $('jr-s04-import').addEventListener('click', onImportClick);
    $('jr-import-file').addEventListener('change', onImportFile);
    $('jr-s04-wipe').addEventListener('click', onWipe);

    /* 뒤로가기 — 화면설계 「뒤로가기 규칙」 */
    window.addEventListener('popstate', function () {
      if (dialogNode) { if (dialogLeftAction) { dialogLeftAction(); } return; }
      if (state.screen === 's02') { state.historyPushed = false; confirmLeave(true); }
    });

    /* 초안 저장 시점 3·4 (§6-6). boot.js 는 DOM 을 만지지 않으므로 폼 값은 여기서 저장합니다 */
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') { saveDraft(); }
      });
    }
    window.addEventListener('pagehide', saveDraft);
  }

  /* ──────────────────────────── 초기화 ──────────────────────────── */

  function syncMonthFromSettings() {
    var s = dataOf(JR.model.getSettings()).settings || {};
    var range = JR.model.monthRange();
    var m = s.selectedMonth || range.max;
    if (m < range.min) { m = range.min; }
    if (m > range.max) { m = range.max; }
    state.month = m;
  }

  function init(bootState) {
    bootState = bootState || {};
    state.readOnly = !!bootState.readOnly;
    state.importSupported = (typeof window.FileReader === 'function');

    syncMonthFromSettings();
    resetSlot('date');
    resetSlot('amount');
    $('jr-amount-hint').textContent = AMOUNT_HINT;
    $('jr-cat-empty').textContent = CAT_EMPTY_S02;

    bind();

    if (JR.model.subscribe) {
      JR.model.subscribe(function () {
        syncMonthFromSettings();
        render();
      });
    }

    state.booted = true;
    goScreen('s01');
  }

  return {
    init: init,
    show: show,
    showErrors: showErrors,
    toast: toast,
    toastText: showToastText,
    inline: inline,
    banner: banner,
    dismissBanner: dismissBanner,
    lock: lock,
    unlock: unlock,
    MSG: MSG,
    TOAST_MS: TOAST_MS
  };
})();
