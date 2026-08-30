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

# ── 3-1) 게이트 조건의 알맹이 — **해당 행 안에서** 봅니다 (3차 재감사 중대-1)
#         파일 어딘가에 그 낱말이 있는 것으로는 부족합니다. 조건이 걸린 자리에 있어야 합니다
for gate, phrases in [
    ("⑤ QA 완료",   [("남은 오류 0개", "어떤 경우에도 면제 대상이 아닙니다"),
                     ("20회", "실행 횟수 하한"),
                     ("호환성 실측표", "compatibility-tester 산출")]),
    ("② 설계 완료",  [("문구", "ux-writer 가 E-코드별 1:1 로 확정"),
                     ("지표", "성공 지표")]),
    ("③ 디자인 완료", [("접근성 실측표", "accessibility-auditor 산출"),
                     ("실제 계산값", "「충분해 보임」은 반려")]),
    ("⑥ 출시 착수",  [("데이터안전 대조표", "privacy-compliance 산출")]),
    ("④ 개발 착수",  [("출처검증", "source-verifier 산출"),
                     ("문구확정", "ux-writer 산출")]),
    ("⑤ QA 착수",   [("보안설계서", "security-architect 산출")]),
]:
    row = gate_row(rules, gate)
    if row is None:
        continue          # 게이트 자체가 없는 것은 위 1) 에서 이미 잡힙니다
    for phrase, why in phrases:
        if not has(row, phrase):
            bad("정본 「%s」 조건에서 「%s」 가 빠졌습니다 — %s" % (gate, phrase, why))

# ── 3-2) 감사실 권한 (거부권을 자문으로 낮추면 조직이 무너집니다)
if "거부권" not in org and "거부권" not in rules:
    bad("감사실의 **거부권** 서술이 사라졌습니다 — 감사관은 승인하지 않고 반려합니다")

# ── 3-3) 마스터 자율 판단 규정 — **이 파일을 읽는 점검기가 하나도 없었습니다**
#         3차 재감사 중대-1: RED 8줄·예외 3요건·대원칙 2 각주를 전부 지워도 초록불이었습니다
DOC = os.path.join(ROOT, ".claude/master-doctrine.md")
doc = read(DOC)
for phrase, why in [
    ("`.claude/` 아래 파일 수정", "RED 목록의 핵심 — 자기 통제 장치를 스스로 바꿀 수 없습니다"),
    ("감사관이 반려했는데 진행", "RED 목록"),
    ("되돌릴 수 없는 삭제", "RED 목록"),
    ("3요건", "`.claude/` 수정 예외 조건"),
    ("감사관 검증", "예외 요건 ③"),
    ("RED 를 GREEN 으로 바꾸지 않습니다", "2026-08-30 치명-1 재발 차단 조항 (대원칙 2 각주)"),
    ("요건 ③ 을 대신하지 못합니다", "2026-08-30 치명-1 재발 차단 조항 (RED 예외 절)"),
    ("확대 해석 금지", "자동 실행 중 예외 불가"),
]:
    if phrase not in doc:
        bad("교리 master-doctrine.md 에서 「%s」 가 사라졌습니다 — %s" % (phrase, why))
red = [l for l in doc.splitlines() if l.startswith("- ") and "## " not in l]
try:
    i = doc.index("## 🔴 RED")
    j = doc.index("###", i)
    n_red = len([l for l in doc[i:j].splitlines() if l.strip().startswith("- ")])
    if n_red < 8:
        bad("교리의 RED 목록이 %d줄입니다 — 8줄 이상이어야 합니다 (지워진 항목이 있습니다)" % n_red)
except ValueError:
    bad("교리에 🔴 RED 절을 찾지 못했습니다")

# ── 3-4) 기록 수단이 정본과 같은가 (3차 감사 치명-1)
#         스킬이 정본과 다른 수단을 지시하면 키가 없을 때 기록이 통째로 사라집니다
for skill in ("meeting-room", "daily-app"):
    sp = os.path.join(ROOT, ".claude/skills", skill, "SKILL.md")
    body = read(sp)
    if "supabase-sync.py event" in body:
        bad("%s 스킬이 `supabase-sync.py event` 를 직접 지시합니다 — 정본의 기록 수단은 "
            "`ai-team/scripts/event.sh` 입니다 (키가 없으면 아무 데도 안 남습니다)" % skill)

# ── 4) 수치의 정본은 한 곳. team-org.md 에 게이트 표가 다시 생기면 드리프트가 재발합니다
org_flat = org.replace(" ", "")
if any(gate_row(org_flat, g.replace(" ", "")) for g in ["④ 개발 착수", "⑤ QA 착수", "② 설계 완료"]):
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
    h = re.search(r"우리 본부 실무자 \**(\d+)\**인", body)
    if not h:
        bad("%s 에 「우리 본부 실무자 N인」 표가 없습니다" % lead)
    elif int(h.group(1)) != n:
        bad("%s 가 실무자를 %s인이라 적었습니다 — 조직 표는 %d인입니다" % (lead, h.group(1), n))
    for wrong in re.findall(r"실무자 \**(\d+)인\**의 산출물", body):
        if int(wrong) != n:
            bad("%s 의 2차 통합이 %s인의 산출물이라 적혀 있습니다 — %d인입니다" % (lead, wrong, n))

if FAIL:
    print("⚠️ 게이트·명부 값 대조 %d건 불일치" % len(FAIL))
    sys.exit(1)
sys.exit(0)
