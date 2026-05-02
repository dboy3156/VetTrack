# Clinical enterprise integrity — quick stack smoke (Windows PowerShell)
# Run from repository root: .\.agents\skills\clinical-enterprise-integrity\scripts\verify-stack.ps1

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $root

Write-Host "==> Typecheck (tsc --noEmit)"
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Unit tests (pnpm test)"
pnpm test
exit $LASTEXITCODE
