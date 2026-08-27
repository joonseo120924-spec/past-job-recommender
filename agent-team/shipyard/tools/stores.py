"""스토어 제출 어댑터.

App Store Connect 와 Google Play Developer API 를 직접 호출하지 않고 `eas submit` 에
위임한다. 이유는 두 가지다.

1. 두 스토어의 인증이 다르다 — Apple은 ASC API 키로 서명한 JWT, Google은 서비스 계정
   OAuth. 그걸 직접 다루면 유지보수할 코드가 늘고, 틀리면 조용히 실패한다.
2. `eas submit` 은 이미 그 둘을 다루고, 빌드 아티팩트를 가져오는 것까지 안다.

**이 모듈에 도달했다는 것은 이미 사람이 승인했다는 뜻이다.** 게이트는 호출부
(tools/__init__.py 의 _submit_to_store)에 있다. 여기서 다시 묻지 않는다.
"""

from __future__ import annotations

import subprocess

from ..config import Settings


class SubmitError(RuntimeError):
    pass


#: 우리 트랙 이름 → 각 스토어의 실제 트랙.
_PLAY_TRACK = {"internal": "internal", "beta": "beta", "production": "production"}


def submit(settings: Settings, platform: str, build_id: str, track: str) -> str:
    if platform not in {"ios", "android"}:
        raise SubmitError(f"알 수 없는 플랫폼: {platform}")

    args = ["submit", "--platform", platform, "--non-interactive"]

    if build_id.startswith("eas:"):
        args += ["--id", build_id.split(":", 1)[1]]
    else:
        # GitHub Actions 백엔드에서 나온 빌드는 EAS가 모른다. 아티팩트 경로를
        # 넘기는 방식으로 제출해야 하며, 그 경로를 여기서 추측하지 않는다.
        raise SubmitError(
            f"build_id {build_id} 는 EAS 빌드가 아니다. GitHub Actions로 빌드한 경우 "
            "제출도 같은 워크플로 안에서 fastlane deliver / supply 로 처리하고, "
            "이 툴 대신 trigger_build 의 submit 프로파일을 쓸 것."
        )

    if platform == "android":
        args += ["--track", _PLAY_TRACK.get(track, "internal")]
    elif track != "production":
        # App Store 쪽은 TestFlight가 곧 internal/beta다. 업로드 자체는 같고,
        # 심사 제출 여부만 다르다.
        args += ["--what-to-test", f"shipyard {track} build"]

    try:
        proc = subprocess.run(
            [settings.eas_cli, *args],
            capture_output=True,
            text=True,
            timeout=1800,
            check=False,
        )
    except FileNotFoundError as exc:
        raise SubmitError(f"`{settings.eas_cli}` 를 찾을 수 없다.") from exc
    except subprocess.TimeoutExpired as exc:
        raise SubmitError("제출이 30분 안에 끝나지 않았다. 스토어 콘솔에서 상태를 직접 확인할 것.") from exc

    if proc.returncode != 0:
        raise SubmitError(f"eas submit 실패 (exit {proc.returncode}):\n{proc.stderr[-1200:]}")

    return (
        f"{platform} / {track} 제출 완료.\n{proc.stdout[-1200:]}\n\n"
        "업로드가 끝난 것이지 심사가 통과한 것이 아니다. "
        "심사 상태는 스토어 콘솔에서 확인해야 하며, 이 팀은 그 상태를 폴링하지 않는다."
    )
