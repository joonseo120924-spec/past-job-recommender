"""SKILL → SPOKEN ANSWER.

각 스킬은 함수 하나입니다. 반환값은 (1) 소리로 읽을 한 문단과 (2) HUD 가 그릴
구조화된 데이터, 그리고 (3) 볼트에 남긴 노트 id 입니다.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from jarvis.config import DAILY_FLOW
from jarvis.metrics import LABELS, MetricsLog
from jarvis.vault import Vault

URGENT = re.compile(r"(오늘|긴급|마감|asap|urgent|!!)", re.IGNORECASE)
CAPTURE_VERBS = ("기억해", "메모", "적어", "저장해", "기록해")


@dataclass
class Answer:
    spoken: str
    data: dict = field(default_factory=dict)
    note_id: str | None = None


def _strip_capture_verb(text: str) -> str:
    body = text.strip()
    for verb in CAPTURE_VERBS:
        idx = body.find(verb)
        if idx != -1:
            body = body[idx + len(verb) :]
            break
    return body.lstrip(" :,.").strip()


def _bullets(items: list[str], empty: str = "- 없음") -> list[str]:
    return items or [empty]


# ------------------------------------------------------------------ metrics


def run_metrics(vault: Vault, query: str, now: datetime) -> Answer:
    log = MetricsLog(vault.root)
    latest, previous, delta = log.latest_delta()
    if latest is None:
        return Answer("기록된 지표가 아직 없습니다. 오늘 수치를 먼저 넣어 주세요.", {"snapshots": []})

    parts = []
    for key, label in LABELS.items():
        value = int(latest.get(key, 0))
        if key in delta:
            d = delta[key]
            sign = "+" if d >= 0 else ""
            parts.append(f"{label} {value:,}명({sign}{d:,})" if key != "views" else f"{label} {value:,}회({sign}{d:,})")
        else:
            parts.append(f"{label} {value:,}")
    base = f"{latest['date']} 기준, " + ", ".join(parts) + "입니다."
    if delta and previous:
        # 조회수는 만 단위, 구독자는 십 단위입니다. 절대량으로 비교하면 언제나
        # 조회수가 이깁니다. 그래서 변화율로 비교합니다.
        rates = {
            key: value / max(int(previous.get(key, 0)), 1) for key, value in delta.items()
        }
        key, rate = max(rates.items(), key=lambda kv: abs(kv[1]))
        base += f" 변화율이 가장 큰 건 {LABELS[key]}, {rate * 100:+.1f}%입니다."
        dropped = [LABELS[k] for k, v in delta.items() if v < 0]
        if dropped:
            base += f" {', '.join(dropped)}는 줄었습니다. 원인 확인이 필요합니다."
    return Answer(
        base,
        {
            "latest": latest,
            "previous": previous,
            "delta": delta,
            "snapshots": log.snapshots()[-14:],
        },
    )


# -------------------------------------------------------------------- plan


def _rank_todos(todos: list[tuple[str, object]]) -> list[dict]:
    ranked = []
    for order, (text, note) in enumerate(todos):
        score = 10 if URGENT.search(text) else 0
        ranked.append({"text": text, "source": getattr(note, "id", ""), "score": score - order * 0.01})
    ranked.sort(key=lambda item: -item["score"])
    return ranked


def run_plan(vault: Vault, query: str, now: datetime) -> Answer:
    todos = vault.open_todos()
    ranked = _rank_todos(todos)
    top3 = ranked[:3]
    if not top3:
        return Answer(
            "raw 폴더에 열린 할 일이 없습니다. `- [ ] 항목`으로 적어 두면 여기서 모아 드립니다.",
            {"top3": [], "open": 0},
        )
    lines = [f"{i}. {item['text']}" for i, item in enumerate(top3, 1)]
    body = "\n".join(f"- [ ] {item['text']}  ← [[{item['source']}]]" for item in top3)
    note = vault.write(
        title=f"{now:%Y-%m-%d} 오늘의 상위 3개",
        body=f"## 우선순위\n\n{body}\n\n미처리 전체: {len(ranked)}건\n",
        kind="outputs",
        type="plan",
        tags=["plan", "daily"],
        note_id=f"plan-{now:%Y-%m-%d}",
    )
    spoken = "오늘의 우선순위 세 가지입니다. " + " ".join(lines) + f" 열린 할 일은 모두 {len(ranked)}건입니다."
    return Answer(spoken, {"top3": top3, "open": len(ranked)}, note.id)


# ------------------------------------------------------------------ trends


def run_trends(vault: Vault, query: str, now: datetime) -> Answer:
    week = now - timedelta(days=7)
    fortnight = now - timedelta(days=14)
    recent: Counter[str] = Counter()
    prior: Counter[str] = Counter()
    for note in vault.notes():
        try:
            stamp = datetime.fromisoformat(note.updated)
        except ValueError:
            continue
        bucket = recent if stamp >= week else (prior if stamp >= fortnight else None)
        if bucket is None:
            continue
        bucket.update(note.tags)

    rising = sorted(
        ((tag, recent[tag] - prior.get(tag, 0)) for tag in recent),
        key=lambda kv: -kv[1],
    )[:3]
    cooling = [tag for tag in prior if recent.get(tag, 0) == 0][:3]

    if not rising:
        return Answer("최근 7일 안에 태그가 붙은 노트가 없습니다. 흐름을 볼 표본이 부족합니다.", {"rising": [], "cooling": cooling})
    spoken = "최근 7일 흐름입니다. " + ", ".join(
        f"{tag} {count:+d}" for tag, count in rising
    ) + "."
    if cooling:
        spoken += f" 반대로 {', '.join(cooling)}는 이번 주에 한 번도 안 나왔습니다."
    return Answer(
        spoken,
        {
            "rising": [{"tag": t, "delta": d, "count": recent[t]} for t, d in rising],
            "cooling": cooling,
            "window_days": 7,
        },
    )


# ------------------------------------------------------------------- vault


def run_vault(vault: Vault, query: str, now: datetime) -> Answer:
    if any(verb in query for verb in CAPTURE_VERBS):
        line = _strip_capture_verb(query)
        if not line:
            return Answer("무엇을 기억할까요? 내용을 함께 말해 주세요.", {"mode": "capture"})
        note = vault.append(
            f"capture-{now:%Y-%m-%d}", line, title=f"{now:%Y-%m-%d} 캡처"
        )
        return Answer(f"기억했습니다. {line}", {"mode": "capture", "line": line}, note.id)

    hits = vault.search(query)
    if not hits:
        return Answer(
            f"'{query.strip()}'에 대한 기록은 볼트에 없습니다.",
            {"mode": "search", "results": []},
        )
    top = hits[0]
    spoken = f"{len(hits)}건 찾았습니다. 가장 가까운 기록은 '{top.title}'입니다. {top.excerpt}"
    return Answer(
        spoken,
        {"mode": "search", "results": [n.to_dict() for n in hits]},
        top.id,
    )


# ------------------------------------------------------------------- inbox


def run_inbox(vault: Vault, query: str, now: datetime) -> Answer:
    since = now - timedelta(days=1)
    fresh = []
    for note in vault.notes("raw"):
        try:
            if datetime.fromisoformat(note.updated) >= since:
                fresh.append(note)
        except ValueError:
            continue
    todos = vault.open_todos()
    metrics_answer = run_metrics(vault, query, now)
    schedule = [f"{t} {desc}" for t, _, desc in DAILY_FLOW]

    spoken = (
        f"좋은 아침입니다. 어제 이후 새 기록 {len(fresh)}건, 열린 할 일 {len(todos)}건입니다. "
        f"{metrics_answer.spoken} "
        f"오늘 일정은 {len(schedule)}개, 첫 블록은 {DAILY_FLOW[0][0]} {DAILY_FLOW[0][2]}입니다."
    )
    body = "\n".join(
        [
            "## 새 기록",
            *_bullets([f"- [[{n.id}]] {n.title}" for n in fresh[:10]]),
            "",
            "## 열린 할 일",
            *_bullets([f"- [ ] {text}" for text, _ in todos[:5]]),
            "",
            "## 지표",
            f"- {metrics_answer.spoken}",
        ]
    )
    note = vault.write(
        title=f"{now:%Y-%m-%d} 모닝 브리핑",
        body=body,
        kind="outputs",
        type="brief",
        tags=["brief", "daily"],
        note_id=f"brief-{now:%Y-%m-%d}",
    )
    return Answer(
        spoken,
        {
            "fresh": [n.to_dict() for n in fresh[:10]],
            "todos": len(todos),
            "metrics": metrics_answer.data,
            "schedule": schedule,
        },
        note.id,
    )


# ------------------------------------------------------------------ review


def run_review(vault: Vault, query: str, now: datetime) -> Answer:
    """19:00 마감 정리. 스킬 폴더 없이 하루 흐름에서만 호출되는 내장 동작입니다."""
    today = date.today().isoformat()
    done_today = [n for n in vault.notes() if n.updated.startswith(today)]
    todos = vault.open_todos()
    body = "\n".join(
        [
            "## 오늘 남긴 것",
            *_bullets([f"- [[{n.id}]] {n.title}" for n in done_today[:10]]),
            "",
            "## 내일로 넘어가는 것",
            *_bullets([f"- [ ] {text}" for text, _ in todos[:3]]),
        ]
    )
    note = vault.write(
        title=f"{now:%Y-%m-%d} 마감 정리",
        body=body,
        kind="outputs",
        type="review",
        tags=["review", "daily"],
        note_id=f"review-{now:%Y-%m-%d}",
    )
    spoken = (
        f"오늘 볼트에 {len(done_today)}건을 남겼습니다. "
        f"내일로 넘어가는 할 일은 {min(len(todos), 3)}건입니다. 회고를 저장했습니다."
    )
    return Answer(
        spoken,
        {"today": len(done_today), "carry_over": [t for t, _ in todos[:3]]},
        note.id,
    )


HANDLERS = {
    "metrics": run_metrics,
    "plan": run_plan,
    "trends": run_trends,
    "vault": run_vault,
    "inbox": run_inbox,
    "review": run_review,
}
