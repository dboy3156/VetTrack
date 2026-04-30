# ER Wedge Decision Ledger + Execution Order

This document captures the locked decisions from the grill session and converts them into a concrete execution order for the 10-week ER wedge plan.

## Locked decisions

1. **ER mode enforcement**
   - Hard allowlist enforcement in ER mode.
   - Non-allowlisted routes and APIs return `404` (concealment behavior).

2. **ER v1 scope allowlist**
   - UI pages: `/patients`, `/patients/:id`, `/appointments`, `/shift-handover`, `/code-blue`, `/er`, `/er/impact`.
   - API groups: `/api/patients`, `/api/appointments`, `/api/shift-handover`, `/api/code-blue`, `/api/realtime`, `/api/er`, `/api/health`.
   - `/api/users` is blocked in ER mode.

3. **Assignee lookup**
   - Dedicated endpoint: `/api/er/assignees`.
   - No dependency on generic `/api/users` in pilot mode.

4. **Intake payload (v1)**
   - Required: `species`, `severity` (`low|medium|high|critical`), `chiefComplaint`.
   - Optional: `animalId`, `ownerName`.

5. **Queue priority policy**
   - Severity-first ordering: `critical > high > medium > low`.
   - Within same severity, older `waitingSince` ranks first.
   - Time-aging auto escalation enabled.

6. **Escalation SLA policy**
   - `low -> medium`: 45 min
   - `medium -> high`: 20 min
   - `high -> critical`: 10 min
   - `critical`: overdue flag at 5 min (no further escalation level)

7. **Structured handoff schema (v1)**
   - Mandatory: `activeIssue`, `nextAction`, `etaMinutes`, `ownerUserId`.
   - Optional: `riskFlags[]`, `pendingMedicationTaskId`, `note`.

8. **Handoff acknowledgment rule**
   - Default: incoming assignee must acknowledge.
   - Override: admin/vet can force acknowledge with mandatory reason.

9. **Board lane model**
   - One primary lane per item (mutually exclusive).
   - Secondary statuses shown as badges (`handoffRisk`, `overdue`, `unassigned`).

10. **`nextAction` ownership**
    - Backend-authored deterministic recommendation (code + label).
    - Frontend renders only.

11. **KPI definitions (v1 locked)**
    - `doorToTriageMinutesP50`: median minutes from intake `createdAt` to first assignment.
    - `missedHandoffRate`: percent of handoff items marked overdue before ack in shift window.
    - `medDelayRate`: percent of medication tasks completed after schedule + grace threshold.

12. **Baseline policy**
    - Per-clinic fixed 14-day pre-go-live baseline (before ER mode enablement).
    - If insufficient baseline data, confidence is low and percent delta is deferred.

13. **Realtime scope (v1)**
    - Unified ER event stream now for intake/assign/handoff.
    - Standardized polling fallback.
    - Medication events deferred to v1.1; med-delay computed from existing task/appointment data.

14. **Startup and readiness**
    - Listen early, but strict not-ready health/readiness until safe.
    - Traffic gated by readiness probe.

15. **Pilot auth behavior**
    - Single auth mode with startup validation.
    - No fallback behavior in pilot.

16. **ER mode control plane**
    - Clinic-level config in DB with optional environment default.

17. **Rollout pattern**
    - Staged activation per clinic with preview mode.
    - Preview logs and surfaces blocked dependency findings in readiness reports.

18. **Readiness go-live gate**
    - `0` unresolved P0/P1 dependencies.
    - `<=3` P2 dependencies, each with owner and ETA.
    - `7` consecutive days with no new P0/P1 preview findings.

19. **Integration readiness scoring**
    - Internal weighted score: `0-100`.
    - External display: `red/yellow/green` + top 2 blockers.

20. **Documentation decisions**
    - Root `CONTEXT.md` created for canonical ER terms.
    - ADR strategy: one ADR now for ER mode allowlist + concealment, defer other ADRs pending pilot signal.

21. **Hard critical-path blocker**
    - ER allowlist implementation and ER API contract freeze must complete by end of week 2.

22. **Per-clinic kill switch**
    - Immediate rollback path is `er_mode_state: enforced -> preview` without redeploy.
    - Rollback event auto-logs actor, timestamp, and reason while telemetry continues.

23. **Realtime consistency SLO**
    - ER board freshness target is `P95 < 3 seconds` with hard ceiling `10 seconds`.

24. **If schedule slips**
    - Cut `/er/impact` UI polish first.
    - Keep KPI collector and impact API; fallback UI can be minimal table/export.
    - Do not cut intake -> assign -> handoff ack core flow.

25. **Primary stickiness KPI**
    - Critical handoff acknowledgment within SLA must reach `>=85%` by pilot week 4.

26. **Go/no-go ownership**
    - Clinical operations lead is final go/no-go owner per clinic.
    - Product and engineering are required sign-offs.

27. **Incident response SLA**
    - P0: acknowledge in 15 minutes, mitigate/rollback in 60 minutes.
    - P1: acknowledge in 30 minutes, mitigate in 4 hours.
    - Any breach triggers enforced-to-preview rollback review.

28. **Minimum safe pilot staffing assumption**
    - At least one vet (or senior clinical decision-maker), one technician, and one designated shift lead.

29. **Pricing-readiness criteria**
    - Over rolling 14 days per clinic, require both:
      - Adoption: critical handoff ack within SLA `>=85%`.
      - Outcome: at least 2 of 3 KPIs improve vs baseline with non-low confidence.

30. **Reliability gating for conversion**
    - KPI improvement alone is insufficient; pricing proposal requires operational reliability governance to pass.

31. **Delivery resourcing floor (weeks 1-6)**
    - Minimum allocation: 1.0 backend, 1.0 frontend, 0.5 QA, 0.25 product/clinical ops.

32. **Absence-triggered timeline review**
    - Backend role availability gap greater than 5 business days auto-triggers schedule slip review.

33. **Backend continuity coverage**
    - Named secondary backend owner at 0.25 allocation starts in week 1.
    - Secondary owner shares ER route contract ownership, can execute rollback runbook, and participates in at least one paired review per critical-path PR.

## Open questions

- None blocking for v1 scope lock and implementation start.
- Future v1.1 candidate to revisit: include medication events in unified realtime stream.

## Sequenced execution order (10-week alignment)

## Week 1-2 (scope + contracts + foundations)

1. Implement clinic-level ER mode config + preview/enforced states.
2. Add backend/frontend allowlist guards with concealment `404`.
3. Freeze ER API contracts:
   - `/api/er/board`
   - `/api/er/intake`
   - `/api/er/intake/:id/assign`
   - `/api/er/handoffs/:id/ack`
   - `/api/er/impact`
   - `/api/er/assignees`
4. Add schema + migrations:
   - `vt_er_intake_events`
   - `vt_shift_handoffs`
   - `vt_shift_handoff_items`
   - `vt_er_kpi_daily`
   - `vt_er_baseline_snapshots`
5. Add queue aging/escalation policy constants and deterministic lane assignment rules.
6. Build preview readiness report pipeline (blocked routes/APIs, P0-P2 tagging, trend window).

## Week 3-6 (core build + ER command flow)

1. Build `server/routes/er.ts` and board service with deterministic `nextAction`.
2. Implement intake APIs and assignment flow with clinic scoping, RBAC, audit logging.
3. Implement `/api/er/assignees` with minimal role-filtered payload.
4. Implement handoff ack transitions with assignee-default + admin/vet forced override reason.
5. Ship `src/pages/er-command-center.tsx` with lane/badge model and quick actions.
6. Add quick intake UI with keyboard-first behavior and under-20-second target.
7. Extend handoff UI with mandatory ack and overdue emphasis.
8. Unify realtime stream (intake/assign/handoff) + polling fallback integration.

## Week 6-10 (stability + pilot conversion readiness)

1. Build KPI collector job (idempotent daily per clinic).
2. Implement `/api/er/impact` using locked baseline policy and confidence behavior.
3. Ship minimal ER impact page.
4. Finalize startup/readiness behavior and deployment probe gating.
5. Enforce single pilot auth mode readiness checks.
6. Complete Integration Readiness Lite scoring + category + blockers output.
7. Run 5-8 integration journeys on real DB:
   - intake -> assign -> task -> handoff ack -> impact
8. Execute staged clinic rollout:
   - preview period
   - readiness thresholds met
   - enforce ER mode

## Definition of done for this planning package

- Decision ledger exists and is approved.
- `CONTEXT.md` is current with resolved language.
- ADR-0001 exists for ER mode enforcement.
- No unresolved v1 blocking decisions remain.
- Resourcing and continuity constraints are explicit and assigned.
