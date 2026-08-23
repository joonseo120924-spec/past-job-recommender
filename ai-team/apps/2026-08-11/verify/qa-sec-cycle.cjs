/* QA(보안) — 사이클 러너.
 * 1 사이클 = 보안 담당 범위 전체를 깨끗한 브라우저 컨텍스트에서 처음부터 끝까지 1회 통과.
 * (각 하위 스크립트는 자기 브라우저를 새로 띄우므로 컨텍스트는 매번 깨끗하다)
 * 사용: node verify/qa-sec-cycle.cjs <사이클번호> <engine>
 */
const { execFileSync } = require('child_process');
const path = require('path');
const V = __dirname;
const N = process.argv[2] || '?';
const ENGINE = process.argv[3] || 'chromium';
const SUITES = ['qa-sec-net', 'qa-sec-net2', 'qa-sec-xss', 'qa-sec-proto',
                'qa-sec-integrity', 'qa-sec-import', 'qa-sec-field', 'qa-sec-store',
                'qa-sec-wipe', 'qa-sec-global'];
const t0 = Date.now();
let pass = 0, fail = 0, consoleErr = 0, netFail = 0;
const failLines = [];
for (const s of SUITES) {
  let out = '';
  try { out = execFileSync(process.execPath, [path.join(V, s + '.cjs'), ENGINE], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 600000 }); }
  catch (e) { out = (e.stdout || '') + '\nSUITE-CRASH ' + s + ' ' + String(e.message).slice(0, 200); failLines.push('SUITE-CRASH ' + s); fail++; }
  out.split('\n').forEach(l => {
    if (/^PASS \|/.test(l)) pass++;
    else if (/^\*\*FAIL\*\* \|/.test(l)) { fail++; failLines.push(s + ' :: ' + l.replace(/^\*\*FAIL\*\* \| /, '').slice(0, 130)); }
    else if (/^RESULT FAIL/.test(l)) { netFail++; failLines.push(s + ' :: ' + l.slice(0, 130)); }
    const m = l.match(/^콘솔에러[^:]*:\s*(\d+)/);
    if (m) consoleErr += parseInt(m[1], 10);
  });
}
const secs = Math.round((Date.now() - t0) / 1000);
console.log('사이클 ' + N + ' | ' + new Date().toISOString() + ' | ' + ENGINE +
  ' | PASS ' + pass + ' | FAIL ' + (fail + netFail) + ' | 콘솔에러 ' + consoleErr + ' | ' + secs + 's');
failLines.forEach(l => console.log('    - ' + l));
