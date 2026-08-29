# 🎩 자비스 설치 — 처음부터 끝까지

> 박수 두 번 → **"네, 사장님."** → 말로 명령.
> 컴퓨터에서만 합니다. 핸드폰은 claude.ai 앱 마이크를 그냥 쓰시면 됩니다.

전부 합쳐 **15분**, **0원**입니다.

---

## 1단계 · 파이썬 설치 (5분, 한 번만)

1. https://www.python.org/downloads/ 접속 → 노란 **Download Python** 버튼
2. 받은 파일 실행
3. 🔴 **첫 화면 맨 아래 「Add python.exe to PATH」에 반드시 체크** — 이걸 놓치면 나중에 "python은 명령이 아닙니다" 가 뜹니다
4. **Install Now** → 끝나면 Close

**확인**: 시작 → `cmd` 입력 → 검은 창에서
```
python --version
```
`Python 3.13.x` 처럼 나오면 됩니다.

> ❌ **"python은(는) 내부 또는 외부 명령이 아닙니다"** → PATH 체크를 놓치신 겁니다.
> 설치 파일을 다시 실행 → **Modify** → Next → **Add Python to environment variables** 체크 → Install

---

## 2단계 · 저장소 받기 (3분, 한 번만)

이미 받아 두셨으면 **`git pull` 만** 하시고 3단계로 가십시오.

```cmd
cd %USERPROFILE%
git clone https://github.com/joonseo120924-spec/past-job-recommender.git
cd past-job-recommender
git checkout claude/notion-ai-agent-team-import-69oi8o
```

---

## 3단계 · 마이크 라이브러리 (1분)

```cmd
pip install sounddevice
```
> ❌ `pip` 를 못 찾으면 → `python -m pip install sounddevice`

---

## 4단계 · 점검 — 소리가 나는지

```cmd
python ai-team\scripts\jarvis.py --setup
```

이렇게 나오면 정상입니다.
```
   ┌─────────────────────────────────────────────┐
   │   J A R V I S                               │
   │   AI 앱 개발팀 · 총괄                        │
   └─────────────────────────────────────────────┘

   ● 마이크          마이크 (Realtek(R) Audio)
   ● 음성 출력        Windows SAPI
   ○ 단축키          미설정 — 깨우기만 합니다
   ● 대기 보고문       1건
```
그리고 **"자비스입니다. 소리가 들리시면 준비가 된 것입니다."** 가 들려야 합니다.

| 증상 | 해결 |
|---|---|
| 마이크가 ○ | `python ai-team\scripts\jarvis.py --list` 로 번호 확인 → `--device 1` |
| 소리가 안 남 | 스피커 볼륨 · Windows 설정 > 시간 및 언어 > 음성 |
| 발음이 어색함 | 위 설정에서 **한국어 음성** 추가 |

---

## 5단계 · 박수 감도 맞추기 (2분)

```cmd
python ai-team\scripts\jarvis.py --tune
```
막대가 실시간으로 움직입니다. **조용히 있다가 박수를 다섯 번쯤** 치십시오.

```
   배경 180    현재 8420  ████████████████████████████████████████
   피크 8420 (기준 1500)
```

`Ctrl+C` 로 멈추면 권장값이 나오고, **`y`** 를 누르면 저장됩니다.

| 증상 | 해결 |
|---|---|
| 박수가 안 잡힘 | 마이크에 가까이 · 더 세게 · `--tune` 다시 |
| 아무 소리에나 반응 | `jarvis.config.json` 의 `floor` 를 **올리십시오** (1500 → 3000) |

---

## 6단계 · 기동

```cmd
python ai-team\scripts\jarvis.py
```

**"자비스 기동했습니다. 박수 두 번으로 부르십시오."**

이제 👏👏 치시면 — **"네, 사장님."** 하고 대답합니다. 대기 중인 보고문이 있으면 읽어 드립니다.

---

## 7단계 · 받아쓰기까지 연결 (선택)

여기까지는 "부르면 대답"입니다. **말로 명령**까지 가려면 단축키를 알려주셔야 합니다.

1. Claude Code 에서 `/config` → **voice** 를 켜고 **tap** 모드로
2. 그 단축키를 자비스에게 알려줍니다
```cmd
python ai-team\scripts\jarvis.py --hotkey ctrl+shift+v
```
3. 다시 기동하면 — 👏👏 → "네, 사장님." → **받아쓰기 자동 시작** → 말씀하시면 됩니다

> 인사가 끝나고 0.6초 뒤에 키를 누릅니다. 자기 목소리가 받아쓰기에 섞이지 않게 한 것입니다.

---

## 항상 켜 두기 (선택)

시작 → `shell:startup` → 열린 폴더에 아래 내용을 `자비스.bat` 으로 저장
```bat
@echo off
cd /d "%USERPROFILE%\past-job-recommender"
python ai-team\scripts\jarvis.py
```

---

## 명령 요약
| 명령 | 하는 일 |
|---|---|
| `jarvis.py` | 기동 (박수 대기) |
| `jarvis.py --setup` | 마이크·음성 점검 |
| `jarvis.py --tune` | 박수 감도 보정 |
| `jarvis.py --say "안녕"` | 말하기만 시험 |
| `jarvis.py --list` | 마이크 목록 |
| `jarvis.py --hotkey ctrl+shift+v` | 단축키 저장 |
| `jarvis.py --quiet` | 소리 없이 감지만 |

설정은 `ai-team/scripts/jarvis.config.json` 에 저장됩니다. 인사말도 여기서 바꾸실 수 있습니다.

---

## 🔴 미검증 — 정직하게

이 프로그램은 **오디오 장치가 없는 원격 컨테이너에서 만들었습니다.**

| | |
|---|---|
| ✅ 검증됨 | 박수 감지 로직 **8종 전항 통과** (합성 신호) · 설정 저장/로드 · 보고문 감지 · 문법 |
| ❌ **미검증** | **실제 마이크** · **실제 소리 출력** · **단축키 전송** |

**4단계(--setup) → 5단계(--tune) 순서를 꼭 거치십시오.** 거기서 걸리면 그 자리에서 알려주십시오. 바로 고치겠습니다.
