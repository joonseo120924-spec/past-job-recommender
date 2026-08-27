"""설정. 전부 환경변수 `SHIPYARD_*` 또는 `.env`에서 온다.

크리덴셜에 대한 원칙 하나: **여기 있는 비밀은 샌드박스에 들어가지 않는다.**
GitHub 토큰, 스토어 서비스 계정 키, EAS 토큰은 전부 호스트 사이드에 머물고,
에이전트는 커스텀 툴을 통해서만 그것들이 필요한 행동을 요청할 수 있다.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_STATE_DIR = Path(".shipyard")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SHIPYARD_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Managed Agents ---
    environment_id: str | None = None
    """`shipyard env create`가 만들어 채운다."""

    workspace_id: str = "default"
    """Console 트레이스 링크용. API 키가 Default 워크스페이스에 없으면 실제 ID로 바꿔야 한다."""

    session_budget_usd: float | None = 50.0
    """세션당 하드 상한. 도달하면 세션이 `budget_reached`로 멈춘다.
    None이면 상한 없음 — 자율 실행에서는 권하지 않는다."""

    # --- 앱 코드가 사는 곳 ---
    repo_url: str | None = None
    repo_branch: str = "main"
    repo_mount_path: str = "/workspace/app"
    github_token: str | None = None
    """`github_repository` 리소스에 붙는다. Anthropic의 git 프록시가 주입하므로
    샌드박스 안에서는 보이지 않는다."""

    # --- 백엔드 (Supabase) ---
    supabase_url: str | None = None
    """프로젝트 URL. 예: https://xxxx.supabase.co"""

    supabase_publishable_key: str | None = None
    """공개(publishable/anon) 키. 클라이언트에 실려 나가도록 설계된 키라
    앱 번들과 샌드박스에 들어가도 된다. RLS가 이 키의 권한 경계다."""

    supabase_service_role_key: str | None = None
    """서비스 롤 키. **샌드박스에 절대 넣지 않는다.** RLS를 통째로 우회하므로
    이 키가 에이전트가 쓴 코드의 사정권에 들어가는 순간 데이터베이스 전체가 노출된다.
    필요해지면 vault의 environment_variable 크리덴셜로만 다루고,
    backend.render_context() 는 이 값을 절대 내보내지 않는다."""

    # --- 빌드 CI (샌드박스 밖) ---
    github_owner: str | None = None
    github_repo: str | None = None
    build_workflow: str = "build.yml"
    """`workflow_dispatch`로 트리거할 워크플로 파일명 또는 ID."""

    eas_cli: str = "eas"
    """`eas` 실행 파일 경로. 컨트롤 플레인 호스트에 설치돼 있어야 한다."""

    # --- 상태 ---
    state_dir: Path = Field(default=DEFAULT_STATE_DIR)

    # --- 게이트 ---
    auto_approve_gates: bool = False
    """True면 휴먼 게이트를 자동 통과시킨다. 개발 중에만 쓸 것.
    스토어 제출 게이트는 이 플래그를 무시한다 — gates.py 참고."""

    @property
    def agent_ids_path(self) -> Path:
        return self.state_dir / "agent-ids.json"

    @property
    def journal_path(self) -> Path:
        return self.state_dir / "journal.sqlite3"

    def console_url(self, session_id: str) -> str:
        return f"https://platform.claude.com/workspaces/{self.workspace_id}/sessions/{session_id}"

    def supabase_host(self) -> str | None:
        """환경의 allowed_hosts 에 넣을 호스트명."""
        if not self.supabase_url:
            return None
        return self.supabase_url.removeprefix("https://").removeprefix("http://").rstrip("/")

    def ensure_state_dir(self) -> Path:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        return self.state_dir


def load_settings() -> Settings:
    return Settings()
