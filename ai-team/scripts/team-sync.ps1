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

Set-Location $RepoDir

# ── 1. pull ────────────────────────────────────────────────────────────────
$before = (git rev-parse HEAD 2>$null)

Say ''
Say "  가져오는 중 — $Branch" 'DarkGray'

$fetchOk = $false
foreach ($wait in 2, 4, 8, 16) {
    git fetch origin $Branch 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $fetchOk = $true; break }
    Say "  네트워크 실패, ${wait}초 후 재시도" 'DarkYellow'
    Start-Sleep -Seconds $wait
}

if (-not $fetchOk) {
    Write-Log '실패: git fetch 안 됨 (네트워크). 마지막으로 받은 상태를 표시합니다.'
} else {
    git checkout $Branch 2>&1 | Out-Null
    git merge --ff-only "origin/$Branch" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Log '경고: fast-forward 불가 — 로컬에 별도 커밋이 있습니다. 수동 확인 필요 (local-windows.md 「충돌하면」 참고)'
    }
}

$after = (git rev-parse HEAD 2>$null)

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
    git log --oneline "$before..$after" | ForEach-Object { Say "    $_" }
    Write-Log ("새 커밋 {0}건 수신" -f (git rev-list --count "$before..$after"))
} else {
    Say ''
    Say '  새 커밋 없음 — 마지막 사이클 이후 변경 없습니다.' 'DarkGray'
    Write-Log '새 커밋 없음'
}

# ── 4. 노션 미동기화 ───────────────────────────────────────────────────────
$queueDir = Join-Path $RepoDir 'ai-team\notion-queue'
if (Test-Path $queueDir) {
    $pending = @(Get-ChildItem $queueDir -Filter '*.md' | Where-Object {
        (Get-Content $_.FullName -TotalCount 1 -Encoding UTF8) -match '대기'
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
