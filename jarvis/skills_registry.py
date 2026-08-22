"""브레인 — 스킬 폴더를 읽어 인텐트를 스킬 하나로 연결합니다.

큰 프롬프트 하나보다 작은 스킬 여러 개. 스킬은 `SKILL.md` 파일 하나로 정의되고,
서버를 다시 띄우지 않아도 파일을 고치면 다음 요청부터 반영됩니다.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from pathlib import Path

from jarvis.config import SKILLS_DIR
from jarvis.vault import _parse_frontmatter


@dataclass(frozen=True)
class Skill:
    name: str
    label: str
    triggers: tuple[str, ...]
    priority: int
    doc: str
    path: Path

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "label": self.label,
            "triggers": list(self.triggers),
            "priority": self.priority,
        }


@dataclass(frozen=True)
class Match:
    skill: Skill | None
    score: float
    reason: str


def load_skills(root: Path | None = None) -> list[Skill]:
    root = Path(root or SKILLS_DIR)
    skills: list[Skill] = []
    for path in sorted(root.glob("*/SKILL.md")):
        meta, doc = _parse_frontmatter(path.read_text(encoding="utf-8"))
        triggers = meta.get("triggers", [])
        if isinstance(triggers, str):
            triggers = [t.strip() for t in triggers.split(",") if t.strip()]
        try:
            priority = int(str(meta.get("priority", 10)))
        except ValueError:
            priority = 10
        skills.append(
            Skill(
                name=str(meta.get("name") or path.parent.name),
                label=str(meta.get("label") or path.parent.name),
                triggers=tuple(str(t) for t in triggers),
                priority=priority,
                doc=doc.strip(),
                path=path,
            )
        )
    return skills


def route(text: str, skills: list[Skill]) -> Match:
    """INTENT → SKILL.

    트리거 문자열이 발화에 들어 있으면 점수를 줍니다. 긴 트리거가 더 구체적이므로
    가중치를 더 받습니다. 아무것도 안 걸리면 vault 스킬로 떨어집니다 — 모르면
    "모르겠다"가 아니라 "기억을 뒤져 본다"가 맞는 기본값입니다.
    """
    normalized = unicodedata.normalize("NFKC", text).strip().lower()
    if not normalized:
        return Match(None, 0.0, "빈 발화")

    best: tuple[float, Skill, str] | None = None
    for skill in skills:
        score = 0.0
        hit: list[str] = []
        for trigger in skill.triggers:
            t = unicodedata.normalize("NFKC", trigger).lower()
            if t and t in normalized:
                score += 1.0 + 0.1 * len(t)
                hit.append(trigger)
        if not score:
            continue
        score += skill.priority / 100
        if best is None or score > best[0]:
            best = (score, skill, "트리거 일치: " + ", ".join(hit))

    if best is None:
        fallback = next((s for s in skills if s.name == "vault"), None)
        return Match(fallback, 0.0, "트리거 미일치 → 볼트 검색으로 위임")
    return Match(best[1], round(best[0], 2), best[2])
