(async()=>{
const { chromium, firefox } = require('/opt/node22/lib/node_modules/playwright');
const APP='file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html';
for(const [nm,eng] of [['Chromium',chromium],['Firefox',firefox]]){
 const b=await eng.launch();
 const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const p=await ctx.newPage(); const errs=[]; const warns=[];
 p.on('pageerror',e=>errs.push('PAGEERROR: '+e));
 p.on('console',m=>{if(m.type()==='error')errs.push('error: '+m.text()); if(m.type()==='warning')warns.push(m.text())});
 p.on('requestfailed',r=>errs.push('REQFAIL: '+r.url()));
 const net=[]; p.on('request',r=>{if(!r.url().startsWith('file://')&&!r.url().startsWith('data:'))net.push(r.url())});
 await p.goto(APP); await p.waitForTimeout(600);
 const tab=async n=>{await p.click(`#jr-tabbar button:nth-of-type(${n})`);await p.waitForTimeout(180)};
 // 전 화면 왕복 3회
 for(let i=0;i<3;i++){await tab(1);await tab(2);await tab(3);}
 await tab(1);
 await tab(1);
 // 기록 12건 추가
 for(let i=0;i<12;i++){
   await tab(1); await p.click('#jr-s01-add'); await p.waitForTimeout(150);
   await p.fill('#jr-amount',String((i+1)*1370));
   await p.click(`#jr-cat-group button:nth-of-type(${(i%8)+1})`);
   await p.fill('#jr-memo','항목 '+i+' 이모지🍜 포함');
   await p.click('#jr-s02-save'); await p.waitForTimeout(200);
 }
 // 검증 오류 유발 (저장 버튼은 필수값이 차야 활성 — 카테고리 먼저 선택)
 await tab(1); await p.click('#jr-s01-add'); await p.waitForTimeout(200);
 await p.click('#jr-cat-group button:nth-of-type(1)'); await p.waitForTimeout(100);
 for(const bad of ['abc','-5','1.5','9999999999','0','  ']){
   if(await p.evaluate(()=>document.body.getAttribute('data-screen'))!=='s02'){
     await tab(1); await p.click('#jr-s01-add'); await p.waitForTimeout(200);
     await p.click('#jr-cat-group button:nth-of-type(1)'); await p.waitForTimeout(100);
   }
   await p.fill('#jr-amount',bad); await p.waitForTimeout(120);
   if(await p.isEnabled('#jr-s02-save')){ await p.click('#jr-s02-save'); await p.waitForTimeout(220); }
   const sc=await p.evaluate(()=>document.body.getAttribute('data-screen'));
   console.log('    금액 "'+bad+'" -> 화면 '+sc+(sc==='s01'?' (저장됨!)':' (거부됨)'));
 }
   if(await p.evaluate(()=>document.body.getAttribute('data-screen'))!=='s02'){
     await tab(1); await p.click('#jr-s01-add'); await p.waitForTimeout(200);
     await p.click('#jr-cat-group button:nth-of-type(1)'); await p.waitForTimeout(100);
   }
 await p.fill('#jr-amount','3000');
 await p.fill('#jr-memo','가'.repeat(150)); await p.waitForTimeout(200);
 await p.fill('#jr-date','1990-01-01'); await p.waitForTimeout(150);
 if(await p.isEnabled('#jr-s02-save')){ await p.click('#jr-s02-save'); await p.waitForTimeout(250); }
 await p.fill('#jr-date','2099-01-01'); await p.waitForTimeout(150);
 if(await p.isEnabled('#jr-s02-save')){ await p.click('#jr-s02-save'); await p.waitForTimeout(250); }
 await p.screenshot({path:'shots/60-'+nm+'-validation.png'});
 await p.click('#jr-s02-cancel'); await p.waitForTimeout(300);
 await p.evaluate(()=>{const bs=[...document.querySelectorAll('#jr-dialog-overlay button')];if(bs.length)(bs.find(x=>/나가기/.test(x.textContent))||bs[0]).click()});
 await p.waitForTimeout(300);
 // 월 이동 왕복
 for(let i=0;i<6;i++){await p.click('#jr-s01-prev');await p.waitForTimeout(120);}
 for(let i=0;i<6;i++){await p.click('#jr-s01-next');await p.waitForTimeout(120);}
 // 통계
 await tab(2); await p.waitForTimeout(300);
 await p.screenshot({path:'shots/61-'+nm+'-stats.png'});
 // 카테고리 추가/이름변경/삭제
 await tab(3); await p.waitForTimeout(200);
 await p.fill('#jr-cat-new','새분류'); await p.click('#jr-s04-cat-add'); await p.waitForTimeout(300);
 await p.click('#jr-s04-cat-list [data-act="rename"]'); await p.waitForTimeout(250);
 await p.fill('#jr-cat-edit-input','바뀐이름'); await p.click('#jr-s04-cat-list [data-act="confirm"]'); await p.waitForTimeout(300);
 await p.click('#jr-s04-cat-list [data-act="delete"]'); await p.waitForTimeout(300);
 await p.evaluate(()=>{const bs=[...document.querySelectorAll('#jr-dialog-overlay button')];if(bs.length)(bs.find(x=>/삭제/.test(x.textContent))||bs[bs.length-1]).click()});
 await p.waitForTimeout(300);
 // 키보드 조작
 for(let i=0;i<25;i++){await p.keyboard.press('Tab');}
 await p.keyboard.press('Enter'); await p.waitForTimeout(300);
 await p.keyboard.press('Escape'); await p.waitForTimeout(200);
 // 새로고침 3회
 for(let i=0;i<3;i++){await p.reload();await p.waitForTimeout(400);}
 await p.screenshot({path:'shots/62-'+nm+'-final.png'});
 const final=await p.evaluate(()=>({e:JR.model.getExpenses().data.items.length,c:JR.model.getCategories().data.items.length,screen:document.body.getAttribute('data-screen')}));
 console.log('=== '+nm+' 종합 스윕 ===');
 console.log('  최종 상태:',JSON.stringify(final));
 console.log('  외부 네트워크 요청:',net.length, net.slice(0,3));
 console.log('  콘솔 에러:',errs.length); errs.slice(0,8).forEach(e=>console.log('    ',e));
 console.log('  콘솔 경고:',warns.length); warns.slice(0,5).forEach(e=>console.log('    ',e));
 await b.close();
}
})();
