param(
  [string]$ExportsDir = "exports",
  [int]$RetentionDays = 14,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root $ExportsDir
if (-not (Test-Path $target)) {
  Write-Host "Exports directory does not exist: $target"
  exit 0
}

$cutoff = (Get-Date).AddDays(-1 * $RetentionDays)
$files = Get-ChildItem -Path $target -File -Recurse | Where-Object { $_.LastWriteTime -lt $cutoff }
if (-not $Apply) {
  $files | Select-Object FullName, Length, LastWriteTime
  Write-Host "DRY RUN: $($files.Count) files older than $RetentionDays days. Add -Apply to delete."
  exit 0
}

foreach ($file in $files) {
  Remove-Item -LiteralPath $file.FullName -Force
}
Write-Host "Deleted $($files.Count) export files older than $RetentionDays days."
