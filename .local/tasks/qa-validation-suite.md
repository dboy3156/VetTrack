# VetTrack QA & Validation Suite

## What & Why
Build a comprehensive automated QA and validation system for VetTrack that tests the real workflows used in a veterinary hospital. This covers the six critical feature areas: QR scanning, offline-first sync, equipment checkout, alerts, RBAC, and data integrity. The goal is a repeatable test runner that can be triggered after every change and simulates real ICU-pressure conditions — validating that the system is safe for production clinical use.

## Done looks like
- A single command (`npx tsx server/tests/validate.ts`) runs the full validation cycle and prints a structured report
- Each test section maps directly to the spec: Core Features, ICU Simulation, Failure Scenarios, Data Integrity, Regression
- Every test outputs PASS / FAIL with the exact scenario, severity, root cause, and recommended fix for failures
- The final output is a clear "System Status: Stable / At Risk / Broken" verdict with categorized issue lists (Critical / High / Medium)
- All six feature areas have automated coverage: QR scan flow, offline queue replay, checkout ownership, alert acknowledgment deduplication, RBAC enforcement, and audit log consistency

## Out of scope
- Browser-level Playwright E2E tests (this is API + logic-layer validation using the existing fetch-based approach in `server/tests/`)
- Visual UI regression screenshots
- Load testing / performance benchmarking beyond basic timing checks

## Tasks

1. **Validation runner scaffold** — Create `server/tests/validate.ts` as the master entry point. It orchestrates all test suites, tracks overall pass/fail counts, and prints the final System Status report with Critical / High / Medium issue buckets. Include a severity tagging system and the bug-loop format from the spec.

2. **QR Scan Flow tests** — Validate that scanning an equipment ID via `POST /api/equipment/:id/scan` returns the correct equipment, records the scan in the audit log, and completes within an acceptable time window. Test malformed IDs, unknown equipment, and rapid back-to-back scans on the same item.

3. **Offline sync & queue replay tests** — Simulate offline action queuing by posting multiple state-change actions and then verifying they are applied in correct order with no duplicates and no data loss. Validate the revert endpoint (`POST /api/equipment/:id/revert`) respects the 90-second window and does not allow double-revert.

4. **Equipment checkout ownership tests** — Validate that `POST /api/equipment/:id/checkout` correctly assigns ownership, that `GET /api/equipment/my` reflects the checked-out item, that `POST /api/equipment/:id/return` clears ownership instantly, and that two users cannot simultaneously hold the same item.

5. **Alerts & acknowledgment deduplication tests** — Verify that alert acknowledgments (`POST /api/alert-acks`) are created correctly, that a second claim by a different user either fails or replaces the first (no split-brain), and that deleting an ack (`DELETE /api/alert-acks`) puts the alert back into unhandled state cleanly.

6. **RBAC enforcement tests** — For each admin-only endpoint (`PATCH /api/users/:id/role`, `PATCH /api/users/:id/status`, `DELETE /api/users/:id`, `DELETE /api/equipment/:id`), confirm that technician-role tokens receive a 401/403 and never a 200. Confirm admins can perform these actions. Tests must use real auth header patterns consistent with the existing security test approach.

7. **ICU simulation & conflict resolution tests** — Simulate rapid repeated scans on the same equipment item from two different users in quick succession. Verify the final state is deterministic (last-write-wins with audit trail, no corrupted intermediate state). Also test app-closed-mid-action: initiate a scan then immediately hit revert and confirm the state is clean.

8. **Data integrity & audit log consistency tests** — After running a sequence of checkout → scan → return → revert actions, query the audit log and verify every action is recorded in correct order with accurate timestamps, no duplicates, and the equipment's final status matches the audit trail's last entry.

9. **Regression guard** — Run a condensed "smoke" version of all the above after each test suite completes, confirming that existing passing flows were not broken by the test actions themselves. This doubles as the regression test required by the spec.

## Relevant files
- `server/tests/security.test.ts`
- `server/routes/equipment.ts`
- `server/routes/users.ts`
- `server/routes/alert-acks.ts`
- `server/routes/audit-logs.ts`
- `server/middleware/auth.ts`
- `server/db.ts`
- `src/lib/sync-engine.ts`
- `src/lib/offline-db.ts`
