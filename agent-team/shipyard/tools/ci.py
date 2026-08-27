"""빌드 CI 어댑터.

에이전트가 iOS 빌드를 직접 못 하는 이유는 정책이 아니라 물리다 — 코드 서명과
Xcode는 macOS를 요구하고 세션 컨테이너는 리눅스다. 그래서 빌드는 항상 밖으로 나간다.

두 가지 백엔드를 지원한다.

- **github**: `workflow_dispatch` 로 워크플로를 돌린다. macOS 러너를 쓸 수 있고,
  서명 키를 GitHub Secrets에 두면 컨트롤 플레인 호스트에도 키가 없어도 된다.
- **eas**: 로컬 `eas` CLI로 Expo 빌드 서비스에 던진다. macOS 없이 iOS 빌드가 되는
  가장 짧은 경로다.

`workflow_dispatch` 는 실행 ID를 돌려주지 않는다. 그래서 상관 ID를 입력으로 넘기고
워크플로가 그것을 실행 이름으로 쓰게 한 뒤, 실행 목록에서 이름으로 찾는다.
워크플로에 다음 한 줄이 필요하다:

    run-name: ${{ inputs.correlation_id }}
"""

from __future__ import annotations

import json
import re
import subprocess
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass

from ..config import Settings

GITHUB_API = "https://api.github.com"

#: GitHub 실행 상태를 우리 어휘로 접는다.
_GITHUB_STATE = {
    ("completed", "success"): "success",
    ("completed", "failure"): "failure",
    ("completed", "cancelled"): "failure",
    ("completed", "timed_out"): "failure",
}


@dataclass
class BuildHandle:
    build_id: str
    backend: str
    detail: str


@dataclass
class BuildStatus:
    build_id: str
    state: str  # queued | running | success | failure | unknown
    url: str | None = None
    detail: str = ""


class CIError(RuntimeError):
    pass


def _backend(settings: Settings) -> str:
    if settings.github_owner and settings.github_repo:
        return "github"
    return "eas"


def trigger(
    settings: Settings, platform: str, profile: str, commit_ref: str | None = None
) -> BuildHandle:
    backend = _backend(settings)
    ref = commit_ref or settings.repo_branch
    if backend == "github":
        return _trigger_github(settings, platform, profile, ref)
    return _trigger_eas(settings, platform, profile)


def status(settings: Settings, build_id: str) -> BuildStatus:
    if build_id.startswith("gh:"):
        return _status_github(settings, build_id)
    if build_id.startswith("eas:"):
        return _status_eas(settings, build_id)
    return BuildStatus(build_id, "unknown", detail=f"알 수 없는 build_id 형식: {build_id}")


# --- GitHub Actions ---


def _github_request(settings: Settings, method: str, path: str, body: dict | None = None):
    if not settings.github_token:
        raise CIError("SHIPYARD_GITHUB_TOKEN 이 없다. CI를 트리거할 수 없다.")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{GITHUB_API}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {settings.github_token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:500]
        raise CIError(f"GitHub API {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise CIError(f"GitHub API 연결 실패: {exc.reason}") from exc


def _trigger_github(settings: Settings, platform: str, profile: str, ref: str) -> BuildHandle:
    correlation_id = f"shipyard-{uuid.uuid4().hex[:10]}"
    _github_request(
        settings,
        "POST",
        f"/repos/{settings.github_owner}/{settings.github_repo}"
        f"/actions/workflows/{settings.build_workflow}/dispatches",
        {
            "ref": ref,
            "inputs": {
                "platform": platform,
                "profile": profile,
                "correlation_id": correlation_id,
            },
        },
    )
    return BuildHandle(
        build_id=f"gh:{correlation_id}",
        backend="github",
        detail=(
            f"{settings.github_owner}/{settings.github_repo} 의 {settings.build_workflow} 를 "
            f"{ref} 에서 실행 요청함 (platform={platform}, profile={profile})."
        ),
    )


def _status_github(settings: Settings, build_id: str) -> BuildStatus:
    correlation_id = build_id.split(":", 1)[1]
    payload = _github_request(
        settings,
        "GET",
        f"/repos/{settings.github_owner}/{settings.github_repo}"
        f"/actions/runs?event=workflow_dispatch&per_page=30",
    )
    for run in (payload or {}).get("workflow_runs", []):
        if run.get("display_title") != correlation_id and run.get("name") != correlation_id:
            continue
        state = _GITHUB_STATE.get(
            (run.get("status"), run.get("conclusion")),
            "running" if run.get("status") in {"in_progress", "queued"} else "unknown",
        )
        return BuildStatus(
            build_id=build_id,
            state=state,
            url=run.get("html_url"),
            detail=f"status={run.get('status')} conclusion={run.get('conclusion')}",
        )
    return BuildStatus(
        build_id=build_id,
        state="queued",
        detail=(
            "아직 해당 실행을 찾지 못했다. 디스패치 직후에는 목록에 나타나기까지 "
            "몇 초 걸린다. 워크플로에 `run-name: ${{ inputs.correlation_id }}` 가 "
            "있는지도 확인할 것."
        ),
    )


# --- EAS ---

_EAS_ID = re.compile(r"\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b")


def _run_eas(settings: Settings, args: list[str], timeout: int = 900) -> str:
    try:
        proc = subprocess.run(
            [settings.eas_cli, *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise CIError(
            f"`{settings.eas_cli}` 를 찾을 수 없다. eas-cli를 설치하거나 "
            "SHIPYARD_GITHUB_OWNER/REPO 를 설정해 GitHub Actions 백엔드를 쓸 것."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise CIError(f"eas {' '.join(args)} 가 {timeout}초 안에 끝나지 않았다.") from exc
    if proc.returncode != 0:
        raise CIError(f"eas {' '.join(args)} 실패 (exit {proc.returncode}): {proc.stderr[-800:]}")
    return proc.stdout


def _trigger_eas(settings: Settings, platform: str, profile: str) -> BuildHandle:
    out = _run_eas(
        settings,
        ["build", "--platform", platform, "--profile", profile, "--non-interactive", "--no-wait"],
    )
    match = _EAS_ID.search(out)
    if not match:
        raise CIError(f"eas build 출력에서 빌드 ID를 찾지 못했다:\n{out[-800:]}")
    return BuildHandle(
        build_id=f"eas:{match.group(1)}",
        backend="eas",
        detail=f"EAS 빌드 대기열에 올림 (platform={platform}, profile={profile}).",
    )


def _status_eas(settings: Settings, build_id: str) -> BuildStatus:
    eas_id = build_id.split(":", 1)[1]
    out = _run_eas(settings, ["build:view", eas_id, "--json", "--non-interactive"], timeout=120)
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return BuildStatus(build_id, "unknown", detail=out[-500:])
    raw = str(data.get("status", "")).lower()
    state = {
        "finished": "success",
        "errored": "failure",
        "canceled": "failure",
        "in_queue": "queued",
        "new": "queued",
        "in_progress": "running",
    }.get(raw, "unknown")
    return BuildStatus(
        build_id=build_id,
        state=state,
        url=data.get("buildUrl") or data.get("artifacts", {}).get("buildUrl"),
        detail=f"eas status={raw}",
    )
