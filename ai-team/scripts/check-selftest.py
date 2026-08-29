#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""점검기 자체를 시험합니다 — 회귀를 **일부러 주입해** 잡히는지 봅니다 (D-037).

2026-08-30 재감사 중대-3 이 이 파일을 만들게 했습니다. 그때 감사관이 회귀 8종을
주입하니 **5종이 통과**했습니다. 점검기가 초록불이라는 사실만으로 「전수 시정」을
주장한 것이 치명-3 의 기전이었습니다.

  python3 ai-team/scripts/check-selftest.py

저장소는 건드리지 않습니다 — `/tmp` 사본에만 주입합니다.
"""
import os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# (이름, 대상파일, 찾을 것, 바꿀 것) — 전부 실제로 일어났거나 감사관이 주입한 회귀입니다
CASES = [
    ("정본 ④ 에서 출처검증 삭제",        ".claude/team-rules.md", " · **출처검증**", ""),
    ("정본 ⑤ 보안설계서 → 보안검토서",    ".claude/team-rules.md", "**보안설계서**", "**보안검토서**"),
    ("team-org.md 에 옛 게이트 표 부활",  ".claude/team-org.md",
     "## 게이트 — 못 지나가면 못 갑니다",
     "## 게이트 — 못 지나가면 못 갑니다\n| 게이트 | 조건 |\n|---|---|\n| **④ 개발 착수** | 8항목 |"),
    ("tech-lead description 8항목 회귀",  ".claude/agents/tech-lead.md",
     "개발 착수 게이트 10항목을 심사", "개발 착수 게이트 8항목을 심사"),
    ("qa-lead description 5자료 회귀",    ".claude/agents/qa-lead.md",
     "QA 착수 6자료를 확인하고", "QA 착수 5자료를 확인하고"),
    ("strategy-lead 실무자 4인 → 3인",   ".claude/agents/strategy-lead.md",
     "## 우리 본부 실무자 4인", "## 우리 본부 실무자 3인"),
    ("design-lead 실무자 3인 → 2인",     ".claude/agents/design-lead.md",
     "## 우리 본부 실무자 3인", "## 우리 본부 실무자 2인"),
    ("product-planner 2차 통합 4인 → 2인", ".claude/agents/product-planner.md",
     "실무자 4인의 산출물", "실무자 2인의 산출물"),
    ("파트장이 신설 실무자를 잊음(전건 치환)", ".claude/agents/qa-lead.md",
     "compatibility-tester", "compat-tester", True),
    ("tech-lead 가 QA 6자료 중 보안설계서 누락", ".claude/agents/tech-lead.md",
     " · **보안설계서**(`security-architect` 산출)", ""),
]


def run(work):
    """사본에서 점검 2종을 돌려 (종료코드, 출력) 을 돌려줍니다."""
    out = []
    rc = 0
    for cmd in (["bash", "ai-team/scripts/team-check.sh"],
                [sys.executable, "ai-team/scripts/check-gates.py"]):
        r = subprocess.run(cmd, cwd=work, capture_output=True, text=True)
        out.append(r.stdout + r.stderr)
        if "🔴" in r.stdout or r.returncode != 0:
            rc = 1
    return rc, "\n".join(out)


def main():
    base = tempfile.mkdtemp(prefix="team-check-selftest-")
    for d in (".claude", "ai-team/scripts"):
        shutil.copytree(os.path.join(ROOT, d), os.path.join(base, d))

    rc, out = run(base)
    if rc != 0:
        print("🔴 기준 상태부터 실패합니다 — 회귀 시험 이전에 저장소를 먼저 고치십시오\n" + out)
        return 1
    print("기준 상태: ✅ 통과 (주입 전)\n")

    missed = []
    for i, case in enumerate(CASES, 1):
        name, rel, old, new = case[:4]
        all_occurrences = len(case) > 4 and case[4]
        work = base + "-c%d" % i
        shutil.copytree(base, work)
        p = os.path.join(work, rel)
        s = open(p, encoding="utf-8").read()
        if old not in s:
            print("%2d. %-38s ⚠️ 주입 실패 — 대상 문자열이 없습니다 (%s)" % (i, name, rel))
            missed.append(name + " (주입 실패)")
            shutil.rmtree(work, ignore_errors=True)
            continue
        open(p, "w", encoding="utf-8").write(
            s.replace(old, new) if all_occurrences else s.replace(old, new, 1))
        rc, out = run(work)
        hit = [l for l in out.splitlines() if l.startswith("🔴")]
        if rc != 0 and hit:
            print("%2d. %-38s ✅ 검출 — %s" % (i, name, hit[0][2:][:70]))
        else:
            print("%2d. %-38s 🔴 **통과해버림**" % (i, name))
            missed.append(name)
        shutil.rmtree(work, ignore_errors=True)

    shutil.rmtree(base, ignore_errors=True)
    print()
    if missed:
        print("🔴 %d / %d 종이 검출되지 않았습니다:" % (len(missed), len(CASES)))
        for m in missed:
            print("   · " + m)
        print("점검기가 초록불이라는 사실을 「전수 시정」의 근거로 쓰지 마십시오.")
        return 1
    print("✅ 회귀 %d종 전부 검출" % len(CASES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
