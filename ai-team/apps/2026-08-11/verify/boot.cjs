(async()=>{
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();
const logs=[];
p.on('console',m=>logs.push({type:m.type(),text:m.text()}));
p.on('pageerror',e=>logs.push({type:'PAGEERROR',text:String(e)}));
p.on('requestfailed',r=>logs.push({type:'REQFAIL',text:r.url()}));
const reqs=[];
p.on('request',r=>reqs.push(r.url()));
await p.goto(APP);
await p.waitForTimeout(1200);
console.log('=== CONSOLE (all) ===');
logs.forEach(l=>console.log(l.type,'|',l.text));
console.log('errors:',logs.filter(l=>l.type==='error'||l.type==='PAGEERROR').length);
console.log('=== NON-FILE REQUESTS ===');
console.log(reqs.filter(u=>!u.startsWith('file://')&&!u.startsWith('data:')));
console.log('=== BOOT STATE ===');
console.log(await p.evaluate(()=>({
  JR: Object.keys(window.JR||{}),
  globals: Object.getOwnPropertyNames(window).filter(k=>/^(JR|jr|app|App)/.test(k)),
  unsupported: !!document.getElementById('jr-unsupported'),
  loading: !!document.getElementById('jr-loading'),
  screen: document.body.getAttribute('data-screen'),
  mode: JR.store.mode(),
  ready: JR.model.isReady(),
  title: document.title
})));
await p.screenshot({path:'shots/01-boot.png'});
await b.close();


})();