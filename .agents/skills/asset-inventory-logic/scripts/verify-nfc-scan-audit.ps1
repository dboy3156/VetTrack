# Audits recent NFC / scan log rows in PostgreSQL (Windows PowerShell).
# Requires: psql on PATH, DATABASE_URL in environment or .env loaded externally.
# Run from repo root: .\.agents\skills\asset-inventory-logic\scripts\verify-nfc-scan-audit.ps1
# Optional args: -ClinicId "your-clinic-id" -Limit 50

param(
  [string]$ClinicId = "",
  [int]$Limit = 30
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $root

if (-not $env:DATABASE_URL) {
  Write-Host "ERROR: DATABASE_URL is not set. Example (PowerShell):"
  Write-Host '  $env:DATABASE_URL="postgres://vettrack:vettrack@localhost:5432/vettrack"'
  exit 1
}

# Single-line SQL: multiline -c breaks `psql` arg parsing on Windows.
$where = if ($ClinicId) { " WHERE clinic_id = '$ClinicId' " } else { "" }
$sql = "SELECT id, clinic_id, equipment_id, status, timestamp FROM vt_scan_logs$where ORDER BY timestamp DESC LIMIT $Limit;"

Write-Host "==> vt_scan_logs (last $Limit rows$( if ($ClinicId) { ", clinic=$ClinicId" }))"
# Argument array avoids PowerShell/word-splitting mangling URI vs -c on Windows.
& psql @('-d', $env:DATABASE_URL, '-c', $sql)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Orphaned billable dispenses: adjustment logs that should have billing_event_id but do not (revenue leakage).
$orphanSql = @"
SELECT il.id, il.clinic_id, il.created_at
FROM vt_inventory_logs il
INNER JOIN vt_containers c ON c.id = il.container_id AND c.clinic_id = il.clinic_id
INNER JOIN vt_items i ON i.id = (il.metadata->>'itemId') AND i.clinic_id = il.clinic_id
WHERE il.log_type = 'adjustment'
  AND il.quantity_added < 0
  AND i.is_billable = true
  AND ABS(il.quantity_added) >= COALESCE(i.minimum_dispense_to_capture, 1)
  AND c.billing_item_id IS NOT NULL
  AND il.billing_event_id IS NULL
  AND (il.metadata->>'billingExemptReason') IS NULL
LIMIT 10;
"@
Write-Host "==> Orphaned dispenses (billable NFC/container pulls missing billing_event_id)"
& psql @('-d', $env:DATABASE_URL, '-c', $orphanSql)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$orphanCountSql = @"
SELECT COUNT(*)::int AS orphan_count
FROM vt_inventory_logs il
INNER JOIN vt_containers c ON c.id = il.container_id AND c.clinic_id = il.clinic_id
INNER JOIN vt_items i ON i.id = (il.metadata->>'itemId') AND i.clinic_id = il.clinic_id
WHERE il.log_type = 'adjustment'
  AND il.quantity_added < 0
  AND i.is_billable = true
  AND ABS(il.quantity_added) >= COALESCE(i.minimum_dispense_to_capture, 1)
  AND c.billing_item_id IS NOT NULL
  AND il.billing_event_id IS NULL
  AND (il.metadata->>'billingExemptReason') IS NULL;
"@
$countRaw = & psql @('-d', $env:DATABASE_URL, '-t', '-A', '-c', $orphanCountSql)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$n = 0
if ($countRaw -match '^\s*(\d+)\s*$') { $n = [int]$Matches[1] }
if ($n -gt 0) {
    Write-Host ('CRITICAL: ' + $n + ' orphaned billable dispense row(s) - revenue invariant violated.') -ForegroundColor Red
    exit 2
}
Write-Host '[V] No orphaned billable dispenses (billing linkage OK).' -ForegroundColor Green
exit 0
