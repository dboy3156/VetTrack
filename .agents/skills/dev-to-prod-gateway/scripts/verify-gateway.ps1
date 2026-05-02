# Production gateway checks (Windows PowerShell): typecheck + validate:prod.
# Run from repo root: .\.agents\skills\dev-to-prod-gateway\scripts\verify-gateway.ps1

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $root

# Windows: invoke `npx.cmd` so the executable resolves when PowerShell spawns the compiler.
$npx = if ($env:OS -eq "Windows_NT") { "npx.cmd" } else { "npx" }

Write-Host "==> Typecheck (tsc --noEmit)"
& $npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> validate:prod (env, secret scan, build checks - see scripts/validate-prod.ts)"
$pnpm = if ($env:OS -eq "Windows_NT") { "pnpm.cmd" } else { "pnpm" }
& $pnpm validate:prod
exit $LASTEXITCODE
