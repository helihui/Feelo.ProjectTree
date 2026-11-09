[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$CliDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Source = Join-Path $CliDir "projecttree.mjs"
$OutputDir = Join-Path $CliDir "dist"
$Output = Join-Path $OutputDir "projecttree.exe"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw "pnpm was not found. Install pnpm before running this script."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

& pnpm dlx "@yao-pkg/pkg@6.24.0" $Source --targets node22-win-x64 --output $Output
if ($LASTEXITCODE -ne 0) {
    throw "EXE build failed with exit code $LASTEXITCODE"
}

$File = Get-Item $Output
$Hash = Get-FileHash $Output -Algorithm SHA256

Write-Host ""
Write-Host "Windows EXE build succeeded"
Write-Host "File: $($File.FullName)"
Write-Host "Size: $([math]::Round($File.Length / 1MB, 2)) MB"
Write-Host "SHA-256: $($Hash.Hash)"
