/* ④ 개발본부 2회차 — 재현 스크립트 공용 헬퍼
 * 작성: tech-lead · 2026-08-26
 * 기존 verify/ 19개 스크립트와 qa-*.cjs 는 한 줄도 건드리지 않습니다. 이 파일은 신규입니다.
 */
const PW = '/opt/node22/lib/node_modules/playwright';
const { chromium } = require(PW);
const APP = 'file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';

function reporter(title) {
  let P = 0, F = 0; const L = [];
  return {
    ok(cond, name, detail) {
      if (cond) { P++; L.push('PASS      | ' + name + ' | ' + detail); }
      else { F++; L.push('**FAIL**  | ' + name + ' | ' + detail); }
    },
    note(text) { L.push('note      | ' + text); },
    finish() {
      console.log('=== ' + title + ' ===');
      L.forEach(l => console.log(l));
      console.log('PASS=' + P + ' FAIL=' + F);
      return F;
    }
  };
}

async function launch() { return chromium.launch(); }

/* 새 컨텍스트(=빈 localStorage)에서 앱을 띄우고 콘솔/페이지 오류를 모읍니다 */
async function freshPage(browser) {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await pg.goto(APP);
  await pg.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
  pg.__errs = errs;
  return pg;
}

/* 같은 컨텍스트(=localStorage 유지)에서 재부팅 */
async function reboot(pg) {
  await pg.reload();
  await pg.waitForFunction(() => window.JR && JR.model && JR.model.isReady && JR.model.isReady());
  return pg;
}

const MK = "var mk=function(o){return Object.assign({id:'x'+Math.random().toString(36).slice(2),date:'2026-08-10',amount:1000,categoryId:cid,memo:'',createdAt:1754870400000},o)};";

/* 내보내기 파일을 뜯어 고친 뒤 가져오기 — ⑤ qa-lead-s2b.cjs 와 같은 방식 */
async function importMutated(pg, mutSrc) {
  return pg.evaluate((src) => {
    const f = JSON.parse(JR.io.buildExport().data.json);
    (new Function('f', 'cid', src))(f, f.data.categories[0].id);
    const pr = JR.io.parseImport(JSON.stringify(f));
    const ap = pr.ok ? JR.io.applyImport(pr.data.payload) : null;
    return {
      parsed: pr.ok, parseCode: pr.ok ? null : pr.code, applied: !!(ap && ap.ok),
      rejectedCount: pr.ok ? pr.data.payload.rejectedCount : -1,
      expenses: JR.model.getExpenses().data.items.map(e => ({ id: e.id, date: e.date, memoLen: e.memo.length, categoryId: e.categoryId, amount: e.amount })),
      cats: JR.model.getCategories().data.items.map(c => c.id + ':' + c.name)
    };
  }, mutSrc);
}

module.exports = { PW, APP, chromium, reporter, launch, freshPage, reboot, importMutated, MK };
