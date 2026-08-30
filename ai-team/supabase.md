# 슈퍼베이스 연동 — 팀 상태를 어디서든 같은 값으로

> **지시 원문 (2026-08-29)**: "지금 만든 팀을 슈퍼베이스와 연동해줘"

## 왜 필요한가
이 팀은 상태가 갈라져서 두 번 크게 다쳤습니다.

| 사고 | 내용 |
|---|---|
| 08-10 ~ 08-15 | Windows 로컬과 원격 컨테이너가 서로를 모른 채 **6일간 독립 실행**. 원격은 FocusNoise 오류 실체를 "확인 불가"로 두고 동결했는데, 로컬엔 이미 FIX-1 이 있었습니다 |
| 08-15 ~ 08-29 | **13일간 커밋 0건 · 노션 항목 0건.** 어느 대화창도 "지금 상태가 무엇인지"를 한 곳에서 확인할 수 없었습니다 |

저장소는 커밋해야 보이고, 노션은 사람이 열어야 보입니다. **새 대화창이 붙는 순간 자동으로 읽히는 곳**이 없었습니다.

## 역할 분담 (셋 다 남깁니다)
| | 역할 | 정본 여부 |
|---|---|---|
| **저장소 `ai-team/`** | 실제 상태. 충돌 시 이쪽이 맞습니다 | ✅ **정본** |
| **슈퍼베이스** | 팀이 읽는 상태 **+ 팀 정의 사본(31명·규정·스킬·스크립트)**. 어느 대화창·기기에서도 즉시 조회·복원 | 사본 |
| **노션 「📓 작업 일지」** | 사람이 읽는 기록 | 사본 |

**슈퍼베이스는 정본이 아닙니다.** 저장소와 어긋나면 저장소가 맞습니다.

## 🚀 어느 창에서든 팀을 통째로 (D-035)
> **지시 원문 (2026-08-29)**: "슈퍼베이스에 ㄷ다른 창에서도 회의 실을 부르면 완벽하게 나오게 해놔"

`team_state` 는 원래 상태 파일 8개만 담았습니다. 이제 **팀 정의까지** 담습니다 —
`.claude/agents/` 31명 · 규정 3종 · `master.md` · 회의실/데일리앱 스킬 · `settings.json` · `ai-team/` 문서와 스크립트.

| 명령 | 하는 일 |
|---|---|
| `push --team` | 팀 정의 + 상태 전부 업로드 (40개 미만이면 **거부** — 빈 체크아웃이 원격을 망가뜨리지 못하게) |
| `restore` | 원격 → 이 체크아웃. 기본은 **예행**, 실제로 쓰려면 `--force` |
| `verify` | 원격만으로 팀이 성립하는지 실측 (31명·필수 11파일·BOM·`---` 첫 줄) |

키는 저장소 기준 상대 경로입니다(`.claude/agents/qa-lead.md`). 예전 8개는 파일명만으로 저장돼 있어
그대로 두었으므로 `supabase-sync.ps1` 과도 호환됩니다.

**저장소가 통째로 없는 창**이라면 `ai-team/BOOTSTRAP.md` 의 붙여넣기 한 덩어리를 쓰십시오. git 없이 복원됩니다.

`Stop` 훅은 `.claude/` 나 `ai-team/scripts/` 가 바뀐 턴에만 `--team` 을 붙입니다 — 매 턴 300KB 를 올리지 않습니다.

⚠️ **정본은 여전히 저장소입니다.** 슈퍼베이스가 어긋나면 저장소가 맞습니다.
⚠️ **키가 없으면 이 전부가 동작하지 않습니다.** 키 없이 구조만 시험하려면
`python3 ai-team/scripts/selftest-supabase.py` — 가짜 서버로 push → 빈 디렉터리 restore → sha256 대조까지 실측합니다.

## 처음 한 번 — 테이블 만들기
publishable 키로는 테이블을 만들 수 없습니다(DDL 불가). 대시보드에서 한 번만 실행하십시오.

1. Supabase 대시보드 → **SQL Editor** → New query
2. `ai-team/supabase/schema.sql` **전문**을 붙여넣고 **Run**
3. 확인: `python3 ai-team/scripts/supabase-sync.py status`

여러 번 실행해도 안전합니다 — **다만 `create table if not exists` 라서 이미 만든 표의
`check` 제약은 바뀌지 않습니다.** 종류(`kind`)를 추가했다면(예: 2026-08-30 「논쟁」) 대시보드에서
제약을 직접 갱신해야 합니다 (3차 감사 중대-3):

```sql
alter table public.team_events drop constraint if exists team_events_kind_check;
alter table public.team_events add constraint team_events_kind_check
  check (kind in ('호출','승인','반려','결정','막힘','기록','동기화','감사','논쟁'));
```

## 키 보관
이 저장소는 **공개(public)** 입니다. 키는 커밋하지 않습니다.

```
ai-team/supabase/.env        ← 실제 키. .gitignore 에 있음
ai-team/supabase/.env.example ← 양식만
```
환경변수 `SUPABASE_URL` · `SUPABASE_KEY` 가 있으면 그쪽이 우선입니다.

> ⚠️ publishable 키는 **설계상 공개용**입니다. 이 키를 가진 사람은 팀 상태를 읽고 덮어쓸 수 있습니다.
> 대신 스키마에서 **삭제 정책을 주지 않았습니다** — `team_events` 와 `team_state` 는 이 키로 지울 수 없습니다.
> 더 잠그려면 `schema.sql` 의 `anon` 정책을 지우고 `authenticated` 만 남기십시오 (세션이 로그인해야 함).

## 테이블
| 테이블 | 용도 |
|---|---|
| `team_state` | `STATE.md` `cycle.md` `board.md` `approvals.md` `decisions.md` `questions.md` `SESSION-LOG.md` `README.md` 의 현재 내용 (키=파일명) |
| `team_events` | **append-only.** 호출·승인·반려·결정·막힘·기록·동기화·감사 이벤트 |
| `team_blockers` | 🔴 차단 목록. 세션이 바뀌어도 유실되지 않게 |
| `team_now` (뷰) | **새 대화창이 이것만 읽으면 됩니다** — STATE 본문 · 갱신시각 · 브랜치 · 열린 차단 수 · 마지막 이벤트 |

## 쓰는 법
```bash
# 원격 컨테이너 (Linux)
python3 ai-team/scripts/supabase-sync.py status                    # 로컬↔원격 차이 · 차단 · 최근 이벤트
python3 ai-team/scripts/supabase-sync.py push                      # 상태 파일 올리기
python3 ai-team/scripts/supabase-sync.py pull                      # 차이만 보고 (파일 안 건드림)
python3 ai-team/scripts/supabase-sync.py pull --force              # 원격 내용으로 덮어쓰기
python3 ai-team/scripts/supabase-sync.py event --kind 결정 \
        --title "D-023 슈퍼베이스 연동" --ref D-023 --actor 마스터
```
```powershell
# Windows 로컬 (Python 없음 → PowerShell 판)
.\ai-team\scripts\supabase-sync.ps1 status
.\ai-team\scripts\supabase-sync.ps1 push
.\ai-team\scripts\supabase-sync.ps1 pull -Force
.\ai-team\scripts\supabase-sync.ps1 event -Kind 막힘 -Title "..." -Actor qa-lead
```

`pull` 은 **기본적으로 파일을 건드리지 않습니다.** `--force` / `-Force` 를 줘야 덮어씁니다.
상태 파일을 말없이 덮어쓰는 것이 08-15 병합 사고에서 가장 위험했던 동작이기 때문입니다.

## 새 대화창이 팀을 불러오는 순서 (연동 후)
1. `python3 ai-team/scripts/supabase-sync.py status` — 지금 무슨 상태이고 무엇이 막혀 있는지
2. 로컬이 뒤처져 있으면 `pull` 로 확인 → 필요하면 `--force`
3. 작업 후 `push` + `event` 로 남김
4. 노션은 종전대로 `notion-sync.md` 규약을 따릅니다 (사람이 읽는 기록)

## 검증 기록 (2026-08-29, 실측)
| 항목 | 결과 |
|---|---|
| 테이블 생성 | ✅ 사용자가 대시보드에서 `schema.sql` 실행 |
| `push` | ✅ 8/8 업로드 (`team_state`) + `team_events` 동기화 기록 |
| `status` | ✅ 8/8 일치 · 차단 6건 · 이벤트 2건 조회 |
| `pull` | ✅ 차이 0 (덮어쓰기 없음) |
| `event` | ✅ 기록 1건 적재 |
| 뷰 `team_now` | ✅ 갱신시각·브랜치·열린차단 6·마지막 이벤트 반환 |
| 기록 삭제 방어 | ✅ `DELETE /team_events` → **HTTP 204 지만 실제 삭제 0건.** 이벤트 2건 그대로 남음 |

> ⚠️ **204 를 성공으로 읽지 마십시오.** PostgREST 는 RLS 가 대상 행을 하나도 보여주지 않아도 204 를 돌려줍니다. 삭제가 막힌 것이 맞지만, 응답 코드만으로는 구별되지 않습니다.

## 아직 검증하지 못한 것 (정직하게)
- `supabase-sync.ps1` 은 **실행해 보지 못했습니다.** 이 컨테이너에 PowerShell 이 없습니다(`pwsh`·`powershell` 부재). `team-sync.ps1` 과 같은 한계입니다 — 문법·구조 검토만 했습니다. **Windows 에서 첫 실행 시 확인이 필요합니다**
- 07:07 Routine 이 이 스크립트를 부르게 하는 것은 **아직 하지 않았습니다.** Routine 프롬프트 교체는 차단 3번(사용자 지시 필요)에 묶여 있습니다
