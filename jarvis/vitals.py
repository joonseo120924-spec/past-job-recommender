"""SYSTEM VITALS — /proc 에서 직접 읽습니다 (psutil 의존성 없음)."""

from __future__ import annotations

import os
import time
from pathlib import Path

_PREV_CPU: tuple[int, int] | None = None


def _read_cpu_totals() -> tuple[int, int] | None:
    try:
        first = Path("/proc/stat").read_text().splitlines()[0]
    except (OSError, IndexError):
        return None
    parts = [int(v) for v in first.split()[1:] if v.isdigit()]
    if len(parts) < 4:
        return None
    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
    return sum(parts), idle


def cpu_percent() -> int | None:
    """두 번의 호출 사이 구간을 봅니다. 첫 호출은 기준점만 잡고 None."""
    global _PREV_CPU
    now = _read_cpu_totals()
    if now is None:
        return None
    prev, _PREV_CPU = _PREV_CPU, now
    if prev is None:
        return None
    total_d, idle_d = now[0] - prev[0], now[1] - prev[1]
    if total_d <= 0:
        return None
    return max(0, min(100, round(100 * (total_d - idle_d) / total_d)))


def memory_percent() -> int | None:
    try:
        lines = Path("/proc/meminfo").read_text().splitlines()
    except OSError:
        return None
    info = {}
    for line in lines:
        key, _, value = line.partition(":")
        digits = value.strip().split(" ")[0]
        if digits.isdigit():
            info[key] = int(digits)
    total, available = info.get("MemTotal"), info.get("MemAvailable")
    if not total:
        return None
    if available is None:
        available = info.get("MemFree", 0)
    return max(0, min(100, round(100 * (total - available) / total)))


def disk_read_ms(path: Path) -> float:
    """볼트가 붙어 있는 저장소의 응답 시간. HUD 의 I/O 지연 표시용."""
    start = time.perf_counter()
    try:
        os.stat(path)
    except OSError:
        return -1.0
    return round((time.perf_counter() - start) * 1000, 2)


def snapshot(vault_root: Path) -> dict:
    return {
        "cpu": cpu_percent(),
        "ram": memory_percent(),
        "io_ms": disk_read_ms(vault_root),
        "uptime_s": _uptime(),
    }


def _uptime() -> int | None:
    try:
        return int(float(Path("/proc/uptime").read_text().split()[0]))
    except (OSError, ValueError, IndexError):
        return None
