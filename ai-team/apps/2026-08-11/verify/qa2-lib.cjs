/* ⑤ 품질본부 파트장 — 되돌림 2회차 재시험 공용 헬퍼 (신규 · ④ 의 dev2-lib.cjs 를 쓰지 않습니다)
 * 작성: qa-lead · 2026-08-27
 * 엔진과 대상 경로를 환경변수로 받습니다 — 같은 단언을 3엔진 · 기준선/조치후 양쪽에 돌리기 위함입니다.
 *   QA2_ENGINE = chromium | firefox | webkit   (기본 chromium)
 *   QA2_APP    = file:///... index.html        (기본 = 현재 src)
 */
const PW = '/opt/node22/lib/node_modules/playwright';
const pw = require(PW);

const ENGINE = process.env.QA2_ENGINE || 'chromium';
const APP = process.env.QA2_APP ||
  'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const TAG = process.env.QA2_TAG || '';

function reporter(title) {
  let P = 0, F = 0, U = 0; const L = [];
  return {
    ok(cond, name, detail) {
      if (cond) { P++; L.push('PASS   | ' + name + ' | ' + (detail === undefined ? '' : detail)); }
      else { F++; L.push('**FAIL** | ' + name + ' | ' + (detail === undefined ? '' : detail)); }
    },
    /* 측정 자체가 불가능한 경우 — PASS 로도 FAIL 로도 세지 않습니다 */
    unknown(name, reason) { U++; L.push('확인불가 | ' + name + ' | 사유: ' + reason); },
    note(t) { L.push('note   | ' + t); },
    finish() {
      console.log('=== ' + title + ' [' + ENGINE + '] ' + TAG + ' ===');
      L.forEach(l => console.log(l));
      console.log('PASS=' + P + ' FAIL=' + F + ' UNKNOWN=' + U);
      return F;
    }
  };
}

async function launch() { return pw[ENGINE].launch(); }

async function fresh(browser) {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await pg.goto(APP);
  await pg.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
  pg.__errs = errs; pg.__ctx = ctx;
  return pg;
}

async function reboot(pg) {
  await pg.reload();
  await pg.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
  return pg;
}

/* localStorage 전 키 원문 덤프 — 잔존물 판정의 근거 */
const dumpAll = pg => pg.evaluate(() => {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
  return o;
});

/* 화면에 실제로 그려진 총합 문자열에서 숫자만 뽑습니다 — "66,000원" → "66000" */
const digits = s => String(s === null || s === undefined ? '' : s).replace(/[^0-9]/g, '');

/* 내보내기 JSON 을 뜯어 고쳐 가져오기 — ⑤ 가 지난 회차에 쓴 방식과 같습니다 */
async function importMutated(pg, src) {
  return pg.evaluate((s) => {
    const f = JSON.parse(JR.io.buildExport().data.json);
    const cid = f.data.categories[0].id;
    (new Function('f', 'cid', s))(f, cid);
    /* counts 는 내보내기 형식의 자기 정합 필드입니다 — 시험 대상이 아니므로 변형 뒤 맞춰 줍니다
     * (맞추지 않으면 io.js:269 counts 불일치로 E-407 이 나서 정작 보려는 검증에 닿지 못합니다) */
    f.counts = { expenses: f.data.expenses.length, categories: f.data.categories.length };
    const pr = JR.io.parseImport(JSON.stringify(f));
    const ap = pr.ok ? JR.io.applyImport(pr.data.payload) : null;
    return {
      parsed: pr.ok, parseCode: pr.ok ? null : pr.code,
      applied: !!(ap && ap.ok), applyCode: ap && !ap.ok ? ap.code : null,
      rejectedCount: pr.ok ? pr.data.payload.rejectedCount : -1,
      expenses: JR.model.getExpenses().data.items.map(e => ({ id: e.id, date: e.date, amount: e.amount, categoryId: e.categoryId, memoLen: JR.model.countChars(e.memo) })),
      cats: JR.model.getCategories().data.items.map(c => ({ id: c.id, name: c.name }))
    };
  }, src);
}

module.exports = { PW, pw, ENGINE, APP, TAG, reporter, launch, fresh, reboot, dumpAll, digits, importMutated };
