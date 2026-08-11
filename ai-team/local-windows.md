# Windows 로컬을 07:07 사이클에 연결하기

> 사용자 지시(2026-08-10): **"너가 매일 아침 7시에 하는거 윈도우 로컬에서도 알았으면해"**

## 원칙 — 실행은 한 곳, 열람은 모든 곳

```
        07:07 KST
             │
   ┌─────────▼──────────┐
   │  원격 컨테이너      │  ← 실행하는 유일한 기기
   │  (claude.ai)       │
   └─────────┬──────────┘
             │ 커밋 + 푸시
             ▼
   ┌────────────────────┐
   │  GitHub 저장소      │  ← 정본. 실제 상태는 항상 여기
   │  claude/notion-ai- │
   │  team-import-8tlqr8│
   └────┬──────────┬────┘
        │ pull     │ append
        ▼          ▼
   Windows 로컬   노션 📓 작업 일지
   (열람·이어서)   (사람이 읽는 기록)
```

**Windows에서 07:07에 같은 사이클을 또 돌리면 안 됩니다.** 두 기기가 서로 다른 작업물을 각각 진행해 상태가 갈라지고, 어느 쪽이 맞는지 판정할 수 없게 됩니다. Windows는 **결과를 받아 보고, 필요하면 이어서 손으로 작업하는** 자리입니다.

---

## 1회만 하면 되는 준비 (Windows)

PowerShell에서:

```powershell
# 저장소를 로컬에 받는다
cd C:\Users\User
git clone https://github.com/joonseo120924-spec/past-job-recommender.git
cd past-job-recommender
git checkout claude/notion-ai-team-import-8tlqr8
```

⚠️ **다른 위치에 clone 하려면 아래 문서의 `C:\Users\User\past-job-recommender` 를 전부 그 경로로 바꾸십시오.** 특히 작업 스케줄러 등록의 `-File` 경로가 어긋나면 **오류 없이 조용히 안 돌게** 됩니다.

`git` 외에 필요한 것 없습니다. Node·Python 설치 불필요합니다.

## 매일 아침 최신 상태 받기

```powershell
cd C:\Users\User\past-job-recommender
.\ai-team\scripts\team-sync.ps1
```

이 스크립트가 하는 일:
1. `claude/notion-ai-team-import-8tlqr8` 브랜치를 pull
2. `ai-team/STATE.md` (현재 상태 한 장) 를 화면에 출력
3. 어젯밤 사이클이 남긴 커밋 목록과 노션 미동기화 건수를 보여줌
4. `ai-team/.local-sync.log` 에 실행 기록을 남김

`-Quiet` 을 붙이면 화면 출력 없이 로그만 남깁니다 (스케줄러용).

## Windows 작업 스케줄러 — 기존 07:07 작업 교체

지금 켜져 있는 **07:07 작업은 반드시 끄십시오.** 대신 원한다면 아침에 결과만 받아 보는 작업으로 바꿔 쓰십시오. 관리자 PowerShell에서:

```powershell
# 1) 기존 07:07 작업 중지 — 실제 이름은 작업 스케줄러에서 확인
Get-ScheduledTask | Where-Object { $_.TaskName -like "*ai-team*" -or $_.TaskName -like "*claude*" }
Disable-ScheduledTask -TaskName "<위에서 확인한 이름>"

# 2) 07:30 에 결과만 받아 오는 작업 (원격 사이클이 끝난 뒤)
$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\Users\User\past-job-recommender\ai-team\scripts\team-sync.ps1 -Quiet"
$trigger = New-ScheduledTaskTrigger -Daily -At 7:30am
Register-ScheduledTask -TaskName "ai-team-sync" -Action $action -Trigger $trigger
```

07:07이 아니라 **07:30** 인 이유: 원격 사이클이 끝나고 푸시까지 마친 뒤에 받아야 그날 결과가 들어옵니다.

## Claude Code 를 Windows에서 열 때

이 저장소 폴더에서 `claude` 를 실행하면 **세션 시작 시 `ai-team/STATE.md` 가 자동으로 읽힙니다** (`.claude/settings.json` 의 `SessionStart` 훅). 별도로 "어제 뭐 했지" 를 물을 필요가 없습니다.

읽히는 것: 현재 사이클·일차, YELLOW 면제 항목, 막힌 것, 본부별 상태, 노션 미동기화 건수.

먼저 `team-sync.ps1` 로 pull 한 뒤 여는 것이 정확합니다. 안 하면 마지막으로 받은 시점의 상태를 봅니다.

## 기존 `C:\Users\User\ai-team\` 폴더는 어떻게 하나

**지우지 마십시오.** 그 폴더에만 있는 것이 아직 있습니다:

| 항목 | 상태 |
|---|---|
| FocusNoise `docs/` (기획서 1,972행) | 로컬에만 존재 |
| FocusNoise `src/` 14파일 약 5,300줄 | 로컬에만 존재 |
| `QA보고서.md` 376행 (**남은 오류 2개의 실체**) | 로컬에만 존재 |

이것들이 없어서 ⑤ 품질본부를 재개하지 못하고 있습니다(Q-001). 저장소로 옮기려면 Windows에서:

```powershell
cd C:\Users\User\past-job-recommender
mkdir ai-team\apps\2026-08-07 -Force
Copy-Item C:\Users\User\ai-team\apps\2026-08-07\* ai-team\apps\2026-08-07\ -Recurse -Force
git add ai-team/apps
git commit -m "FocusNoise 산출물 로컬에서 이관"
git push origin claude/notion-ai-team-import-8tlqr8
```

푸시하면 **다음 07:07 사이클이 자동으로 그 파일들을 읽고 ⑤ 품질본부를 재개**합니다. 옮기기 전까지 그 폴더는 아카이브로 두고 손대지 않습니다.

## 충돌하면

저장소가 정본입니다. Windows 로컬 변경이 pull 과 충돌하면 로컬 것을 버리는 쪽이 기본입니다.

```powershell
git fetch origin claude/notion-ai-team-import-8tlqr8
git reset --hard origin/claude/notion-ai-team-import-8tlqr8
```

단, 위 FocusNoise 이관처럼 **로컬에서 의도적으로 만든 커밋이 있으면 먼저 푸시**하고 나서 하십시오. `reset --hard` 는 되돌릴 수 없습니다.
