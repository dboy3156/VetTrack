# ADR-002 — appointments.service.ts Decomposition Plan

**Date:** 2026-04-25  
**Status:** Accepted — pending implementation  
**Context:** Item 2.5 — `appointments.service.ts` is 1,692 lines (God class)

---

## Context

`server/services/appointments.service.ts` handles three distinct concerns that have grown together:

1. **Scheduling** — create/update/cancel appointments, conflict detection, status state machine
2. **Task lifecycle** — start, complete, vet-approve; technician task queries (today, by priority, active)
3. **Medication execution** — dose resolution, billing, container resolution, inventory deduction queue

This coupling makes it harder to:
- Reason about individual workflows
- Test in isolation
- Onboard new engineers

---

## Decision

Split into three focused services. The split is boundary-preserving — all public API surfaces stay stable, callers update their import paths only.

### Target files

| File | Exports | ~Lines |
|------|---------|--------|
| `server/services/scheduling.service.ts` | `AppointmentInput`, `AppointmentUpdateInput`, `AppointmentServiceError`, `AppointmentStatus`, `createAppointment`, `updateAppointment`, `cancelAppointment`, `getAppointmentsByDay`, `getAppointmentsByVet`, `listAppointmentsByRange` | ~400 |
| `server/services/task-lifecycle.service.ts` | `TaskAuditActor`, `startTask`, `completeTask`, `vetApproveTask`, `getTasksForTechnician`, `getTasksForTechnicianToday`, `getTasksByPriority`, `getActiveTasks`, `getTodayTasks` | ~700 |
| `server/services/medication-execution.service.ts` | `MedicationExecutionTask`, `MedicationExecutionInput`, `resolveMedicationTaskContainerId`, `getActiveMedicationTasks` | ~300 |
| `server/services/appointments.service.ts` | Barrel re-exports from all three above (for backwards compatibility during migration) | ~30 |

### Internal helpers

Private helpers (`resolveMedicationDedupFingerprint`, `findOpenDuplicateMedicationAppointment`, etc.) follow their primary consumer into the appropriate file.

---

## Implementation order

1. Extract `scheduling.service.ts` first (least coupled)
2. Extract `medication-execution.service.ts` (isolated domain)
3. Extract `task-lifecycle.service.ts` last (most internal cross-references)
4. Convert `appointments.service.ts` to barrel re-exports
5. Run full test suite after each extraction

---

## Consequences

- No behaviour changes — pure file reorganisation
- All existing tests continue to pass (imports update automatically if barrel is preserved)
- Each resulting file is ≤700 lines and has a single responsibility
- Estimated effort: one focused engineer-day
