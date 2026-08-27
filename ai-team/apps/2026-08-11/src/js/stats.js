/* 한달정리 — JR.stats
 * 집계 · 최대잔여법 · 캐시.
 * 정본: docs/기획-구조설계.md §4-3 · §4-3-1 · §4-3-2 · §4-4 · §4-5 · §5-5
 *     + docs/기획서.md INT-07(__deleted__ 항상 마지막) · INT-30
 * 의존: JR.err · JR.model(읽기 전용 함수만).  JR.store · JR.io · JR.ui 호출 금지.
 */
var JR = JR || {};
JR.stats = (function () {
  'use strict';

  var E = JR.err;
  var DELETED_ID = '__deleted__';
  var DELETED_LABEL = '미분류(삭제된 카테고리)';

  var statsCache = Object.create(null);   /* INT-42 */

  function invalidate() {
    statsCache = Object.create(null);   /* INT-42 */
  }

  /* R-6 순수 함수 — §4-3 구현 그대로. 합이 항상 정확히 100 */
  function allocatePercents(amounts, total) {
    var n = (amounts && amounts.length) ? amounts.length : 0;
    var out = new Array(n), rem = [], i, floorSum = 0, exact;
    if (!total || total <= 0 || n === 0) {
      for (i = 0; i < n; i++) { out[i] = 0; }
      return out;
    }
    for (i = 0; i < n; i++) {
      exact = amounts[i] * 100 / total;
      out[i] = Math.floor(exact);
      floorSum += out[i];
      rem.push({ i: i, r: exact - out[i], a: amounts[i] });
    }
    var deficit = 100 - floorSum;
    rem.sort(function (x, y) {
      if (y.r !== x.r) { return y.r > x.r ? 1 : -1; }
      if (y.a !== x.a) { return y.a - x.a; }
      return x.i - y.i;
    });
    for (i = 0; i < deficit; i++) { out[rem[i].i] += 1; }
    return out;
  }

  /* R-6 순수 함수 — §4-5. 단위("원")를 붙이지 않는다 */
  function formatAmount(n) {
    if (typeof n !== 'number' || !isFinite(n)) { return '0'; }
    var neg = n < 0, s = String(Math.abs(Math.trunc(n))), out = '', i, c = 0;
    for (i = s.length - 1; i >= 0; i--) {
      out = s.charAt(i) + out;
      if (++c % 3 === 0 && i > 0) { out = ',' + out; }
    }
    return (neg ? '-' : '') + out;
  }

  /* §4-3-1 */
  function compareStatItem(a, b) {
    if (a.amount !== b.amount) { return b.amount - a.amount; }
    if (a.categoryName !== b.categoryName) { return a.categoryName < b.categoryName ? -1 : 1; }
    return a.categoryId < b.categoryId ? -1 : 1;
  }

  function monthTotal(yyyymm) {
    try {
      if (typeof yyyymm !== 'string') { return E.fail('E-502', {}); }
      var r = JR.model.listByMonth(yyyymm);
      if (!r.ok) { return E.ok({ total: 0, count: 0 }); }
      return E.ok({ total: r.data.total, count: r.data.count });
    } catch (e) {
      E.log('E-501', e);
      return E.fail('E-501', {});
    }
  }

  function byCategory(yyyymm) {
    try {
      if (typeof yyyymm !== 'string') { return E.fail('E-502', {}); }
      if (Object.prototype.hasOwnProperty.call(statsCache, yyyymm)) {
        return E.ok(statsCache[yyyymm]);
      }

      var r = JR.model.listByMonth(yyyymm);
      if (!r.ok) {
        return E.ok({ yyyymm: yyyymm, total: 0, count: 0, items: [] });
      }
      var list = r.data.items, total = r.data.total, count = r.data.count;
      if (total === 0 || list.length === 0) {
        var empty = { yyyymm: yyyymm, total: 0, count: 0, items: [] };
        statsCache[yyyymm] = empty;
        return E.ok(empty);
      }

      var mapR = JR.model.getCategoryMap();
      var map = (mapR.ok && mapR.data.map) ? mapR.data.map : {};

      /* INT-42 — buckets 를 평범한 객체로 두면 categoryId 가 '__proto__' 일 때
       * 세터를 타 프로토타입이 교체되고 버킷이 매 건 새로 만들어진다 */
      var buckets = Object.create(null), order = [], i, e, key, b;
      for (i = 0; i < list.length; i++) {
        e = list[i];
        key = Object.prototype.hasOwnProperty.call(map, e.categoryId) ? e.categoryId : DELETED_ID;
        if (!Object.prototype.hasOwnProperty.call(buckets, key)) {
          buckets[key] = { categoryId: key, amount: 0, count: 0 };
          order.push(key);
        }
        buckets[key].amount += e.amount;
        buckets[key].count += 1;
      }

      var normal = [], deleted = null;
      for (i = 0; i < order.length; i++) {
        b = buckets[order[i]];
        if (b.amount < 1) { continue; }              /* §4-3-2 손상 데이터 방어 */
        var item = {
          categoryId: b.categoryId,
          categoryName: (b.categoryId === DELETED_ID) ? DELETED_LABEL : map[b.categoryId].name,
          amount: b.amount,
          percent: 0,
          count: b.count,
          isDeletedCategory: (b.categoryId === DELETED_ID)
        };
        if (item.isDeletedCategory) { deleted = item; } else { normal.push(item); }
      }

      normal.sort(compareStatItem);
      var items = normal.slice();
      if (deleted) { items.push(deleted); }          /* INT-07 · 항상 마지막 */

      var amounts = [];
      for (i = 0; i < items.length; i++) { amounts.push(items[i].amount); }
      var pct = allocatePercents(amounts, total);
      for (i = 0; i < items.length; i++) { items[i].percent = pct[i]; }

      var result = { yyyymm: yyyymm, total: total, count: count, items: items };
      statsCache[yyyymm] = result;
      return E.ok(result);
    } catch (e2) {
      E.log('E-501', e2);
      return E.fail('E-501', {});
    }
  }

  return {
    monthTotal: monthTotal,
    byCategory: byCategory,
    allocatePercents: allocatePercents,
    formatAmount: formatAmount,
    invalidate: invalidate
  };
})();
