<#
.SYNOPSIS
    원격 컨테이너의 07:07 사이클 결과를 Windows 로컬로 받아 현재 상태를 보여준다.

.DESCRIPTION
    실행은 원격 컨테이너에서만 이뤄집니다. 이 스크립트는 그 결과를 pull 해서
    ai-team/STATE.md 를 보여줄 뿐, 사이클을 진행하지 않습니다.
    자세한 배경: ai-team/local-windows.md

.EXAMPLE
    .\ai-team\scripts\team-sync.ps1
    .\ai-team\scripts\team-sync.ps1 -Quiet     # 스케줄러용: 화면 출력 없이 로그만
#>
[CmdletBinding()]
param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$Branch  = 'claude/notion-ai-team-import-8tlqr8'
$RepoDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # <repo>/ai-team/scripts → <repo>
$LogFile = Join-Path $RepoDir 'ai-team\.local-sync.log'

function Write-Log([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    if (-not $Quiet) { Write-Host $line }
}

function Say([string]$Text, [string]$Color = 'Gray') {
    if (-not $Quiet) { Write-Host $Text -ForegroundColor $Color }
}

# git 은 정상 동작 중에도 stderr 로 진행 정보를 씁니다. $ErrorActionPreference='Stop' 상태에서
# 네이티브 stderr 는 Windows PowerShell 5.1 에서 NativeCommandError 로 승격돼 스크립트를 죽입니다.
# 그래서 git 호출은 전부 이 함수를 통해서만 하고, 성공 여부는 종료 코드로만 판정합니다.
function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)

    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & git @GitArgs 2>&1 | ForEach-Object { "$_" }
        $code   = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    [pscustomobject]@{ ExitCode = $code; Output = $output }
}

# Invoke-Git 은 stderr 를 출력에 합칩니다. HEAD SHA 처럼 값 자체가 필요한 곳에서는
# git 이 경고를 한 줄이라도 내면 SHA 대신 경고문을 집게 되므로, SHA 형식만 통과시킵니다.
function Get-Sha {
    $r = Invoke-Git rev-parse HEAD
    if ($r.ExitCode -ne 0) { return $null }
    return ($r.Output | Where-Object { $_ -match '^[0-9a-f]{7,40}$' } | Select-Object -First 1)
}

Set-Location $RepoDir

# ── 1. pull ────────────────────────────────────────────────────────────────
$before = Get-Sha

Say ''
Say "  가져오는 중 — $Branch" 'DarkGray'

# 4회 시도, 사이 대기 3번 (마지막 실패 후에는 기다리지 않는다)
$waits   = @(2, 4, 8)
$fetchOk = $false
for ($i = 0; $i -le $waits.Count; $i++) {
    if ((Invoke-Git fetch origin $Branch).ExitCode -eq 0) { $fetchOk = $true; break }
    if ($i -lt $waits.Count) {
        Say ("  네트워크 실패, {0}초 후 재시도" -f $waits[$i]) 'DarkYellow'
        Start-Sleep -Seconds $waits[$i]
    }
}

if (-not $fetchOk) {
    Write-Log '실패: git fetch 안 됨 (네트워크). 마지막으로 받은 상태를 표시합니다.'
} else {
    $co = Invoke-Git checkout $Branch
    if ($co.ExitCode -ne 0) {
        Write-Log ("경고: '{0}' 브랜치로 전환하지 못했습니다 — {1}" -f $Branch, ($co.Output -join ' '))
    }
    if ((Invoke-Git merge --ff-only "origin/$Branch").ExitCode -ne 0) {
        Write-Log '경고: fast-forward 불가 — 로컬에 별도 커밋이 있습니다. 수동 확인 필요 (local-windows.md 「충돌하면」 참고)'
    }
}

$after = Get-Sha

# ── 2. 현재 상태 한 장 ─────────────────────────────────────────────────────
$statePath = Join-Path $RepoDir 'ai-team\STATE.md'
if (Test-Path $statePath) {
    if (-not $Quiet) {
        Say ''
        Get-Content $statePath -Encoding UTF8 | Where-Object { $_ -notmatch '^>' } | Write-Host
    }
} else {
    Write-Log '경고: ai-team/STATE.md 없음 — 브랜치가 맞는지 확인하십시오.'
}

# ── 3. 어젯밤 사이클이 남긴 것 ─────────────────────────────────────────────
if ($before -and $after -and ($before -ne $after)) {
    Say ''
    Say '  새로 받은 커밋' 'Cyan'
    $logRes = Invoke-Git log --oneline "$before..$after"
    if ($logRes.ExitCode -eq 0) { $logRes.Output | ForEach-Object { Say "    $_" } }
    $cntRes = Invoke-Git rev-list --count "$before..$after"
    $count  = if ($cntRes.ExitCode -eq 0) {
        $cntRes.Output | Where-Object { $_ -match '^[0-9]+$' } | Select-Object -First 1
    } else { $null }
    if ($null -ne $count) { Write-Log ("새 커밋 {0}건 수신" -f $count) }
    else { Write-Log '새 커밋 있음 — 건수 확인 실패' }
} elseif ($null -eq $before -or $null -eq $after) {
    # Get-Sha 가 실패한 경우. "변경 없음" 과 구별해서 적는다 — 확인 못 한 것을 정상으로 쓰지 않는다
    Say ''
    Say '  ⚠️ HEAD 를 확인하지 못해 새 커밋 여부를 알 수 없습니다.' 'Yellow'
    Write-Log '확인 불가: git rev-parse HEAD 실패 — 새 커밋 여부 미확인'
} else {
    Say ''
    Say '  새 커밋 없음 — 마지막 사이클 이후 변경 없습니다.' 'DarkGray'
    Write-Log '새 커밋 없음'
}

# ── 4. 노션 미동기화 ───────────────────────────────────────────────────────
$queueDir = Join-Path $RepoDir 'ai-team\notion-queue'
if (Test-Path $queueDir) {
    $pending = @(Get-ChildItem $queueDir -Filter '*.md' | Where-Object {
        (Get-Content $_.FullName -TotalCount 1 -Encoding UTF8) -match '^\s*상태:\s*대기'
    })
    if ($pending.Count -gt 0) {
        Say ''
        Say ("  노션 미동기화 {0}건: {1}" -f $pending.Count, ($pending.Name -join ', ')) 'Yellow'
        Write-Log ("노션 미동기화 {0}건" -f $pending.Count)
    }
}

Say ''
Say '  실행은 원격 컨테이너 07:07 에서만 이뤄집니다. 이 기기는 열람용입니다.' 'DarkGray'
Say ''
