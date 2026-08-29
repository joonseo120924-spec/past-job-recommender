#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""박수 두 번 감지기 — 사용자 PC(Windows)에서 상주 실행합니다.

    pip install sounddevice
    python ai-team/scripts/clap-listen.py --calibrate     # 1단계: 소리 크기 보기
    python ai-team/scripts/clap-listen.py --test          # 2단계: 감지만 (아무 것도 안 누름)
    python ai-team/scripts/clap-listen.py --key ctrl+shift+v   # 3단계: 실제 사용

무엇을 하는가
    마이크를 계속 듣다가 **짧고 강한 소리 두 번**(박수)을 감지하면
    지정한 단축키를 눌러 줍니다. Claude Code 의 음성 입력(tap 모드) 단축키를 주면
    박수 두 번 → 받아쓰기 시작이 됩니다.

⚠️ 이 스크립트는 **오디오 장치가 없는 원격 컨테이너에서 작성**됐습니다.
   문법·로직 검토만 했고 **실제 마이크로 검증하지 못했습니다.**
   반드시 --calibrate → --test 순서로 사장님 PC 에서 확인한 뒤 쓰십시오.
"""
import argparse, math, sys, time
from array import array

RATE = 16000
BLOCK = 320                    # 20ms
REFRACTORY = 0.12              # 한 박수를 두 번 세지 않기 위한 최소 간격(초)
GAP_MIN, GAP_MAX = 0.15, 1.20  # 두 박수 사이 간격 허용 범위(초)
COOLDOWN = 3.0                 # 발동 후 재무장까지(초)


def rms(buf: bytes) -> float:
    a = array("h"); a.frombytes(buf)
    if not a:
        return 0.0
    return math.sqrt(sum(v * v for v in a) / len(a))


class Detector:
    """적응형 배경소음 대비 '짧고 강한 피크'를 박수로 봅니다.

    - 배경소음(noise)은 조용한 블록으로만 천천히 갱신 → 큰 소리가 기준을 오염시키지 않습니다
    - **직전 블록이 조용했어야** 시작으로 인정 (온셋) → 지속음이 *끝나는* 순간을 박수로 세지 않습니다
    - 피크 뒤 곧바로 조용해져야(감쇠) 박수로 인정 → 말소리·음악은 계속 커서 걸러집니다

    두 조건을 모두 요구하는 이유: 온셋만 보면 음악 시작이, 감쇠만 보면 말끝이 걸립니다.
    """

    def __init__(self, factor, floor, verbose=False):
        self.factor, self.floor, self.verbose = factor, floor, verbose
        self.noise = 200.0
        self.last_clap = 0.0
        self.first_clap = None
        self.armed_at = 0.0
        self.pending_decay = None   # (시각, 피크값)
        self.prev_level = 0.0       # 직전 블록 — 온셋 판정용

    def feed(self, level, now):
        """블록 하나를 넣고, 박수 두 번이 완성되면 True."""
        # 감쇠 확인 — 직전 피크가 진짜 '짧은' 소리였는지
        if self.pending_decay is not None:
            t0, peak = self.pending_decay
            if now - t0 >= 0.04:                      # 40ms 뒤
                self.pending_decay = None
                if level < peak * 0.35:               # 충분히 사그라들었으면 박수
                    return self._clap(now)
                elif self.verbose:
                    print("   (지속음 — 박수 아님)")
        thresh = max(self.noise * self.factor, self.floor)
        quiet_before = self.prev_level < thresh * 0.5      # 직전이 조용했는가 (온셋)
        if (level > thresh and quiet_before
                and now - self.last_clap > REFRACTORY and self.pending_decay is None):
            self.pending_decay = (now, level)
            if self.verbose:
                print("   피크 %.0f (기준 %.0f)" % (level, thresh))
        elif level < self.noise * 2:
            self.noise = self.noise * 0.995 + level * 0.005   # 조용할 때만 배경 갱신
        self.prev_level = level
        return False

    def _clap(self, now):
        self.last_clap = now
        if now < self.armed_at:
            return False
        if self.first_clap is None or now - self.first_clap > GAP_MAX:
            self.first_clap = now
            print("👏 1")
            return False
        if now - self.first_clap >= GAP_MIN:
            self.first_clap = None
            self.armed_at = now + COOLDOWN
            print("👏👏 감지")
            return True
        return False


def send_keys(combo: str):
    """Windows 전용 — 추가 설치 없이 ctypes 로 단축키를 보냅니다."""
    import ctypes
    VK = {"ctrl": 0x11, "control": 0x11, "shift": 0x10, "alt": 0x12, "win": 0x5B,
          "space": 0x20, "enter": 0x0D, "tab": 0x09, "esc": 0x1B, "f1": 0x70, "f2": 0x71,
          "f3": 0x72, "f4": 0x73, "f5": 0x74, "f6": 0x75, "f7": 0x76, "f8": 0x77,
          "f9": 0x78, "f10": 0x79, "f11": 0x7A, "f12": 0x7B}
    parts = [p.strip().lower() for p in combo.split("+") if p.strip()]
    codes = []
    for p in parts:
        if p in VK:
            codes.append(VK[p])
        elif len(p) == 1:
            codes.append(ord(p.upper()))
        else:
            raise SystemExit("✗ 알 수 없는 키: %s" % p)
    u = ctypes.windll.user32
    for c in codes:
        u.keybd_event(c, 0, 0, 0)
    for c in reversed(codes):
        u.keybd_event(c, 0, 2, 0)


def main():
    ap = argparse.ArgumentParser(description="박수 두 번 감지기")
    ap.add_argument("--calibrate", action="store_true", help="소리 크기를 실시간 표시 (임계값 정하기)")
    ap.add_argument("--test", action="store_true", help="감지만 하고 키는 누르지 않음")
    ap.add_argument("--key", help="감지 시 누를 단축키. 예: ctrl+shift+v")
    ap.add_argument("--run", help="감지 시 실행할 명령 (키 대신)")
    ap.add_argument("--factor", type=float, default=6.0, help="배경소음 대비 배수 (기본 6)")
    ap.add_argument("--floor", type=float, default=1500.0, help="절대 최소 크기 (기본 1500)")
    ap.add_argument("--device", help="입력 장치 이름/번호 (미지정 시 기본 마이크)")
    ap.add_argument("--list", action="store_true", help="입력 장치 목록")
    a = ap.parse_args()

    try:
        import sounddevice as sd
    except ImportError:
        raise SystemExit("✗ sounddevice 가 없습니다.  pip install sounddevice\n"
                         "  (실패하면 numpy 도 함께:  pip install sounddevice numpy)")

    if a.list:
        print(sd.query_devices()); return
    if not (a.calibrate or a.test or a.key or a.run):
        raise SystemExit("✗ --calibrate / --test / --key / --run 중 하나가 필요합니다.\n"
                         "  처음이라면:  python ai-team/scripts/clap-listen.py --calibrate")
    if a.key and sys.platform != "win32":
        raise SystemExit("✗ --key 는 Windows 전용입니다. 다른 OS 에서는 --run 을 쓰십시오.")

    det = Detector(a.factor, a.floor, verbose=a.calibrate or a.test)
    if a.calibrate:
        print("🎚  보정 모드 — 조용히 있다가 박수를 몇 번 쳐 보십시오. Ctrl+C 로 종료")
        print("   조용할 때 '배경'보다 박수 '피크'가 훨씬 커야 합니다.\n")
    else:
        print("👂 대기 중 — 박수 두 번 (%s). Ctrl+C 로 종료"
              % ("테스트" if a.test else (a.key or a.run)))

    dev = a.device
    if dev is not None and dev.isdigit():
        dev = int(dev)
    last_print = 0.0
    try:
        with sd.RawInputStream(samplerate=RATE, blocksize=BLOCK, dtype="int16",
                               channels=1, device=dev) as stream:
            while True:
                buf, overflowed = stream.read(BLOCK)
                now = time.monotonic()
                level = rms(bytes(buf))
                if a.calibrate and now - last_print > 0.25:
                    last_print = now
                    bar = "█" * min(40, int(level / 200))
                    print("  배경 %-6.0f 현재 %-6.0f %s" % (det.noise, level, bar))
                if det.feed(level, now):
                    if a.test:
                        print("   → (테스트 모드라 아무 것도 하지 않습니다)")
                    elif a.key:
                        send_keys(a.key); print("   → 키 전송: %s" % a.key)
                    elif a.run:
                        import subprocess; subprocess.Popen(a.run, shell=True)
                        print("   → 실행: %s" % a.run)
    except KeyboardInterrupt:
        print("\n종료")


if __name__ == "__main__":
    main()
