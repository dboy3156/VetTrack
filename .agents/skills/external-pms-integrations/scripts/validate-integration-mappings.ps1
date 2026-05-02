# Validates integration layer compile + basic mapping hygiene (Windows PowerShell).
# Run from repo root: .\.agents\skills\external-pms-integrations\scripts\validate-integration-mappings.ps1

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $root

Write-Host "==> Typecheck (server + shared subset)"
npx tsc --noEmit -p tsconfig.server-check.json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Scan: adapters must not import client aliases (@/)"
$hits = @()
Get-ChildItem -Path "server\integrations" -Filter "*.ts" -Recurse -File | ForEach-Object {
  Select-String -LiteralPath $_.FullName -Pattern 'from\s+[''`"]@/' | ForEach-Object { $hits += $_ }
}
if ($hits.Count -gt 0) {
  Write-Host "FAIL: client-path imports in integrations:"
  $hits | ForEach-Object { Write-Host "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
  exit 1
}

Write-Host "PASS: integration mapping sanity checks"
Write-Host "Manual: review Zod boundaries - rg safeParse server\integrations"

exit 0
