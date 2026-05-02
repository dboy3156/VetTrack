# Smart COP — Phase 3: Global enforcement, hard-stops & Command Center feedback

**Date:** 2026-05-02  
**Status:** Design only — no implementation in this deliverable  
**Depends on:** [2026-05-02-smart-cop-global-enforcement-audit-design.md](./2026-05-02-smart-cop-global-enforcement-audit-design.md) (Phase 1 audit), [CONTEXT.md](../../../CONTEXT.md) (ER vocabulary)

---

## 1. Purpose

Specify **how VetTrack enforces Smart COP invariants globally** (not ER-only): authoritative **server rejection** of unsafe mutations, **deterministic HTTP semantics**, a **database-unavailability fallback**, and **Command Center** UX for clinical discrepancy visibility.

This document is the **clinical invariant & hard-stop layer** design. Implementation wiring (`evaluateDispenseAgainstOrders` is currently defined in `server/lib/dispense-order-validation.ts` but not yet bound to routes — see Phase 1 gap notes) follows in a separate **implementation plan** after sign-off.

---

## 2. Scope & invariants

| Invariant | Definition |
|-----------|------------|
| **Global enforcement** | Any mutation that records a **cabinet dispense** or **medication task completion** with inventory impact must pass Smart COP alignment checks when policy requires them, **regardless of ER Mode** or route concealment. ER Mode continues to govern **visibility** of `/api/er/*` and related UI; it must **not** skip validation on allowlisted clinical APIs. |
| **Orphan usage** | A dispense or completion line is **orphan** when `evaluateDispenseAgainstOrders` (or successor) returns **non-empty `orphanLines`** for that operation’s `(clinicId, animalId, containerId, lines)` context. Reason codes today: `NO_PATIENT_LINKED`, `NO_ACTIVE_HOSPITALIZATION`, `NO_ACTIVE_ORDER`, `QUANTITY_EXCEEDS_ORDER` (`server/lib/dispense-order-validation.ts`). |
| **Hard-stop** | The server **does not** persist the mutation and **does not** return HTTP **2xx** success for that request. The client must receive a **clinical error** payload with stable machine-readable reasons (Phase 1 glossary: not toast-only or SSE-only). |

**Out of scope for this phase-3 design:** Hebrew/English copy finalization (keys live under `locales/*` per project rules); offline sync conflict resolution beyond stating banner expectations; formulary min/max hard-stop policy (may share the same JSON error shape but is tracked separately in the audit).

---

## 3. Blocking logic — server responses for orphan usage

### 3.1 Prohibited behavior

- **Never** return **200 OK** (or any **2xx**) with a body that means “failed validation” (e.g. `{ ok: false }` without error semantics). Clients and intermediaries treat 2xx as success; Smart COP blocks must be **non-2xx**.
- **Never** silently omit validation on allowlisted mutation paths because ER Mode is not “enforced” for UI purposes.

### 3.2 Recommended HTTP status

| Situation | Status | Rationale |
|-----------|--------|-----------|
| Request understood; **business/clinical rule** blocks commit (orphan lines present, policy says block) | **422 Unprocessable Entity** | Aligns with existing validation-style failures (`server/routes/queue.ts`); distinguishes from auth (`401`/`403`) and not-found (`404`). |
| Rare: validation conflicts with **current server state** (e.g. row changed between read and write) | **409 Conflict** | Reuse existing conflict patterns (`billing`, `containers`, `shift-handover`). |
| Smart COP policy disabled by explicit server config (if ever introduced) | **200** only when the operation **actually succeeds** and audit reflects policy — not a validation failure disguised as success. |

### 3.3 JSON error shape (clinical)

Extend the established **`apiError`-style** JSON used across routes (`code`, `reason`, `message`, `requestId`) with a **clinical** branch:

```json
{
  "code": "CLINICAL_INVARIANT_VIOLATION",
  "reason": "ORPHAN_DISPENSE_BLOCKED",
  "message": "Dispense does not match active orders for this patient/container context.",
  "requestId": "<uuid>",
  "clinical": true,
  "cop": {
    "kind": "orphan_dispense",
    "orphanLines": [
      {
        "itemId": "<uuid>",
        "quantity": 1,
        "label": "…",
        "reasons": ["NO_ACTIVE_ORDER"],
        "matchingOrderIds": []
      }
    ]
  }
}
```

**Requirements:**

- **`reason`** stable for i18n and analytics: use a single top-level token such as `ORPHAN_DISPENSE_BLOCKED` for “any orphan line blocked”; per-line detail stays in `cop.orphanLines[].reasons` (existing `OrphanReasonCode` union).
- **`clinical: true`** allows the Command Center and other surfaces to route messaging without parsing message strings.
- **No PII beyond what is already required** for the clinician to correct the action (item labels/ids already in validation).

### 3.4 Mutation boundaries (authoritative)

Phase 3 enforcement MUST run inside the **same database transaction** as the mutation (or before commit with the same `tx`), so a blocked request never leaves inventory/billing inconsistent. Concrete routes/services to bind in implementation (inventory from Phase 1 audit):

- **Medication task completion** (`completeTask` path in `server/services/appointments.service.ts` and related routes).
- **Container / cabinet dispense** endpoints that decrement stock and attach `animalId` + `containerId` + line items.
- **Emergency bypass** (`isEmergency` or equivalent): if product keeps a bypass, the design requires **explicit audit fields** and optional **different reason codes** — bypass must not silently skip Smart COP without recording **why** (document in implementation plan).

---

## 4. Fail-open strategy — DB unreachability

Database connectivity failures during **`evaluateDispenseAgainstOrders`** present a **safety vs availability** tradeoff. Phase 3 adopts a **documented fail-open with surfaced degradation**, suitable for continuity of care when the primary DB is unavailable but **misaligned dispensing remains dangerous**. Operators must **see** that validation did not run.

### 4.1 Definition of “unreachable”

Any of:

- Connection acquire timeout or pool exhaustion when opening the validation query.
- Query timeout or driver error from the validation `SELECT`s inside the transaction.
- Transaction abort before validation completes (treat as failure of validation layer, not necessarily of the whole DB).

**Not** “unreachable”: validation returns `{ orphanLines: [] }` — that is a **passed** check.

### 4.2 Fail-open behavior (default policy)

When validation **cannot complete** due to infra failure:

1. **Do not** treat as orphan (do not fabricate `orphanLines`).
2. **Allow** the mutation to proceed **only if** the product owner enables this policy (env or `vt_server_config` flag, e.g. `SMART_COP_VALIDATION_FAIL_OPEN=true`). If the flag is **false**, behavior is **fail-closed**: return **503 Service Unavailable** with `reason: "COP_VALIDATION_UNAVAILABLE"` and **no** inventory change (rollback).
3. When fail-open is active and the mutation proceeds:
   - Append an **audit log** entry (`logAudit`) with action type indicating **COP validation skipped — DB error**, including `requestId` and error class (not raw stack in production).
   - Emit or enqueue a **realtime / outbox** signal so the Command Center can show **degraded validation** (see §5.2).

**Rationale:** Ambulance scenarios may require dispensing when Postgres is degraded; fail-closed default protects integrity when the org prefers safety over availability. The flag is **per deployment / clinic policy**, not per request.

### 4.3 Health & monitoring

- **`/api/health`** (or dedicated readiness): optional aggregated counter `cop_validation_degraded_total` for ops dashboards (`server/routes/health.ts` patterns).
- **Alerting:** reuse `alert-engine` patterns for sustained validation failures (spike detection similar to `ACCESS_DENIED_SPIKE`).

---

## 5. UI feedback — Clinical discrepancy on the Command Center

**Today:** `CopDiscrepancyBanner` (`src/components/cop-discrepancy-banner.tsx`) renders alerts from React Query key `ORPHAN_DRUG_ALERTS_QUERY_KEY`, fed by **`POTENTIAL_ORPHAN_USE`** realtime events (`src/lib/event-reducer.ts`). That path is **surveillance** (inform after the fact).

**Phase 3 addition:** distinct **“Clinical discrepancy”** messaging when:

| Source | User meaning |
|--------|----------------|
| **A — Realtime** (existing) | Potential orphan / order mismatch detected in stream — keep amber/destructive styling by `CopAlertEntry.variant`. |
| **B — Server hard-stop echo** | User attempted an action; server returned **422** with `clinical: true`. Client shows a **inline or toast** error using `cop.orphanLines` (mutation-scoped). Command Center may show a **short-lived aggregate strip** if the app routes here after failed dispense (optional navigation context). |
| **C — Degraded validation (fail-open)** | Last operation or session flag indicates **COP validation skipped (DB)** — **new banner variant**: neutral/warning border (e.g. `border-amber`), icon distinct from orphan mismatch, copy key such as `cop.validationDegradedTitle` / `cop.validationDegradedDetail` in `locales/en.json` + `he.json`. |

### 5.1 Layout

- **Placement:** Top of main content on **`src/pages/er-command-center.tsx`**, **above** `CopDiscrepancyBanner` or merged into a single **stack** with ordering: **degraded validation (C)** first (system issue), then **orphan/mismatch (A)**, then optional **session error (B)** from last API response.
- **RTL:** Reuse existing flex patterns; no hardcoded LTR alignment.
- **Dismiss:** Degraded banner may be **sticky until acknowledgment** (product choice); orphan entries remain dismissable per existing `dismissable` flag.

### 5.2 Client state for degraded mode

- **Minimum:** After fail-open path, server sends **SSE or included header** `X-COP-Validation-Status: degraded` on subsequent ER board payloads **or** a dedicated lightweight `/api/er/.../cop-status` — design choice in implementation; spec requires **one authoritative signal** the UI can subscribe to without polling heavy endpoints.
- **Offline:** If mutation is queued in Dexie/offline queue, queue items that **require** COP validation must be tagged; on sync failure with **422 clinical**, surface banner **B** and **do not** drop the payload silently (`sync-engine` / offline docs alignment in implementation).

---

## 6. Verification (design-level acceptance criteria)

No code in this deliverable. Implementation must satisfy:

1. **HTTP:** For blocked orphan dispense, response is **422** (or 409 only for true conflict), body includes `clinical: true` and `cop.orphanLines` mirroring server evaluation; **never** 200 for failed validation.
2. **Transaction:** No partial inventory/billing write when validation fails (same transaction rollback).
3. **ER decoupling:** With ER Mode off or concealment active, **allowlisted** dispense/complete endpoints still run validation when hit directly (integration test).
4. **Fail-open flag:** With DB fault injected, fail-closed returns **503** and no mutation; fail-open completes mutation, writes audit, emits degraded signal, Command Center shows **C** banner state.
5. **i18n:** All new user-visible strings use `t.*` keys in both locales.
6. **Audit:** Every fail-open path generates an audit row traceable by `requestId`.

---

## 7. Traceability to Phase 1 audit

| Phase 1 theme | Phase 3 design section |
|---------------|-------------------------|
| Hard-stop = HTTP rejection + stable reason | §3 |
| Formulary/dose-range (separate track) | §2 out of scope note; same JSON shape allowed |
| Fail-safe vs alert-only | §3–4 |
| ER Mode must not skip validation on APIs | §2, §3.4 |

---

## 8. Self-review (2026-05-02)

- **Spec coverage:** Blocking, fail-open, Command Center UI, and verification criteria are all addressed; no TBD placeholders.
- **Consistency:** Reuses existing `OrphanReasonCode`, `CopDiscrepancyBanner`, `apiError` patterns, and Phase 1 terminology.
- **Risk:** Fail-open increases wrong-patient risk during outages — mitigated by audit, banners, and configurable fail-closed default.

---

## 9. Next step

Stakeholder sign-off on this design → **`writing-plans`** implementation plan (tasks, files, tests) for wiring `evaluateDispenseAgainstOrders` at mutation boundaries, JSON helper shared across routes, config flag, and Command Center banner variants.
