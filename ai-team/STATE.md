> **이 파일은 자동 생성됩니다.** 사이클 마감 6단계에서 다시 씁니다. 손으로 고치지 마십시오.
> 어느 기기에서 열든 **이 한 장이 팀의 현재 상태**입니다.

# 📌 AI 앱 개발팀 — 현재 상태

| | |
|---|---|
| 최종 갱신 | **2026-08-29 · 초기화 + 조직 개편 v3** |
| 갱신 주체 | 원격 컨테이너 |
| 조직 | **6본부 29명 + 감사실 2명 = 31명** (D-025) |
| 사이클 | **없음 — 착수 대기.** 다음 = 사이클 3 |
| 다음 단계 | 🔴 **감사실 2인의 개편 감사** → 통과 시 사이클 3 ① 전략 |
| 정기 실행 | 매일 07:07 KST — Claude Routine `trig_01R318Goz8QaBwiJ8nSPRjEi` (지정 대화창을 깨우는 방식) |
| 정본 브랜치 | ⚠️ **분기 중** — `8tlqr8` ↔ `69oi8o` (B-06) |
| 복구 지점 | `backup/pre-reset-2026-08-29` = 커밋 `0fd169f` (개편·초기화 직전 전체) |

## 🔄 2026-08-29 에 무엇이 바뀌었나
| | 이전 | 지금 |
|---|---|---|
| 인원 | 6본부 20명 + 감사관 1 | **6본부 29명 + 감사실 2** |
| 앱 산출물 | 사이클 1·2, 3,296행 | **비움** (백업 브랜치에 보존) |
| 개발 착수 게이트 | 8항목 | **10항목** (출처검증 · 문구확정 추가) |
| QA 착수 게이트 | 5자료 | **6자료** (보안설계서 추가) |
| 상호 검토 | 6행 | **15행** |
| 산출 경로 | `docs/…` (루트에 떨어짐) | **`<앱폴더>/docs/…`** |

## 🟡 YELLOW (사라지면 안 됨)
- **D-025 개편은 감사 미수행입니다.** `.claude/` 를 전면 개편했고 D-014 RED 예외 3요건 중 **③ 감사관 검증이 비어 있습니다.** 되돌릴 수 있어(백업 브랜치) 진행했으며, **사이클 3 착수 전 첫 작업이 이 감사**입니다
- **D-021 도 ③ 미충족인 채 반영**됐습니다. D-025 와 묶어 감사받습니다
- **D-013 (③ 디자인 승인 면제) 는 미검증인 채 종료**됐습니다. 사이클 3 에는 적용되지 않습니다
- **마스터는 인원 축소를 권했고 사용자가 확대를 택했습니다.** 세션 한도 위험은 「호출 단위 상한」으로 완화했을 뿐 사라지지 않았습니다

## 🔴 지금 막힌 것
| # | 항목 | 상태 |
|---|---|---|
| B-03 | **Routine 프롬프트 교체** | 🔴 이 환경에서 Routine 을 수정할 수 없습니다. `ai-team/routine-prompt.md` 의 교체안을 사용자가 claude.ai Routines UI 에 반영해야 합니다. **현재 프롬프트는 20명 시절 것이라 새 조직과 맞지 않습니다** |
| B-06 | **브랜치 분기** | 🔴 `team-sync.ps1`·`local-windows.md`·Routine 은 `8tlqr8`, 작업은 `69oi8o`. 사용자 결정 필요 |
| B-07 | **D-025 개편 감사 미수행** | 🔴 감사실 2인 호출 필요 |
| — | Windows 07:07 스케줄 | ⚠️ 중지 여부 미확인. 이 환경에서 조작 불가 |
| — | 13일 공백 (08-16~08-28) | ⚠️ Routine 실행 이력 미확인 — 사용자가 Routines UI 에서 확인 필요 |

**해소됨**: B-01(정본 모순) · B-02(산출 경로) · B-04(handoff 필독) · B-05(daily-app 순서) — 전부 D-025 개편에서.

## 조직 — 6본부 29명 + 감사실 2명
| 본부 | 파트장 | 실무자 |
|---|---|---|
| ① 전략 | `strategy-lead` | `market-analyst` · `competitor-analyst` · `user-researcher` · **`source-verifier`** |
| ② 프로덕트 | `product-planner` | `ux-designer` · `system-architect` · **`ux-writer`** · **`data-analyst`** |
| ③ 디자인 | `design-lead` | `ui-designer` · `brand-designer` · **`accessibility-auditor`** |
| ④ 개발 | `tech-lead` | `frontend-dev` · `fullstack-dev` · **`performance-engineer`** · **`security-architect`** |
| ⑤ 품질 | `qa-lead` | `functional-tester` · `security-tester` · **`compatibility-tester`** · **`test-automation-engineer`** |
| ⑥ 출시운영 | `gtm-lead` | `store-release` · `ops-manager` · **`privacy-compliance`** · **`tech-writer`** |
| 감사실 | — (거부권) | `team-master` · **`evidence-auditor`** |

**굵은 글씨 11명이 신설**입니다. 각각 이 팀이 실제로 겪은 사고에서 나왔습니다 — 근거표는 `.claude/team-org.md` 「신설 11명」.

## 어디서 무엇이 도는가
| 기기 | 역할 | 07:07 |
|---|---|---|
| **원격 컨테이너** (claude.ai) | **실행.** 사이클 진행 후 커밋·푸시 | ✅ 여기서만 |
| **Windows 로컬** | 열람·이어서 작업 | ⚠️ 돌면 안 됨 — 중지 여부 미확인 |
| **노션** 「📓 작업 일지」 | 사람이 읽는 기록 | 항목 append **+ 상단 표 갱신** |
| **슈퍼베이스** | 팀이 읽는 상태 | 마감 시 push · 진행 중 event |

## 슈퍼베이스 (D-023)
`team_state` · `team_events`(append-only) · `team_blockers` · 뷰 `team_now`.
새 대화창은 `python3 ai-team/scripts/supabase-sync.py status` 한 줄로 현재 상태·차단·최근 이벤트를 봅니다. 절차는 `ai-team/supabase.md`.
- ✅ 왕복 실측 완료 (push 8/8 · status 일치 · pull 차이 0 · event · 뷰 조회)
- ⚠️ `DELETE` 는 **204 를 돌려주지만 실제 삭제 0건** — 204 를 성공으로 읽지 마십시오
- ⚠️ `supabase-sync.ps1` 은 미검증 (이 컨테이너에 PowerShell 없음)

## 「항상」 규칙 (D-026 · 2026-08-29 신설)
| 규칙 | 수단 | 자동화 |
|---|---|---|
| 슈퍼베이스 항상 저장 | `Stop` 훅 → `checkpoint.sh` | ✅ 매 턴 |
| GitHub 중간중간 푸시 | 같은 훅 (`[checkpoint]` 커밋) | ✅ 매 턴 |
| 노션 항상 갱신 | 큐 + 미반영 건수 매 턴 감시 | ⚠️ 반영은 도구 있는 세션만 |
| 에이전트 항상 호출 가능 | `SessionStart` 훅 → `roster.sh` 실측 | ✅ 세션마다 |

절차 정본 `ai-team/always-on.md`. **훅의 실제 발화는 미검증** — 다음 턴 끝에 `📌 체크포인트` 가 뜨면 살아 있는 것입니다.

## 노션 동기화
**append 완료 ≠ 동기화 완료.** 항목 append **와** 상단 「현재 상태」 표 갱신이 **둘 다** 끝나야 반영된 것입니다 (`notion-sync.md` 2-1).
- 미반영 큐: **0건** — `2026-08-29-3.md` 완료 (작업일지 + 팀 규정)
