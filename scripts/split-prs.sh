#!/usr/bin/env bash
# Non-interactive split of stash@{0} into four stacked branches (merge order: 1 → 2 → 3 → 4).
# Branch 1 holds shared schema + Express/React wiring + outbox/DLQ stack; later branches add slices.
#
# IMPORTANT: With `git stash push -u`, brand-new (untracked) files live under stash@{0}^3, not stash@{0}.
# This script restores untracked paths from STASH_UNTRACKED (^3) and modified tracked paths from STASH_REF.
#
# Usage:
#   bash scripts/split-prs.sh
# Optional:
#   STASH_REF='stash@{1}' BASE_BRANCH=main bash scripts/split-prs.sh
#
# GitHub: open PRs as a stack — PR2 targets branch 1 (or rebase PR2 onto main after PR1 merges).

set -euo pipefail

STASH_REF="${STASH_REF:-stash@{0}}"
STASH_UNTRACKED="${STASH_REF}^3"
BASE_BRANCH="${BASE_BRANCH:-main}"

export GIT_TERMINAL_PROMPT=0

die() { echo "error: $*" >&2; exit 1; }

command -v git >/dev/null || die "git not found"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  die "not inside a git repository"
fi

if ! git stash show "${STASH_REF}" --stat >/dev/null 2>&1; then
  die "cannot read ${STASH_REF} (run: git stash list)"
fi

if ! git rev-parse "${STASH_UNTRACKED}^{commit}" >/dev/null 2>&1; then
  die "missing ${STASH_UNTRACKED} — stash was likely created without untracked files. Recreate with: git stash push -u -m \"…\""
fi

echo "Using stash: ${STASH_REF}"
echo "Untracked tree: ${STASH_UNTRACKED}"
echo "Base branch: ${BASE_BRANCH}"

# Untracked-on-disk paths → checkout from stash^3
checkout_ut() {
  [[ $# -eq 0 ]] && return 0
  git checkout "${STASH_UNTRACKED}" -- "$@"
}

# Modifications to tracked files → checkout from stash merge commit
checkout_tr() {
  [[ $# -eq 0 ]] && return 0
  git checkout "${STASH_REF}" -- "$@"
}

git checkout "${BASE_BRANCH}"
git pull --ff-only --quiet || die "git pull failed (close other Git/IDE locks on .git and retry)"

# -----------------------------------------------------------------------------
# Branch 1 — foundational infra (outbox/DLQ + all migrations + full db/routes/schedulers)
# -----------------------------------------------------------------------------

git branch -D infra/dlq-classification-and-backoff 2>/dev/null || true
git checkout -b infra/dlq-classification-and-backoff

checkout_ut \
  migrations/090_vt_event_outbox.sql \
  migrations/091_vt_event_outbox_event_version.sql \
  migrations/092_vt_appointments_inventory_item_id.sql \
  migrations/093_vt_event_outbox_retry_tracking.sql \
  migrations/094_vt_er_intake_escalation.sql \
  migrations/095_vt_event_outbox_error_type.sql \
  migrations/096_vt_event_outbox_next_attempt_at.sql \
  server/lib/event-publisher.ts \
  server/lib/outbox-error-classification.ts \
  server/lib/outbox-health.ts \
  server/lib/outbox-janitor.ts \
  server/lib/realtime-outbox-version.ts \
  server/lib/realtime-outbox.ts \
  server/lib/dispense-order-validation.ts \
  server/routes/admin-outbox-dlq.ts \
  server/routes/admin-outbox-health.ts \
  server/services/system-health-monitor.ts \
  server/services/er-intake-escalation.service.ts \
  server/services/shadow-inventory.service.ts \
  shared/realtime-schema-version.ts \
  src/lib/event-reducer.ts \
  src/types/realtime-events.ts \
  src/pages/admin-ops-dashboard.tsx \
  src/pages/admin-medication-integrity.tsx \
  tests/outbox-error-classification.test.ts \
  tests/system-health-monitor.test.ts

checkout_tr \
  server/db.ts \
  server/app/routes.ts \
  server/app/start-schedulers.ts \
  .env.example \
  locales/en.json \
  locales/he.json \
  server/lib/metrics.ts \
  server/lib/realtime.ts \
  server/lib/audit.ts \
  server/routes/realtime.ts \
  server/routes/code-blue.ts \
  server/routes/shift-chat.ts \
  server/routes/admin-medication-integrity.ts \
  shared/er-types.ts \
  src/lib/api.ts \
  src/lib/i18n.ts \
  src/lib/realtime.ts \
  src/hooks/useRealtime.ts \
  src/app/routes.tsx \
  src/components/layout.tsx \
  src/pages/display.tsx

git add -A
git commit --no-verify -m "feat(infra): event outbox, DLQ classification, realtime health, shared schema"

# -----------------------------------------------------------------------------
# Branch 2 — ER SLA escalation
# -----------------------------------------------------------------------------

git checkout -b feature/er-sla-escalation

checkout_ut \
  src/hooks/useErEscalationAnticipation.ts \
  tests/er-intake-escalation.service.test.ts

checkout_tr \
  server/services/er-intake.service.ts \
  server/services/er-board.service.ts \
  server/services/er-handoff-sla.service.ts \
  server/services/er-handoff.service.ts \
  server/routes/er.ts \
  src/pages/er-command-center.tsx

git add -A
git commit --no-verify -m "feat(er): intake SLA escalation and command center"

# -----------------------------------------------------------------------------
# Branch 3 — notification pipeline reliability
# -----------------------------------------------------------------------------

git checkout -b infra/notification-pipeline-reliability

checkout_ut \
  server/services/notification-worker.ts

checkout_tr \
  server/lib/push.ts \
  server/lib/task-notification.ts \
  server/lib/queue.ts \
  server/workers/notification.worker.ts \
  server/services/task-automation.service.ts \
  server/services/appointments.service.ts \
  src/pages/appointments.tsx \
  tests/phase-2-3-medication-package-integration.test.ts \
  tests/phase-3-3-5-hardening.test.js \
  tests/phase-3-3-recall-production.test.js

git add -A
git commit --no-verify -m "feat(infra): notification pipeline reliability"

# -----------------------------------------------------------------------------
# Branch 4 — security / COP / tenant joins
# -----------------------------------------------------------------------------

git checkout -b chore/security-and-housekeeping

checkout_ut \
  src/components/cop-discrepancy-banner.tsx \
  src/types/cop-alerts.ts

checkout_tr \
  server/routes/patients.ts \
  server/routes/containers.ts \
  src/pages/meds.tsx \
  tests/active-patients-api.test.js \
  tests/integration-adapter.test.js

git add -A
git commit --no-verify -m "chore: clinic-scoped queries, COP surfaces, test updates"

# -----------------------------------------------------------------------------
git checkout "${BASE_BRANCH}"

echo ""
echo "Done. Stacked branches (newest tip = chore/security-and-housekeeping):"
echo "  1. infra/dlq-classification-and-backoff"
echo "  2. feature/er-sla-escalation"
echo "  3. infra/notification-pipeline-reliability"
echo "  4. chore/security-and-housekeeping"
echo ""
echo "Open PRs as a stack: base branch for PR2–PR4 is the previous feature branch until merged to ${BASE_BRANCH}."
echo "You are back on ${BASE_BRANCH}; tip commits live on chore/security-and-housekeeping."
