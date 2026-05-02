# Dependency and clutter hints (Windows PowerShell). Non-destructive.
# Requires: depcheck in devDependencies (pnpm add -D depcheck).
# Run from repo root: .\.agents\skills\superagent-cleaner\scripts\run-cleaner.ps1

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $root

Write-Host "==> depcheck (pnpm exec - pinned devDependency)"
pnpm exec depcheck . '--ignores=@clerk/clerk-react,@clerk/clerk-sdk-node,@clerk/express,@clerk/testing,drizzle-kit'
Write-Host "(depcheck exit code $($LASTEXITCODE) - review false positives)"

Write-Host ""
Write-Host "==> TODO / FIXME counts (src + server)"
$pat = "TODO|FIXME|HACK"
(Get-ChildItem -Path "src","server" -Include "*.ts","*.tsx" -Recurse -File | Select-String -Pattern $pat).Count | ForEach-Object { Write-Host "  matches: $_" }

Write-Host ""
Write-Host "==> console.* occurrences (quick smell test)"
(Get-ChildItem -Path "src","server" -Include "*.ts","*.tsx" -Recurse -File | Select-String -Pattern '\bconsole\.(log|debug|info)\(').Count | ForEach-Object { Write-Host "  console.log/info/debug lines approx $_" }

exit 0
