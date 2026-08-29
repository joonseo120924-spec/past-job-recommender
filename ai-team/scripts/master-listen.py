#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
마스터 — 박수 두 번에 깨어나는 음성 비서 (Windows 상주)

    pip install sounddevice
    python ai-team/scripts/master-listen.py --setup      1. 마이크·음성 점검
    python ai-team/scripts/master-listen.py --tune       2. 박수 감도 보정
    python ai-team/scripts/master-listen.py              3. 기동

무엇을 하는가
    마이크를 계속 듣다가 **박수 두 번**을 감지하면
      ① "네, 사장님." 하고 소리로 대답한 뒤
      ② 지정한 단축키를 눌러 Claude 의 받아쓰기를 켭니다.
    보고문이 도착해 있으면 읽어 드립니다 (ai-team/voice-out/).

말하기는 Windows 내장 음성(SAPI)을 PowerShell 로 부릅니다 — **추가 설치가 없습니다.**

⚠️ 이 파일은 오디오 장치가 없는 원격 컨테이너에서 작성됐습니다.
   감지 로직은 합성 신호로 검증했으나 **실제 마이크로는 미검증**입니다.
   반드시 --setup → --tune 을 먼저 거치십시오.
"""
import argparse, json, math, os, subprocess, sys, threading, time
from array import array
from pathlib import Path

RATE, BLOCK = 16000, 320          # 16kHz, 20ms
REFRACTORY = 0.12                 # 한 박수를 두 번 세지 않기 위한 최소 간격
GAP_MIN, GAP_MAX = 0.15, 1.20     # 두 박수 사이 허용 간격
COOLDOWN = 3.0                    # 발동 후 재무장

ROOT = Path(__file__).resolve().parents[2]
CFG_PATH = ROOT / "ai-team" / "scripts" / "master-listen.config.json"
VOICE_OUT = ROOT / "ai-team" / "voice-out"

DEFAULTS = {
    "hotkey": "",                 # 예: "ctrl+shift+v" — 비우면 키를 누르지 않습니다
    "factor": 6.0,
    "floor": 1500.0,
    "device": None,
    "greeting": "네, 사장님.",
    "boot_line": "마스터 기동했습니다. 박수 두 번으로 부르십시오.",
    "sleep_line": "대기 모드로 전환합니다.",
    "speak": True,
    "read_reports": True,
}

C = {"dim": "\033[2m", "b": "\033[1m", "amber": "\033[38;5;179m",
     "ok": "\033[38;5;72m", "red": "\033[38;5;167m", "off": "\033[0m"}
if os.name == "nt":
    os.system("")                 # Windows 10+ ANSI 활성화


def cfg_load():
    c = dict(DEFAULTS)
    if CFG_PATH.exists():
        try:
            c.update(json.loads(CFG_PATH.read_text(encoding="utf-8")))
        except Exception as e:
            print("%s설정 파일을 읽지 못했습니다 (%s). 기본값으로 갑니다.%s" % (C["red"], e, C["off"]))
    return c


def cfg_save(c):
    CFG_PATH.write_text(json.dumps(c, ensure_ascii=False, indent=2), encoding="utf-8")


# ─────────────────────────── 말하기 (Windows SAPI, 추가 설치 없음)
_speak_lock = threading.Lock()

def speak(text, enabled=True, block=False):
    if not enabled or not text:
        return
    if sys.platform != "win32":
        print("%s   (음성: %s)%s" % (C["dim"], text, C["off"]))
        return
    ps = ("Add-Type -AssemblyName System.Speech;"
          "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
          "$k=$s.GetInstalledVoices()|Where-Object{$_.VoiceInfo.Culture.Name -like 'ko*'}|Select-Object -First 1;"
          "if($k){$s.SelectVoice($k.VoiceInfo.Name)};"
          "$s.Speak([Console]::In.ReadToEnd())")
    def run():
        with _speak_lock:
            try:
                subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                               input=text, text=True, encoding="utf-8",
                               capture_output=True, timeout=90)
            except Exception as e:
                print("%s   (말하지 못했습니다: %s)%s" % (C["red"], e, C["off"]))
    if block:
        run()
    else:
        threading.Thread(target=run, daemon=True).start()


# ─────────────────────────── 단축키
def send_keys(combo):
    if not combo:
        return
    if sys.platform != "win32":
        print("%s   (키 전송은 Windows 전용입니다: %s)%s" % (C["dim"], combo, C["off"]))
        return
    import ctypes
    VK = {"ctrl": 0x11, "control": 0x11, "shift": 0x10, "alt": 0x12, "win": 0x5B,
          "space": 0x20, "enter": 0x0D, "tab": 0x09, "esc": 0x1B}
    VK.update({"f%d" % i: 0x6F + i for i in range(1, 13)})
    codes = []
    for p in [x.strip().lower() for x in combo.split("+") if x.strip()]:
        if p in VK:
            codes.append(VK[p])
        elif len(p) == 1:
            codes.append(ord(p.upper()))
        else:
            print("%s   알 수 없는 키: %s%s" % (C["red"], p, C["off"]))
            return
    u = ctypes.windll.user32
    for c in codes:
        u.keybd_event(c, 0, 0, 0)
    for c in reversed(codes):
        u.keybd_event(c, 0, 2, 0)


# ─────────────────────────── 감지 (합성 신호 8종으로 검증된 로직)
def rms(buf):
    a = array("h"); a.frombytes(buf)
    return math.sqrt(sum(v * v for v in a) / len(a)) if a else 0.0


class Detector:
    """온셋 AND 감쇠를 모두 요구합니다.
    온셋만 보면 음악 시작이, 감쇠만 보면 말끝이 박수로 걸립니다."""

    def __init__(self, factor, floor, verbose=False):
        self.factor, self.floor, self.verbose = factor, floor, verbose
        self.noise = 200.0
        self.last_clap = self.armed_at = 0.0
        self.first_clap = None
        self.pending = None
        self.prev = 0.0

    def feed(self, level, now):
        if self.pending is not None:
            t0, peak = self.pending
            if now - t0 >= 0.04:
                self.pending = None
                if level < peak * 0.35:
                    return self._clap(now)
        thresh = max(self.noise * self.factor, self.floor)
        if (level > thresh and self.prev < thresh * 0.5
                and now - self.last_clap > REFRACTORY and self.pending is None):
            self.pending = (now, level)
            if self.verbose:
                print("   피크 %.0f (기준 %.0f)" % (level, thresh))
        elif level < self.noise * 2:
            self.noise = self.noise * 0.995 + level * 0.005
        self.prev = level
        return False

    def _clap(self, now):
        self.last_clap = now
        if now < self.armed_at:
            return False
        if self.first_clap is None or now - self.first_clap > GAP_MAX:
            self.first_clap = now
            print("%s👏%s" % (C["dim"], C["off"]), end="", flush=True)
            return False
        if now - self.first_clap >= GAP_MIN:
            self.first_clap = None
            self.armed_at = now + COOLDOWN
            return True
        return False


# ─────────────────────────── 보고문
def pending_reports():
    if not VOICE_OUT.exists():
        return []
    spoken_file = VOICE_OUT / ".spoken"
    done = set(spoken_file.read_text(encoding="utf-8").split()) if spoken_file.exists() else set()
    return [p for p in sorted(VOICE_OUT.glob("*.txt")) if p.name not in done]


def mark_spoken(p):
    with (VOICE_OUT / ".spoken").open("a", encoding="utf-8") as f:
        f.write(p.name + "\n")


# ─────────────────────────── 화면
BANNER = r"""
   ┌─────────────────────────────────────────────┐
   │   J A R V I S                               │
   │   AI 앱 개발팀 · 총괄                        │
   └─────────────────────────────────────────────┘
"""

def boot_check(cfg):
    print(C["amber"] + BANNER + C["off"])
    steps = []
    try:
        import sounddevice as sd
        try:
            d = sd.query_devices(kind="input")
            steps.append(("마이크", True, d["name"][:38]))
        except Exception as e:
            steps.append(("마이크", False, str(e)[:38]))
    except ImportError:
        steps.append(("마이크", False, "sounddevice 없음 → pip install sounddevice"))
    steps.append(("음성 출력", sys.platform == "win32",
                  "Windows SAPI" if sys.platform == "win32" else "Windows 에서만 소리가 납니다"))
    steps.append(("단축키", bool(cfg["hotkey"]), cfg["hotkey"] or "미설정 — 깨우기만 합니다"))
    n = len(pending_reports())
    steps.append(("대기 보고문", True, "%d건" % n))
    for name, ok, note in steps:
        mark = C["ok"] + "●" + C["off"] if ok else C["red"] + "○" + C["off"]
        print("   %s %-12s %s%s%s" % (mark, name, C["dim"], note, C["off"]))
    print()
    return all(s[1] for s in steps[:1])


# ─────────────────────────── 모드
def mode_setup(cfg):
    ok = boot_check(cfg)
    print("%s말하기 시험 — 소리가 들려야 정상입니다.%s" % (C["b"], C["off"]))
    speak("마스터입니다. 소리가 들리시면 준비가 된 것입니다.", cfg["speak"], block=True)
    print("\n다음 단계:  python ai-team/scripts/master-listen.py --tune")
    if not ok:
        print("%s마이크부터 해결하셔야 합니다.%s" % (C["red"], C["off"]))


def mode_tune(cfg):
    try:
        import sounddevice as sd
    except ImportError:
        return print("%spip install sounddevice 를 먼저 하십시오.%s" % (C["red"], C["off"]))
    print("%s감도 보정 — 조용히 계시다가 박수를 다섯 번쯤 쳐 보십시오. Ctrl+C 로 종료%s\n"
          % (C["b"], C["off"]))
    det = Detector(cfg["factor"], cfg["floor"], verbose=True)
    peaks, last = [], 0.0
    try:
        with sd.RawInputStream(samplerate=RATE, blocksize=BLOCK, dtype="int16",
                               channels=1, device=cfg["device"]) as st:
            while True:
                buf, _ = st.read(BLOCK)
                now, lvl = time.monotonic(), rms(bytes(buf))
                if lvl > max(det.noise * det.factor, det.floor):
                    peaks.append(lvl)
                det.feed(lvl, now)
                if now - last > 0.25:
                    last = now
                    print("\r   배경 %-6.0f 현재 %-6.0f %s%-40s%s"
                          % (det.noise, lvl, C["amber"], "█" * min(40, int(lvl / 200)), C["off"]),
                          end="", flush=True)
    except KeyboardInterrupt:
        print("\n")
        if peaks:
            lo = min(peaks)
            rec_floor = max(800.0, lo * 0.6)
            print("   박수 %d회 감지 · 가장 약한 피크 %.0f · 배경 %.0f" % (len(peaks), lo, det.noise))
            print("   권장 floor = %.0f" % rec_floor)
            if input("   설정에 저장할까요? [y/N] ").strip().lower() == "y":
                cfg["floor"] = rec_floor
                cfg_save(cfg)
                print("   저장했습니다 → %s" % CFG_PATH.name)
        else:
            print("   %s박수가 한 번도 잡히지 않았습니다.%s floor 를 낮춰 보십시오 (현재 %.0f)"
                  % (C["red"], C["off"], cfg["floor"]))


def mode_run(cfg):
    try:
        import sounddevice as sd
    except ImportError:
        return print("%spip install sounddevice 를 먼저 하십시오.%s" % (C["red"], C["off"]))
    boot_check(cfg)
    speak(cfg["boot_line"], cfg["speak"])
    print("%s대기 중 — 박수 두 번.  Ctrl+C 로 종료%s\n" % (C["b"], C["off"]))
    det = Detector(cfg["factor"], cfg["floor"])
    woke = 0
    try:
        with sd.RawInputStream(samplerate=RATE, blocksize=BLOCK, dtype="int16",
                               channels=1, device=cfg["device"]) as st:
            while True:
                buf, _ = st.read(BLOCK)
                if not det.feed(rms(bytes(buf)), time.monotonic()):
                    continue
                woke += 1
                print("\r%s👏👏  네, 사장님.%s%s" % (C["amber"], C["off"], " " * 20))
                speak(cfg["greeting"], cfg["speak"])
                if cfg["read_reports"]:
                    for p in pending_reports():
                        print("   %s보고문 낭독 — %s%s" % (C["dim"], p.name, C["off"]))
                        speak(p.read_text(encoding="utf-8").strip(), cfg["speak"], block=True)
                        mark_spoken(p)
                if cfg["hotkey"]:
                    time.sleep(0.6)          # 인사가 끝난 뒤 눌러야 받아쓰기에 안 섞입니다
                    send_keys(cfg["hotkey"])
                    print("   %s받아쓰기 시작 (%s) — 말씀하십시오%s"
                          % (C["dim"], cfg["hotkey"], C["off"]))
    except KeyboardInterrupt:
        print("\n%s마스터 대기 모드.%s (오늘 %d회 응답)" % (C["dim"], C["off"], woke))
        speak(cfg["sleep_line"], cfg["speak"], block=True)


def main():
    ap = argparse.ArgumentParser(description="마스터 — 박수 두 번에 깨어나는 음성 비서")
    ap.add_argument("--setup", action="store_true", help="마이크·음성 점검")
    ap.add_argument("--tune", action="store_true", help="박수 감도 보정")
    ap.add_argument("--say", help="이 문장을 말해 보기 (음성 시험)")
    ap.add_argument("--hotkey", help="깨어난 뒤 누를 단축키. 예: ctrl+shift+v")
    ap.add_argument("--device", help="입력 장치 번호/이름")
    ap.add_argument("--list", action="store_true", help="입력 장치 목록")
    ap.add_argument("--quiet", action="store_true", help="소리 없이 (감지만)")
    a = ap.parse_args()

    cfg = cfg_load()
    if a.hotkey is not None:
        cfg["hotkey"] = a.hotkey; cfg_save(cfg)
    if a.device is not None:
        cfg["device"] = int(a.device) if a.device.isdigit() else a.device; cfg_save(cfg)
    if a.quiet:
        cfg["speak"] = False

    if a.list:
        import sounddevice as sd; return print(sd.query_devices())
    if a.say:
        return speak(a.say, True, block=True)
    if a.setup:
        return mode_setup(cfg)
    if a.tune:
        return mode_tune(cfg)
    mode_run(cfg)


if __name__ == "__main__":
    main()
