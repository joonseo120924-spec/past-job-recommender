(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const b=await chromium.launch(); const p=await (await b.newContext()).newPage();
await p.goto('file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html');
await p.waitForTimeout(500);
console.log(await p.evaluate(()=>{
  const r={};
  r.first  = JR.ui.lock('save');    // 최초 획득 -> true 여야 함
  r.second = JR.ui.lock('save');    // 이미 잠김 -> false 여야 함
  JR.ui.unlock('save');
  r.afterUnlock = JR.ui.lock('save');
  JR.ui.unlock('save');
  r.keys = ['save','delete','export','import','wipe','category-add'].map(k=>{
     const a=JR.ui.lock(k); JR.ui.unlock(k); return k+'='+a;
  });
  r.unknownKey = JR.ui.lock('nonexistent-key');
  return r;
}));
await b.close();
})();
