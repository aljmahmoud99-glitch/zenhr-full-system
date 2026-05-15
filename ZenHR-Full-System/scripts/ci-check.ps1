param(
  [switch]$SkipBrowser,
  [string]$BackendUrl = "http://localhost:3001"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== ZenJO CI check =="
Write-Host "Repository: $root"

pnpm.cmd run typecheck

Push-Location frontend
try {
  node ..\node_modules\@angular\cli\bin\ng.js build --configuration production
}
finally {
  Pop-Location
}

try {
  $health = Invoke-WebRequest -Uri "$BackendUrl/api/healthz" -UseBasicParsing -TimeoutSec 10
  if ($health.StatusCode -ne 200) { throw "Backend health returned $($health.StatusCode)" }
  node qa\phase-9-smoke.cjs
  if (-not $SkipBrowser) {
    node qa\phase-9-browser.cjs
  }
}
catch {
  Write-Warning "Backend smoke skipped or failed: $($_.Exception.Message)"
  Write-Warning "Start the backend and rerun scripts\ci-check.ps1 for full CI parity."
  throw
}

Write-Host "CI check passed."
