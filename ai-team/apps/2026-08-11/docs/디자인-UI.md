# 디자인 — UI 스펙

작성: `ui-designer` (③ 디자인본부 실무, 1차 호출)
작성일: 2026-08-16 (사이클 2 · 3일차)
앱 폴더: `ai-team/apps/2026-08-11/`
근거(순서대로 읽음): `handoff/02-기획.md` → `docs/기획서.md` §7 → `docs/기획-화면설계.md` → `docs/기획-구조설계.md` §7 → `docs/디자인-분배안.md`(파트장 공유 계약, **값 변경 금지**)

병렬 작업자 `brand-designer` 의 산출물(`docs/디자인-브랜드.md`)은 볼 수 없습니다. 이 문서는 `docs/디자인-UI.md` 하나만 씁니다.

---

## 0. 이 문서의 지위와 범위

- 색·간격·타이포·아이콘 문법·모션 토큰의 **이름과 값은 전부 `디자인-분배안.md` §2 확정값을 그대로** 씁니다. 이 문서는 새 토큰을 만들지 않습니다.
- 화면 문구·전환·비활성 조건은 `기획서.md` §7(INT) 확정을 그대로 인용합니다. 새 문구를 쓰지 않습니다.
- §2-3 대비비 표는 파트장이 이미 계산한 값을 인용하고, **이 문서에서 새로 등장하는 색 조합만** 직접 계산해 §3에 덧붙입니다.
- 검증하지 못한 것은 "확인 불가"로 표시합니다(§9).
- 계약에 없는 값이 필요했던 지점 2건은 `ai-team/questions.md` **Q-018** 에 남기고, 잠정 해법으로 진행했습니다(§8).

---

## 1. 토큰 정의 블록 (복사 가능 `:root`)

④ 개발본부가 이 블록을 그대로 붙여 넣습니다. `--jr-fs-*` 5종은 이 문서에서 확정한 값입니다.

```css
:root {
  /* 색 — 디자인-분배안.md §2-2 그대로, 이름·값 변경 금지 */
  --jr-bg: #FFFFFF;
  --jr-surface: #F4F6F8;
  --jr-surface-sunken: #E9EDF1;
  --jr-text: #16191D;
  --jr-text-muted: #5A626B;
  --jr-brand: #0B6B5B;
  --jr-on-brand: #FFFFFF;
  --jr-danger: #A3231C;
  --jr-on-danger: #FFFFFF;
  --jr-focus: #0B4FD9;
  --jr-focus-on-dark: #FFFFFF;
  --jr-border: #7E8790;
  --jr-divider: #C2CBD4;
  --jr-track: #E3E8ED;
  --jr-bar-deleted: #5A626B;
  --jr-banner-state-bg: #FFF3D6;
  --jr-banner-event-bg: #E6EEFB;
  --jr-banner-block-bg: #FDE7E5;
  --jr-toast-bg: #2A2F36;
  --jr-toast-text: #FFFFFF;

  /* 간격 · 반경 · 크기 · 계층 — 디자인-분배안.md §2-6 그대로 */
  --jr-sp-1: 4px;   --jr-sp-2: 8px;   --jr-sp-3: 12px;  --jr-sp-4: 16px;
  --jr-sp-5: 20px;  --jr-sp-6: 24px;  --jr-sp-8: 32px;  --jr-sp-10: 40px;

  --jr-radius-sm: 6px;
  --jr-radius-md: 10px;
  --jr-radius-pill: 999px;

  --jr-touch: 44px;
  --jr-tabbar-h: 56px;
  --jr-maxw: 520px;

  --jr-z-tabbar: 20;
  --jr-z-banner: 30;
  --jr-z-toast: 40;
  --jr-z-dialog-overlay: 50;
  --jr-z-dialog: 51;
  --jr-z-unsupported: 60; /* §3-4, 분배안에는 명시 없으나 부팅 3요소 중 최상위로 필요 — §7-4 참고 */

  /* 폰트 — 디자인-분배안.md §2-7 그대로 */
  --jr-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo",
             "Malgun Gothic", "맑은 고딕", "Noto Sans KR", "Nanum Gothic", sans-serif;
  --jr-font-num: var(--jr-font);

  /* 타이포 스케일 — ui-designer 확정 (§2) */
  --jr-fs-sm: 14px;
  --jr-fs-base: 16px;
  --jr-fs-lg: 18px;
  --jr-fs-xl: 22px;
  --jr-fs-amount: 28px;

  --jr-lh-body: 1.6;   /* 본문(--jr-fs-sm·--jr-fs-base) 전용 — 접근성 §2-4 강제값 */
  --jr-lh-heading: 1.3; /* 구역제목·화면제목·금액(단일 줄, "본문" 아님) */

  --jr-fw-regular: 400;
  --jr-fw-medium: 500;
  --jr-fw-semibold: 600;
  --jr-fw-bold: 700;

  /* 모션 — 디자인-분배안.md §2-7 그대로 */
  --jr-dur-fast: 120ms;
  --jr-dur-base: 180ms;
  --jr-dur-toast-in: 180ms;
  --jr-dur-toast-out: 200ms;
  --jr-ease: cubic-bezier(0.2, 0, 0, 1);
}

@media (prefers-reduced-motion: reduce) {
  *:not(#jr-unsupported), *:not(#jr-unsupported)::before, *:not(#jr-unsupported)::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

`--jr-z-unsupported: 60` 은 분배안 §2-6 z-index 표에 없던 값입니다 — 분배안 §3-4 본문이 "z-index 60 — 앱 UI보다 위"라고 이미 텍스트로 확정해 두었으므로, 그 값을 토큰으로 옮겼을 뿐 새로 만든 값이 아닙니다.

---

## 2. 타이포 스케일

| 토큰 | 크기 | `line-height` | `font-weight` | 용도 |
|---|---|---|---|---|
| `--jr-fs-sm` | 14px | `var(--jr-lh-body)` 1.6 | 400 | 보조 텍스트 · `0/100` 카운터 · 막대 목록의 비율 텍스트 · 인라인 오류 문구 · 배너 본문 · 토스트 본문 |
| `--jr-fs-base` | 16px | `var(--jr-lh-body)` 1.6 | 400(본문) / 600(버튼 라벨·입력값) | 본문 · 버튼 라벨 · 입력값 · 목록 행 텍스트 |
| `--jr-fs-lg` | 18px | `var(--jr-lh-heading)` 1.3 | 700 | 구역 제목(`카테고리 관리` 등) · 월 표시(`2026년 8월`) |
| `--jr-fs-xl` | 22px | `var(--jr-lh-heading)` 1.3 | 700 | S-01 화면 제목(앱 이름) 단 한 곳 |
| `--jr-fs-amount` | 28px | `var(--jr-lh-heading)` 1.3 | 700 | S-01·S-03 총합 금액 |

- 14px 미만 사용 없음(전 컴포넌트 검사 완료).
- `--jr-lh-body` 1.6 은 **§2-4 접근성 강제값**이며 `--jr-fs-sm`·`--jr-fs-base` 에만 적용합니다. 제목·금액류(`--jr-fs-lg/xl/amount`)는 한 줄로 끝나는 짧은 텍스트라 "본문"이 아니므로 1.3을 씁니다(줄바꿈 자체가 없어 줄간격 가독성 문제가 발생하지 않음).
- 금액이 나오는 모든 자리(`--jr-fs-amount`, 목록 행 금액, 통계 막대 금액·비율 텍스트)는 `font-variant-numeric: tabular-nums` + `var(--jr-font-num)` 를 반드시 지정합니다.

---

## 3. 대비비 검증표 — 이 문서에서 새로 등장한 조합만 (계산값)

파트장 표(분배안 §2-3)에 없던 조합입니다. 계산식은 분배안 §7(WCAG 2.1 상대휘도) 그대로 사용했습니다.

| 전경 | 배경 | 계산값 | 기준 | 판정 | 사용처 |
|---|---|---|---|---|---|
| `--jr-text` `#16191D` | `--jr-banner-event-bg` `#E6EEFB` | **15.10:1** | 4.5 | ✅ | 사건형 배너 본문 텍스트 |
| `--jr-danger` `#A3231C` (좌측 세로 강조선, 비텍스트) | `--jr-banner-block-bg` `#FDE7E5` | **6.30:1** | 3 | ✅ | 차단형 배너 왼쪽 4px 강조선 |
| `--jr-border` `#7E8790` | `--jr-surface` `#F4F6F8` | **3.10:1** | 3 | ✅ (근소 통과) | 입력란 자체 배경(`--jr-surface`) 위에 놓인 `--jr-border` 테두리 — 입력란은 페이지 배경이 아니라 자기 배경 위에 테두리가 놓이므로 별도 계산 필요 |
| `--jr-border` `#7E8790` | `--jr-surface-sunken` `#E9EDF1` (비활성 입력란) | **3.10:1** | 3 | ✅ (근소 통과) | 비활성 텍스트 입력의 테두리 |

계산 과정(검증용, `#7E8790` 대 `#E9EDF1` 예시): R=126,G=135,B=144 → 선형화 후 L=0.23785. `#E9EDF1` → L=0.84241. `(0.84241+0.05)/(0.23785+0.05) = 3.10`. 나머지 3건도 동일 절차로 계산했습니다.

**나머지 모든 조합은 분배안 §2-3 표를 그대로 인용**하며 재계산하지 않았습니다(파트장 확정값, 재계산 불필요).

---

## 4. 컴포넌트 13종 — 상태 전부

공통 규칙(전 컴포넌트 적용, 반복 표기하지 않음):
- 포커스 표시: `outline: 3px solid var(--jr-focus); outline-offset: 2px;` — `:focus-visible` 우선, `:focus` 폴백 병기. **절대 `box-shadow: inset`으로 대체하지 않습니다**(분배안 §2-3 발견 1 — 포커스링을 브랜드색 위에 그리면 안 보임).
- 최소 터치 영역 44×44px. 시각 크기가 44px 미만이면 `padding` 또는 `::before { content:''; position:absolute; inset: -Npx; }` 로 히트 영역만 확장합니다(인접 요소와 겹치지 않는 값으로 N을 계산 — 컴포넌트별로 아래 명시).
- 인접 조작 요소 간격 8px 이상, **파괴적 버튼 옆은 12px 이상**.
- `hover`/`pressed` 상태에 새 색 토큰을 만들지 않고, 기존 토큰으로 배경을 교체하는 방식(예: `--jr-bg` → `--jr-surface` → `--jr-surface-sunken` 단계 전이)을 우선 사용합니다. 채움이 이미 브랜드/위험색인 버튼(주요·파괴적 버튼)은 예외이며 §4-1·§4-3에 별도 기재합니다.

### 4-1. 주요 버튼 (`저장` · `추가` · `확인`)

클래스: `.jr-btn.jr-btn--primary`

```html
<button type="button" class="jr-btn jr-btn--primary">저장</button>
```

```css
.jr-btn--primary {
  height: var(--jr-touch);               /* 44px */
  padding: 0 var(--jr-sp-4);              /* 16px */
  border: none;
  border-radius: var(--jr-radius-sm);     /* 6px — 버튼 전용 반경 토큰이 없어 "보조 버튼" 용도로 지정된 sm 을 전 버튼 공통으로 사용 */
  background: var(--jr-brand);
  color: var(--jr-on-brand);
  font: var(--jr-fw-semibold) var(--jr-fs-base)/1 var(--jr-font);
  position: relative;
}
```

| 상태 | 배경 | 텍스트 | 테두리 | 비고 |
|---|---|---|---|---|
| 기본 | `--jr-brand` | `--jr-on-brand` | 없음 | 대비 6.43:1(분배안 §2-3) |
| hover | `--jr-brand` + `::after{background:rgba(22,25,29,.08)}` 오버레이 | `--jr-on-brand` | 없음 | 새 색 토큰 없이 `--jr-text`(#16191D)를 8% 알파로 얹어 어둡게. 마우스 환경 전용, 터치에는 나타나지 않음 |
| 눌림(`:active`) | 위와 동일 오버레이 알파만 `.16`로 증가 | `--jr-on-brand` | 없음 | |
| `:focus-visible` | 기본과 동일 + `outline: 3px solid var(--jr-focus); outline-offset: 2px` | `--jr-on-brand` | 없음 | 링이 버튼 바깥 페이지 배경 위에 그려지므로 대비 6.70:1(분배안 §2-3, focus vs 배경) 적용 |
| 비활성 | `--jr-surface-sunken` | `--jr-text-muted` | 없음 | `disabled` + `aria-disabled="true"` + `cursor:not-allowed`. 라벨 텍스트 유지(지우지 않음) |

### 4-2. 보조 버튼 (`취소` · `이름변경` · `전체 선택` · `내보내기` · `가져오기`)

클래스: `.jr-btn.jr-btn--secondary`

```css
.jr-btn--secondary {
  height: var(--jr-touch);
  padding: 0 var(--jr-sp-4);
  border: 1px solid var(--jr-border);      /* 3.65:1, 분배안 §2-3 */
  border-radius: var(--jr-radius-sm);
  background: var(--jr-bg);
  color: var(--jr-text);
  font: var(--jr-fw-semibold) var(--jr-fs-base)/1 var(--jr-font);
}
```

| 상태 | 배경 | 텍스트 | 테두리 |
|---|---|---|---|
| 기본 | `--jr-bg` | `--jr-text` | `--jr-border` 1px |
| hover | `--jr-surface` | `--jr-text` | `--jr-border` 1px |
| 눌림 | `--jr-surface-sunken` | `--jr-text` | `--jr-border` 1px |
| `:focus-visible` | 기본 유지 + outline 규칙 | `--jr-text` | `--jr-border` 1px |
| 비활성 | `--jr-surface-sunken` | `--jr-text-muted` | `--jr-border` 1px (테두리는 유지 — 형태 정보이므로 `--jr-divider` 사용 금지) |

### 4-3. 파괴적 버튼 (`삭제` · `이 기록 삭제` · `전체 삭제` · `모두 삭제`)

클래스: `.jr-btn.jr-btn--danger`

```css
.jr-btn--danger {
  height: var(--jr-touch);
  padding: 0 var(--jr-sp-4);
  border: none;
  border-radius: var(--jr-radius-sm);
  background: var(--jr-danger);
  color: var(--jr-on-danger);
  font: var(--jr-fw-semibold) var(--jr-fs-base)/1 var(--jr-font);
}
```

| 상태 | 배경 | 텍스트 |
|---|---|---|
| 기본 | `--jr-danger` | `--jr-on-danger` (7.46:1) |
| hover | `--jr-danger` + `::after{background:rgba(22,25,29,.08)}` | `--jr-on-danger` |
| 눌림 | 위 + 알파 `.16` | `--jr-on-danger` |
| `:focus-visible` | 기본 + outline 3px `--jr-focus`, offset 2px | `--jr-on-danger` |
| 비활성(S-04 카테고리 1개일 때 `삭제`만 해당) | `--jr-surface-sunken` | `--jr-text-muted` |

**인접 간격**: S-04 카테고리 행에서 `이름변경`(보조 버튼)과 `삭제`(파괴적 버튼) 사이는 `gap: var(--jr-sp-3)`(12px). 그 외 파괴적 버튼과 인접 버튼(예: 대화상자의 `취소`/`삭제`)도 동일하게 12px.

### 4-4. 월 이동 버튼 (`‹ 이전 달` · `다음 달 ›`)

클래스: `.jr-btn.jr-btn--ghost.jr-btn--month`

```html
<button type="button" class="jr-btn jr-btn--ghost jr-btn--month" aria-label="이전 달">
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true" focusable="false">
    <path d="M15 6l-6 6 6 6"/>
  </svg>
  <span>이전 달</span>
</button>
```

```css
.jr-btn--ghost {
  height: var(--jr-touch);
  padding: 0 var(--jr-sp-3);
  border: none;
  border-radius: var(--jr-radius-sm);
  background: transparent;
  color: var(--jr-text);
  display: inline-flex; align-items: center; gap: var(--jr-sp-1);
  font: var(--jr-fw-medium) var(--jr-fs-base)/1 var(--jr-font);
}
```

| 상태 | 배경 | 텍스트/아이콘 |
|---|---|---|
| 기본 | 투명 | `--jr-text` |
| hover | `--jr-surface` | `--jr-text` |
| 눌림 | `--jr-surface-sunken` | `--jr-text` |
| `:focus-visible` | 기본 + outline 규칙 | `--jr-text` |
| 비활성(2000년 1월 / 오늘+1년 경계) | `--jr-surface-sunken` | `--jr-text-muted`. `disabled` + `aria-disabled="true"` |

라벨 `이전 달`/`다음 달`은 항상 텍스트로 남습니다(아이콘 전용 버튼 금지, §2-8·화면설계 §0-3).

### 4-5. 텍스트 입력 (카테고리 이름 · 메모)

클래스: `.jr-field` (wrapper) → `.jr-input` / `.jr-textarea`

```html
<div class="jr-field">
  <label class="jr-field__label" for="jr-memo">메모 (선택)</label>
  <textarea id="jr-memo" class="jr-textarea" placeholder="메모를 남겨보세요" maxlength="100" aria-describedby="jr-memo-count"></textarea>
  <div class="jr-field__meta">
    <span id="jr-memo-count" class="jr-field__counter">0/100</span>
  </div>
</div>
```

```css
.jr-input, .jr-textarea {
  min-height: var(--jr-touch);
  width: 100%;
  padding: var(--jr-sp-2) var(--jr-sp-3);   /* 8px 16px 아님 — 12px 좌우, 8px 상하 */
  border: 1px solid var(--jr-border);        /* 3.65:1 */
  border-radius: var(--jr-radius-sm);
  background: var(--jr-surface);
  color: var(--jr-text);
  font: var(--jr-fw-regular) var(--jr-fs-base)/var(--jr-lh-body) var(--jr-font);
}
.jr-field__counter {
  font-size: var(--jr-fs-sm);
  color: var(--jr-text-muted);               /* 6.19:1 / 5.71:1 */
  font-variant-numeric: tabular-nums;
}
```

| 상태 | 테두리 | 배경 | 비고 |
|---|---|---|---|
| 기본 | `--jr-border` 1px | `--jr-surface` | |
| `:focus-visible` | `--jr-border` 1px 유지 + outline 3px `--jr-focus` offset 2px | `--jr-surface` | 링은 입력란 바깥, 페이지 배경(대개 `--jr-bg`) 위에 그려짐 → 6.70:1 적용 |
| 오류 | `--jr-danger` **2px**(굵기 증가로 색 외 신호 추가) | `--jr-surface` | `aria-invalid="true"` + `aria-describedby="{id}-error"`로 I 슬롯 연결 |
| 비활성 | `--jr-border` 1px (3.10:1, §3) | `--jr-surface-sunken` | 텍스트 `--jr-text-muted`. S-04 카테고리 20개 도달 시 새 카테고리 입력란이 이 상태 |
| 글자수 카운터 배치 | — | — | `.jr-field__meta` 를 입력란 우측 하단, 입력란과 `var(--jr-sp-1)`(4px) 간격. `JR.model.countChars` 기준 값을 `④` 가 채움(코드포인트 계수, `maxlength` HTML 속성은 표시용 폴백일 뿐 신뢰하지 않음 — 구조설계 §4-6) |

### 4-6. 금액 입력

클래스: `.jr-field.jr-field--amount`

```html
<div class="jr-field jr-field--amount">
  <label class="jr-field__label" for="jr-amount">금액</label>
  <div class="jr-amount-input">
    <input id="jr-amount" class="jr-input jr-input--amount" type="text" inputmode="numeric"
           autocomplete="off" placeholder="0" aria-describedby="jr-amount-hint">
    <span class="jr-amount-input__suffix" aria-hidden="true">원</span>
  </div>
  <p id="jr-amount-hint" class="jr-field__hint">1원 ~ 999,999,999원까지 입력할 수 있습니다.</p>
</div>
```

```css
.jr-amount-input { position: relative; }
.jr-input--amount {
  padding-right: var(--jr-sp-8);            /* 32px — "원" 접미사 자리 확보, 자릿수 흔들려도 겹치지 않도록 여유 */
  font-variant-numeric: tabular-nums;
  font-family: var(--jr-font-num);
}
.jr-amount-input__suffix {
  position: absolute; right: var(--jr-sp-3); top: 50%; transform: translateY(-50%);
  color: var(--jr-text-muted); font-size: var(--jr-fs-base); pointer-events: none;
}
```

- 접미사 `원`은 `position: absolute` 로 입력란 안쪽 우측에 **고정 표시**(입력값과 무관하게 항상 보임). 입력란 자체가 이동하지 않으므로 자리가 흔들리지 않습니다.
- 천 단위 쉼표는 `input` 이벤트에서 재삽입되며(구조설계 INT-20), 접미사는 `padding-right: 32px` 안쪽에 고정이라 8자리 숫자(`999,999,999`)가 들어와도 겹치지 않는지 확인 필요 — **④ 실측 항목**(폰트 렌더링에 따라 실제 폭이 달라짐, §9).
- 나머지 상태(기본/포커스/오류/비활성)는 §4-5 와 동일 규칙.

### 4-7. 날짜 입력 (`<input type="date">`)

클래스: `.jr-field.jr-field--date`

```html
<div class="jr-field jr-field--date">
  <label class="jr-field__label" for="jr-date">날짜</label>
  <input id="jr-date" class="jr-input jr-input--date" type="date"
         min="2000-01-01" aria-describedby="jr-date-hint">
  <p id="jr-date-hint" class="jr-field__hint">2000-01-01 ~ {max} 사이 날짜만 입력할 수 있습니다.</p>
</div>
```

```css
.jr-input--date {
  font-variant-numeric: tabular-nums;
  font-family: var(--jr-font-num);
  min-height: var(--jr-touch);
}
```

- 브라우저 기본 달력 아이콘의 위치·크기·클릭 히트영역은 **우리가 통제할 수 없습니다.** 레이아웃은 이를 전제로 입력란 우측에 `padding-right: var(--jr-sp-8)`(32px) 여유를 두어 기본 아이콘과 텍스트가 겹치지 않게만 합니다. 아이콘 자체의 모양·색은 브라우저 기본값을 그대로 씁니다(변경 시도하지 않음 — 브라우저마다 다른 셰도우 DOM이라 안전하게 스타일링할 수 없음).
- `min`/`max` HTML 속성은 힌트일 뿐이며 검증은 항상 `JR.model.validateExpense` 가 함(구조설계 INT-21). 시안은 이 속성이 없어도 동일하게 그려야 합니다.
- `type="date"` 미지원 브라우저는 `text` 로 자동 폴백됩니다 — 이때도 같은 클래스·레이아웃을 그대로 씁니다(달력 아이콘만 없어짐). 별도 시안 불필요.
- 나머지 상태는 §4-5 와 동일.
- **④ 실측 항목**: 실제 브라우저별 달력 아이콘이 이 여백과 충돌하는지(§9).

### 4-8. 카테고리 칩 (단일 선택)

클래스: `.jr-chip-group[role="radiogroup"]` → `.jr-chip[role="radio"]`

```html
<div class="jr-chip-group" role="radiogroup" aria-label="카테고리" aria-describedby="jr-cat-hint">
  <button type="button" class="jr-chip" role="radio" aria-checked="true">식비</button>
  <button type="button" class="jr-chip" role="radio" aria-checked="false">교통</button>
</div>
<p id="jr-cat-hint" class="jr-field__hint jr-field__hint--neutral">카테고리를 선택해 주세요.</p>
```

```css
.jr-chip-group {
  display: flex; flex-wrap: wrap;
  gap: var(--jr-sp-2);                       /* 8px 이상, 칩 간 간격 */
}
.jr-chip {
  min-height: var(--jr-touch);               /* 44px */
  padding: 0 var(--jr-sp-4);
  border-radius: var(--jr-radius-pill);
  border: 1px solid var(--jr-border);
  background: var(--jr-surface);
  color: var(--jr-text);
  font: var(--jr-fw-medium) var(--jr-fs-base)/1 var(--jr-font);
}
.jr-chip[aria-checked="true"] {
  background: var(--jr-brand);
  border: 1.5px solid var(--jr-on-brand);     /* 배경 반전 + 굵은 테두리 — 색 외 신호 */
  color: var(--jr-on-brand);
  font-weight: var(--jr-fw-semibold);
}
```

| 상태 | 배경 | 텍스트 | 테두리 | 비고 |
|---|---|---|---|---|
| 미선택 | `--jr-surface` | `--jr-text` | `--jr-border` 1px | |
| 선택 | `--jr-brand` (6.43:1) | `--jr-on-brand` | `--jr-on-brand` 1.5px | `aria-checked="true"` + 굵기 변화로 색약 사용자도 구분(분배안 §2-5) |
| `:focus-visible` | 상태 유지 | 상태 유지 | + outline 3px `--jr-focus` offset 2px | 그룹 내 좌우 방향키 이동, 정지점은 그룹 전체 1개(분배안 §3-5) |
| 줄바꿈 | — | — | — | `flex-wrap: wrap`. 최대 20개, 여러 줄 허용. 실제 줄 수는 화면 폭에 따라 다름 — **④ 실측 항목**(§9) |

INT-04 중립 안내(`카테고리를 선택해 주세요.`)는 §7 참조.

### 4-9. 하단 탭바

클래스: `.jr-tabbar` → `.jr-tab`

```html
<nav class="jr-tabbar" aria-label="주요 화면">
  <a href="#" class="jr-tab jr-tab--active" aria-current="page">
    <svg class="jr-tab__icon" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 001 1h4v-6h2v6h4a1 1 0 001-1v-9"/>
    </svg>
    <span>홈</span>
  </a>
  <a href="#" class="jr-tab">
    <svg class="jr-tab__icon" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true" focusable="false">
      <path d="M5 20V10M12 20V4M19 20v-7"/>
    </svg>
    <span>통계</span>
  </a>
  <a href="#" class="jr-tab">
    <svg class="jr-tab__icon" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>
    </svg>
    <span>설정</span>
  </a>
</nav>
```

```css
.jr-tabbar {
  position: fixed; left: 0; right: 0; bottom: 0;
  height: var(--jr-tabbar-h);                 /* 56px */
  display: flex;
  background: var(--jr-bg);
  border-top: 1px solid var(--jr-divider);     /* 장식용 구분선 — 정보 전달 아님, 색만으로 판정하지 않으므로 허용 */
  padding-bottom: env(safe-area-inset-bottom);
  z-index: var(--jr-z-tabbar);
}
.jr-tab {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--jr-sp-1);
  min-height: var(--jr-touch);
  color: var(--jr-text-muted);                 /* 6.19:1 */
  font: var(--jr-fw-regular) var(--jr-fs-sm)/1 var(--jr-font);
  position: relative;
}
.jr-tab--active {
  color: var(--jr-brand);                       /* 6.43:1 */
  font-weight: var(--jr-fw-semibold);
}
.jr-tab--active::before {
  content: ''; position: absolute; top: 0; left: var(--jr-sp-3); right: var(--jr-sp-3);
  height: 3px; background: var(--jr-brand); border-radius: 0 0 2px 2px;
}
```

| 상태 | 색 | 표식 |
|---|---|---|
| 현재 탭 | `--jr-brand` | 상단 3px 인디케이터 + `font-weight:600` + `aria-current="page"` (분배안 §2-5, 색만으로 구분 금지 항목) |
| 그 외 | `--jr-text-muted` | 없음 |
| `:focus-visible` | 유지 | + outline 3px `--jr-focus` offset 2px |

S-02 에는 탭바가 없으므로 `--jr-tabbar-h` 를 그 화면 컨테이너에서 `0` 으로 오버라이드합니다(§6 토스트 기준선과 연동).

### 4-10. 목록 행 (S-01)

클래스: `.jr-expense-row`

```html
<button type="button" class="jr-expense-row">
  <span class="jr-expense-row__main">
    <span class="jr-expense-row__category">식비</span>
    <span class="jr-expense-row__memo">점심 김밥천국</span>
  </span>
  <span class="jr-expense-row__side">
    <span class="jr-expense-row__day">15일</span>
    <span class="jr-expense-row__amount">12,000원</span>
  </span>
</button>
```

```css
.jr-expense-row {
  width: 100%; min-height: 56px;               /* 44px 이상 확보, 3줄 정보 담아 여유 */
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--jr-sp-3);
  padding: var(--jr-sp-3) var(--jr-sp-4);
  border: none; border-bottom: 1px solid var(--jr-divider); /* 장식용 구분선 */
  background: var(--jr-bg);
  text-align: left;
  color: var(--jr-text);
}
.jr-expense-row__memo {
  color: var(--jr-text-muted); font-size: var(--jr-fs-sm);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;
}
.jr-expense-row__amount {
  font: var(--jr-fw-semibold) var(--jr-fs-base)/1 var(--jr-font-num);
  font-variant-numeric: tabular-nums;
}
```

| 상태 | 배경 | 비고 |
|---|---|---|
| 기본 | `--jr-bg` | 행 전체가 하나의 `<button>` — 탭하면 S-02 수정 모드 |
| hover | `--jr-surface` | |
| 눌림 | `--jr-surface-sunken` | |
| `:focus-visible` | 기본 유지 + outline 3px `--jr-focus` offset 2px | 행이 넓으므로 outline 이 다음 행과 겹치지 않게 `outline-offset: -2px` 대신 **바깥 2px**을 유지하되 인접 행과 최소 2px 이상 벌어지도록 `.jr-expense-row` 사이 여백을 `border-bottom` 만으로 두고 `margin` 을 추가하지 않음(테두리 겹침을 이용해 시각적으로 촘촘히 유지, outline 은 행 바깥쪽으로 그려짐) |

- 메모 1줄 말줄임: `white-space: nowrap` + `text-overflow: ellipsis`.
- `미분류(삭제된 카테고리)` 13자 한 줄 수용 확인: `.jr-expense-row__category` 는 `flex-shrink: 0` 대신 자연 폭을 쓰고, `--jr-fs-base`(16px) 기준 시스템 폰트에서 13자 한글은 대략 13×16px×0.95(한글 전각 비율 근사) ≈ 198px 로 계산됩니다. `.jr-expense-row__main` 의 좌측 폭이 카드 내부 최소 240px(모바일 360px 화면 기준 좌우 패딩 32px·우측 금액 영역 최소 90px 제외)을 넘으므로 한 줄에 들어갑니다 — 다만 이는 계산 근거이며 **실제 렌더 폭은 ④ 실측 항목**(시스템 폰트가 실제로 무엇으로 잡히는지에 따라 자간이 달라짐, §9). 넘칠 경우를 대비해 `.jr-expense-row__category` 에도 `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` 을 기본 적용해 레이아웃이 깨지지 않게 합니다.

### 4-11. 배너 3종 (상태형 · 사건형 · 차단형)

클래스: `.jr-banner.jr-banner--state|event|block`

```html
<div class="jr-banner jr-banner--state" role="status" style="position:sticky; top:0;">
  <svg class="jr-banner__icon" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/>
    <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>
  </svg>
  <p class="jr-banner__text">이 브라우저에서는 저장 기능이 꺼져 있어…</p>
  <button type="button" class="jr-banner__close" aria-label="닫기">
    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18"/>
    </svg>
  </button>
</div>
```

```css
.jr-banner {
  position: sticky; top: 0;                     /* fixed 금지 — 분배안 §2-6 */
  z-index: var(--jr-z-banner);
  display: flex; align-items: flex-start; gap: var(--jr-sp-3);
  padding: var(--jr-sp-4);
  border-radius: 0 0 var(--jr-radius-md) var(--jr-radius-md);
  max-width: var(--jr-maxw); margin: 0 auto;
  /* max-height, overflow:hidden 절대 사용 금지 — 높이는 항상 auto */
}
.jr-banner--state { background: var(--jr-banner-state-bg); color: var(--jr-text); }
.jr-banner--event { background: var(--jr-banner-event-bg); color: var(--jr-text); }
.jr-banner--block { background: var(--jr-banner-block-bg); color: var(--jr-text);
  border-left: 4px solid var(--jr-danger); }   /* 6.30:1, §3 */
.jr-banner__text { flex: 1; font-size: var(--jr-fs-sm); line-height: var(--jr-lh-body); }
.jr-banner__icon { flex-shrink: 0; color: var(--jr-text); }
.jr-banner__close {
  flex-shrink: 0; width: var(--jr-touch); height: var(--jr-touch);
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; color: var(--jr-text);
}
```

| 종류 | 배경 | 대비(본문) | 아이콘 모양 | 닫기 버튼 | 닫은 뒤 |
|---|---|---|---|---|---|
| 상태형 | `--jr-banner-state-bg` | 15.99:1(분배안 §2-3) | 정보 원(`i`) — §4-11 예시 | 있음 | 화면 이동 시 다시 노출(원인 지속) |
| 사건형 | `--jr-banner-event-bg` | **15.10:1**(§3) | 체크 원 — `<circle r="9"/><path d="M8 12l2.5 2.5L16 9"/>` | 있음 | 이 세션 동안 재노출 없음 |
| 차단형 | `--jr-banner-block-bg` | 14.89:1(분배안 §2-3) | 팔각형(정지 표지 모양) — `<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/>` | **없음**(만들지 않음) | 새로고침 전까지 고정 |

- 세 아이콘은 서로 다른 모양(원+선 / 원+체크 / 팔각형)이라 배경색이 같아 보이는 경우(색약)에도 구분됩니다(분배안 §2-5).
- 최장 문구 검증: E-201(3문장, 95자)·E-307(78자) 모두 `max-height`·`overflow:hidden` 을 쓰지 않는 `position: sticky` + 높이 `auto` 구조이므로 **구조적으로 잘림이 불가능**합니다(분배안 §2-6 사유 그대로 채택. 실제 줄바꿈 후 몇 줄이 되는지는 폰트 폭에 따라 달라지지만, 높이가 항상 내용을 따라가므로 "잘림"은 발생하지 않습니다).
- 배너는 항상 1개만 표시(우선순위는 구조설계 §7-8). 이 문서는 표시 규칙을 다시 정하지 않고 그대로 따릅니다.

### 4-12. 토스트

클래스: `.jr-toast`

```html
<div class="jr-toast" role="status" aria-live="polite">저장했습니다</div>
```

```css
.jr-toast {
  position: fixed; left: 50%; transform: translateX(-50%);
  bottom: calc(var(--jr-tabbar-h) + var(--jr-sp-2) + env(safe-area-inset-bottom)); /* §2-7 토스트 기준선, 분배안 §3-6 그대로 */
  z-index: var(--jr-z-toast);
  max-width: calc(var(--jr-maxw) - var(--jr-sp-8));
  padding: var(--jr-sp-3) var(--jr-sp-4);
  border-radius: var(--jr-radius-md);
  background: var(--jr-toast-bg);
  color: var(--jr-toast-text);                  /* 13.48:1 */
  font-size: var(--jr-fs-sm);
  line-height: var(--jr-lh-body);
}
```

- S-02 에서는 `--jr-tabbar-h: 0` 이 그 화면 컨테이너에 적용되어 있으므로 위 계산식이 그대로 하단 8px + 안전영역이 됩니다(분배안 §3-6, 재계산 없이 그대로 인용).
- 조작 요소(닫기 버튼 등) 없음 — 어두운 배경 위 포커스 문제(§2-3 발견 2)가 애초에 발생하지 않음.
- 교체(누적 없음): 새 토스트가 뜨면 이전 토스트는 즉시 대체(마운트된 노드 재사용, DOM에 2개를 쌓지 않음).
- 최장 문구 E-121(74자)은 `max-width: calc(520px - 32px)` 안에서 2~3줄로 자연 줄바꿈되며, 높이는 `auto`(고정 높이 없음)이므로 잘리지 않습니다.

### 4-13. 대화상자 5종

클래스: `.jr-dialog-overlay` → `.jr-dialog`

```html
<div class="jr-dialog-overlay">
  <div class="jr-dialog" role="alertdialog" aria-modal="true" aria-labelledby="jr-dialog-title" aria-describedby="jr-dialog-desc">
    <p id="jr-dialog-title" class="jr-dialog__title">이 기록을 삭제할까요?</p>
    <p id="jr-dialog-desc" class="jr-dialog__desc">삭제한 기록은 복구할 수 없습니다.</p>
    <div class="jr-dialog__actions">
      <button type="button" class="jr-btn jr-btn--secondary" data-default-focus>취소</button>
      <button type="button" class="jr-btn jr-btn--danger">삭제</button>
    </div>
  </div>
</div>
```

```css
.jr-dialog-overlay {
  position: fixed; inset: 0; z-index: var(--jr-z-dialog-overlay);
  background: rgba(22, 25, 29, 0.5);            /* --jr-text(#16191D) 50% 알파. 전용 스크림 토큰이 계약에 없어 기존 토큰을 알파로 활용 — questions.md Q-018 참고 */
  display: flex; align-items: center; justify-content: center;
  padding: var(--jr-sp-4);
}
.jr-dialog {
  z-index: var(--jr-z-dialog);
  width: 100%; max-width: min(var(--jr-maxw), 420px);
  background: var(--jr-bg);
  border-radius: var(--jr-radius-md);
  padding: var(--jr-sp-6);
}
.jr-dialog__title { font: var(--jr-fw-bold) var(--jr-fs-lg)/var(--jr-lh-heading) var(--jr-font); color: var(--jr-text); }
.jr-dialog__desc  { margin-top: var(--jr-sp-2); font-size: var(--jr-fs-sm); line-height: var(--jr-lh-body); color: var(--jr-text-muted); }
.jr-dialog__actions { margin-top: var(--jr-sp-6); display: flex; justify-content: flex-end; gap: var(--jr-sp-3); }
```

| 대화상자 | 버튼(왼쪽=안전/기본포커스 · 오른쪽=실행) | 오른쪽 버튼 스타일 | 간격 |
|---|---|---|---|
| 나가기 확인(S-02) | `계속 입력`(기본 포커스) / `나가기` | `.jr-btn--danger`(입력 내용 소실은 되돌릴 수 없음) | 12px |
| 기록 삭제(S-02) | `취소`(기본 포커스) / `삭제` | `.jr-btn--danger` | 12px |
| 카테고리 삭제(S-04, 문구 2종) | `취소`(기본 포커스) / `삭제` | `.jr-btn--danger` | 12px |
| 가져오기 경고(S-04) | `취소`(기본 포커스) / `가져오기` | `.jr-btn--danger`(전체 교체, 파괴적) | 12px |
| 전체 삭제 1단계(S-04) | `취소`(기본 포커스) / `다음` | `.jr-btn--primary`(아직 삭제 실행 아님, 진행만) | 8px |
| 전체 삭제 2단계(S-04, 최종) | `취소`(기본 포커스) / `모두 삭제` | `.jr-btn--danger` | 12px |

- 포커스 트랩: `Tab`/`Shift+Tab` 이 `.jr-dialog` 내부 요소만 순환(첫 요소에서 `Shift+Tab` → 마지막 요소, 마지막에서 `Tab` → 첫 요소). 트랩 자체는 ④ 구현(JS) 영역이며 이 문서는 `data-default-focus` 마크업 지점만 지정합니다.
- `Esc` = 왼쪽(안전) 버튼과 동일 동작.
- 닫히면 포커스는 대화상자를 연 버튼으로 복귀.
- 진입/퇴장 모션: `--jr-dur-base`(180ms) 오버레이 `opacity 0→1`, 본체 `opacity 0→1` + `transform: scale(0.96)→scale(1)`. reduced-motion에서는 `transition-duration: 0.01ms` 로 즉시 나타남(§7 모션 스펙 참조) — 크기 변화는 보조 연출일 뿐 정보 전달에 필요하지 않으므로 즉시 나타나도 의미가 그대로 유지됨.
- 최장 본문: 가져오기 경고(치환 전 87자)도 `.jr-dialog__desc` 가 `max-width` 안에서 자동 줄바꿈, 높이 `auto` — 잘림 없음.

---

## 5. 추가로 정의할 영역 4개

### 5-1. I 슬롯(인라인 오류) — 자리 예약 방식

**결정: 4개 자리(날짜·금액·카테고리·카테고리 이름) 모두 항상 자리를 예약합니다(레이아웃 고정, 흔들리지 않음).**

```css
.jr-field__hint {
  min-height: calc(var(--jr-fs-sm) * var(--jr-lh-body)); /* 14px × 1.6 ≈ 22.4px, 한 줄분 고정 */
  margin-top: var(--jr-sp-1);
  display: flex; align-items: flex-start; gap: var(--jr-sp-1);
  font-size: var(--jr-fs-sm); line-height: var(--jr-lh-body);
  visibility: hidden;                      /* 메시지 없을 때도 공간 유지, display:none 아님 */
}
.jr-field__hint--visible { visibility: visible; }
.jr-field__hint--error { color: var(--jr-danger); }        /* 6.89:1 (surface 배경 기준) */
.jr-field__hint--neutral { color: var(--jr-text-muted); }  /* INT-04, 5.71:1 */
```

- **사유**: S-02 는 날짜·금액·카테고리 세 필드의 오류가 동시에 뜨거나 사라질 수 있습니다(예: 저장 눌렀는데 두 필드가 동시에 잘못됨). 자리가 접혔다 펼쳐지면 그 순간 다른 필드·버튼이 위아래로 밀려 사용자가 다음에 탭하려던 요소가 다른 곳으로 이동합니다(특히 `저장` 버튼처럼 화면 하단 고정 요소 근처). **고정 높이 예약**이 이 흔들림을 원천 차단합니다. 대신 메시지가 없을 때는 빈 22.4px 여백이 보이는 비용을 지불하지만, 이 비용이 조작 실수 방지보다 저렴하다고 판단했습니다.
- 아이콘 규격은 4종(날짜·금액·카테고리·카테고리 이름) 전부 동일: `viewBox 0 0 24 24`, 표시 16px, `aria-hidden="true" focusable="false"`, 경고 삼각형 모양(§7-2 참고).
- INT-04(카테고리 미선택 안내)도 **동일 규격**의 자리를 씁니다(`.jr-field__hint--neutral`) — 분배안 §3-1 요구대로 다른 I 슬롯과 같은 위치·높이·아이콘 크기.

### 5-2. 내보내기 대체 영역 (S-04, INT-10 — 성공·실패 모두 노출)

클래스: `.jr-export-fallback`

```html
<section class="jr-export-fallback" aria-live="polite">
  <p class="jr-export-fallback__notice">파일을 저장했습니다. 저장된 파일이 보이지 않으면 아래 내용을 복사해 보관하세요.</p>
  <textarea class="jr-export-fallback__text" readonly aria-label="내보낸 데이터 전체"></textarea>
  <button type="button" class="jr-btn jr-btn--secondary">전체 선택</button>
</section>
```

```css
.jr-export-fallback { margin-top: var(--jr-sp-4); padding: var(--jr-sp-4); border-radius: var(--jr-radius-md); background: var(--jr-surface); }
.jr-export-fallback__notice { font-size: var(--jr-fs-sm); line-height: var(--jr-lh-body); color: var(--jr-text); margin-bottom: var(--jr-sp-3); }
.jr-export-fallback__text {
  width: 100%; height: 160px;              /* 고정 높이 + 내부 스크롤 — 대화상자·화면 전체 길이를 데이터 크기에 종속시키지 않음 */
  overflow-y: auto;
  padding: var(--jr-sp-3);
  border: 1px solid var(--jr-border);
  border-radius: var(--jr-radius-sm);
  background: var(--jr-bg);
  color: var(--jr-text);
  font: 400 var(--jr-fs-sm)/var(--jr-lh-body) ui-monospace, "SFMono-Regular", Consolas, monospace;
  /* 모노스페이스는 시스템 폰트 스택에 없던 값이므로 --jr-font 대신 OS 기본 코드 폰트 스택을 직접 나열 — JSON 텍스트 가독성 목적. 외부 폰트 로드 없음(전부 로컬 시스템 폰트) */
  resize: none;
  margin-bottom: var(--jr-sp-3);
}
```

| 안내문 | 발생 |
|---|---|
| `파일을 저장했습니다. 저장된 파일이 보이지 않으면 아래 내용을 복사해 보관하세요.` | 성공(`anchor-blob`/`anchor-data`) — 기획서 INT-10 확정 문구 |
| `파일 저장이 지원되지 않는 환경입니다. 아래 내용을 직접 복사해 보관하세요.` | 실패(`E-401`) — 화면설계 확정 문구 |

- 텍스트 영역은 **고정 높이 160px + 내부 스크롤**(전체를 펼치지 않음 — JSON 전문 길이가 기록 수에 비례해 늘어나므로 화면 전체가 늘어지는 것을 막기 위함). `readonly`, `전체 선택` 버튼이 `select()` 로 전체 선택 상태 전환(④ JS 구현).
- 영역은 S-04 를 벗어나면 사라지고 재진입 시 다시 `내보내기` 를 눌러야 나타남(화면설계 그대로).

### 5-3. 빈 상태 (S-01 2종 · S-03 1종)

클래스: `.jr-empty-state`

```html
<div class="jr-empty-state">
  <p class="jr-empty-state__title">아직 기록이 없어요</p>
  <p class="jr-empty-state__body">첫 지출을 기록해 보세요.</p>
</div>
```

```css
.jr-empty-state {
  padding: var(--jr-sp-10) var(--jr-sp-4);   /* 40px 상하 여유 */
  text-align: center;
}
.jr-empty-state__title { font: var(--jr-fw-bold) var(--jr-fs-lg)/var(--jr-lh-heading) var(--jr-font); color: var(--jr-text); }
.jr-empty-state__body  { margin-top: var(--jr-sp-2); font-size: var(--jr-fs-base); line-height: var(--jr-lh-body); color: var(--jr-text-muted); }
```

| 화면 | 제목 | 본문 |
|---|---|---|
| S-01 전체 0건 | `아직 기록이 없어요` | `첫 지출을 기록해 보세요.` |
| S-01 해당 월만 0건 | (제목 없음 — 화면설계가 본문 한 문장만 확정) | `이 달에는 기록이 없습니다.` |
| S-03 해당 월 0건 | (제목 없음) | `이 달에는 기록이 없어 통계를 표시할 수 없습니다.` |

- 제목이 없는 두 케이스는 `.jr-empty-state__title` 을 렌더링하지 않고(빈 요소를 만들지 않음) 본문만 `.jr-empty-state__body` 로 출력합니다 — 문구를 새로 만들지 않기 위함(화면설계에 제목이 확정되어 있지 않으므로 임의로 짓지 않음).
- 아이콘 없음(문구 원칙 그대로, §0 아이콘 예산 9개에 포함하지 않음).
- **E-307 읽기 전용 모드에서는 이 컴포넌트 자체를 렌더링하지 않습니다**(분배안 §3-7). S-01·S-03 모두 목록/막대 영역을 완전히 비우고 이 빈 상태 문구도 띄우지 않습니다 — 자체 판단으로 안내 문구를 채우지 않았습니다.

### 5-4. 부팅 이전 3요소

```html
<noscript>
  <div class="jr-noscript">자바스크립트가 꺼져 있어 앱을 사용할 수 없습니다. 브라우저 설정에서 자바스크립트를 켜고 새로고침해 주세요.</div>
</noscript>
<div id="jr-unsupported">이 브라우저에서는 앱을 사용할 수 없습니다. 크롬·엣지·사파리·파이어폭스의 최신 버전에서 열어 주세요.</div>
<div id="jr-loading">불러오는 중</div>
```

```css
.jr-noscript, #jr-unsupported {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  padding: var(--jr-sp-6);
  background: var(--jr-bg);
  color: var(--jr-text);
  font: var(--jr-fw-regular) var(--jr-fs-base)/var(--jr-lh-body) var(--jr-font);
  text-align: center;
}
#jr-unsupported {
  z-index: var(--jr-z-unsupported);           /* 60 */
  opacity: 0;
  animation: jr-reveal 0s linear 3s forwards;  /* 분배안 §3-3 그대로 — 3초 뒤 노출 */
}
@keyframes jr-reveal { to { opacity: 1; } }

#jr-loading {
  position: fixed; inset: 0; z-index: 10;
  display: flex; align-items: center; justify-content: center;
  color: var(--jr-text-muted);
  font-size: var(--jr-fs-base);
  /* 스피너·마크·아이콘 없음 — 화면설계 S-01 로딩 상태 확정: 텍스트만 */
}
```

- 세 요소 모두 브랜드 마크 없음(분배안 §3-4 그대로).
- `#jr-unsupported` 는 `prefers-reduced-motion` 리셋에서 **반드시 제외**(§1 토큰 블록의 `*:not(#jr-unsupported)` 선택자가 이미 처리). 리셋에 걸리면 `animation-duration: 0.01ms` 가 강제되어 지연 없이 즉시 나타나 정상 부팅에서도 번쩍입니다.
- 겹침 순서: `<noscript>`(최상단, JS 꺼진 경우만 브라우저가 렌더) → `#jr-unsupported`(z-index 60, 3초 지연) → `#jr-loading`(z-index 10). 정상 부팅 시 `boot.js` 가 `#jr-unsupported` 를 3초 이전에 DOM에서 제거.

---

## 6. 화면별 레이아웃 스펙 — 4개 화면 × 24개 상태

공통 골격: 페이지 배경 `--jr-bg`, 본문 열 `max-width: var(--jr-maxw)`(520px) 가운데 정렬, 좌우 패딩 `var(--jr-sp-4)`(16px), 화면 상단부터 배너(있으면) → 화면별 헤더 → 본문 → (S-01·S-03·S-04) 탭바.

### 6-1. S-01 홈 — 7종

레이아웃 순서(위→아래): 배너(조건부, sticky) → 월 이동 바(`이전 달` / 월 표시 `--jr-fs-lg` / `다음 달`, 간격 `var(--jr-sp-2)`) → 총합 카드(`이 달 총 지출` 라벨 `--jr-fs-sm` `--jr-text-muted` + 금액 `--jr-fs-amount` `--jr-text` `tabular-nums`) → `+ 지출 추가`(주요 버튼, 총합 카드 아래 `var(--jr-sp-4)`) → 목록(`.jr-expense-row` 반복, 세로 스크롤, 페이지 없음) → 탭바(`--jr-tabbar-h`).

| # | 상태 | 시안 규칙 |
|---|---|---|
| 1 | 정상 | 위 골격 그대로. 목록은 §4-1 정렬(날짜↓→생성↓→id↓)을 그대로 반영해 렌더 |
| 2 | 전체 0건(빈 상태) | 목록 영역을 `.jr-empty-state`(제목 `아직 기록이 없어요` / 본문 `첫 지출을 기록해 보세요.`)로 교체. 총합 카드는 화면설계상 "안내 문구만 표시"이므로 총합 카드 자체를 숨기고 빈 상태 블록만 남김. `+ 지출 추가`는 그대로 활성·강조 노출 |
| 3 | 해당 월만 0건 | 총합 카드는 `0원` 그대로 유지(숨기지 않음). 목록 영역만 `.jr-empty-state`(본문 `이 달에는 기록이 없습니다.`, 제목 없음)로 교체 |
| 4 | 기록 수백 건 | 목록 컨테이너에 `overflow-y: auto`(또는 페이지 자연 스크롤), 더보기·페이지네이션 UI 없음. 메모 말줄임은 §4-10 그대로 |
| 5 | 로딩 | `#jr-loading` 만 표시(§5-4), 탭바·버튼 등 다른 요소는 이 순간 DOM에 렌더하지 않음(화면설계 확정) |
| 6 | 배너 노출 | `.jr-banner` 를 본문 최상단 sticky로 삽입, 종류는 발생한 코드에 따름(§4-11) |
| 7 | E-307 읽기 전용 | `.jr-banner--block`(닫기 없음) 고정 노출. 목록·빈 상태 문구 **모두 렌더하지 않음**(빈 컨테이너만 유지, §5-3). `+ 지출 추가`는 `disabled`(§4-1 비활성 스펙) |

초기 포커스: `이전 달` 버튼(배너가 있어도 동일 — 분배안 §3-5).

### 6-2. S-02 입력 — 6종

레이아웃(탭바 없음, `--jr-tabbar-h: 0` 오버라이드): 배너(조건부, sticky, INT-01) → 상단 제목(`--jr-fs-lg`, 추가 모드 `지출 추가` / 수정 모드 `지출 수정`) + `취소` 버튼(제목과 같은 행, 우측 정렬) → 날짜 필드(§4-7) → 금액 필드(§4-6) → 카테고리 칩 그룹(§4-8) + I 슬롯(§5-1) → 메모 필드(§4-5) → `저장`(주요 버튼, 전체 너비) → (수정 모드만) `이 기록 삭제`(파괴적 버튼, `저장` 아래 `var(--jr-sp-4)` 간격 — 저장과 삭제 사이는 서로 다른 목적의 버튼이라 파괴적 기준 12px이 아니라 시각적으로 분리된 섹션 간격 16px 사용, 오조작 방지는 간격보다 별도 확인 대화상자가 1차 방어선).

| # | 상태 | 시안 규칙 |
|---|---|---|
| 1 | 추가 모드 | 제목 `지출 추가`. 날짜 기본값 오늘, 금액/메모 빈값, 카테고리 미선택 → INT-04 중립 안내 상시 노출. `이 기록 삭제` 버튼 없음(DOM에 없음, `display:none` 아님 — 애초에 렌더하지 않음) |
| 2 | 수정 모드 | 제목 `지출 수정`. 4개 필드가 기존 값으로 채워짐. `이 기록 삭제` 버튼 노출 |
| 3 | 인라인 오류 표시 중 | 해당 필드 `.jr-field__hint--error` 활성(§5-1), 입력란 테두리 `--jr-danger` 2px. 여러 필드 동시 오류 가능(저장 시도 시 전부 표시) |
| 4 | 카테고리 0개 대체 안내 | 칩 그룹 영역을 문구 `설정에서 카테고리를 먼저 추가해 주세요.` 로 교체(`.jr-field__hint` 규격이 아니라 칩 그룹 자체를 대체하는 별도 텍스트 블록, `--jr-fs-base` `--jr-text`). `저장` 버튼 `disabled` |
| 5 | 배너 노출(INT-01) | S-01과 동일 `.jr-banner`, 위치는 상단 제목보다 위 |
| 6 | 초안 복원 직후 | 폼이 초안 값으로 채워진 상태로 진입. 진입 직후 토스트 `E-602`(`작성 중이던 내용을 다시 불러왔습니다.`) 자동 노출(§4-12 토스트 규칙 그대로). 시각적으로 다른 필드 스타일 변화 없음(상태 배지를 추가로 두지 않음 — 화면설계·구조설계 어디에도 "복원됨" 배지가 확정되지 않았으므로 임의로 만들지 않음) |

초기 포커스: 날짜 필드(배너 유무와 무관 — 분배안 §3-5).

### 6-3. S-03 통계 — 5종

레이아웃: 배너(조건부) → 월 이동 바(S-01과 동일) → 총합 카드(`이 달 총 지출` + 금액 + `총 N건`, `총 N건` 은 `--jr-fs-sm` `--jr-text-muted`) → 막대 목록(`.jr-stat-row` 반복) → 탭바.

```html
<div class="jr-stat-row">
  <div class="jr-stat-row__head">
    <span class="jr-stat-row__name">식비</span>
    <span class="jr-stat-row__value">320,000원 (24%)</span>
  </div>
  <div class="jr-bar-track">
    <div class="jr-bar-fill" style="width:24%"></div>
  </div>
</div>
```

```css
.jr-stat-row { margin-bottom: var(--jr-sp-4); }
.jr-stat-row__head { display: flex; justify-content: space-between; margin-bottom: var(--jr-sp-1); }
.jr-stat-row__name { font-size: var(--jr-fs-base); color: var(--jr-text); }
.jr-stat-row__value { font-size: var(--jr-fs-sm); color: var(--jr-text-muted); font-variant-numeric: tabular-nums; }
.jr-bar-track {
  height: 10px; border-radius: var(--jr-radius-pill);
  background: var(--jr-track);
  border: 1px solid var(--jr-border);      /* 분배안 §2-3 발견 3 — 트랙 자체 대비 1.23:1 이라 경계선 필수 */
}
.jr-bar-fill {
  height: 100%; border-radius: var(--jr-radius-pill);
  background: var(--jr-brand);              /* 5.21:1 vs 트랙 */
  min-width: 6px;                            /* 분배안 §3-2 — 0% 항목도 보이게 */
}
.jr-stat-row--deleted .jr-bar-fill { background: var(--jr-bar-deleted); } /* 5.02:1 vs 트랙 */
```

| # | 상태 | 시안 규칙 |
|---|---|---|
| 1 | 정상 | 막대 목록은 `JR.stats.byCategory()` 가 반환한 순서를 **그대로** 렌더(UI 재정렬 금지, INT-07) |
| 2 | 해당 월 0건(빈 상태) | 막대 목록 영역 전체를 `.jr-empty-state`(본문만: `이 달에는 기록이 없어 통계를 표시할 수 없습니다.`)로 교체. 총합은 `0원 · 총 0건` 그대로 표시 |
| 3 | 카테고리 20개 스크롤 | 막대 목록 컨테이너 자연 스크롤, 접기·더보기 없음 |
| 4 | 0% 항목 포함 | `.jr-bar-fill { width: 0%; min-width: 6px; }` — 실제 렌더 폭은 6px, 텍스트는 정확한 금액·`(0%)` 그대로 표시(색·길이만으로 정보 전달하지 않음) |
| 5 | `미분류` 항목 포함 | 배열의 **항상 마지막**에 위치(INT-07). `.jr-stat-row--deleted` 클래스로 채움색만 `--jr-bar-deleted` 로 교체, 그 외 레이아웃 동일. 라벨 `미분류(삭제된 카테고리)` — `.jr-stat-row__name` 도 `overflow:hidden;text-overflow:ellipsis;white-space:nowrap` 적용해 좁은 화면에서도 줄이 깨지지 않게 함 |

초기 포커스: `이전 달` 버튼. 막대 목록은 포커스 대상 아님(정보 표시 영역, `tabindex` 부여하지 않음).

### 6-4. S-04 설정 — 6종

레이아웃: 배너(조건부) → 구역 `카테고리 관리`(`--jr-fs-lg` 제목) → 카테고리 행 목록(`.jr-category-row` 반복) → 새 카테고리 입력란 + `추가` → 구역 `데이터 관리` → `내보내기` → (조건부) 내보내기 대체 영역(§5-2) → `가져오기` → 구역 `데이터 초기화` → `전체 삭제` → 탭바.

```html
<div class="jr-category-row">
  <span class="jr-category-row__name">식비</span>
  <div class="jr-category-row__actions">
    <button type="button" class="jr-btn jr-btn--secondary jr-btn--sm">이름변경</button>
    <button type="button" class="jr-btn jr-btn--danger jr-btn--sm">삭제</button>
  </div>
</div>
```

```css
.jr-category-row {
  display: flex; align-items: center; justify-content: space-between;
  min-height: var(--jr-touch);
  padding: var(--jr-sp-2) 0;
  border-bottom: 1px solid var(--jr-divider);
}
.jr-category-row__actions { display: flex; gap: var(--jr-sp-3); } /* 12px — 이름변경↔삭제, 파괴적 인접 규칙 */
.jr-btn--sm { height: 36px; padding: 0 var(--jr-sp-3); position: relative; }
.jr-btn--sm::before { content: ''; position: absolute; inset: -4px; } /* 36px 시각 크기를 44px 히트영역으로 확장, -4px×2=8px 보정 */
```

- `.jr-btn--sm` 은 시각 높이 36px 이지만 `::before` 확장으로 실제 히트 영역 44px 를 확보합니다. `이름변경`과 `삭제` 사이 `gap: 12px` 이 있고 각 히트영역 확장이 ±4px 이므로 확장된 영역끼리는 `12px - 4px - 4px = 4px` 간격이 남아 서로 겹치지 않습니다(경계 없이 인접 다른 행의 버튼과도 세로 방향으로 겹치지 않도록 `.jr-category-row` 의 `padding: 8px 0`이 세로 여유를 확보).

| # | 상태 | 시안 규칙 |
|---|---|---|
| 1 | 정상 | 카테고리 행 등록 순서(`order`)대로 나열. 각 행 기본 표시 상태 |
| 2 | 카테고리 행 편집 상태 | 해당 행의 `이름변경`/`삭제` 버튼을 입력란(§4-5 `.jr-input`, 기존 이름 채움) + `확인`(주요 버튼, 소형) / `취소`(보조 버튼, 소형)로 교체. 입력란 아래 I 슬롯 자리(§5-1) 사용, `E-114`·`E-115`·`E-116` 표시 |
| 3 | 카테고리 20개 도달 | 새 카테고리 입력란·`추가` 버튼 `disabled`(§4-1/§4-5 비활성 스펙). 입력란 자리에 안내문 `카테고리는 최대 20개까지 만들 수 있습니다.` 을 `.jr-field__hint--neutral` 규격으로 상시 노출(자리 예약 없이 항상 보임 — 20개 조건이 유지되는 동안 계속 표시) |
| 4 | 카테고리 1개(삭제 비활성) | 유일한 행의 `삭제` 버튼 `disabled`(§4-3). **Q-014 잠정 2번 채택**: 20개 안내문과 동일 규격의 안내 문구 자리를 `카테고리 관리` 구역 제목 아래에 상시 확보(`.jr-field__hint--neutral` 재사용). 문구 텍스트는 ② 판정 대기 — 자리만 예약하고 내용은 `E-118` 문자열(`카테고리는 최소 1개가 있어야 해서 삭제할 수 없습니다. 새 카테고리를 먼저 추가해 주세요.`)을 잠정 배치. ② 가 다른 문구를 확정하면 텍스트만 교체하면 되도록 별도 하드코딩 없이 `JR.err.MESSAGES['E-118']` 를 그대로 바인딩하는 구조로 마크업 준비 |
| 5 | 내보내기 대체 영역 노출 | §5-2 그대로, `내보내기` 버튼 바로 아래 삽입 |
| 6 | 가져오기 진행 중 | 가져오기 확인 대화상자의 `가져오기` 버튼 라벨이 `가져오는 중…` 으로 바뀌고 `disabled`(§4-1 비활성 스펙 + 라벨 텍스트 교체는 ④ 구현) |

초기 포커스: 카테고리 첫 행의 `이름변경` 버튼(분배안 §3-5). E-307(카테고리 목록이 빔)일 때는 `카테고리 관리` 구역 제목(`tabindex="-1"`)으로 대체.

---

## 7. 모션 스펙

| 상태 변화 | 토큰 | 속성 | 비고 |
|---|---|---|---|
| 버튼 hover/active 오버레이 | `--jr-dur-fast`(120ms) `--jr-ease` | `opacity` | §4-1·§4-3 오버레이 |
| 칩 선택 전환 | `--jr-dur-fast`(120ms) `--jr-ease` | `background-color`, `border-color`, `color` | |
| 배너 등장 | `--jr-dur-base`(180ms) `--jr-ease` | `opacity` (0→1). 높이는 처음부터 `auto`이므로 애니메이션 대상 아님(레이아웃 시프트 방지) | |
| 대화상자 등장 | `--jr-dur-base`(180ms) `--jr-ease` | 오버레이 `opacity`, 본체 `opacity` + `transform: scale(.96→1)` | reduced-motion에서 스케일 변화는 즉시 완료, 오버레이/본체 모두 즉시 보임 |
| 대화상자 퇴장 | `--jr-dur-base`(180ms) `--jr-ease` | 위 역순 | |
| 토스트 등장 | `--jr-dur-toast-in`(180ms) `--jr-ease` | `opacity`(0→1) + `transform: translateY(8px→0)` | 이동은 보조 연출, reduced-motion에서 즉시 최종 위치·불투명도로 나타나도 "저장했습니다"라는 의미는 그대로 전달됨 |
| 토스트 소멸 | `--jr-dur-toast-out`(200ms) `--jr-ease` | `opacity`(1→0) | 3초 표시 시간(기획 확정)에 **포함**되는 시간, 3초를 늘리지 않음 |
| `#jr-unsupported` 지연 노출 | 없음(0ms 지속 + 3s 지연의 `animation`) | `opacity` | `prefers-reduced-motion` 리셋에서 **제외**(§5-4) — 유일한 예외 |
| 탭 전환 | 없음(순간 전환) | — | 화면 자체가 바뀌므로 트랜지션 없음. 탭바의 인디케이터만 배경색·위치 즉시 갱신 |

```css
@media (prefers-reduced-motion: reduce) {
  *:not(#jr-unsupported), *:not(#jr-unsupported)::before, *:not(#jr-unsupported)::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

(§1 토큰 블록과 동일 — 이 문서 어디서든 재정의하지 않고 한 곳에만 둡니다.)

---

## 8. 계약에 없던 값 2건 — `questions.md` Q-018 로 남기고 잠정 진행

| 지점 | 계약 부재 | 잠정 해법 |
|---|---|---|
| 주요/파괴적 버튼의 hover·pressed 피드백 | 분배안 §2-2 색 토큰에 "브랜드색보다 어두운/밝은" 변형 토큰이 없음 | 새 색 토큰을 만들지 않고, `--jr-text`(#16191D)를 8%/16% 알파 오버레이로 얹어 어둡게(§4-1·§4-3). 순수 CSS, 추가 이미지·필터 불필요 |
| 대화상자 뒷막(오버레이) 색 | 분배안에 `--jr-overlay` 류 스크림 토큰이 없음 | `--jr-text` 를 50% 알파로 사용(`rgba(22,25,29,.5)`, §4-13). 새 이름의 토큰을 만들지 않고 기존 토큰 값을 그대로 재사용 |

두 건 모두 "가장 가까운 기존 토큰을 쓰라"는 분배안 §2-2 지침을 따른 것이며, 새 색상 값을 창작하지 않았습니다(기존 토큰의 알파 변형만 사용). `ai-team/questions.md` Q-018 에 기록했습니다.

---

## 9. 확인 불가 — ④ 실측 항목 (단정하지 않음)

이 문서에서 만든 시안 중 브라우저 실행 없이는 검증할 수 없는 지점입니다. 분배안 §8-3 목록에 아래 3건을 더합니다.

| # | 지점 | 이유 |
|---|---|---|
| 1 | 금액 입력란의 `padding-right: 32px` 이 `999,999,999원` 9자리 + 접미사 `원`을 실제 시스템 폰트에서 겹침 없이 수용하는가(§4-6) | 시스템 폰트 실제 렌더 폭을 알 수 없음 |
| 2 | `<input type="date">` 기본 달력 아이콘이 `padding-right: 32px` 여유와 브라우저별로 충돌하지 않는가(§4-7) | 셰도우 DOM, 브라우저마다 다름(분배안 §8-3과 동일 항목 재확인) |
| 3 | `미분류(삭제된 카테고리)`(13자) 및 카테고리 20개 칩이 실제 좁은 화면(360px 폭)에서 몇 줄/한 줄로 렌더되는가(§4-10·§4-8) | 실제 시스템 폰트의 자간에 따라 달라짐(분배안 §8-3 항목과 동일) |
| 4 | `#jr-unsupported` 3초 지연의 실제 브라우저 동작(모바일 사파리 `file://` 등) | 분배안 §3-3에서 이미 ④ 실측 항목으로 지정됨. 이 문서는 CSS 구현만 제공(§5-4) |

이 문서는 위 항목들을 "동작한다"고 단정하지 않고, 실측 실패 시에도 레이아웃이 깨지지 않도록 여유값·`overflow` 처리·자연 줄바꿈을 기본 전략으로 삼았습니다(예: 목록 행 카테고리명에 말줄임 폴백 추가, 텍스트 영역 내부 스크롤).

---

## 10. 반려 사유 자가 점검 (분배안 §8-2 기준)

| # | 반려 사유 | 이 문서 상태 |
|---|---|---|
| 1 | 대비비 계산값 없이 제출 | §3 에 이 문서에서 새로 등장한 4개 조합 전부 계산값 제시. 나머지는 분배안 §2-3 인용 |
| 2 | 고정 토큰 이름·값 임의 변경 | §1 토큰 블록이 분배안 §2 값과 100% 동일. 새 토큰은 `--jr-lh-*`·`--jr-fw-*`·`--jr-fs-*`·`--jr-z-unsupported` 뿐이며 전부 분배안이 위임하거나(타이포) 텍스트로 이미 확정한(z-index 60) 값 |
| 3 | 외부 폰트·CDN·아이콘 세트·래스터 이미지 | 없음. 아이콘 전부 인라인 SVG(§7-2), 모노스페이스 텍스트 영역도 로컬 시스템 폰트 스택만 사용(§5-2) |
| 4 | 확정 문구를 고치거나 새로 만듦 | 없음. 모든 문구는 화면설계·구조설계·기획서 §7 원문 그대로 인용. Q-014 미결 문구는 `JR.err.MESSAGES['E-118']` 자리만 예약하고 임의로 새 문구를 짓지 않음 |
| 5 | 터치 44×44 미만·파괴적 버튼 인접 12px 미만 | `.jr-btn--sm` 은 `::before` 확장으로 44px 확보(§6-4). 파괴적 버튼 인접 전부 12px(§4-3·§4-13) |
| 6 | 포커스 표시 없는 조작 요소 | 모든 컴포넌트에 `:focus-visible` 규칙 명시(§4 전체) |
| 7 | `prefers-reduced-motion` 블록 누락 | §1·§7 에 명시, `#jr-unsupported` 예외 처리 포함 |
| 8 | 색만으로 구분되는 상태 | 분배안 §2-5 5개 지점 전부 반영(칩=배경+테두리+aria-checked, 탭=색+인디케이터+굵기+aria-current, 비활성 버튼=채움+aria-disabled+커서, 인라인 오류=색+아이콘+텍스트+테두리, 배너=배경+아이콘+닫기유무) |
| 9 | 인수인계서 §7 상태 목록 누락 | S-01 7 · S-02 6 · S-03 5 · S-04 6 = 24종 전부 §6에 기재 |
| 10 | 검증 못 한 것을 단정 | §9 에 4건 명시, "확인 불가"로 표기 |

---

작성 완료. 병렬 산출물 `docs/디자인-브랜드.md`(`brand-designer`)와의 통합은 파트장 2차 호출(`docs/디자인가이드.md`)에서 이뤄집니다.
