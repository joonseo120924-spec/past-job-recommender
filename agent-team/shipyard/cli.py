"""커맨드라인.

    python -m shipyard env apply         환경(컨테이너 템플릿)을 만든다
    python -m shipyard apply             에이전트 매니페스트를 반영한다
    python -m shipyard run "아이디어"     릴리스를 시작한다
    python -m shipyard resume            중단된 릴리스를 이어서 진행한다
    python -m shipyard status            최근 실행 상태를 본다
    python -m shipyard doctor            설정이 실제로 맞는지 점검한다
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

from . import backend
from .config import Settings, load_settings
from .gates import Gate, GateDecision, GateKind
from .journal import Journal
from .pipeline import STAGES, ReleasePipeline, Stage
from .roster import RosterStore, apply_roster, load_manifests
from .session import SessionDriver
from .tools import ToolDispatcher

HERE = Path(__file__).resolve().parent.parent
AGENTS_DIR = HERE / "agents"
ENV_MANIFEST = HERE / "environments" / "shipyard.yaml"
COORDINATOR_NAME = "Showrunner"


def _client():
    try:
        import anthropic
    except ImportError:  # pragma: no cover - 설치 안내
        sys.exit("anthropic SDK가 없다: pip install -r agent-team/requirements.txt")
    return anthropic.Anthropic()


def _wire(settings: Settings, run_id: str) -> tuple[Journal, Gate, ToolDispatcher]:
    settings.ensure_state_dir()
    journal = Journal(settings.journal_path)

    def record(kind: GateKind, decision: GateDecision, summary: str) -> None:
        journal.record_gate(
            run_id, kind.value, summary, decision.approved, decision.automatic, decision.note
        )

    gate = Gate(settings, on_record=record)
    dispatcher = ToolDispatcher(settings, gate, journal, run_id)
    return journal, gate, dispatcher


# --- 명령들 ---


def cmd_env_apply(args: argparse.Namespace) -> int:
    settings = load_settings()
    manifest = yaml.safe_load(ENV_MANIFEST.read_text(encoding="utf-8"))

    # 프로젝트별 호스트는 매니페스트에 박지 않고 설정에서 주입한다.
    # networking이 limited라 여기 없으면 샌드박스가 Supabase에 닿지 못한다.
    host = settings.supabase_host()
    networking = manifest.get("config", {}).get("networking", {})
    if host and networking.get("type") == "limited":
        allowed = networking.setdefault("allowed_hosts", [])
        if host not in allowed:
            allowed.append(host)
            print(f"allowed_hosts 에 {host} 추가")

    env = _client().beta.environments.create(**manifest)
    print(f"환경 생성됨: {env.id}")
    print(f"\n다음을 셸이나 .env 에 넣어라:\n  export SHIPYARD_ENVIRONMENT_ID={env.id}")
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    settings = load_settings()
    settings.ensure_state_dir()
    store = RosterStore(settings.agent_ids_path)
    applied = apply_roster(_client(), AGENTS_DIR, store)

    width = max(len(a.name) for a in applied)
    for agent in applied:
        print(f"  {agent.action:<9} {agent.name:<{width}}  {agent.agent_id}  v{agent.version}")
    changed = sum(1 for a in applied if a.action != "unchanged")
    print(f"\n{len(applied)}개 중 {changed}개 반영됨 → {settings.agent_ids_path}")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    settings = load_settings()
    if not settings.environment_id:
        sys.exit("SHIPYARD_ENVIRONMENT_ID 가 없다. 먼저 `python -m shipyard env apply` 를 실행할 것.")

    store = RosterStore(settings.agent_ids_path)
    agent_id = store.coordinator_id(COORDINATOR_NAME)

    settings.ensure_state_dir()
    journal = Journal(settings.journal_path)
    run_id = journal.start_run(args.idea[:80])
    journal, gate, dispatcher = _wire(settings, run_id)

    driver = SessionDriver.start(
        _client(),
        settings,
        dispatcher,
        agent_id=agent_id,
        title=f"shipyard: {args.idea[:60]}",
        on_event=print,
    )
    journal.attach_session(run_id, driver.session_id)

    pipeline = ReleasePipeline(
        driver, gate, journal, run_id, on_stage=lambda s: print(f"\n=== [{s.stage.value}] {s.title} ===")
    )
    result = pipeline.run(
        idea=args.idea,
        platforms=args.platforms,
        start=Stage(args.start),
        stop_after=Stage(args.stop_after) if args.stop_after else None,
        context=backend.describe(settings),
    )

    if result.stopped_at:
        journal.finish_run(run_id, "stopped")
        print(f"\n[{result.stopped_at.value}] 에서 멈췄다: {result.reason}")
        print(f"이어서 하려면: python -m shipyard resume --start {result.stopped_at.value}")
        return 1

    journal.finish_run(run_id, "done")
    print(f"\n완료한 단계: {', '.join(s.value for s in result.completed)}")
    print(f"세션: {settings.console_url(driver.session_id)}")
    return 0


def cmd_resume(args: argparse.Namespace) -> int:
    settings = load_settings()
    settings.ensure_state_dir()
    journal = Journal(settings.journal_path)
    run = journal.get_run(args.run_id) if args.run_id else journal.latest_run()
    if not run:
        sys.exit("이어갈 실행이 없다.")
    if not run.get("session_id"):
        sys.exit(f"{run['id']} 에는 세션이 붙어 있지 않다. 새로 시작해야 한다.")

    _, gate, dispatcher = _wire(settings, run["id"])
    driver = SessionDriver(
        _client(), settings, dispatcher, session_id=run["session_id"], on_event=print
    )
    print(f"{run['id']} 이어감 (세션 {run['session_id']}, 마지막 단계 {run['stage']})")

    pipeline = ReleasePipeline(
        driver, gate, journal, run["id"], on_stage=lambda s: print(f"\n=== [{s.stage.value}] {s.title} ===")
    )
    start = Stage(args.start) if args.start else Stage(run["stage"] or Stage.DISCOVERY.value)
    result = pipeline.run(
        idea=run["app_name"],
        platforms=args.platforms,
        start=start,
        context=backend.describe(settings),
    )

    if result.stopped_at:
        print(f"\n[{result.stopped_at.value}] 에서 멈췄다: {result.reason}")
        return 1
    journal.finish_run(run["id"], "done")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    settings = load_settings()
    if not settings.journal_path.exists():
        print("아직 실행 기록이 없다.")
        return 0
    journal = Journal(settings.journal_path)
    run = journal.get_run(args.run_id) if args.run_id else journal.latest_run()
    if not run:
        print("실행 기록이 없다.")
        return 0

    print(f"실행 {run['id']}  상태={run['status']}  단계={run['stage']}")
    print(f"앱: {run['app_name']}")
    if run.get("session_id"):
        print(f"세션: {settings.console_url(run['session_id'])}")
    print("\n단계 이력:")
    for row in journal.stage_history(run["id"]):
        note = f"  {row['note']}" if row["note"] else ""
        print(f"  {row['at'][:19]}  {row['stage']:<14} {row['status']}{note}")
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    """설정이 실제로 맞는지 점검한다. 세션을 만들기 전에 여기서 걸러내는 게 싸다."""
    settings = load_settings()
    problems: list[str] = []
    notes: list[str] = []

    try:
        manifests = load_manifests(AGENTS_DIR)
        notes.append(f"매니페스트 {len(manifests)}개 파싱 성공")
        coordinators = [m for m in manifests if m.get("roster")]
        if len(coordinators) != 1:
            problems.append(f"코디네이터가 {len(coordinators)}개다. 정확히 1개여야 한다.")
        else:
            roster = coordinators[0]["roster"]
            if len(roster) > 20:
                problems.append(f"로스터 항목이 {len(roster)}개다. 최대 20개다.")
            if sum(1 for e in roster if e == "self") > 1:
                problems.append("로스터에 self 가 두 번 이상 있다.")
    except Exception as exc:
        problems.append(f"매니페스트 로드 실패: {exc}")

    if not settings.environment_id:
        problems.append("SHIPYARD_ENVIRONMENT_ID 없음 — `env apply` 를 먼저 실행할 것")
    if not settings.agent_ids_path.exists():
        problems.append(f"{settings.agent_ids_path} 없음 — `apply` 를 먼저 실행할 것")
    if settings.supabase_url:
        notes.append(f"Supabase: {settings.supabase_url}")
        if not settings.supabase_publishable_key:
            problems.append("SHIPYARD_SUPABASE_URL 은 있는데 공개 키가 없다")
    else:
        notes.append("Supabase 미설정 — 백엔드가 필요하면 에이전트가 새로 만들려 할 것이다")
    if settings.supabase_service_role_key:
        problems.append(
            "SHIPYARD_SUPABASE_SERVICE_ROLE_KEY 가 설정돼 있다. 이 팀은 그 키를 쓰지 않으며 "
            "샌드박스에 넣지도 않는다. 설정에서 빼라."
        )
    if not settings.repo_url:
        notes.append("SHIPYARD_REPO_URL 없음 — 세션에 코드 저장소가 붙지 않는다")
    if not (settings.github_owner and settings.github_repo):
        notes.append("GitHub Actions 백엔드 미설정 — 빌드는 로컬 eas CLI로 시도한다")
    if settings.session_budget_usd is None:
        notes.append("세션 예산 상한 없음 — 자율 실행에서는 권하지 않는다")
    if settings.auto_approve_gates:
        notes.append("게이트 자동 승인 켜짐 (스토어 제출은 예외로 항상 사람이 승인한다)")

    for note in notes:
        print(f"  · {note}")
    for problem in problems:
        print(f"  ✗ {problem}")
    if not problems:
        print("\n점검 통과.")
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="shipyard", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    env = sub.add_parser("env", help="환경 관리")
    env_sub = env.add_subparsers(dest="env_command", required=True)
    env_sub.add_parser("apply", help="환경을 만든다").set_defaults(func=cmd_env_apply)

    sub.add_parser("apply", help="에이전트 매니페스트를 반영한다").set_defaults(func=cmd_apply)

    run = sub.add_parser("run", help="릴리스를 시작한다")
    run.add_argument("idea", help="앱 아이디어 한 문단")
    run.add_argument("--platforms", default="ios, android")
    run.add_argument("--start", default=Stage.DISCOVERY.value, choices=[s.stage.value for s in STAGES])
    run.add_argument("--stop-after", dest="stop_after", default=None, choices=[s.stage.value for s in STAGES])
    run.set_defaults(func=cmd_run)

    resume = sub.add_parser("resume", help="중단된 릴리스를 이어서 진행한다")
    resume.add_argument("--run-id", dest="run_id", default=None)
    resume.add_argument("--start", default=None, choices=[s.stage.value for s in STAGES])
    resume.add_argument("--platforms", default="ios, android")
    resume.set_defaults(func=cmd_resume)

    status = sub.add_parser("status", help="최근 실행 상태")
    status.add_argument("--run-id", dest="run_id", default=None)
    status.set_defaults(func=cmd_status)

    sub.add_parser("doctor", help="설정 점검").set_defaults(func=cmd_doctor)

    args = parser.parse_args(argv)
    return args.func(args)
