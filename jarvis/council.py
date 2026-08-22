"""회의실 — 앱 사이클 밖의 주제로도 팀을 소집합니다.

6본부는 원래 앱을 만들려고 짠 조직이지만, 하는 일을 한 겹 벗기면 어떤 주제에도
쓰입니다. 조사 → 설계 → 표현 → 실행 → 검증 → 운영. 이 스킬은 그 껍질을 벗겨
"앱"이 아닌 안건에도 같은 파이프라인을 씌웁니다.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from jarvis.vault import Vault, slugify

# 본부별 — 앱을 걷어낸 일반 역할과, 그 본부가 필요한 안건의 신호어.
GENERAL_ROLE = {
    "strategy": ("무엇을 할지 정한다", "조사 · 후보 비교 · 선택 근거",
                 ["뭐", "어떤", "고를", "정할", "비교", "조사", "시장", "경쟁", "아이디어", "기획"]),
    "product": ("질문 없이 실행할 수 있게 설계한다", "요구사항 · 구조 · 예외 정의",
                ["설계", "구조", "절차", "프로세스", "시스템", "체계", "정리"]),
    "design": ("어떻게 보이고 읽히는지 정한다", "표현 · 톤 · 접근성",
               ["디자인", "썸네일", "브랜드", "톤", "영상", "글", "카피", "보이"]),
    "dev": ("실제로 굴러가게 만든다", "구현 · 자동화 · 도구",
            ["만들", "구현", "자동", "코드", "스크립트", "도구", "앱"]),
    "qa": ("틀린 곳을 찾는다", "검증 · 반례 · 남은 오류",
           ["검증", "확인", "테스트", "점검", "리스크", "위험", "안전"]),
    "gtm": ("바깥으로 내보내고 지켜본다", "발행 · 운영 · 지표",
            ["출시", "발행", "업로드", "채널", "구독자", "홍보", "운영", "수익"]),
}


# 안건을 가리지 않고 앉는 자리.
STANDING = ("strategy", "qa")

# "전원 소집" 처럼 사람이 명시적으로 전부를 부르는 말.
ALL_HANDS = ("전원", "전부", "다 불러", "모두", "다같이", "다 같이")


@dataclass(frozen=True)
class Seat:
    division: str
    label: str
    lead: str
    members: list[str]
    duty: str
    produces: str
    reason: str


class Council:
    def __init__(self, vault: Vault) -> None:
        self.vault = vault
        path = Path(vault.root) / "data" / "roster.json"
        self.roster = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}

    def _members(self, division_id: str) -> tuple[str, list[str]]:
        lead, staff = "", []
        for agent in self.roster.get("agents", []):
            if agent.get("division") != division_id:
                continue
            if agent.get("lead"):
                lead = agent["id"]
            else:
                staff.append(agent["id"])
        return lead, staff

    def seats(self, topic: str) -> list[Seat]:
        """안건에 걸리는 본부를 부릅니다.

        ① 전략과 ⑤ 품질은 상시 배석입니다. 무엇을 할지 정하는 자리와 틀린 곳을
        찾는 자리는 안건을 가리지 않고, 규정도 "모든 산출물은 검토를 1회 이상"
        이라고 못박고 있습니다.
        """
        normalized = topic.lower()
        all_hands = any(word in normalized for word in ALL_HANDS)
        chosen: list[Seat] = []
        for division in self.roster.get("divisions", []):
            did = division["id"]
            if did == "audit":
                continue
            duty, produces, signals = GENERAL_ROLE.get(did, ("", "", []))
            hit = [s for s in signals if s in normalized]
            lead, staff = self._members(did)
            if all_hands:
                reason = "전원 소집 지시"
            elif did in STANDING:
                reason = ("안건에 걸린 말: " + ", ".join(hit)) if hit else "상시 배석"
            elif hit:
                reason = "안건에 걸린 말: " + ", ".join(hit)
            else:
                continue
            chosen.append(Seat(did, f"{division['no']} {division['name']}", lead, staff,
                               duty, produces, reason))
        return chosen

    def convene(self, topic: str, *, now: datetime | None = None) -> tuple[str, list[Seat], str]:
        now = now or datetime.now()
        topic = re.sub(r"^(팀\s*)?(소집|회의|불러|모아)\S*\s*", "", topic.strip()).strip() or "안건 미정"
        seats = self.seats(topic)
        auditor_lead, _ = self._members("audit")

        lines = [f"# 안건 — {topic}", "", "| 본부 | 파트장 | 실무자 | 이 안건에서 하는 일 | 산출 |",
                 "|---|---|---|---|---|"]
        for seat in seats:
            lines.append(
                f"| {seat.label} | `{seat.lead}` | {', '.join(f'`{m}`' for m in seat.members) or '—'} "
                f"| {seat.duty} | {seat.produces} |"
            )
        lines += [
            "",
            "## 규칙 (팀 규정 그대로)",
            "- 파트장만 승인권을 가집니다. 실무자는 병렬로 일하고 파트장이 통합합니다.",
            "- \"완료했습니다\"는 무효입니다. 파일을 직접 열어 확인해야 완료입니다.",
            "- 검증 못 한 항목은 \"확인 불가 — 사유\"로 적습니다.",
            f"- 감사관 `{auditor_lead}` 이 마지막에 판정합니다. 반려되면 진행하지 않습니다.",
            "",
            "## 결정",
            "- (회의 후 여기에 기록)",
        ]
        note = self.vault.write(
            title=f"{now:%Y-%m-%d} 회의 — {topic}",
            body="\n".join(lines),
            kind="outputs", type="council", tags=["council", "team"],
            note_id=f"council-{now:%Y-%m-%d}-{slugify(topic)}",
        )
        return topic, seats, note.id
