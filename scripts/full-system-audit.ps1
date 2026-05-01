# VetTrack Full System Audit Tool
# Logic based on Clinical Enterprise Integrity Standards

$ErrorActionPreference = "Stop"
$Global:HasCriticalErrors = $false
$Global:AuditHadStepFailure = $false

$IsCi = ($env:CI -eq "true") -or ($env:GITHUB_ACTIONS -eq "true") -or ($env:CONTINUOUS_INTEGRATION -eq "true") -or ($env:TF_BUILD -eq "True")
if ($IsCi -and -not $env:DATABASE_URL) {
    Write-Host "[!!!] CI requires DATABASE_URL - NFC SQL audit and revenue checks are mandatory (exit 2)." -ForegroundColor Red
    exit 2
}

function Run-AuditStep {
    param (
        [string]$Name,
        [string]$Path,
        [string]$Severity = "P1"
    )
    Write-Host "`n[>>>] Running Audit: $Name..." -ForegroundColor Cyan
    if (Test-Path $Path) {
        & $Path
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[!] ${Name} found issues (Exit Code: $LASTEXITCODE)" -ForegroundColor Yellow
            $Global:AuditHadStepFailure = $true
            if ($LASTEXITCODE -eq 2) {
                Write-Host "[!!!] CRITICAL SECURITY/LOGIC VIOLATION DETECTED" -ForegroundColor Red
                $Global:HasCriticalErrors = $true
            }
        } else {
            Write-Host "[V] $Name passed." -ForegroundColor Green
        }
    } else {
        Write-Host "[?] Skip: $Path not found." -ForegroundColor Gray
    }
}

Write-Host "=========================================" -ForegroundColor White
Write-Host "   VETTRACK OS - FULL PROJECT AUDIT     " -ForegroundColor White
Write-Host "=========================================" -ForegroundColor White

# 1. Security & Multi-tenancy
Run-AuditStep "Security (ClinicId Isolation)" ".agents/skills/enterprise-security-multi-tenancy/scripts/audit-clinicid-queries.ps1"

# 2. Project Structure & Worktree
Run-AuditStep "Architecture (Folder Depth)" ".agents/skills/code-project-architect/scripts/validate-folder-depth.ps1"

# 3. Integration Integrity
Run-AuditStep "Integrations (Type Mapping)" ".agents/skills/external-pms-integrations/scripts/validate-integration-mappings.ps1"

# 4. Code Hygiene
Run-AuditStep "Cleaner (Dead Code and Logs)" ".agents/skills/superagent-cleaner/scripts/run-cleaner.ps1"

# 5. Asset & NFC Logic (skip when no DB — strict CI should set DATABASE_URL)
if (-not $env:DATABASE_URL) {
    Write-Host "`n[>>>] Running Audit: Asset Logic (NFC Audit)..." -ForegroundColor Cyan
    Write-Host "[~] Skipped: Local Environment (DATABASE_URL not set). NFC SQL audit requires Postgres." -ForegroundColor Yellow
} else {
    Run-AuditStep "Asset Logic (NFC Audit)" ".agents/skills/asset-inventory-logic/scripts/verify-nfc-scan-audit.ps1"
}

# 6. Build & Production Readiness
Run-AuditStep "Gateway (Pre-Prod Check)" ".agents/skills/dev-to-prod-gateway/scripts/verify-gateway.ps1"

Write-Host "`n=========================================" -ForegroundColor White
if ($Global:HasCriticalErrors) {
    Write-Host "AUDIT FAILED: Critical risks identified. Fix P0/P1 issues before pushing." -ForegroundColor Red
    exit 2
} elseif ($Global:AuditHadStepFailure) {
    Write-Host "AUDIT FAILED: One or more steps did not pass. Review messages above." -ForegroundColor Red
    exit 1
} else {
    Write-Host "AUDIT COMPLETE: Project meets Clinical Enterprise standards." -ForegroundColor Green
    exit 0
}
