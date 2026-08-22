/* 한달정리 — JR.err
 * E-코드 문구·슬롯 단일 출처.
 * 정본: docs/기획-구조설계.md §5-7 · §7 표 (63개)
 *     + docs/기획서.md INT-27 (E-413 신설) = 64개
 *     + INT-32 (E-413 슬롯 T -> B)
 *     + INT-33 (E-403 · E-121 · E-306 문구 단축)
 * 의존: 없음 (순수)
 */
var JR = JR || {};
JR.err = (function () {
  'use strict';

  /* slot 값
   *  'T' 토스트 · 'I' 인라인 · 'B' 배너 · 'S' 정적 HTML(슬롯 밖 · E-001 전용)
   *  분포: T 33 · I 15 · B 15 · S 1 = 64  (기획서 §6 · INT-33 5항)
   */
  var MESSAGES = {

    /* ---- E-0xx 환경 (2) ---- */
    'E-001': { slot: 'S', field: null, msg: '이 브라우저에서는 앱을 사용할 수 없습니다. 크롬·엣지·사파리·파이어폭스의 최신 버전에서 열어 주세요.' },
    'E-002': { slot: 'B', field: null, msg: '이 브라우저에서는 파일 가져오기를 쓸 수 없어 해당 버튼을 꺼 두었습니다. 기록·통계·내보내기는 그대로 사용할 수 있습니다.' },

    /* ---- E-1xx 입력 검증 (25) ---- */
    'E-101': { slot: 'I', field: 'amount', msg: '금액을 입력해 주세요.' },
    'E-102': { slot: 'I', field: 'amount', msg: '금액은 숫자만 입력할 수 있습니다.' },
    'E-103': { slot: 'I', field: 'amount', msg: '금액은 1원부터 입력할 수 있습니다.' },
    'E-104': { slot: 'I', field: 'amount', msg: '금액은 999,999,999원까지 입력할 수 있습니다.' },
    'E-105': { slot: 'I', field: 'amount', msg: '금액은 원 단위로만 기록합니다. 소수점은 입력할 수 없습니다.' },
    'E-106': { slot: 'I', field: 'amount', msg: '금액을 숫자로 읽을 수 없습니다. 다시 입력해 주세요.' },
    'E-107': { slot: 'I', field: 'date', msg: '날짜 형식이 올바르지 않습니다. 2026-08-11 처럼 입력해 주세요.' },
    'E-108': { slot: 'I', field: 'date', msg: '날짜를 입력해 주세요.' },
    'E-109': { slot: 'I', field: 'date', msg: '달력에 없는 날짜입니다. 다시 선택해 주세요.' },
    'E-110': { slot: 'I', field: 'date', msg: '2000년 1월 1일부터 기록할 수 있습니다.' },
    'E-111': { slot: 'I', field: 'date', msg: '{max} 이후 날짜는 기록할 수 없습니다. 오늘부터 1년 뒤까지 입력할 수 있습니다.' },
    'E-112': { slot: 'I', field: 'categoryId', msg: '카테고리를 선택해 주세요.' },
    'E-113': { slot: 'T', field: 'categoryId', msg: '선택한 카테고리가 이미 삭제되었습니다. 다른 카테고리를 선택해 주세요.' },
    'E-114': { slot: 'I', field: 'name', msg: '카테고리 이름을 입력해 주세요.' },
    'E-115': { slot: 'I', field: 'name', msg: '카테고리 이름은 12자까지 쓸 수 있습니다.' },
    'E-116': { slot: 'I', field: 'name', msg: '\'{name}\' 과(와) 같은 이름의 카테고리가 이미 있습니다.' },
    'E-117': { slot: 'T', field: 'name', msg: '카테고리는 최대 20개까지 만들 수 있습니다. 쓰지 않는 카테고리를 삭제한 뒤 추가해 주세요.' },
    'E-118': { slot: 'T', field: null, msg: '카테고리는 최소 1개가 있어야 해서 삭제할 수 없습니다. 새 카테고리를 먼저 추가해 주세요.' },
    'E-119': { slot: 'T', field: null, msg: '이미 삭제된 기록입니다. 목록을 새로 불러왔습니다.' },
    'E-120': { slot: 'T', field: 'memo', msg: '메모는 100자까지 저장할 수 있습니다. {over}자를 줄여 주세요.' },
    /* INT-33 · 74자 -> 61자 · 문장 순서 교정(결과를 앞으로) */
    'E-121': { slot: 'T', field: 'memo', msg: '메모가 100자를 넘어 저장하지 못했습니다. 이모지는 보이는 것보다 글자 수가 많습니다. 메모를 줄여 주세요.' },
    'E-122': { slot: 'T', field: 'memo', msg: '메모에서 표시할 수 없는 문자를 지우고 저장했습니다.' },
    'E-123': { slot: 'T', field: 'memo', msg: '메모는 100자까지 입력할 수 있어 뒷부분을 잘랐습니다.' },
    'E-124': { slot: 'T', field: null, msg: '이미 삭제된 카테고리입니다. 목록을 새로 불러왔습니다.' },
    'E-125': { slot: 'T', field: null, msg: '볼 수 있는 기간을 벗어났습니다. 2000년 1월부터 오늘로부터 1년 뒤까지 이동할 수 있습니다.' },

    /* ---- E-2xx 저장소 (5) ---- */
    'E-201': { slot: 'B', field: null, msg: '이 브라우저에서는 저장 기능이 꺼져 있어 기록이 기기에 남지 않습니다. 창을 닫거나 새로고침하면 지금 입력한 내용은 사라집니다. 설정에서 내보내기로 파일을 저장해 두세요.' },
    'E-202': { slot: 'B', field: null, msg: '저장 공간이 가득 차 방금 입력한 내용을 저장하지 못했습니다. 이전 기록은 그대로 있습니다. 설정에서 내보내기로 백업한 뒤, 지난 기록을 정리하고 다시 시도해 주세요.' },
    'E-203': { slot: 'B', field: null, msg: '저장 공간을 {percent}% 썼습니다. 가득 차면 새 기록을 저장할 수 없습니다. 설정에서 내보내기로 백업해 두세요.' },
    'E-204': { slot: 'T', field: null, msg: '저장은 끝났지만 백업본을 만들지 못했습니다. 설정에서 내보내기로 파일을 저장해 두시기를 권합니다.' },
    'E-205': { slot: 'B', field: null, msg: '저장한 내용이 기기에 남지 않고 있습니다. 지금부터는 이번 세션에서만 기록되며, 새로고침하면 사라집니다. 설정에서 내보내기로 파일을 저장해 두세요.' },

    /* ---- E-3xx 데이터 손상 · 스키마 (9) ---- */
    'E-301': { slot: 'B', field: null, msg: '마지막 저장이 끝까지 완료되지 않아 백업본을 다시 만들었습니다. 기록은 그대로 있습니다.' },
    'E-302': { slot: 'B', field: null, msg: '이 브라우저에 다른 형식의 데이터가 있어 새로 시작합니다. 원래 내용은 지우지 않고 따로 보관해 두었습니다.' },
    'E-303': { slot: 'B', field: null, msg: '저장된 데이터 일부가 손상되어 백업본으로 되살렸습니다. 가장 최근에 입력한 기록이 빠졌을 수 있으니 목록을 확인해 주세요.' },
    'E-304': { slot: 'B', field: null, msg: '저장된 기록 가운데 {count}건을 읽을 수 없어 제외했습니다. 나머지 기록과 금액은 그대로입니다.' },
    'E-305': { slot: 'B', field: null, msg: '카테고리 정보를 읽을 수 없어 기본 카테고리 8개로 되돌렸습니다. 기록과 금액은 그대로이며, 예전 카테고리를 쓰던 기록은 \'미분류(삭제된 카테고리)\'로 표시됩니다.' },
    /* INT-33 · 35자 -> 29자 */
    'E-306': { slot: 'T', field: null, msg: '카테고리 순서가 어긋나 이름순으로 다시 정리했습니다.' },
    'E-307': { slot: 'B', field: null, msg: '이 데이터는 더 최신 버전의 앱에서 만들어졌습니다. 내용을 잘못 덮어쓰지 않도록 읽기와 저장을 모두 멈췄습니다. 최신 버전에서 열어 주세요.' },
    'E-308': { slot: 'T', field: null, msg: '손상된 데이터를 따로 보관하지 못했습니다. 복구 자체는 정상으로 끝났습니다.' },
    'E-309': { slot: 'T', field: null, msg: '화면 설정을 읽을 수 없어 이번 달 기준으로 되돌렸습니다.' },

    /* ---- E-4xx 내보내기 · 가져오기 (13) ---- */
    'E-401': { slot: 'T', field: null, msg: '이 환경에서는 파일로 저장할 수 없습니다. 화면에 나온 내용을 복사해 보관해 주세요.' },
    'E-402': { slot: 'T', field: null, msg: '내보낼 파일을 만들지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.' },
    /* INT-33 · 77자 -> 64자 */
    'E-403': { slot: 'T', field: null, msg: '파일을 읽지 못했습니다. 파일이 열려 있거나 접근이 막혀 있을 수 있습니다. 다른 위치에 복사한 뒤 선택해 주세요.' },
    'E-404': { slot: 'T', field: null, msg: '이 파일은 읽을 수 있는 형식이 아닙니다. 내보내기로 만든 .json 파일을 선택해 주세요.' },
    'E-405': { slot: 'T', field: null, msg: '이 앱에서 내보낸 파일이 아닙니다. 지금 기록은 그대로 두었습니다.' },
    'E-406': { slot: 'T', field: null, msg: '더 최신 버전에서 내보낸 파일이라 가져올 수 없습니다. 지금 기록은 그대로 두었습니다.' },
    'E-407': { slot: 'T', field: null, msg: '파일 내용이 손상되어 가져올 수 없습니다. 지금 기록은 그대로 두었습니다.' },
    'E-408': { slot: 'T', field: null, msg: '파일이 너무 커서 가져올 수 없습니다. 이 앱에서 내보낸 파일이 맞는지 확인해 주세요.' },
    'E-409': { slot: 'T', field: null, msg: '가져오기를 완료했습니다. 읽을 수 없는 {count}건은 제외했습니다.' },
    'E-410': { slot: 'B', field: null, msg: '가져오기에 실패해 이전 데이터로 되돌렸습니다. 기록은 가져오기 전 상태 그대로입니다.' },
    'E-411': { slot: 'B', field: null, msg: '가져오기가 도중에 멈춰 데이터가 일부만 바뀌었습니다. 화면을 새로고침하면 되돌리기를 한 번 더 시도합니다.' },
    'E-412': { slot: 'T', field: null, msg: '이 브라우저에서는 파일 가져오기를 지원하지 않습니다.' },
    /* INT-27 신설 · INT-32 로 슬롯 T -> B(사건형) · 문구 변경 없음 */
    'E-413': { slot: 'B', field: null, msg: '저장 공간이 부족해 이 파일을 가져올 수 없습니다. 지금 기록은 그대로 있습니다. 설정에서 내보내기로 백업한 뒤 오래된 기록을 정리하고 다시 시도해 주세요.' },

    /* ---- E-5xx 내부 오류 (4) ---- */
    'E-501': { slot: 'T', field: null, msg: '처리 중 문제가 생겨 작업을 취소했습니다. 기록은 바뀌지 않았습니다.' },
    'E-502': { slot: 'T', field: null, msg: '요청을 처리할 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.' },
    'E-507': { slot: 'T', field: null, msg: '기록 번호를 만들지 못해 저장을 멈췄습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.' },
    'E-599': { slot: 'T', field: null, msg: '알 수 없는 문제가 발생했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.' },

    /* ---- E-6xx 세션 · 상호작용 (6) ---- */
    'E-601': { slot: 'T', field: null, msg: '저장을 처리하고 있습니다. 잠시만 기다려 주세요.' },
    'E-602': { slot: 'T', field: null, msg: '작성 중이던 내용을 다시 불러왔습니다.' },
    'E-603': { slot: 'T', field: null, msg: '작성 중이던 내용이 하루가 지나 지워졌습니다. 새로 입력해 주세요.' },
    'E-604': { slot: 'B', field: null, msg: '앱이 화면에서 벗어나는 동안 작성 중이던 내용을 저장하지 못했습니다.' },
    'E-605': { slot: 'T', field: null, msg: '다른 창에서 기록이 바뀌어 화면을 새로 불러왔습니다.' },
    'E-606': { slot: 'T', field: null, msg: '작성 중인 내용이 자동으로 저장되지 않습니다. 저장 버튼을 눌러야 기록됩니다.' }
  };

  /* 배너 종류 — 구조설계 §7-8
   * 'state'  상태형: 닫아도 화면을 옮기면 다시 나타남. dismissedNotices 에 기록하지 않음
   * 'event'  사건형: 닫으면 이 세션 동안 다시 나타나지 않음. dismissedNotices 에 기록
   * 'block'  차단형: 닫기 버튼을 만들지 않음
   */
  var BANNER_KIND = {
    'E-002': 'state', 'E-201': 'state', 'E-202': 'state', 'E-205': 'state',
    'E-203': 'event', 'E-301': 'event', 'E-302': 'event', 'E-303': 'event',
    'E-304': 'event', 'E-305': 'event', 'E-410': 'event', 'E-413': 'event',
    'E-604': 'event',
    'E-307': 'block', 'E-411': 'block'
  };

  /* 배너 표시 우선순위 — 구조설계 §7-8 + INT-32(E-413 을 E-410 과 E-302 사이) */
  var BANNER_PRIORITY = [
    'E-307', 'E-411', 'E-202', 'E-205', 'E-201', 'E-303', 'E-305', 'E-304',
    'E-410', 'E-413', 'E-302', 'E-301', 'E-604', 'E-203', 'E-002'
  ];

  function format(tpl, params) {
    if (typeof tpl !== 'string') { return ''; }
    var p = (params && typeof params === 'object') ? params : {};
    return tpl.replace(/\{([A-Za-z0-9_]+)\}/g, function (whole, key) {
      var v = p[key];
      if (v === undefined || v === null) { return ''; }
      return String(v);
    });
  }

  function get(code, params) {
    var entry = (typeof code === 'string' && Object.prototype.hasOwnProperty.call(MESSAGES, code))
      ? MESSAGES[code] : null;
    if (!entry) {
      var fb = MESSAGES['E-599'];
      return {
        code: (typeof code === 'string' ? code : 'E-599'),
        msg: fb.msg,
        slot: fb.slot,
        field: fb.field
      };
    }
    return {
      code: code,
      msg: format(entry.msg, params),
      slot: entry.slot,
      field: entry.field
    };
  }

  /* 반환은 'T' | 'I' | 'B'.
   * E-001 은 슬롯 밖(정적 HTML)이므로 런타임 표시 경로에서는 'T' 로 흡수한다.
   * 표에 없는 코드도 'T'. (구조설계 §5-7)
   */
  function slot(code) {
    if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(MESSAGES, code)) {
      var s = MESSAGES[code].slot;
      if (s === 'I' || s === 'B') { return s; }
      return 'T';
    }
    return 'T';
  }

  function ok(data) {
    return { ok: true, data: (data && typeof data === 'object') ? data : {} };
  }

  function fail(code, data) {
    return { ok: false, code: code, data: (data && typeof data === 'object') ? data : {} };
  }

  function log(code, detail) {
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
      console.warn('[JR]', code, detail);
    }
  }

  return {
    MESSAGES: MESSAGES,
    BANNER_KIND: BANNER_KIND,
    BANNER_PRIORITY: BANNER_PRIORITY,
    get: get,
    slot: slot,
    format: format,
    ok: ok,
    fail: fail,
    log: log
  };
})();
