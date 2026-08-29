<#
  회의실 보고를 소리 내어 읽습니다 (Windows 로컬 전용)

    .\ai-team\scripts\speak-report.ps1                    STATE.md 요약을 읽음
    .\ai-team\scripts\speak-report.ps1 -Path <파일>        그 파일을 읽음
    .\ai-team\scripts\speak-report.ps1 -Text "..."        준 문장을 읽음
    .\ai-team\scripts\speak-report.ps1 -Rate 1 -Save out.wav

  왜 여기(Windows)에서만 되는가:
    원격 컨테이너에는 TTS 엔진도 오디오 장치도 없고, 있어도 소리가 사용자에게 닿지 않습니다.
    그래서 보고문은 원격이 만들고, **읽는 것은 이 PC 의 Windows SAPI** 가 합니다.

  ⚠️ 미검증: 이 스크립트는 PowerShell 이 없는 컨테이너에서 작성됐습니다.
     Windows 에서 처음 돌릴 때 동작을 확인하십시오. (D-020 에 따라 UTF-8 BOM)
#>
[CmdletBinding()]
param(
  [string]$Path,
  [string]$Text,
  [int]$Rate = 0,          # -10(느리게) ~ 10(빠르게)
  [string]$Save            # 주면 소리 대신 .wav 로 저장
)
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

if (-not $Text) {
  if (-not $Path) { $Path = Join-Path $RepoRoot 'ai-team\STATE.md' }
  if (-not (Test-Path $Path)) { Write-Host "✗ 파일이 없습니다: $Path" -ForegroundColor Red; exit 1 }
  $raw = Get-Content $Path -Raw -Encoding UTF8
  # 마크다운을 읽기 좋은 문장으로 — 표·코드블록·기호는 걷어냅니다
  $lines = @()
  $inCode = $false
  foreach ($l in ($raw -split "`r?`n")) {
    if ($l -match '^\s*```') { $inCode = -not $inCode; continue }
    if ($inCode) { continue }
    if ($l -match '^\s*\|') { continue }                       # 표는 읽지 않습니다
    $t = $l -replace '`', '' -replace '\*\*', '' -replace '^#+\s*', '' -replace '^\s*[-*]\s*', ''
    $t = $t -replace '\[([^\]]+)\]\([^)]+\)', '$1'             # 링크는 글자만
    $t = $t.Trim()
    if ($t -and $t -notmatch '^[>─-]+$') { $lines += $t }
  }
  $Text = ($lines -join '. ')
}
if (-not $Text) { Write-Host "✗ 읽을 내용이 없습니다" -ForegroundColor Red; exit 1 }

Add-Type -AssemblyName System.Speech
$v = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v.Rate = $Rate
# 한국어 음성이 설치돼 있으면 그것으로 (없으면 기본 음성 — 한글 발음이 어색할 수 있습니다)
$ko = $v.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'ko*' } | Select-Object -First 1
if ($ko) { $v.SelectVoice($ko.VoiceInfo.Name) }
else { Write-Host "⚠️ 한국어 음성이 설치돼 있지 않습니다 — 기본 음성으로 읽습니다 (설정 > 시간 및 언어 > 음성)" -ForegroundColor Yellow }

if ($Save) { $v.SetOutputToWaveFile($Save); $v.Speak($Text); $v.SetOutputToDefaultAudioDevice(); Write-Host "✓ 저장: $Save" }
else { Write-Host "🔊 읽는 중... ($($Text.Length)자)"; $v.Speak($Text); Write-Host "✓ 완료" }
$v.Dispose()
