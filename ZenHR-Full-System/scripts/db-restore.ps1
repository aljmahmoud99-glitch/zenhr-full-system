param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
if (-not $DatabaseUrl) { throw "DATABASE_URL is required. Pass -DatabaseUrl or set env:DATABASE_URL." }
if (-not (Test-Path $BackupFile)) { throw "Backup file not found: $BackupFile" }

if (-not $Apply) {
  Write-Host "DRY RUN: pg_restore --clean --if-exists --no-owner --dbname [DATABASE_URL hidden] `"$BackupFile`""
  Write-Host "Add -Apply to execute. Restore is intentionally opt-in."
  exit 0
}

pg_restore --clean --if-exists --no-owner --dbname "$DatabaseUrl" "$BackupFile"
Write-Host "Database restore completed from $BackupFile"
