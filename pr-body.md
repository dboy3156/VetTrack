## Summary
- Add deterministic 3-day veterinary hospital simulation under `server/demo-production-safe/`
- 43 Hebrew demo users (2 admin, 9 senior via shift role, 27 technicians, 5 viewers)
- 51 equipment items across ICU / אשפוז / כירורגיה zones with realistic status distribution (20 in-use, 8 overdue, 8 issue, 15 available)
- 46 scan-log events using existing `scanLogs` table shape (visible in current UI without changes)
- 27 senior shifts spanning 3 days
- Overdue derived from `checkedOutAt + expectedReturnMinutes` (not hardcoded)
- Includes required demo moments: 2 overdue 3-day devices, ICU stuck device, recently returned, missing user context, issue+still-in-use
- One-command rollback (`demo:hospital:rollback`) removes only demo-prefixed data
- All scripts idempotent (safe to re-run)
- Zero schema changes, zero backend refactors, zero UI changes

## Test plan
- [x] `pnpm run demo:hospital:seed` — 43 users, 51 equipment, 46 events, 27 shifts created
- [x] Re-run seed — 0 new inserts (idempotent)
- [x] `pnpm run demo:hospital:rollback` — all demo data removed
- [x] Re-run rollback — 0 deletes (idempotent no-op)
- [x] Seed after rollback — full state restored
- [x] Role constraints verified (only 2 admins, seniors via shift role only)
- [x] Overdue logic verified (12 items flagged dynamically)
- [x] All 5 demo moments present
- [x] All 5 exact Hebrew issue notes present
- [x] Scan logs match `/api/activity` and `/api/equipment/:id/logs` shape
