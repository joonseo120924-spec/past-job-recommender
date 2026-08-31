# 복원 절차

노션 정본: **🏢 AI 앱 개발팀 (AI App Dev Team)** 및 그 하위 3개 페이지
불러오는 말: **"노션에서 AI 앱 개발팀 가져와"**

## 0. 환경부터 판별 — 설치 위치가 다릅니다
```bash
uname -s                                          # Linux / MINGW64_NT-... / Darwin
pwd
git rev-parse --is-inside-work-tree 2>/dev/null   # true 면 저장소 안
echo "$HOME"
```

| 판별 | 설치 위치 | 영속성 |
|---|---|---|
| **Windows 로컬** (`MINGW64_NT`, repo 아님) | `~/.claude/` · `~/ai-team/` | ✅ 디스크에 남음 |
| **원격 컨테이너** (`Linux`, repo 안) | **`<repo>/.claude/` · `<repo>/ai-team/`** | ⚠️ **커밋해야만 남음** |
| Linux인데 repo 아님 | `~/.claude/` · `~/ai-team/` | ❌ **세션 종료 시 소멸** — 사용자에게 보고 |

### 원격 컨테이너
```bash
cd "$(git rev-parse --show-toplevel)"
mkdir -p .claude/agents .claude/skills/meeting-room .claude/skills/daily-app
mkdir -p ai-team/apps ai-team/docs   # 앱 산출물은 ai-team/apps/<날짜>/ 아래에만
                                     # ai-team/docs/ 는 **앱과 무관한 감사 보고서** 자리입니다
                                     # (team-master·evidence-auditor 정의가 지정한 경로 — 3차 감사 중대-6 정정)
# ... 파일 작성 ...
git add .claude ai-team
git commit -m "AI 앱 개발팀 복원: 6본부 29명 + 감사실 2 + 규정 + 스킬 + 상태 파일"
```
`.gitignore` 에 `.claude/` 가 있으면 **제외 규칙을 먼저 풀어야** 합니다.
**원격 컨테이너에는 스케줄러가 없고, Claude Routine 도 2026-08-30 에 폐지했습니다 (실측 0건).** 이전 서술: Routine 이 매일 07:07 KST 에 지정된 대화창을 깨웁니다 — 자동 실행은 **동작합니다**. 결과는 커밋해야만 남습니다.

## 1. 파일 작성 시 절대 지킬 것
| 항목 | 이유 |
|---|---|
| **BOM 없는 UTF-8** | BOM이 붙으면 `---` 프론트매터를 못 읽어 **에이전트 전원이 통째로 사라집니다.** 20명 시절 실제 발생한 사고 |
| 첫 줄이 정확히 `---` | 에이전트 파일 필수 |
| **경로는 상대 POSIX** | Windows 절대경로는 Linux에서 전부 깨짐 |
| **브라우저 검증 역할은 `tools:` 줄 금지** | 화이트리스트가 있으면 MCP 브라우저 도구가 차단됨 |

`tools:` 를 **쓰면 안 되는** 역할 16개 (2026-08-29 실측):
`accessibility-auditor` · `brand-designer` · `compatibility-tester` · `design-lead` · `evidence-auditor` · `frontend-dev` · `fullstack-dev` · `functional-tester` · `performance-engineer` · `qa-lead` · `security-tester` · `strategy-lead` · `team-master` · `tech-lead` · `test-automation-engineer` · `ui-designer`

## 2. 검증 스크립트
```bash
# BOM 검사 — 출력 있으면 실패
for f in .claude/agents/*.md; do head -c3 "$f" | grep -q $'\xef\xbb\xbf' && echo "BOM: $f"; done
# frontmatter
for f in .claude/agents/*.md; do [ "$(head -1 "$f")" = "---" ] || echo "BAD: $f"; done
# 절대경로 잔재 — .claude/ 범위에서 0이어야 함
# (ai-team/ 에는 원본 소재지를 가리키는 기록용 C:\Users\ 가 정상적으로 존재합니다.
#  지시·경로 지정에 쓰였다면 지적 대상, 이력 서술이면 무방)
grep -ro 'C:.Users' .claude/ | wc -l
# 개수 — 20
ls .claude/agents/*.md | wc -l    # 31 이어야 합니다
```

## 3. 복원 순서
1. `.claude/agents/` 에 **31개** `.md` 생성 (6본부 29 + 감사실 2 — 명단은 `.claude/team-org.md`)
2. `.claude/` 에 `team-rules.md` · `team-org.md` · `master-doctrine.md` 생성
3. `.claude/skills/meeting-room/SKILL.md` · `skills/daily-app/SKILL.md` 생성 (정본 참조형 — D-012)
4. `ai-team/` 에 `README.md` `SESSION-LOG.md` `cycle.md` `board.md` `approvals.md` `decisions.md` `questions.md` 생성
5. ~~정기 실행 등록~~ — **2026-08-30 폐지.** 등록하지 마십시오. 이전 서술: **실행 기기는 하나뿐입니다.** 현재는 원격 컨테이너의 Claude Routine (매일 07:07 KST)이 그 하나입니다. **Windows 로컬에서 같은 사이클을 또 등록하지 마십시오** — 두 기기가 서로 다른 작업물을 진행해 상태가 갈라집니다. Windows 는 결과를 받아 보는 07:30 수신 작업으로 대체합니다 (`ai-team/local-windows.md`). 프롬프트는 정본을 읽게 하는 **얇은 참조형** (D-012, 사본: `ai-team/routine-prompt.md`)
6. (영속 환경만) 영구 기억 `~/.claude/projects/<프로젝트>/memory/` 에 `MEMORY.md` + 팀 기억 파일 생성
   → **원격 컨테이너에서는 홈이 소멸하므로 만들어도 남지 않습니다**
7. **`team-master` 감사관을 호출해 복원 결과를 감사** (D-014 3요건 중 ③)
