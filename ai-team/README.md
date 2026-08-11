# 🏢 AI 앱 개발팀 — 작업 공간

앱 하나를 4일 주기로 만드는 **6본부 20명 + 독립 감사관** 조직의 작업 폴더입니다.

## 진입점
| 먼저 읽을 것 | 무엇 |
|---|---|
| `.claude/team-rules.md` | **규정 정본 — 무엇과 충돌하든 우선** |
| `.claude/team-org.md` | 조직도 · 파이프라인 · 파일 규약 |
| `.claude/master-doctrine.md` | 마스터 GREEN/YELLOW/RED 판단 |
| `ai-team/SESSION-LOG.md` | 직전 세션이 어디서 멈췄는가 |

팀을 소집하려면 `/meeting-room`, 하루치를 돌리려면 `/daily-app`.

## 상태 파일
| 파일 | 용도 |
|---|---|
| `SESSION-LOG.md` | 세션 간 인수인계 |
| `cycle.md` | 사이클 번호 · 일차 · 단계 진행표 |
| `board.md` | 실시간 작업 현황판 |
| `approvals.md` | 승인 · 반려 기록 |
| `decisions.md` | 의사결정 (D-001~) |
| `questions.md` | 팀원 간 질문 · 답변 (Q-001~) |
| `RESTORE.md` | 다른 환경에서 팀을 복원하는 방법 |
| `notion-sync.md` | **노션 정리 규약 (매일 필수)** |
| `notion-queue/` | 노션에 반영 대기 중인 날짜별 기록 |
| `apps/<날짜>/` | 앱별 산출물 (`docs/` `handoff/` `src/`) |

## 정기 실행
매일 **07:07 KST**, Claude Routine 이 지정된 대화창을 깨워 `/daily-app` 을 돌립니다.
하루치가 끝나면 **저장소에 커밋·푸시**하고 **노션 「📓 작업 일지」에 그날 항목을 append** 합니다 (절차: `notion-sync.md`).
다음날 실행은 노션의 "내일 이어받을 지점"부터 이어갑니다.

## ⚠️ 이 저장소 사본에 대하여
여기는 **Linux 원격 컨테이너**입니다.
- 파일은 **커밋해야만 남습니다.** 세션이 끝나면 컨테이너는 회수됩니다
- **컨테이너 자체의 자동 실행은 없습니다.** 대신 Claude Routine (`trig_01R318Goz8QaBwiJ8nSPRjEi`, cron `7 22 * * *` UTC)이 매일 07:07 KST 에 지정된 대화창을 깨우는 방식으로 동작합니다 — 위 「정기 실행」과 같은 내용입니다. 결과는 **커밋해야만** 남습니다
- 조직·규정·에이전트는 노션에서 완전 복원됐지만, **사이클 1(FocusNoise)의 실제 산출물(`docs/` 120KB, `src/` 14파일 약 5,300줄)은 노션에 없습니다.** 원본은 Windows 로컬 `C:\Users\User\ai-team\apps\2026-08-07\` 에만 있습니다
