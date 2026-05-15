param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$OutputDir = "backups",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
if (-not $DatabaseUrl) { throw "DATABASE_URL is required. Pass -DatabaseUrl or set env:DATABASE_URL." }
$root = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $root $OutputDir
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $targetDir "zenjo-db-$timestamp.dump"

if ($DryRun) {
  Write-Host "DRY RUN: pg_dump --format=custom --file `"$file`" [DATABASE_URL hidden]"
  exit 0
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$env:PGCONNECT_TIMEOUT = "15"
pg_dump --format=custom --file "$file" "$DatabaseUrl"
Write-Host "Database backup written to $file"
