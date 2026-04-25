# ADR-001 — Two Medication Task Models: Canonical Designation

**Date:** 2026-04-25  
**Status:** Accepted  
**Context:** Item 2.4 — Due-diligence report raised question about two parallel medication-task models

---

## Context

VetTrack contains two distinct models that both involve medication tasks:

### Model A — `vt_appointments` with `task_type = 'medication'`

Located in: `server/services/appointments.service.ts`, `server/routes/appointments.ts`

**Purpose:** Clinical task scheduling. A medication appointment is a scheduled clinical event (with time window, assigned vet, animal, priority) that happens to involve medication administration. Participates in the broader task queue, conflict detection, shift handover, and recall dashboard.

**Lifecycle:** `pending → assigned → in_progress → completed`

**Key features:** Status machine, technician conflict detection, real-time broadcast, audit log, shift recall, task-recall service.

---

### Model B — `vt_medication_tasks`

Located in: `server/services/medication-tasks.service.ts`, `server/routes/medication-tasks.ts`

**Purpose:** Pharmacy dispensing workflow. A medication task represents a discrete drug administration order: drug identity, dose calculation (mg/kg → mL), vet approval gate, container/inventory selection, and inventory deduction. Created from the pharmacy forecast pipeline.

**Lifecycle:** `pending → in_progress → completed` (with vet approval gate)

**Key features:** Dose calculation, safety level enforcement, dose-deviation justification, RBAC (technician takes, vet approves), container inventory deduction, stale-sweep cleanup.

---

## Decision

**These models are NOT duplicates. They serve different layers of the clinical workflow:**

- `vt_appointments/medication` = the **scheduling layer** (when, who, for which animal, priority)
- `vt_medication_tasks` = the **pharmacy dispensing layer** (which drug, calculated dose, inventory deduction)

A medication treatment event creates:
1. A `vt_appointments` row (scheduling, task queue, recall)
2. Optionally a `vt_medication_tasks` row (when dose calculation and inventory deduction are required)

**Canonical rules going forward:**
- Task scheduling, assignment, shift handover, recall → use `vt_appointments`
- Drug calculation, vet approval, inventory deduction → use `vt_medication_tasks`
- New features that span both layers must coordinate through the `appointments.service.ts` completion path, which already enqueues inventory deduction jobs

---

## Consequences

- No tables deprecated or removed — both models serve distinct purposes
- Future work: expose `vt_medication_tasks.id` as a foreign key on `vt_appointments` to make the relationship explicit at the DB level
- This ADR resolves the due-diligence "parallel models" question: the models are complementary, not competing
