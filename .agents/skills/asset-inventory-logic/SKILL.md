---
name: asset-inventory-logic
description: Covers NFC/QR equipment scanning, Asset Radar, offline Dexie caches, sync-engine queues, and DB-backed scan or transfer logs for hospital assets and consumables. Use when implementing checkout/return or bulk flows, debugging offline conflicts, stale asset detection, inventory deduction jobs, or changes touching scan APIs and equipment routes.
---

# Asset & inventory logic

## Quick start

1. Trace **scan → API → DB → billing/inventory job** for the equipment path you are changing.
2. Offline: inspect `src/lib/offline-db.ts` and `src/lib/sync-engine.ts`—every write needs a **replay or conflict** story.
3. Server: equipment tables and logs live in `server/db.ts` (`vt_scan_logs`, `vt_transfer_logs`, `vt_equipment`, related).
4. Verify recent scan activity with [scripts/verify-nfc-scan-audit.ps1](scripts/verify-nfc-scan-audit.ps1) when debugging NFC pipelines.

## Workflows

### A — Checkout / return / bulk checkout

- Mutations should stay **idempotent** where possible (duplicate scan should not double-charge).
- After task completion, remember **async inventory jobs** may lag briefly—surface UI state accordingly.

### B — Offline sync conflicts

- Classify: same asset two locations vs stale cache vs network reordering; prefer **last-write-wins with audit** only where product allows—otherwise explicit conflict UI.

### C — Stale asset detection

- Align timestamps with scan logs and room/equipment APIs; Asset Radar semantics follow `replit.md` (Asset Radar / rooms sections).

## Scripts

| Script | Purpose |
|--------|---------|
| [scripts/verify-nfc-scan-audit.ps1](scripts/verify-nfc-scan-audit.ps1) | Optional SQL audit of `vt_scan_logs` via `psql` |

## Deep reference

See [REFERENCE.md](REFERENCE.md) for table pointers and Dexie stores overview.
