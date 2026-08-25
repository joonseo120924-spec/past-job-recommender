/* ⑤ 파트장 — 비-{ok} 전수 정적 감사. ok.cjs 를 쓰지 않고 새로 짠다.
   ok.cjs 의 사각(=ui 모듈이 열거 루프 밖)이 17→18 오류의 원인이므로 도구부터 바꾼다. */
const fs = require('fs');
const DIR = '/home/user/past-job-recommender/ai-team/apps/2026-08-11/src/js';
const MODS = ['err', 'store', 'model', 'stats', 'io', 'ui'];

function bodyOf(src, name) {
  const re = new RegExp('function\\s+' + name.replace(/\$/g, '\\$') + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index), depth = 0, start = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return { body: src.slice(start, i + 1), line: src.slice(0, m.index).split('\n').length }; }
  }
  return null;
}
/* 중첩 function 을 제거해 바깥 함수 자신의 return 만 남긴다 */
function stripNested(body) {
  let out = '', i = 0;
  while (i < body.length) {
    const j = body.indexOf('function', i);
    if (j < 0) { out += body.slice(i); break; }
    // 첫 여는 중괄호(=본체 시작)는 건너뛰지 않는다: 함수 선언의 본체만 잘라낸다
    if (j === 0) { out += body[i]; i++; continue; }
    out += body.slice(i, j);
    let k = body.indexOf('{', j);
    if (k < 0) { i = j + 8; continue; }
    let d = 0;
    for (; k < body.length; k++) { if (body[k] === '{') d++; else if (body[k] === '}') { d--; if (d === 0) break; } }
    i = k + 1;
  }
  return out;
}
const rows = [];
for (const mod of MODS) {
  const src = fs.readFileSync(DIR + '/' + mod + '.js', 'utf8');
  // 반환 객체(모듈 표면) 추출: 마지막 "return {" 블록
  const idx = src.lastIndexOf('return {');
  const block = src.slice(idx, src.indexOf('};', idx));
  const surface = [];
  block.replace(/^\s*([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*,?\s*$/gm, (_, key, val) => { surface.push([key, val]); return _; });
  for (const [key, impl] of surface) {
    const b = bodyOf(src, impl);
    if (!b) { rows.push({ fn: mod + '.' + key, kind: '상수/비함수', ret: '-', line: '-' }); continue; }
    const own = stripNested(b.body);
    const rets = (own.match(/\breturn\b[^;]*/g) || []).map(s => s.replace(/\s+/g, ' ').trim());
    const bare = rets.filter(r => /^return$/.test(r));
    const okish = rets.filter(r => /E\.ok\(|E\.fail\(|^return (r|w|res|out)$/.test(r));
    const other = rets.filter(r => !bare.includes(r) && !okish.includes(r));
    let kind;
    if (rets.length === 0) kind = '비-{ok} (반환문 없음 → undefined)';
    else if (bare.length > 0 && okish.length > 0) kind = '혼합 (일부 경로 undefined)';
    else if (okish.length === rets.length) kind = '{ok}';
    else kind = '비-{ok}';
    rows.push({ fn: mod + '.' + key, kind, ret: rets.slice(0, 4).join(' | ').slice(0, 110), line: mod + '.js:' + b.line });
  }
}
const non = rows.filter(r => /비-\{ok\}|혼합/.test(r.kind));
console.log('=== 정적 전수 감사 · 표면 함수 ' + rows.filter(r => r.kind !== '상수/비함수').length + '개 ===');
console.log('--- 비-{ok} 또는 혼합 ---');
non.forEach(r => console.log(String(r.fn).padEnd(26) + ' | ' + r.kind.padEnd(30) + ' | ' + r.line + ' | ' + r.ret));
console.log('\n비-{ok}/혼합 합계 = ' + non.length);
console.log('\n--- 상수(함수 아님) ---');
console.log(rows.filter(r => r.kind === '상수/비함수').map(r => r.fn).join(', '));
