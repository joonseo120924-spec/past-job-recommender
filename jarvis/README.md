# J.A.R.V.I.S. — 4단계 시스템

말 한마디로 하루를 굴리는 개인 비서. **브레인 · 기억 · 보이스 · HUD** 네 부품만
있습니다. 외부 API를 호출하지 않고, 음성은 브라우저 밖으로 나가지 않습니다.

```bash
pip install -r requirements.txt
uvicorn jarvis.main:app --reload --port 8010
# http://127.0.0.1:8010  ← HUD 한 화면
```

볼트를 옵시디언 금고로 바꾸려면:

```bash
JARVIS_VAULT=~/Documents/MyVault uvicorn jarvis.main:app --port 8010
```

## 네 개의 부품

| 파트 | 하는 일 | 코드 |
|---|---|---|
| 브레인 | 요청을 스킬 하나로 연결 (INTENT → SKILL) | `jarvis/skills_registry.py`, `jarvis/skills/*/SKILL.md` |
| 기억 | 모든 기록이 마크다운으로 쌓임 | `jarvis/vault.py`, `vault/` |
| 보이스 | 로컬 STT/TTS, 스페이스바로 말하기 | `jarvis/static/hud.js` (Web Speech) |
| HUD | 한 화면에서 상태·명령·일정 | `jarvis/static/` |

## STEP 1 — 브레인

스킬 하나는 역할 하나만 맡습니다. 큰 프롬프트 하나보다 작은 스킬 다섯 개가 낫습니다.

| 스킬 | 역할 |
|---|---|
| `inbox` | 아침 브리핑 |
| `plan` | 오늘의 상위 3개 |
| `metrics` | 지표 확인 |
| `trends` | 흐름 스캔 |
| `vault` | 기억 읽기/쓰기 |

각 스킬은 `jarvis/skills/<name>/SKILL.md` 하나로 정의됩니다. 프론트매터의
`triggers` 가 라우팅 키워드이고, 파일을 고치면 **서버 재시작 없이** 다음 요청부터
반영됩니다. 어느 트리거에도 안 걸리면 `vault` 로 떨어집니다 — 모를 때의 기본값은
"모르겠다"가 아니라 "기억을 뒤져 본다"입니다.

## STEP 2 — 기억

```
vault/
  raw/      원본 수집 (캡처, 받은 것)
  wiki/     정제된 지식
  outputs/  결과물 아카이브 (브리핑·계획·회고)
  data/     지표 스냅샷 (metrics.jsonl)
```

노트는 `---` 프론트매터가 붙은 평범한 마크다운입니다. DB도 인덱스도 없어서 옵시디언
으로 그대로 열립니다. `[[노트id]]` 로 링크하면 백링크가 잡히고, 링크된 노트 비율이
HUD 의 **VAULT SYNC** 수치입니다 — 링크 없는 노트는 결국 다시 안 읽히니까요.

검색은 형태소 분석 없이 부분 문자열로 합니다. 한국어에서 어설픈 토크나이징보다
이 편이 덜 틀립니다. 점수는 제목 3배, 태그 2배, 본문 1배(최대 5회).

## STEP 3 — 보이스

- **스페이스바를 누른 채로** 말하면 듣고, 떼면 처리합니다 (마이크 버튼도 동일)
- STT/TTS 모두 브라우저 로컬 엔진(Web Speech, `ko-KR`) — 오디오는 서버로 가지 않고,
  서버가 받는 건 인식된 **텍스트 한 줄**뿐입니다
- 파형은 마이크 레벨만 그립니다. 녹음도, 저장도 하지 않습니다
- Web Speech 미지원 브라우저에서는 입력창으로 그대로 씁니다

## STEP 4 — HUD

한 화면, 탭 없음. SYSTEM VITALS(CPU/RAM/IO, `/proc` 직접 읽기) · VAULT SYNC ·
AUDIO I/O · 코어 대화 · COMMAND DECK · SCHEDULE · LIVE FROM THE VAULT.

## 하루의 흐름

| 시간 | 하는 일 | 스킬 |
|---|---|---|
| 07:00 | 모닝 브리핑: 메일·일정·AI 뉴스 요약 | `inbox` |
| 09:00 | 오늘 계획: 우선순위 3개 정리 | `plan` |
| 14:00 | 지표 확인: 조회수·구독자·팔로워 점검 | `metrics` |
| 19:00 | 마감 정리: 회고 저장, 내일 준비 | `review` |

HUD 의 SCHEDULE 은 각 블록이 오늘 실행됐는지를 볼트 결과물(`brief-`/`plan-`/
`review-` 노트, 그리고 오늘자 지표 스냅샷)로 판정합니다. 사람이 크론에 걸어 두고
싶다면 `curl -X POST localhost:8010/api/run/inbox` 를 그대로 쓰면 됩니다.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/vitals` | 시스템 상태 + 볼트 통계 |
| `GET` | `/api/skills` | 로드된 스킬 목록 |
| `GET` | `/api/schedule` | 오늘 흐름과 완료 여부 |
| `POST` | `/api/ask` | `{"text": "오늘 할 일 정리해줘"}` → 라우팅 + 답변 |
| `POST` | `/api/run/{skill}` | 스킬 직접 실행 (크론용) |
| `GET` | `/api/vault/notes?q=&kind=&limit=` | 목록 / 검색 |
| `GET` | `/api/vault/notes/{id}` | 본문 + 백링크 |
| `POST` | `/api/vault/notes` | 노트 생성 |
| `GET`·`POST` | `/api/metrics` | 지표 조회 / 스냅샷 기록 |

## 설계상 정해 둔 것

- **지표 비교는 변화율로.** 조회수는 만 단위, 구독자는 십 단위입니다. 절대량으로
  "가장 크게 움직인 지표"를 뽑으면 언제나 조회수가 이깁니다.
- **캡처는 하루 한 파일.** "기억해 …" 는 `raw/capture-YYYY-MM-DD` 에 줄을 덧붙입니다.
- **저장 명령은 앞뒤에서만.** "썸네일 어디 적어놨더라"의 `적어`는 과거형 어미이지
  명령이 아닙니다. 명령형은 문장의 맨 앞이나 맨 뒤에 올 때만 저장으로 봅니다.
- **할 일은 raw 에서만 수집.** wiki 는 정제된 지식이라 체크박스를 세지 않습니다.
- **볼트 전체를 매번 훑습니다.** 개인 볼트(수천 건) 규모에서는 인덱스를 유지하다
  깨뜨리는 쪽이 더 비쌉니다.

## 테스트

```bash
pytest tests/jarvis -q
```
