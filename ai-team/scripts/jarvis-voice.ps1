<#
  자비스 음성 응답 — 새 보고문을 받아 소리 내어 읽습니다 (Windows 로컬 상주)

    .\ai-team\scripts\jarvis-voice.ps1              20초마다 pull → 새 보고문 낭독
    .\ai-team\scripts\jarvis-voice.ps1 -Once        한 번만
    .\ai-team\scripts\jarvis-voice.ps1 -IntervalSec 10 -Rate 1

  왜 이런 구조인가
    자비스는 클라우드 컨테이너에 있어 **소리를 낼 수 없습니다** (TTS·오디오 장치 부재, 실측).
    그래서 자비스는 보고문을 ai-team\voice-out\ 에 **파일로** 쓰고 푸시하고,
    읽는 것은 이 PC 의 Windows SAPI 가 합니다. 지연은 폴링 주기만큼입니다.

  ⚠️ 미검증 — PowerShell 이 없는 컨테이너에서 작성됐습니다. 처음 실행 시 확인하십시오.
  (D-020 에 따라 UTF-8 BOM)
#>
[CmdletBinding()]
param(
  [int]$IntervalSec = 20,
  [int]$Rate = 0,
  [switch]$Once,
  [switch]$NoPull        # git pull 없이 로컬 폴더만 감시
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$OutDir   = Join-Path $RepoRoot 'ai-team\voice-out'
$Spoken   = Join-Path $OutDir '.spoken'          # 이미 읽은 파일 목록 (git 추적 안 함)

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
if (-not (Test-Path $Spoken)) { New-Item -ItemType File -Path $Spoken -Force | Out-Null }

Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.Rate = $Rate
$ko = $voice.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'ko*' } | Select-Object -First 1
if ($ko) { $voice.SelectVoice($ko.VoiceInfo.Name); Write-Host "🔊 음성: $($ko.VoiceInfo.Name)" }
else { Write-Host "⚠️ 한국어 음성 미설치 — 기본 음성으로 읽습니다 (설정 > 시간 및 언어 > 음성)" -ForegroundColor Yellow }

function Get-Spoken { @(Get-Content $Spoken -Encoding UTF8 -ErrorAction SilentlyContinue) }

function Speak-New {
  $done = Get-Spoken
  $files = @(Get-ChildItem -Path $OutDir -Filter '*.txt' -File -ErrorAction SilentlyContinue |
             Sort-Object Name)
  $n = 0
  foreach ($f in $files) {
    if ($done -contains $f.Name) { continue }
    $text = (Get-Content $f.FullName -Raw -Encoding UTF8).Trim()
    if (-not $text) { Add-Content $Spoken $f.Name -Encoding UTF8; continue }
    Write-Host "`n🎩 자비스 보고 — $($f.Name)" -ForegroundColor Cyan
    Write-Host $text
    $voice.Speak($text)
    Add-Content $Spoken $f.Name -Encoding UTF8      # 읽은 뒤에 기록 — 중간에 끊기면 다시 읽습니다
    $n++
  }
  return $n
}

function Pull-Latest {
  if ($NoPull) { return }
  Push-Location $RepoRoot
  try {
    $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
    git fetch origin $branch --quiet 2>$null
    git merge --ff-only "origin/$branch" --quiet 2>$null | Out-Null
  } catch { Write-Host "⚠️ pull 실패 — 로컬 폴더만 봅니다: $($_.Exception.Message)" -ForegroundColor Yellow }
  finally { Pop-Location }
}

Write-Host "👂 자비스 음성 대기 — $OutDir  (${IntervalSec}초마다 확인, Ctrl+C 로 종료)"
do {
  Pull-Latest
  $spokenCount = Speak-New
  if (-not $Once) { Start-Sleep -Seconds $IntervalSec }
} while (-not $Once)
$voice.Dispose()
