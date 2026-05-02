# Security sweep: Drizzle db.(select|insert|update|delete) must appear in a tenant-aware handler window.
# Scope-aware heuristic (not line-count-only): for each db.* call, scan a combined window of lines BEFORE and AFTER
# the call so .values({ clinicId }) above an insert and .where(eq(.clinicId, clinicId)) below selects both count.
# Exit 2 = circuit breaker for hooks/CI when findings exist.
# Run from repo root: .\.agents\skills\enterprise-security-multi-tenancy\scripts\audit-clinicid-queries.ps1

param(
    [int]$LinesBefore = 90,
    [int]$LinesAfter = 18
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $root

$routeFiles = Get-ChildItem -Path "server\routes" -Filter "*.ts" -Recurse -File
# Include optional whitespace/newlines so Drizzle chains like `await db` + newline + `.update(...)` count.
$queryPattern = 'db\s*\.\s*(select|insert|update|delete)'
$findings = @()

foreach ($f in $routeFiles) {
    $lines = Get-Content -LiteralPath $f.FullName
    $matches = Select-String -LiteralPath $f.FullName -Pattern $queryPattern
    foreach ($m in $matches) {
        # LineNumber is 1-based; convert to 0-based index of the hit line
        $hitIdx = $m.LineNumber - 1
        $start = [Math]::Max(0, $hitIdx - $LinesBefore)
        $end = [Math]::Min($lines.Length - 1, $hitIdx + $LinesAfter)
        $windowText = ($lines[$start..$end] -join "`n")

        if ($windowText -notmatch 'clinicId') {
            $findings += $m
        }
    }
}

if ($findings.Count -gt 0) {
    Write-Host "CRITICAL: DB calls with no clinicId / tenant filter in handler window (${LinesBefore} lines before + hit + ${LinesAfter} after)." -ForegroundColor Red
    $findings | ForEach-Object { Write-Host "$($_.Filename):$($_.LineNumber) -> $($_.Line.Trim())" }
    exit 2
}

Write-Host "Security audit passed: tenant tokens present in expanded handler windows (spot-check cross-file patterns)." -ForegroundColor Green

# Mutation routes that directly write via db.insert/update/delete should emit logAudit (same-handler heuristic).
# Default: warn only. Set AUDIT_STRICT_LOGAUDIT=1 to fail (exit 2) when gaps exist.
$auditGaps = @()
foreach ($f in $routeFiles) {
    $lines = @(Get-Content -LiteralPath $f.FullName)
    for ($i = 0; $i -lt $lines.Length; $i++) {
        # Anchor: avoid matching commented-out lines such as `// router.post(...)`.
        if ($lines[$i] -match '^\s*router\.(post|put|patch|delete)\s*\(') {
            $start = $i
            # Stop at the next route declaration so one handler is not blamed for another's DB calls.
            $nextRouterLine = $lines.Length - 1
            for ($j = $i + 1; $j -lt $lines.Length; $j++) {
                if ($lines[$j] -match '^\s*router\.(get|post|put|patch|delete)\s*\(') {
                    $nextRouterLine = $j - 1
                    break
                }
            }
            # Scan the whole handler up to the next route (not capped at $MutationWindow), so long handlers
            # still pair mutations with logAudit below. Safety fuse avoids runaway scans.
            $maxSpan = 1200
            $end = [Math]::Min($lines.Length - 1, [Math]::Min($nextRouterLine, $i + $maxSpan))
            $chunk = ($lines[$start..$end] -join "`n")
            # Match db/tx mutations split across lines (common Drizzle style).
            if ($chunk -match '(db|tx)\s*\.\s*(insert|update|delete)' -and $chunk -notmatch 'logAudit\s*\(') {
                $auditGaps += "$($f.Name):$($i + 1) (mutation handler window) DB mutation without logAudit"
            }
        }
    }
}

if ($auditGaps.Count -gt 0) {
    Write-Host "WARN: Routes with db insert/update/delete but no logAudit in per-route handler window ($($auditGaps.Count) route(s)):" -ForegroundColor Yellow
    $auditGaps | ForEach-Object { Write-Host "      $_" }
    if ($env:AUDIT_STRICT_LOGAUDIT -eq "1") {
        Write-Host "AUDIT_STRICT_LOGAUDIT=1 - failing audit." -ForegroundColor Red
        exit 2
    }
} else {
    Write-Host "Audit trail heuristic: no db-write mutation routes missing logAudit in per-route handler window." -ForegroundColor Green
}
exit 0
