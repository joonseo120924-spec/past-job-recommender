"""Shipyard — 앱을 만들어 App Store / Google Play에 출시하는 에이전트 팀의 컨트롤 플레인.

에이전트 루프는 Anthropic Managed Agents가 돌린다. 이 패키지가 소유하는 것은
그 바깥의 것들뿐이다: 팀 정의(로스터), 릴리스 상태 머신, 휴먼 게이트,
크리덴셜이 필요한 호스트 사이드 툴, 그리고 실행 기록.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
