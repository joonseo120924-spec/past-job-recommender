#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""팀 구성 상세 — 본부 · 파트장/직원 · 모델 · 도구 · 하는 일.
모델과 도구는 .claude/agents/*.md 의 프론트매터를 **실측**합니다 (손으로 관리하면 드리프트합니다)."""
import io, os, re, glob, sys, signal
signal.signal(signal.SIGPIPE, signal.SIG_DFL)   # `| head` 로 잘라도 깨지지 않게
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(ROOT)
UNITS = [
    ("① 전략본부", "뭘 만들지 정한다", ["strategy-lead","market-analyst","competitor-analyst","user-researcher","source-verifier"]),
    ("② 프로덕트본부", "개발자가 질문 없이 만들 수 있게", ["product-planner","ux-designer","system-architect","ux-writer","data-analyst"]),
    ("③ 디자인본부", "어떻게 보이는지", ["design-lead","ui-designer","brand-designer","accessibility-auditor"]),
    ("④ 개발본부", "실제로 돌아가는 코드", ["tech-lead","frontend-dev","fullstack-dev","performance-engineer","security-architect"]),
    ("⑤ 품질본부", "가장 무거운 권한", ["qa-lead","functional-tester","security-tester","compatibility-tester","test-automation-engineer"]),
    ("⑥ 출시운영본부", "복붙만 하면 되게", ["gtm-lead","store-release","ops-manager","privacy-compliance","tech-writer"]),
    ("🎖️ 감사실", "마스터까지 감시 · 거부권(승인권 아님)", ["team-master","evidence-auditor"]),
]
JOB = {
 "strategy-lead":"조사 분배 → 4축 종합 → 아이디어 승인","market-analyst":"시장 규모·카테고리·트렌드 (출처 URL 필수)",
 "competitor-analyst":"경쟁 앱 기능·가격·페이월 위치·약점","user-researcher":"리뷰·커뮤니티의 실제 불편·이탈 이유",
 "source-verifier":"인용 출처를 실제로 열어 검증 (403·인용불일치·단일의존)",
 "product-planner":"기능 정의 → 통합 → 설계 승인","ux-designer":"화면 구조·버튼 동작·전환 흐름",
 "system-architect":"데이터 구조·모듈 인터페이스·예외(E-코드)","ux-writer":"화면 문구 전량 확정 (E-코드별 1:1)",
 "data-analyst":"채점 모델 검토·성공 지표·민감도 분석",
 "design-lead":"디자인 방향·통합·디자인 승인","ui-designer":"컬러 토큰·타이포·간격·컴포넌트 상태",
 "brand-designer":"아이콘 SVG·파비콘·스토어 스크린샷","accessibility-auditor":"대비비 실계산·터치영역·포커스·키보드 실측",
 "tech-lead":"착수 게이트 10항목 심사 → 파일 분할 → 구현 승인","frontend-dev":"HTML·CSS·UI 렌더링·이벤트",
 "fullstack-dev":"코어 로직·데이터·상태·저장소","performance-engineer":"로드·응답·메모리·저장소 한계 실측",
 "security-architect":"구현 전 위협 모델·방어 설계 지정",
 "qa-lead":"착수 6자료 확인 → 종합 → 품질 승인 (오류 0개까지)","functional-tester":"버튼·경계값·상태 20회 이상 실행",
 "security-tester":"XSS 실주입·프로토타입 오염·네트워크 실계측","compatibility-tester":"file:// · 저장소 · 권한 API 실호출 확인",
 "test-automation-engineer":"반복 검증을 재실행 가능한 스크립트로",
 "gtm-lead":"통합·검수 → 출시 준비 승인·운영 승인","store-release":"스토어 제출 입력값 (복붙용, 글자수 실측)",
 "ops-manager":"크래시·리뷰·성능·보안 모니터링","privacy-compliance":"방침·약관 + 데이터안전 대조표 (코드 대조)",
 "tech-writer":"README·사용법·FAQ·CHANGELOG (사용자용)",
 "team-master":"규정 준수 감사 · 판본 드리프트 검사","evidence-auditor":"주장 ↔ 실물 대조. 증거 유무만 판정",
}
NEW = {"source-verifier","ux-writer","data-analyst","accessibility-auditor","performance-engineer",
       "security-architect","compatibility-tester","test-automation-engineer","privacy-compliance",
       "tech-writer","evidence-auditor"}

def frontmatter(path):
    s = io.open(path, encoding="utf-8").read()
    fm = s.split("---")[1] if s.startswith("---") else ""
    def g(k):
        m = re.search(r"^%s:\s*(.+)$" % k, fm, re.M)
        return m.group(1).strip() if m else None
    tools = g("tools")
    if tools is None:            kind = "전체"      # tools 줄 없음 = 전체 상속 (브라우저 검증 가능)
    elif "Bash" in tools:        kind = "문서+Bash"
    elif "Edit" in tools:        kind = "문서"
    else:                        kind = "웹조사"
    return (g("model") or "—"), kind

rows = {}
for p in glob.glob(".claude/agents/*.md"):
    rows[os.path.basename(p)[:-3]] = frontmatter(p)
if not rows:
    print("⚠️ .claude/agents 가 비어 있습니다 — 팀이 이 체크아웃에 없습니다"); sys.exit(0)

op = sum(1 for m, _ in rows.values() if m == "opus")
print("🎩 총괄 자비스(JARVIS) — 사용자와 대화하는 유일한 창구 · 메인 스레드 본인 (서브에이전트 아님)")
print("👥 AI 앱 개발팀 — 총 %d명   (opus %d · sonnet %d)" % (len(rows), op, len(rows) - op))
print("   모델은 별칭입니다: opus → claude-opus-5 · sonnet → claude-sonnet-5")
print("   도구 «전체» = tools: 줄 없음 → 전체 상속. 브라우저로 직접 실행·검증할 수 있어야 하는 역할입니다")
for unit, what, names in UNITS:
    print("\n%s — %s" % (unit, what))
    print("   %-2s %-25s %-7s %-10s %s" % ("", "이름", "모델", "도구", "하는 일"))
    print("   " + "─" * 103)
    for i, n in enumerate(names):
        if n not in rows:
            print("   ⚠️ %-25s 파일 없음 — 호출 불가" % n); continue
        model, tools = rows[n]
        tag = "감사관" if unit.startswith("🎖️") else ("파트장" if i == 0 else "직원")
        print("   %s %-25s %-7s %-10s %s  ·%s" % ("🆕" if n in NEW else "  ", n, model, tools, JOB.get(n, ""), tag))
extra = sorted(set(rows) - {n for _, _, ns in UNITS for n in ns})
if extra:
    print("\n⚠️ 조직도에 없는 에이전트: %s" % ", ".join(extra))
