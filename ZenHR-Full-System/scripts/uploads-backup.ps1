param(
  [string]$UploadsDir = "uploads",
  [string]$OutputDir = "backups",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$source = Resolve-Path (Join-Path $root $UploadsDir)
$targetDir = Join-Path $root $OutputDir
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = Join-Path $targetDir "zenjo-uploads-$timestamp.zip"

if ($DryRun) {
  Write-Host "DRY RUN: Compress-Archive `"$source`" -> `"$archive`""
  exit 0
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Compress-Archive -Path (Join-Path $source "*") -DestinationPath $archive -Force
Write-Host "Uploads backup written to $archive"
