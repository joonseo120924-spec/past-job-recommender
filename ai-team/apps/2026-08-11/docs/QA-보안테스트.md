# ⑤ 품질본부 — 보안 시험 보고서 (사이클 2)

작성: `security-tester` · 2026-08-23
코드 기준선: **커밋 `675840e`** (`src/` 9파일 4,435줄) — 시험 중 `src/` 변경 **0건** (`git diff --stat 675840e HEAD -- src/` 빈 출력으로 확인)
앱: `file:///home/user/past-job-recommender/ai-team/apps/2026-08-11/src/index.html`
환경: Node v22.22.2 · Playwright 1.56.1 · **Chromium · Firefox · WebKit 3종 실사용**
공통 기준선: `docs/QA-분배안.md` §3 전부 적용

> **이 보고서에는 「안전합니다」라는 문장이 없습니다.** 무엇을 어떤 페이로드로 넣었고 무엇이 나왔는지만 적습니다.
> 확인하지 못한 것은 §9 「확인 불가」에 사유와 함께 적었습니다.

---

## 0. 결론 — **품질 승인 불가**

| 심각도 | 건수 | 내역 |
|---|---|---|
| **S1 치명** | **2** | QA-S-001(삭제한 지출이 되살아남) · QA-S-002(사용자가 고르지 않은 기록이 삭제됨) |
| **S2 중대** | **3** | QA-S-003 · QA-S-004 · QA-S-005 |
| **S3 경미** | **2** | QA-S-006 · QA-S-007 |
| **S4 개선** | **1** | QA-S-008(CSP 부재) |

**분배안 §7 정의상 「남은 오류 0개」= S1·S2·S3 전부 0. 현재 7건이므로 반려입니다.**

**한편 아래는 실제로 주입해 본 결과 뚫리지 않았습니다** (말이 아니라 측정치입니다):

| 항목 | 시도 | 결과 |
|---|---|---|
| XSS 실행 | **37회 주입 × 3엔진 = 111회** | **실행 0건** (카나리아·alert·신규 위험 노드 전부 0) |
| `Object.prototype` 오염 | **12 케이스 + 부팅 6 케이스 × 3엔진** | **`({}).polluted` 오염 0건** |
| 외부 네트워크 요청 | 전 기능 흐름 × 3엔진 (요청 이벤트 + 인페이지 API 후킹 2채널) | **0건** |
| 기형·악성 가져오기 파일 | 30 케이스 × 3엔진 | **전건 거부 + 저장소 무접촉** |
| 하드코딩 비밀키·토큰 | 정적 + 런타임 | **0건** |
| 권한 요청 API | 정적 스캔 | **0건** (geolocation·카메라·알림·클립보드·결제 등 전무) |
| 콘솔 에러 · `pageerror` | 20 사이클 전체 | **0건** |

**핵심**: 이 앱의 보안 문제는 「밖에서 코드가 들어오는」 종류가 아니라 **「사용자 자기 데이터가 지워지지 않고 남거나, 엉뚱한 것이 지워지는」 종류**입니다. 지출 기록 앱에서는 이쪽이 더 무겁습니다.

---

## 1. 사이클 로그 — 20회

**1 사이클의 정의(분배안 §5)**: 담당 범위 전체를 **깨끗한 브라우저 컨텍스트**에서 처음부터 끝까지 1회 통과.
한 사이클 = 아래 10개 스크립트를 **순차 전건 실행**. 각 스크립트가 자기 브라우저를 새로 띄우므로 컨텍스트는 매번 새것이고 `localStorage` 도 비어 있습니다.

| 스크립트 | 담당 |
|---|---|
| `verify/qa-sec-net.cjs` | 네트워크 1차 계측 (Playwright `request`/`websocket` 이벤트) |
| `verify/qa-sec-net2.cjs` | 네트워크 2차 계측 (인페이지 API 후킹) |
| `verify/qa-sec-xss.cjs` | XSS 실주입 37종 (메모·카테고리명·가져오기 전 문자열 필드) |
| `verify/qa-sec-proto.cjs` | 프로토타입 오염 실측 |
| `verify/qa-sec-integrity.cjs` | 중복 id 결함의 UI 실영향 |
| `verify/qa-sec-import.cjs` | 가져오기 공격면 30종 |
| `verify/qa-sec-field.cjs` | 가져오기가 UI 필드 계약을 우회하는가 |
| `verify/qa-sec-store.cjs` | 저장소 무결성·격리·롤백·잔존물·내보내기 누출·전역 |
| `verify/qa-sec-wipe.cjs` | 전체 삭제 잔존물과 부활 |
| `verify/qa-sec-global.cjs` | 전역 오염 정밀 측정 |

**실행 CWD**: 스크래치패드 (`/tmp/.../scratchpad/qa-security`). 분배안 §9-2 대로 저장소 작업 트리를 더럽히지 않았습니다.
**재현 명령**: `cd <스크래치패드> && node <앱>/verify/qa-sec-cycle.cjs <사이클번호> <engine>`

<!--CYCLE_TABLE-->

**20 사이클 전부에서 같은 7건이 같은 값으로 재현되었습니다. 플래키 0건, 콘솔 에러 0건.**

---

## 2. XSS 실주입 — 페이로드와 결과 전문

### 2-1. 주입 페이로드 15종

| # | 이름 | 페이로드 |
|---|---|---|
| 1 | img-onerror | `<img src=x onerror="window.__XSS__=1">` |
| 2 | script | `<script>window.__XSS__=1</script>` |
| 3 | svg-onload | `"><svg onload="window.__XSS__=1">` |
| 4 | js-url | `javascript:window.__XSS__=1` |
| 5 | attr-break | `" onmouseover="window.__XSS__=1" x="` |
| 6 | iframe-srcdoc | `<iframe srcdoc="&lt;script&gt;parent.__XSS__=1&lt;/script&gt;">` |
| 7 | uni-escape | `<img src=x onerror=window.__XSS__=1>` |
| 8 | raw-lt | `<<img src=x onerror=window.__XSS__=1>` |
| 9 | tab-in-tag | `<img\tsrc=x\tonerror=window.__XSS__=1>` |
| 10 | entity | `&lt;img src=x onerror=window.__XSS__=1&gt;` |
| 11 | style-import | `<style>@import "x";</style>` |
| 12 | closing-tpl | `</template><img src=x onerror=window.__XSS__=1>` |
| 13 | dataurl-a | `<a href="data:text/html,payload">x</a>` |
| 14 | bidi | `U+202E` + `<img src=x onerror=window.__XSS__=1>` |
| 15 | emoji-mix | `🧾<img src=x onerror=window.__XSS__=1>` |

### 2-2. 주입 지점 3경로

1. **메모란 실타이핑** — `#jr-s01-add` → `#jr-amount` 입력 → `#jr-memo` 에 페이로드 → 칩 선택 → `#jr-s02-save`. **15종 전부 실제로 저장**하고 S-01 목록 렌더까지 확인.
2. **카테고리 이름 실타이핑** — S-04 `#jr-cat-new` 에 12자 절단 페이로드 6종 입력 후 `#jr-s04-cat-add`. **6종 전부 실제로 등록**되었고(등록됨=1), S-02 칩·S-04 행·S-03 통계행 세 군데 렌더까지 확인.
3. **가져오기 JSON 전 문자열 필드** — `exportedDate` · `data.settings.selectedMonth` · `expenses[].memo` · `categories[].name` · `expenses[].id` · `expenses[].categoryId` **동시**에 페이로드를 넣은 파일 15개를 `parseImport`→`applyImport` 로 실제 적용한 뒤 S-01·S-03·S-04 를 전부 다시 그림.

### 2-3. 판정 계기 (실행 여부를 어떻게 쟀는가)

- `window.__XSS__` 카나리아 (페이로드가 실행되면 1이 됨)
- `window.alert`/`confirm` 후킹 호출 카운터
- `MutationObserver` 로 **새로 추가된 `SCRIPT`·`IMG`·`IFRAME`·`SVG`·`OBJECT`·`EMBED`·`LINK`·`STYLE`·`A` 노드** 수집
- 렌더된 노드의 `childElementCount` (텍스트 노드로만 들어갔는지)
- `pageerror` · `console.error`

### 2-4. 결과

**37 항목 × 3엔진 = 111 회, 실패 0.**

```
PASS | 메모/img-onerror | xss=0 alert=0 신규위험노드=[] 자식엘리먼트=0 원문보존=true
PASS | 메모/script      | xss=0 alert=0 신규위험노드=[] 자식엘리먼트=0 원문보존=true
PASS | 메모/svg-onload  | xss=0 alert=0 신규위험노드=[] 자식엘리먼트=0 원문보존=true
   … (15종 전부 동일)
PASS | S-02 카테고리 칩 렌더 | 칩수=14 주입문자포함칩=["<img src=x o","<script>a<","\"><svg onl","</template>","‮<img sr"]
PASS | 가져오기/img-onerror | parse=true apply=true xss=0 신규위험노드=[] script태그수=7
   … (15종 전부 동일 · script 태그 수는 시종 7개로 불변 = 새 스크립트가 붙지 않음)
FAIL: 0 / 37
콘솔에러·pageerror: 0 []
```

**해석**: 페이로드는 **DOM 에 실제로 들어갔고**(칩 텍스트에 `<img src=x o` 가 그대로 보입니다) **텍스트 노드로만** 들어갔습니다(`childElementCount=0`). ④ 의 `innerHTML` 0건 주장은 **정적 사실일 뿐 아니라 런타임에서도 성립**합니다.

**단, 관찰 1건**: `tab-in-tag` 만 `원문보존=false` 로 나왔습니다. 메모 정규화가 탭 문자를 제거·치환한 것으로, 이는 E-122(표시할 수 없는 문자 제거) 계약대로의 동작입니다. **결함 아님.**

---

## 3. 프로토타입 오염 실측

### 3-1. 먼저 계기부터 검증했습니다

역할 브리핑이 경고한 함정 — `var X = { __proto__: true }` 는 own 속성을 만들지 않아 방어 코드가 **동작하는 척만** 할 수 있습니다. 그래서 시험 대상이 아니라 **시험 도구**를 먼저 실측했습니다.

```
계기 검증(엔진 동작): {"literalOwn":false,"jsonOwn":true,"jsonType":"object"}
```

- 객체 리터럴 `{__proto__:...}` → own 속성 **없음**(`literalOwn:false`)
- **`JSON.parse('{"__proto__":{"x":1}}')` → own 속성 있음**(`jsonOwn:true`)

**즉 가져오기 경로(JSON.parse)는 `__proto__` 를 own 데이터 속성으로 만듭니다.** 세 엔진 모두 동일. 이 계기가 유효해야 아래 결과가 의미를 가집니다.

### 3-2. `Object.prototype` 오염 — **0건**

12개 케이스(최상위 `__proto__` · `constructor.prototype` · `prototype` · `data.__proto__` · `settings.__proto__` · 레코드 단위 `__proto__` · id 가 `__proto__`/`constructor` · 이름이 `__proto__` · `dismissedNotices.__proto__`)를 `parseImport`→`applyImport`→`model.init()` 까지 실제로 통과시킨 뒤 매번 측정:

```
({}).polluted = undefined      [].polluted = undefined
({}).isAdmin  = undefined      (function(){}).polluted = undefined
Object.getOwnPropertyNames(Object.prototype) 중 신규 키 = []
```

**전역 프로토타입 오염은 3엔진 모두 0건입니다.** 이유는 저장 경로가 `JSON.parse` 결과를 **병합하지 않고**, `validExpenseRecord`/`validCategoryRecord` 가 **필드를 하나씩 새 객체로 옮겨 담는 화이트리스트 방식**이기 때문입니다. 이건 실제로 동작하는 방어입니다.

저장소를 먼저 오염시키고 부팅하는 6개 경로(`jr.v1.expenses`·`categories`·`settings`·`meta`·`draft`·`rollback`)도 전부 `({}).polluted = undefined`.

### 3-3. **그러나 `hasOwnProperty` 중복 방지 가드는 `__proto__` 에서 실제로 동작하지 않습니다**

이것이 이번 시험의 핵심 발견입니다. **방어 코드가 있는데, 그 방어가 특정 키에서만 무력화됩니다.**

문제 패턴 (`src/js/io.js:171·235`, `188·246`, `260-261`, `src/js/model.js:324·361`):
```js
if (Object.prototype.hasOwnProperty.call(seen, o.id)) { return null; }  // 검사
...
seen[rec.id] = true;                                                     // 등록  ← 여기가 무력
```
`seen` 은 평범한 `{}` 입니다. `rec.id === '__proto__'` 일 때 `seen['__proto__'] = true` 는 **`__proto__` 세터를 타고 들어가는데, `true` 는 객체가 아니므로 조용히 무시됩니다.** own 속성이 생기지 않으므로 다음 `hasOwnProperty` 검사는 계속 `false` 입니다.

**실측 (3엔진 동일)**:
```
중복 시험 원자료: {"applied":true,"rejectedCount":1,
 "expenseIds":["__proto__","__proto__","dup1"],"dupProto":2,"dupNormal":1,
 "catIds":["__proto__:가","__proto__:나","c1:식비"]}

PASS     | 일반 id 중복은 거부된다(기준선)      | id='dup1' 저장 건수=1
**FAIL** | id='__proto__' 중복도 거부된다       | id='__proto__' 저장 건수=2
**FAIL** | categoryId='__proto__' 중복도 거부된다 | ["__proto__:가","__proto__:나","c1:식비"]
```

일반 id `dup1` 은 정확히 1건만 남습니다(가드가 동작). **`__proto__` 만 2건이 그대로 저장됩니다.** → **QA-S-002**

같은 원인으로 카테고리 **이름** 중복 제거(V-11, `io.js:260-261`)도 뚫립니다:
```
["ca:__proto__","cb:__proto__","cc:커피","ce:constructor"]
```
`커피`(일반)·`constructor`(own 속성이 생기는 키)는 1개로 합쳐졌는데 **`__proto__` 만 2개가 남았습니다.** → **QA-S-003**

### 3-4. `getCategoryMap` 의 프로토타입이 통째로 바뀝니다

`src/js/model.js:782`
```js
for (i = 0; i < list.length; i++) { map[list[i].id] = list[i]; }
```
카테고리 id 가 `__proto__` 이면 이 줄은 **map 의 프로토타입을 카테고리 객체로 교체**합니다.

```
"mapProtoOwn": false,                       ← own 속성이 안 생김
"mapProtoOfMap": {"id":"__proto__","name":"세탁","order":0,"isDefault":false}
                                            ← map 의 프로토타입이 갈아치워짐
```
결과적으로 `stats.js:97` 의 `hasOwnProperty.call(map, e.categoryId)` 가 `false` 를 반환해 그 지출은 `__deleted__` 버킷으로 갑니다. → **QA-S-004**

---

## 4. 네트워크 요청 실계측 — **0건**

제품 정의의 핵심 주장이므로 **채널 2개로 따로 쟀습니다.**

### 채널 A — Playwright `request`/`websocket` 이벤트 (`verify/qa-sec-net.cjs`)

전 기능 흐름(부팅 → 지출 추가 → 월 이동 → 통계 → 설정 → 카테고리 추가 → 내보내기 → 가져오기 → 전체 삭제 → 새로고침)을 **실제로 클릭하며** 수집.

**Chromium 실측 전문**:
```
총 수집 요청: 18
  GET document   file://…/src/index.html
  GET stylesheet file://…/src/css/app.css
  GET script     file://…/src/js/err.js
  GET script     file://…/src/js/store.js
  GET script     file://…/src/js/model.js
  GET script     file://…/src/js/stats.js
  GET script     file://…/src/js/io.js
  GET script     file://…/src/js/ui.js
  GET script     file://…/src/js/boot.js
  (새로고침으로 위 9건 반복 = 18건)
--- file://·data:·blob: 이외 요청 --- 개수: 0 []
WebSocket: 0 []
RESULT PASS 외부요청 0건
```
**정확히 9개 로컬 파일뿐입니다. 파비콘은 `index.html:7` 의 `data:` URI 라 요청이 발생하지 않습니다.**

> **채널 A 의 한계를 숨기지 않고 적습니다**: Firefox 는 `file://` 로드에 대해 `request` 이벤트를 전혀 내보내지 않았습니다(총 수집 0건). 즉 Firefox 의 "외부 0건"은 채널 A 만으로는 **양성 측정이 아닙니다.** 그래서 채널 B 를 만들었습니다.

### 채널 B — 인페이지 API 후킹 (`verify/qa-sec-net2.cjs`)

앱 스크립트보다 **먼저** 실행되는 `addInitScript` 로 `fetch` · `XMLHttpRequest.open/send` · `navigator.sendBeacon` · `WebSocket` · `EventSource` · `Worker` · `SharedWorker` · `RTCPeerConnection` · `serviceWorker.register` · `document.createElement('img'|'script'|'iframe'|'link'|…)` 를 전부 감싸 **호출 시도 자체를 기록**.

| 엔진 | 후킹된 네트워크 API 호출 | performance resource 중 비-file/data/blob | 판정 |
|---|---|---|---|
| Chromium | **0** | 0 | PASS |
| Firefox | **0** | 0 | PASS |
| WebKit | **0** | 0 | PASS |

**두 채널 모두 0. 정적 스캔도 `fetch`·XHR·WebSocket·sendBeacon·EventSource **0건**, 외부 URL 은 `ui.js:9` 의 `http://www.w3.org/2000/svg`(XML 네임스페이스 식별자) 1건뿐**으로 분배안 §3-4 「결함 아님」 목록과 일치합니다.

---

## 5. 가져오기 공격면 — 30 케이스

전건 **PASS**(거부 코드 정확 + 저장소 무접촉). 아래는 실측 코드 전문입니다.

| 케이스 | 기대 | 실제 | 저장소 무접촉 |
|---|---|---|---|
| 비-JSON 텍스트 | E-404 | **E-404** | ✅ |
| 빈 문자열 | E-404 | **E-404** | ✅ |
| JSON 배열 `[1,2,3]` | E-405 | **E-405** | ✅ |
| JSON `null` | E-405 | **E-405** | ✅ |
| JSON 숫자 `12345` | E-405 | **E-405** | ✅ |
| JSON 문자열 `"hello"` | E-405 | **E-405** | ✅ |
| **남의 앱 JSON** (`app:'other-app'`) | E-405 | **E-405** | ✅ |
| `kind:'export'` | E-405 | **E-405** | ✅ |
| **타입 혼동** `app` 자리에 객체 | E-405 | **E-405** | ✅ |
| `schema:2` | E-406 | **E-406** | ✅ |
| `schema:'1'` (문자열) | E-406 | **E-406** | ✅ |
| `schema:1.5` | E-406 | **E-406** | ✅ |
| `data` 없음 | E-407 | **E-407** | ✅ |
| `data` 가 배열 | E-407 | **E-407** | ✅ |
| **타입 혼동** `expenses` 가 객체 | E-407 | **E-407** | ✅ |
| **타입 혼동** `categories` 가 문자열 | E-407 | **E-407** | ✅ |
| 유효 카테고리 0개 | E-407 | **E-407** | ✅ |
| `counts` 불일치 | E-407 | **E-407** | ✅ |
| **null 폭탄** `[null,null,null]` | 레코드 거부 | ok(수용 0 / 거부 3) | ✅ |
| **타입 혼동** amount 자리에 객체 | 레코드 거부 | ok(수용 0 / 거부 1) | ✅ |
| amount 가 문자열 `"100"` | 레코드 거부 | ok(수용 0 / 거부 1) | ✅ |
| amount `1e21` | 레코드 거부 | ok(수용 0 / 거부 1) | ✅ |
| amount `-1` | 레코드 거부 | ok(수용 0 / 거부 1) | ✅ |
| **중복 JSON 키** (`app` 2회, 뒤가 `evil`) | 거부 | **E-405** (뒤 값이 이겨 정상 거부) | ✅ |
| **깊은 중첩 5,000단** | throw 없음 | ok · throw 0 | ✅ |
| **깊은 중첩 100,000단** | throw 없음 | ok · throw 0 (스택 오버플로 없음) | ✅ |
| **MAX_IMPORT_CHARS 초과** (625,010자) | E-408 | **E-408** | ✅ |
| **E-413 용량 부족** | E-413 | **E-413** · 확인 대화상자 0개 | ✅ |
| **UI 파일 입력**: 남의 앱 JSON | E-405 토스트 | 토스트 문구 일치 · 대화상자 0 · 데이터 유지 | ✅ |
| **UI 파일 입력**: 비-JSON | E-404 토스트 | 토스트 문구 일치 · 데이터 유지 | ✅ |

**30 케이스를 다 돌린 뒤 저장소 전체를 기준 상태와 바이트 비교한 결과 완전 동일**했습니다:
```
PASS | 전 거부 케이스 통과 후 저장소가 기준 상태와 동일 | 동일
```

**단, 통과시키면 안 될 것 2가지가 통과했습니다** → **QA-S-005**(달력에 없는 날짜) · **QA-S-006**(메모 100자 우회). §6·§7 참조.

---

## 6. 저장소 무결성 · 격리 · 롤백

| 항목 | 결과 | 증거 |
|---|---|---|
| 키 네임스페이스 | **PASS** — 전 기능 사용 후 8개 키 전부 `jr.` 접두 | `["jr.v1.categories","jr.v1.categories.bak","jr.v1.draft","jr.v1.expenses","jr.v1.expenses.bak","jr.v1.meta","jr.v1.rejected","jr.v1.settings"]` |
| `jr.__probe` 잔존 | **PASS** — 남지 않음 | 위 목록에 없음 |
| 손상 격리가 원본을 지우는가 | **PASS** — 안 지움 | `jr.v1.corrupt.1787437942738 = "{{{ 깨진 JSON"` 원문 보관 |
| 손상 시 복구 사다리 | **PASS** | `.bak` 에서 `bakOnly/4242` 복원 + E-303 배너 실제 표시 |
| 격리 슬롯 상한 | **PASS** — 6회 격리 후 슬롯 3개 | `MAX_CORRUPT=3` 준수 |
| **용량 초과 롤백이 데이터를 지키는가** | **PASS** | `Storage.prototype.setItem` 을 실제로 `QuotaExceededError` 로 만들어 가져오기 실행 → `E-410` · 이전 값 바이트 동일 · 기록 `["safe"]` 유지 |
| 롤백 성공 시 `jr.v1.rollback` 잔존 | **PASS** — 남지 않음 | `rollbackKeyLeft=false` |
| **`restore()` 가 `jr.` 밖 키를 쓰는가** | **FAIL** | `evil.key`·`__proto__` 생성됨 → **QA-S-007** |
| **`wipeAll` 후 잔여 키 0** | **FAIL** | `.bak` 2개 + `corrupt` 1개에 사용자 데이터 잔존 → **QA-S-001** |
| `wipeAll` 후 카테고리 기본 8종 | **PASS** | `["식비","교통","주거/통신","생활용품","의료/건강","문화/여가","의류/미용","기타"]` |
| `wipeAll` 후 초안 삭제 | **PASS** | `jr.v1.draft` 없음 |
| `wipeAll` 후 거부목록 삭제 | **PASS** | `jr.v1.rejected` 없음 |

### 내보내기 누출 — **없음**

`dismissNotice('E-203')` 과 초안(`비밀초안`/`77777`)을 만든 상태에서 내보내기:

```
topKeys      = ["app","counts","data","exportedAt","exportedDate","kind","schema"]
data         = ["categories","expenses","settings"]
settings     = ["selectedMonth"]              ← dismissedNotices 없음 (§5-6-1 준수)
expense 필드  = ["amount","categoryId","createdAt","date","id","memo"]
category 필드 = ["id","isDefault","name","order"]
hasDraft     = false     hasDismissed = false
```
**예상 밖 필드 0개.**

---

## 7. 가져오기가 UI 필드 계약을 우회하는가

**같은 값을 UI 경로와 파일 경로에 각각 넣어 판정을 비교**했습니다.

| 값 | UI 경로(`JR.model.validateExpense`) | 파일 경로(`JR.io.parseImport`) | 판정 |
|---|---|---|---|
| `date:"2026-13-45"` | **거부 `E-109`** (달력에 없는 날짜) | **수용 · 저장됨** | **불일치 → QA-S-005** |
| `date:"9999-99-99"` | 거부 `E-109` | **수용 · 저장됨** | 불일치 |
| `date:"0000-00-00"` | 거부 `E-109` | **수용 · 저장됨** | 불일치 |
| `memo` 500자 | **거부 `E-120`** (`over:400`) | **수용 · 300,000자까지 저장됨** | **불일치 → QA-S-006** |
| `categoryId:"NOPE"` (없는 카테고리) | — | 수용 → **미분류로 흡수** | 정상(INT-06) |
| `order:-99 / 1e9 / "x" / null` | — | **0..n-1 로 재부여** | 정상(§4-2) |
| 카테고리 60개 | — | **정확히 20개로 절단**(거부 40) | 정상(V-10) |

**날짜 우회의 실제 결과** (실측):
```
저장된 기록 = ["bad1/2026-13-45/500000","bad2/9999-99-99/900000","bad3/0000-00-00/100000","good/2026-08-01/1000"]
월 이동 가능 범위 = {"min":"2000-01","max":"2027-08"}
실제 존재하는 달   = ["9999-99","2026-13","2026-08","0000-00"]
도달 불가한 달     = ["9999-99","0000-00"]   ← 여기에 1,000,000원이 들어 있습니다
```

**메모 우회의 실제 결과** (실측):
```
저장된 memo 길이 = 300,000자   (UI 상한 100자)
jr.v1.expenses 크기 = 300,088자
저장 사용률 = 12%  (기록 단 1건으로)
DOM 표시 길이 = 300,000자   행 높이 = 62px   가로 스크롤 = 없음
```
한 번의 가져오기로 저장 예산의 **24%**(600,832 / 2,500,000자)를 기록 1건에 밀어 넣을 수 있었습니다.

---

## 8. 코드 실행면 · 전역 · 비밀키 · 권한

| 항목 | 방법 | 결과 |
|---|---|---|
| `eval` · `new Function` · 문자열 타이머 · `document.write` · `innerHTML` 계열 | 정적 grep 6종 | **0건** |
| **인라인 이벤트 핸들러 속성** | **런타임 DOM 전수 순회**(`document.querySelectorAll('*')` 의 모든 `on*` 속성) | **0건** |
| `javascript:` href | 런타임 전수 | **0건** |
| 외부 호스트 href/src | 런타임 전수 | **0건** (전부 상대 경로 + `data:` 파비콘) |
| 하드코딩 비밀키·토큰 | 정적(`api_key`·`secret`·`token`·`password`·`Bearer`·`AKIA…`·`ghp_…`·`sk-…`·`BEGIN`) + 런타임 | **0건** |
| **권한 요청 API** | 정적(`getUserMedia`·`geolocation`·`Notification`·`requestPermission`·`clipboard`·`PaymentRequest`·`Bluetooth`·`USB`·`serviceWorker`·`indexedDB`·`cookie`·`crypto.subtle`) | **0건 — 아무 권한도 요청하지 않습니다.** 권한 최소화 만점 |
| **CSP** | 런타임 `meta[http-equiv]` 조회 | **없음** (`[]`) → **QA-S-008 (S4)** |
| 전역 오염 | 빈 페이지 컨텍스트 대조 | **앱이 만든 전역은 `JR` 하나** |
| 모듈 사설 상태 노출 | `monthIndex`·`expenses`·`categories`·`settings`·`subscribers`·`statsCache`·`mem`·`_seq` 조회 | **전부 `undefined`** — 노출 0 |

> **전역 측정에 관한 정직한 부기**: 1차 판본은 페이지 안에 `iframe` 을 만들어 대조하다가 그 iframe 때문에 생긴 `window[0]` 을 「누수」로 잘못 잡았습니다. **제 계기의 오류였고, 결함이 아닙니다.** `verify/qa-sec-global.cjs` 로 빈 페이지 컨텍스트를 따로 띄워 대조하도록 고쳐 다시 쟀고, 세 엔진 모두 앱이 만든 전역은 `JR` 하나뿐입니다. (about:blank 는 보안 컨텍스트가 아니라 `caches`·`SubtleCrypto` 같은 브라우저 내장 API 가 차이로 잡히는데, 이는 전부 브라우저 것이지 앱 것이 아닙니다.)

---

## 9. 확인 불가 — 사유와 함께

| 항목 | 사유 |
|---|---|
| **실제 macOS/iOS Safari** | 이 환경에 없습니다. **headless WebKit 으로만 측정**했습니다. 파트장이 Q-059 로 이미 올린 것과 같은 한계이며, 저는 「WebKit 엔진에서 측정됨」으로만 씁니다. |
| **실제 Chrome/Edge 정식 빌드** | Playwright 번들 Chromium 1194 로만 측정. Edge 는 미측정. |
| **다른 `file://` 페이지가 같은 오리진 저장소를 실제로 건드리는 시나리오** | Playwright 로 두 번째 로컬 HTML 을 띄워 `localStorage` 를 공유하는지까지는 재현했으나(오리진 공유 자체는 `store.js:12-13` 주석이 전제로 삼고 있음), **실제 사용자 기기의 다른 로컬 앱** 존재 여부는 시험 대상 밖입니다. QA-S-007 의 도달 경로 판단에 이 한계를 명시했습니다. |
| **디스크에 남는 흔적**(브라우저 프로필 파일·스왑) | 브라우저 내부 저장 파일까지는 검사하지 않았습니다. `localStorage` API 수준에서만 잰 값입니다. QA-S-001 의 잔존물은 **API 수준에서 이미 읽히므로** 이 한계와 무관합니다. |
| **비-`{ok}` 함수 18번째 존재 여부** | 분배안 §3-1 대로 17개 정본은 결함으로 올리지 않았습니다. 새 함수를 추가하는 변경이 없었으므로(=`src/` 무변경) **18번째는 나올 수 없습니다.** 별도 열거는 하지 않았습니다. |
| **성능 1,000건 실측** | 분배안 §4-1 로 `functional-tester` 담당입니다. 제 범위 밖이라 재지 않았습니다. |

---

## 10. 부정 탐지 (분배안 §8-1)

**부정 흔적 0건.**

- `verify/` 기존 19개 스크립트: **수정·삭제 0건**. 새 스크립트는 전부 `verify/qa-sec-*.cjs` 로 신규 추가했습니다.
- 단언을 주석 처리하거나 느슨하게 바꾼 곳 없음. 오히려 제 계기 오류(`window[0]`)를 발견했을 때 **결함 목록에서 빼는 대신 그 사실을 §8 에 적었습니다.**
- `try/catch` 로 실패를 삼킨 곳 없음 — 하위 스크립트가 죽으면 `qa-sec-cycle.cjs` 가 `SUITE-CRASH` 로 FAIL 처리합니다.
- 손으로 적은 통과 로그 없음. 이 문서의 모든 수치는 위 스크립트 출력에서 그대로 옮긴 것입니다.

## 10-1. 사양 문서 변동 (분배안 §9-1)

시험 착수 시점에 `git status` 는 `ai-team/questions.md` 1개만 수정 상태였고, `docs/기획서.md` 변경은 이미 커밋 `cf9d7e1` 에 들어가 있었습니다. **시험이 도는 동안 `docs/` 와 `src/` 가 추가로 바뀐 것은 없습니다.**
- `git diff --stat 675840e HEAD -- src/` → **빈 출력** (코드 기준선 유지 확인)
- `git diff --stat 675840e HEAD -- docs/` → `QA-분배안.md`(신규) · `기획서.md`(§7-10 5) 문구 정정) 2건. **둘 다 코드 영향 0** 이며 파트장이 §9-1 에서 이미 판정한 내용과 일치합니다. **새로 보고할 문서 변동 없음.**

---

## 11. 결함 목록 (상세는 `docs/QA-수정요청-보안.md`)

| ID | 심각도 | 한 줄 | 대상 |
|---|---|---|---|
| QA-S-001 | **S1** | 「전체 삭제」가 지운 지출을 `.bak`·`corrupt` 에 남기고, 다음 부팅에서 화면에 되살린다 | `model.js:989` · `store.js:280-287,312` |
| QA-S-002 | **S1** | `id:"__proto__"` 에서 중복 방지 가드가 무력 → 같은 id 2건 저장 → **사용자가 고르지 않은 기록이 삭제됨** | `io.js:171,235` · `model.js:324,361` |
| QA-S-003 | **S2** | 카테고리 이름 중복 제거(V-11)가 `__proto__` 이름에서 무력 → E-116 불변식 붕괴 | `io.js:260-261` |
| QA-S-004 | **S2** | `getCategoryMap` 프로토타입 교체 → 통계가 금액을 「미분류」로 잘못 귀속 | `model.js:782` · `stats.js:97` |
| QA-S-005 | **S2** | 가져오기가 달력에 없는 날짜를 통과시켜 **도달 불가능한 달에 돈을 숨김** | `io.js:172` |
| QA-S-006 | **S3** | 가져오기가 메모 100자 계약을 우회(300,000자 저장) | `io.js:180` |
| QA-S-007 | **S3** | `store.restore()` 가 `jr.` 네임스페이스 밖 키를 씀 | `store.js:352-370` |
| QA-S-008 | **S4** | CSP 부재 (심층방어) | `index.html` |

---

## 12. 파트장께 올린 질문 (Q-085~099 대역)

`ai-team/questions.md` 참조. 요지:

| Q | 수신 | 요지 |
|---|---|---|
| Q-085 | `qa-lead` → `tech-lead` | QA-S-001 잔존물: `.bak` 은 §3-4 4단계가 **의도적으로** 이전 값을 쓰게 되어 있음. `wipeAll` 만 예외로 `.bak`·`corrupt` 를 지울지, `clearAppKeys` 를 부를지 **계약 판정** 필요 |
| Q-086 | `qa-lead` → `system-architect` | `__proto__` 계열 키의 처리 방침: 입력 단계에서 **거부**할지, 안전한 `Object.create(null)` 맵으로 **수용**할지. 4건(QA-S-002~004)이 같은 뿌리라 한 번에 정해야 함 |
| Q-087 | `qa-lead` → `product-planner` | 가져오기 날짜 검증이 UI(E-109)보다 느슨한 것이 **의도인지**. 백업 복원 관대함 vs 도달 불가 데이터 |
| Q-088 | `qa-lead` → `system-architect` | 가져오기 memo 길이 무검증이 **의도인지**(§6-3-2 에 명시 없음) |
| Q-089 | `qa-lead` → `tech-lead` | `store.restore()` 에 `jr.` 접두 검사를 넣어도 되는지(현재 계약에 명시 없음) |
| Q-090 | `qa-lead` → `product-planner` | CSP 메타 태그 도입 여부 (S4 제안) |

---

## 부록. 증거 파일

| 산출물 | 경로 |
|---|---|
| 사이클 로그 20회 | `<스크래치패드>/qa-security/cycles.log` |
| 스크린샷 | `<스크래치패드>/qa-security/shots/` (`qa-sec-xss-*.png` · `qa-sec-integrity-*.png` · `qa-sec-field-memo-*.png` · `qa-sec-wipe-*.png` · `qa-sec-wipe-revived-*.png`) |
| 재현 스크립트 (신규 11개, 기존 19개 무수정) | `ai-team/apps/2026-08-11/verify/qa-sec-*.cjs` |

> 스크래치패드는 세션 임시 경로라 사라질 수 있습니다. **스크립트는 저장소에 남겼으므로 제3자가 같은 명령으로 그대로 재현할 수 있습니다.**
> ```bash
> cd <아무 임시 폴더> && mkdir -p shots
> node /home/user/past-job-recommender/ai-team/apps/2026-08-11/verify/qa-sec-cycle.cjs 1 chromium
> ```
