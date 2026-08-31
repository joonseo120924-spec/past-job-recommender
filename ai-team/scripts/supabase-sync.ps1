<#
  AI 앱 개발팀 · 슈퍼베이스 동기화 (Windows 로컬용)
  이 PC 에는 Python 이 없으므로 supabase-sync.py 와 같은 일을 PowerShell 로 합니다.

    .\ai-team\scripts\supabase-sync.ps1 status
    .\ai-team\scripts\supabase-sync.ps1 push
    .\ai-team\scripts\supabase-sync.ps1 pull            # 차이만 보고, 파일은 그대로
    .\ai-team\scripts\supabase-sync.ps1 pull -Force     # 로컬을 원격 내용으로 덮어씀
    .\ai-team\scripts\supabase-sync.ps1 event -Kind 결정 -Title "D-023 ..." -Ref D-023

  설정: 환경변수 SUPABASE_URL / SUPABASE_KEY, 없으면 ai-team\supabase\.env (git 추적 안 함)
  이 파일은 D-020 에 따라 UTF-8 BOM 입니다 (PowerShell 5.1 한글 깨짐 방지).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true, Position=0)]
  [ValidateSet('status','push','pull','event')]
  [string]$Command,
  [switch]$Force,
  [ValidateSet('호출','승인','반려','결정','막힘','기록','동기화','감사')]
  [string]$Kind,
  [string]$Title,
  [string]$Body,
  [string]$Actor,
  [string]$Ref,
  [string]$Stage,
  [int]$Cycle,
  [int]$Day,
  [string]$Source = 'windows-local'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoRoot  = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$StateDir  = Join-Path $RepoRoot 'ai-team'
$EnvFile   = Join-Path $StateDir 'supabase\.env'
$Files     = @('STATE.md','cycle.md','board.md','approvals.md','decisions.md','questions.md','SESSION-LOG.md','README.md')

function Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

function Get-Config {
  $url = $env:SUPABASE_URL; $key = $env:SUPABASE_KEY
  if ((-not $url -or -not $key) -and (Test-Path $EnvFile)) {
    foreach ($line in Get-Content $EnvFile -Encoding UTF8) {
      $t = $line.Trim()
      if (-not $t -or $t.StartsWith('#') -or ($t -notmatch '=')) { continue }
      $k, $v = $t.Split('=', 2)
      $v = $v.Trim().Trim('"').Trim("'")
      if ($k.Trim() -eq 'SUPABASE_URL' -and -not $url) { $url = $v }
      elseif ($k.Trim() -eq 'SUPABASE_KEY' -and -not $key) { $key = $v }
    }
  }
  if (-not $url -or -not $key) {
    Fail "SUPABASE_URL / SUPABASE_KEY 를 찾지 못했습니다. ai-team\supabase\.env 를 만드십시오 (.env.example 참고)."
  }
  return @{ Url = $url.TrimEnd('/'); Key = $key }
}

function Invoke-Sb {
  param([string]$Method, [string]$Path, $Payload, [string]$Prefer)
  $cfg = $script:Cfg
  $headers = @{ apikey = $cfg.Key; Authorization = "Bearer $($cfg.Key)" }
  if ($Prefer) { $headers['Prefer'] = $Prefer }
  $args = @{ Uri = "$($cfg.Url)$Path"; Method = $Method; Headers = $headers; TimeoutSec = 30 }
  if ($null -ne $Payload) {
    $json = $Payload | ConvertTo-Json -Depth 6 -Compress
    $args['Body'] = [Text.Encoding]::UTF8.GetBytes($json)
    $args['ContentType'] = 'application/json; charset=utf-8'
  }
  try { return Invoke-RestMethod @args }
  catch {
    $detail = $_.ErrorDetails.Message
    if ($detail -and ($detail -match 'PGRST205' -or $detail -match 'schema cache')) {
      Fail "테이블이 아직 없습니다. ai-team\supabase\schema.sql 을 Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하십시오."
    }
    Fail "요청 실패 [$Method $Path] $($_.Exception.Message) $detail"
  }
}

function Get-Sha256([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)) | ForEach-Object { $_.ToString('x2') }) }
  finally { $sha.Dispose() }
}

function Get-LocalFiles {
  $map = @{}
  foreach ($n in $Files) {
    $p = Join-Path $StateDir $n
    if (Test-Path $p) { $map[$n] = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) }
  }
  return $map
}

function Get-Branch {
  $head = Join-Path $RepoRoot '.git\HEAD'
  if (-not (Test-Path $head)) { return $null }
  $ref = (Get-Content $head -Raw).Trim()
  if ($ref -match 'refs/heads/(.+)$') { return $Matches[1] }
  return $ref
}

$script:Cfg = Get-Config

switch ($Command) {
  'status' {
    $local  = Get-LocalFiles
    $remote = @{}
    foreach ($r in (Invoke-Sb GET '/rest/v1/team_state?select=key,sha256,updated_at,source,branch')) { $remote[$r.key] = $r }
    Write-Host "브랜치: $(Get-Branch)"
    '{0,-16} {1,-10} {2}' -f '파일','상태','원격 갱신' | Write-Host
    Write-Host ('-' * 62)
    $same = 0
    foreach ($n in $Files) {
      $l = $local[$n]; $r = $remote[$n]
      if (-not $l -and -not $r) { continue }
      if (-not $l)                       { $mark = '원격만';  $when = $r.updated_at }
      elseif (-not $r)                   { $mark = '미전송';  $when = '-' }
      elseif ((Get-Sha256 $l) -eq $r.sha256) { $mark = '일치'; $when = $r.updated_at; $same++ }
      else                               { $mark = '**다름**'; $when = $r.updated_at }
      '{0,-16} {1,-10} {2}' -f $n, $mark, $when | Write-Host
    }
    Write-Host ('-' * 62)
    Write-Host "일치 $same / $($Files.Count)"

    $blockers = Invoke-Sb GET '/rest/v1/team_blockers?select=id,title,needs_user&resolved_at=is.null&order=id'
    Write-Host "`n🔴 열린 차단 $($blockers.Count)건"
    foreach ($b in $blockers) { Write-Host "  $($b.id) $($b.title)" }

    $events = Invoke-Sb GET '/rest/v1/team_events?select=at,kind,actor,title&order=at.desc&limit=5'
    Write-Host "`n최근 이벤트 $($events.Count)건"
    foreach ($e in $events) { Write-Host "  $($e.at.Substring(0,19)) [$($e.kind)] $($e.actor) $($e.title)" }
  }

  'push' {
    $local = Get-LocalFiles
    if ($local.Count -eq 0) { Fail '보낼 상태 파일이 없습니다.' }
    $now = (Get-Date).ToUniversalTime().ToString('o')
    $branch = Get-Branch
    $rows = foreach ($n in $local.Keys) {
      [pscustomobject]@{
        key = $n; content = $local[$n]; sha256 = Get-Sha256 $local[$n]
        bytes = [Text.Encoding]::UTF8.GetByteCount($local[$n])
        branch = $branch; source = $Source; updated_at = $now
      }
    }
    Invoke-Sb POST '/rest/v1/team_state' @($rows) 'resolution=merge-duplicates,return=minimal' | Out-Null
    Write-Host "✓ $($rows.Count)개 파일 업로드 (source=$Source, branch=$branch)"
    $ev = [pscustomobject]@{ kind='동기화'; title="상태 파일 $($rows.Count)개 push"; body=(($local.Keys | Sort-Object) -join ', '); actor='supabase-sync'; ref=$branch; source=$Source }
    Invoke-Sb POST '/rest/v1/team_events' @($ev) 'return=minimal' | Out-Null
    Write-Host '✓ team_events 에 동기화 기록 남김'
  }

  'pull' {
    $local = Get-LocalFiles
    $rows  = Invoke-Sb GET '/rest/v1/team_state?select=key,content,sha256,updated_at,source'
    $changed = @($rows | Where-Object { $Files -contains $_.key -and $local[$_.key] -ne $_.content })
    if ($changed.Count -eq 0) { Write-Host '✓ 원격과 로컬이 같습니다. 받을 것이 없습니다.'; break }
    Write-Host "원격이 다른 파일 $($changed.Count)개:"
    foreach ($r in $changed) { Write-Host "  $($r.key)  원격 갱신 $($r.updated_at.Substring(0,19)) ($($r.source))" }
    if (-not $Force) {
      Write-Host "`n파일은 건드리지 않았습니다. 덮어쓰려면 -Force 를 주십시오."
      Write-Host '정본은 저장소입니다 — 덮어쓰기 전에 무엇이 최신인지 확인하십시오.'
      break
    }
    $utf8NoBom = New-Object Text.UTF8Encoding($false)
    foreach ($r in $changed) { [IO.File]::WriteAllText((Join-Path $StateDir $r.key), $r.content, $utf8NoBom) }
    Write-Host "`n✓ $($changed.Count)개 파일을 원격 내용으로 덮어썼습니다."
  }

  'event' {
    if (-not $Kind -or -not $Title) { Fail 'event 는 -Kind 와 -Title 이 필요합니다.' }
    $row = @{ kind=$Kind; title=$Title; source=$Source }
    if ($Body)  { $row['body']  = $Body }
    if ($Actor) { $row['actor'] = $Actor }
    if ($Ref)   { $row['ref']   = $Ref }
    if ($Stage) { $row['stage'] = $Stage }
    if ($PSBoundParameters.ContainsKey('Cycle')) { $row['cycle'] = $Cycle }
    if ($PSBoundParameters.ContainsKey('Day'))   { $row['day']   = $Day }
    Invoke-Sb POST '/rest/v1/team_events' @([pscustomobject]$row) 'return=minimal' | Out-Null
    Write-Host "✓ 이벤트 기록: [$Kind] $Title"
  }
}
