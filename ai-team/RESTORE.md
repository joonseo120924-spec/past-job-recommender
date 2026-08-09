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
mkdir -p ai-team/docs ai-team/apps
# ... 파일 작성 ...
git add .claude ai-team
git commit -m "AI 앱 개발팀 복원: 6본부 20명 + 규정 + 스킬 + 상태 파일"
```
`.gitignore` 에 `.claude/` 가 있으면 **제외 규칙을 먼저 풀어야** 합니다.
**원격 컨테이너에는 로컬 스케줄러가 없어 07:07 자동 실행이 동작하지 않습니다.**

## 1. 파일 작성 시 절대 지킬 것
| 항목 | 이유 |
|---|---|
| **BOM 없는 UTF-8** | BOM이 붙으면 `---` 프론트매터를 못 읽어 **에이전트 20명이 통째로 사라집니다.** 실제 발생한 사고 |
| 첫 줄이 정확히 `---` | 에이전트 파일 필수 |
| **경로는 상대 POSIX** | Windows 절대경로는 Linux에서 전부 깨짐 |
| **브라우저 검증 역할은 `tools:` 줄 금지** | 화이트리스트가 있으면 MCP 브라우저 도구가 차단됨 |

`tools:` 를 **쓰면 안 되는** 역할 10개:
`team-master` `design-lead` `ui-designer` `brand-designer` `tech-lead` `frontend-dev` `fullstack-dev` `qa-lead` `functional-tester` `security-tester`

## 2. 검증 스크립트
```bash
# BOM 검사 — 출력 있으면 실패
for f in .claude/agents/*.md; do head -c3 "$f" | grep -q $'\xef\xbb\xbf' && echo "BOM: $f"; done
# frontmatter
for f in .claude/agents/*.md; do [ "$(head -1 "$f")" = "---" ] || echo "BAD: $f"; done
# 절대경로 잔재 — 0이어야 함
grep -ro 'C:.Users' .claude/ | wc -l
# 개수 — 20
ls .claude/agents/*.md | wc -l
```

## 3. 복원 순서
1. `.claude/agents/` 에 20개 `.md` 생성
2. `.claude/` 에 `team-rules.md` · `team-org.md` · `master-doctrine.md` 생성
3. `.claude/skills/meeting-room/SKILL.md` · `skills/daily-app/SKILL.md` 생성 (정본 참조형 — D-012)
4. `ai-team/` 에 `README.md` `SESSION-LOG.md` `cycle.md` `board.md` `approvals.md` `decisions.md` `questions.md` 생성
5. (Windows 로컬만) 스케줄 작업 등록 — 매일 07:00, 프롬프트는 정본 4개를 읽게 하는 **얇은 참조형**
6. (영속 환경만) 영구 기억 `~/.claude/projects/<프로젝트>/memory/` 에 `MEMORY.md` + 팀 기억 파일 생성
   → **원격 컨테이너에서는 홈이 소멸하므로 만들어도 남지 않습니다**
7. **`team-master` 감사관을 호출해 복원 결과를 감사** (D-014 3요건 중 ③)
