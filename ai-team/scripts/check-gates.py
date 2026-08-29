#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""게이트·명부를 **값으로** 대조합니다 (D-037).

2026-08-30 재감사 중대-3: 예전 검사는 `10항목`·`6자료` 라는 **낱말이 있는지**만 봤습니다.
감사관이 회귀 8종을 주입하니 **5종이 통과**했습니다 — 정본에서 항목을 지워도, 이름을
바꿔도, team-org.md 에 옛 표를 되살려도 초록불이었습니다.

그래서 이 파일은 낱말이 아니라 **집합과 개수**를 봅니다.
  · 정본(team-rules.md)의 게이트 표에서 항목 이름을 뽑아
  · 그 항목을 실제로 심사하는 파트장 파일이 **같은 이름을 전부** 갖고 있는지
  · team-org.md 에 게이트 표가 **다시 생기지 않았는지**
  · team-org.md 조직 표의 실무자 명부와 파트장 파일의 인원·이름이 일치하는지

  python3 ai-team/scripts/check-gates.py          # 이상 없으면 침묵
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
R = os.path.join(ROOT, ".claude/team-rules.md")
O = os.path.join(ROOT, ".claude/team-org.md")
A = os.path.join(ROOT, ".claude/agents")
FAIL = []


def bad(m):
    FAIL.append(m)
    print("🔴 " + m)


def read(p):
    try:
        return open(p, encoding="utf-8").read()
    except OSError:
        bad("파일 없음: %s" % os.path.relpath(p, ROOT))
        return ""


def gate_row(text, title):
    """정본 표에서 게이트 한 줄을 찾아 조건 칸을 돌려줍니다."""
    for line in text.splitlines():
        if line.startswith("|") and title in line:
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) >= 2:
                return cells[1]
    return None


def items(cell):
    """조건 칸에서 항목 이름만 뽑습니다 — 강조·번호·접두 설명을 걷어냅니다."""
    cell = re.sub(r"^\**\d+(항목|자료)[^:]*:\s*", "", cell.replace("**", ""))
    return [t.strip() for t in cell.split("·") if t.strip()]


def has(body, name):
    """띄어쓰기는 무시하고 비교합니다 — 정본 「아이디어승인」 과
    파트장 「아이디어 승인」 은 같은 항목입니다."""
    return name.replace(" ", "") in body.replace(" ", "")


rules, org = read(R), read(O)

# ── 1) 정본에 6게이트가 다 있는가
for g in ["② 설계 완료", "③ 디자인 완료", "④ 개발 착수", "⑤ QA 착수", "⑤ QA 완료", "⑥ 출시 착수"]:
    if gate_row(rules, g) is None:
        bad("정본 team-rules.md 에 게이트 「%s」 가 없습니다" % g)

# ── 2) ④ 개발 착수 — 항목 개수와 이름을 tech-lead 가 그대로 갖고 있는가
dev = gate_row(rules, "④ 개발 착수")
tech = read(os.path.join(A, "tech-lead.md"))
if dev:
    it = items(dev)
    if len(it) != 10:
        bad("정본 ④ 개발 착수가 %d항목입니다 (10항목이어야 합니다): %s" % (len(it), " · ".join(it)))
    missing = [x for x in it if not has(tech, x)]
    if missing:
        bad("tech-lead 가 착수 항목을 모릅니다 — %s. 심사자가 옛 기준으로 통과시킵니다" % ", ".join(missing))

# ── 3) ⑤ QA 착수 — 자료 이름을 qa-lead(심사)와 tech-lead(인수인계)가 둘 다 갖고 있는가
qa = gate_row(rules, "⑤ QA 착수")
qal = read(os.path.join(A, "qa-lead.md"))
if qa:
    it = items(qa)
    if len(it) != 6:
        bad("정본 ⑤ QA 착수가 %d자료입니다 (6자료여야 합니다): %s" % (len(it), " · ".join(it)))
    missing = [x for x in it if not has(qal, x)]
    if missing:
        bad("qa-lead 가 QA 착수 자료를 모릅니다 — %s" % ", ".join(missing))
    # tech-lead 는 **인수인계 절 안에** 6자료를 전부 실어야 합니다. 파일 어딘가에
    # 그 낱말이 있는 것으로는 부족합니다 — 넘기는 자리에 없으면 QA 가 착수를 거부합니다
    # 「handoff/04-개발.md」 는 파일에 두 번 나옵니다(2회 호출 구조·인수인계).
    # 자료 목록이 실린 쪽은 「## 인수인계」 절입니다
    m = re.search(r"## 인수인계.*?(?=\n## |\Z)", tech, re.S)
    block = m.group(0) if m else ""
    if not block:
        bad("tech-lead 에 인수인계(handoff/04-개발.md) 절이 없습니다")
    else:
        missing = [x for x in it if not has(block, x)]
        if missing:
            bad("tech-lead 인수인계 절에 QA 착수 자료가 빠졌습니다 — %s" % ", ".join(missing))

# ── 4) 수치의 정본은 한 곳. team-org.md 에 게이트 표가 다시 생기면 드리프트가 재발합니다
if any(gate_row(org, g) for g in ["④ 개발 착수", "⑤ QA 착수", "② 설계 완료"]):
    bad("team-org.md 에 게이트 표가 되살아났습니다 — 수치의 정본은 team-rules.md 하나입니다 (D-036)")

# ── 5) 조직 표(정본)의 실무자 명부와 파트장 파일이 일치하는가
for line in org.splitlines():
    m = re.match(r"^\|\s*([①-⑥])\s*(\S+)\s*\|\s*`([a-z-]+)`\s*\|\s*(.+?)\s*\|", line)
    if not m:
        continue
    unit, name, lead, staff_cell = m.groups()
    staff = re.findall(r"`([a-z-]+)`", staff_cell)
    body = read(os.path.join(A, lead + ".md"))
    if not body:
        continue
    for s in staff:
        if s not in body:
            bad("%s%s 파트장 %s 가 실무자 `%s` 를 모릅니다 — 분배안에서 통째로 빠집니다" % (unit, name, lead, s))
    n = len(staff)
    h = re.search(r"우리 본부 실무자 (\d+)인", body)
    if not h:
        bad("%s 에 「우리 본부 실무자 N인」 표가 없습니다" % lead)
    elif int(h.group(1)) != n:
        bad("%s 가 실무자를 %s인이라 적었습니다 — 조직 표는 %d인입니다" % (lead, h.group(1), n))
    for wrong in re.findall(r"실무자 (\d+)인의 산출물", body):
        if int(wrong) != n:
            bad("%s 의 2차 통합이 %s인의 산출물이라 적혀 있습니다 — %d인입니다" % (lead, wrong, n))

if FAIL:
    print("⚠️ 게이트·명부 값 대조 %d건 불일치" % len(FAIL))
    sys.exit(1)
sys.exit(0)
