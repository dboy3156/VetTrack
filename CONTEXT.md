# VetTrack — canonical context (`CONTEXT.md`)

This file is the **single source of domain language and non-negotiable rules** for VetTrack’s emergency/clinical surface. Use it in product, clinical safety, and engineering work; later phases (Smart COP enforcement, ER features) should align terminology and seams here before implementation.

---

## Glossary (canonical)

**ER Wedge (Operational focus mode)**  
The clinic-scoped product slice built for high-pressure shift operations: **ER Mode** narrows the app to ER-critical workflows, driven by an explicit **ER Allowlist** and **Concealment 404** for everything else. Same concept as **ER Mode** in day-to-day language; “ER Wedge” emphasizes the operational pilot and measurable outcomes, not a separate product.

**Smart COP (Global clinical integrity layer)**  
Cross-cutting safeguards that keep **dispensing, orders, and patient context** aligned across the whole product—not only when ER Mode is on. Includes server-side evaluation of cabinet/lot dispense lines against active medication orders and hospitalization (see `server/lib/dispense-order-validation.ts`), and staff-facing **surveillance** (e.g. orphan/mismatch alerts via realtime and `CopDiscrepancyBanner`). **Authoritative** blocks happen at HTTP mutation boundaries; UI alerts alone are not sufficient for safety.

**Dose Hard-Stop**  
A **server-side rejection** of a mutating request (e.g. task completion, dispense commit) when an entered or computed dose violates enforced bounds (e.g. formulary `min_dose` / `max_dose`, or policy-backed caps), returning a **stable clinical reason code** (4xx), not only a toast or SSE event. Distinct from advisory warnings shown while editing.

**Orphan Usage**  
A dispense line that **cannot be tied** to an appropriate active clinical order and stay context for the patient on the transaction: for example no linked patient, no active hospitalization when required, no matching active medication appointment/order for the inventory line, or quantity above the allowed maximum derived from order metadata (`NO_PATIENT_LINKED`, `NO_ACTIVE_HOSPITALIZATION`, `NO_ACTIVE_ORDER`, `QUANTITY_EXCEEDS_ORDER` in `dispense-order-validation.ts`). Resolving orphan usage is a **Cop** concern—alerting and/or blocking per product policy.

---

## ER Wedge domain language

VetTrack defines an emergency-room wedge for veterinary clinics, optimized for high-pressure shift operations and measurable pilot outcomes. The terms below keep product, clinical, and engineering aligned.

**ER Mode**:  
A clinic-scoped operating mode that limits the product to ER-critical workflows only.  
_Avoid_: Lite mode, pilot skin

**ER Allowlist**:  
The explicit set of pages and APIs that remain accessible in ER Mode.  
_Avoid_: Partial hide, soft block

**Concealment 404**:  
The policy that non-allowlisted routes return not found in ER Mode.  
_Avoid_: Forbidden mode, visible-disabled route

**Intake Event**:  
A fast triage intake record created at patient arrival with minimal required fields.  
_Avoid_: Full registration, admission form

**Queue Severity**:  
The clinical urgency level assigned to an intake item (`low`, `medium`, `high`, `critical`).  
_Avoid_: Priority score, risk rank

**Time Aging Escalation**:  
A policy that raises queue urgency when waiting time exceeds configured SLA thresholds.  
_Avoid_: Manual bump only

**Primary Lane**:  
The single canonical board lane where an item appears at any given time.  
_Avoid_: Multi-lane card, duplicate card

**Risk Badge**:  
A secondary marker shown on a board item without changing its primary lane.  
_Avoid_: Secondary lane

**Structured Clinical Handoff**:  
A per-patient transfer artifact with mandatory fields needed for safe shift transition.  
_Avoid_: Free-text handoff note

**Incoming Assignee Ack**:  
The default rule requiring the designated incoming owner to acknowledge a handoff item.  
_Avoid_: Team-level generic ack

**Forced Ack Override**:  
An admin or vet acknowledgment path requiring an explicit reason when default ack is blocked.  
_Avoid_: Silent override

**Outcome KPI**:  
A clinic-level ER metric used to compare pre-go-live baseline and post-adoption performance.  
_Avoid_: Usage metric only

**Pre-Go-Live Baseline**:  
The 14-day clinic window immediately before ER Mode activation used as KPI baseline.  
_Avoid_: Post-launch baseline

**Unified ER Event Stream**:  
A single realtime feed for ER intake, assignment, and handoff state changes.  
_Avoid_: Per-screen polling mesh

---

## Relationships

- A clinic in **ER Mode** is constrained by the **ER Allowlist**
- In ER Mode, non-allowlisted routes resolve through **Concealment 404**
- An **Intake Event** starts in a **Queue Severity** level and may change via **Time Aging Escalation**
- Each board item has exactly one **Primary Lane** and zero or more **Risk Badges**
- A **Structured Clinical Handoff** closes through **Incoming Assignee Ack** or **Forced Ack Override**
- **Outcome KPI** values are interpreted against the **Pre-Go-Live Baseline**
- Board freshness depends on the **Unified ER Event Stream**
- **Smart COP** applies globally; **ER Wedge** controls **visibility and navigation**, not whether integrity rules apply to allowlisted APIs

---

## Example dialogue

> **Dev:** "In ER Mode, if someone opens a procurement URL directly, should we show forbidden?"  
> **Domain expert:** "No, apply Concealment 404 because that route is outside the ER Allowlist."
>
> **Dev:** "This patient is both overdue and handoff risk; do we duplicate the card?"  
> **Domain expert:** "No, keep one Primary Lane and add Risk Badges."

---

## Flagged ambiguities

- "priority" was used to mean both **Queue Severity** and **Primary Lane** — resolved: severity drives urgency, lane is the board placement outcome.
- "handoff acknowledged" was used to mean either any team member or assigned owner — resolved: default is **Incoming Assignee Ack**, with **Forced Ack Override** for admin/vet only.

---

## Code map (key seams)

### [`shared/er-mode-access.ts`](shared/er-mode-access.ts)

- **`ER_MODE_API_PATH_PREFIX_ALLOWLIST`** — Prefixes under `/api` that remain callable when ER concealment is enforced (`/er`, `/users`, `/session`, `/realtime`, `/push`). Keeps session identity and ER APIs alive without widening scope accidentally.
- **`normalizeApiPathAfterPrefix` / `isErApiPathAllowlisted`** — Shared normalization so server middleware and any client tests use the same rule for “is this API allowed in ER?”
- **`isErSpaPathAllowlisted`** — SPA paths that stay reachable (landing, auth, `/er/*`); everything else may be treated as not found for concealment parity with [`server/middleware/er-mode-concealment.ts`](server/middleware/er-mode-concealment.ts) and client guards.

### [`server/lib/dispense-order-validation.ts`](server/lib/dispense-order-validation.ts)

- **`evaluateDispenseAgainstOrders`** — Transaction-scoped cross-check of cabinet dispense lines vs active medication **appointments** and **open hospitalization** for the same `animalId` / `clinicId`; produces **orphan line** detail for **Smart COP** (`OrphanReasonCode`, `OrphanLineDetail`).
- **`medicationMetaMatchesInventoryItem` / `maxDispenseUnitsFromMetadata`** — Best-effort alignment between order metadata and inventory labels/codes; caps quantity against order-derived limits.
- **`loadInventoryItemLabelCode`** — Helper to resolve label/code for validation inside the same transaction.

### [`src/pages/er-command-center.tsx`](src/pages/er-command-center.tsx)

- **Command Center UI** for the ER board: intake, assignment, lanes, handoff dialogs, realtime refresh; imports **`CopDiscrepancyBanner`** for Smart Cop discrepancy/orphan alerts.
- **`deduplicateByPrimaryLane`** — Enforces **one card per item**: merges lane arrays from the server and places each item solely by **`item.lane`** so **Primary Lane** is never duplicated across columns.
- **`severityCardClass` / escalation hooks** — **Queue Severity** and SLA escalation styling; severity is independent of lane placement (see comments in file).

**Related (not exhaustive):** [`shared/er-types.ts`](shared/er-types.ts) (frozen `/api/er` shapes), [`server/lib/er-mode.ts`](server/lib/er-mode.ts) (clinic ER flag), [`src/features/er/components/ErModeGuard.tsx`](src/features/er/components/ErModeGuard.tsx) (SPA concealment), [`src/components/cop-discrepancy-banner.tsx`](src/components/cop-discrepancy-banner.tsx) (Cop alerts).

---

## Invariants (clinical & safety — do not break)

1. **Tenant isolation**: Every database query filters by the active **`clinicId`**; no cross-clinic reads or writes.
2. **RBAC source of truth**: Effective **role** comes from **`vt_users.role`** in the database, not from JWT claims alone.
3. **ER Allowlist parity**: Any new staff-critical API or SPA route used in ER workflows must be reflected in **`shared/er-mode-access.ts`** (and tested) so **Concealment 404** does not lock out bedside flows by accident.
4. **Primary Lane**: Each ER board item appears in **exactly one** primary lane; duplicate placement is invalid (UI defensively deduplicates; server contracts should not emit duplicates).
5. **Smart COP scope**: Clinical alignment rules (orders, hospitalization, orphan detection) are **not** “ER only”; ER Mode affects **what is reachable**, not whether integrity logic may apply to allowlisted mutations.
6. **Hard-stop vs surfacing**: A **Dose Hard-Stop** or policy-backed **orphan block** must **reject the mutation on the server** with a clear reason code; reliance on banners or realtime alone for unstoppable actions is insufficient where policy requires a stop.
7. **Auditability**: Sensitive actions (dispensing, permission changes, integration credential use) must remain **auditable** (e.g. `logAudit()` patterns per project rules).
8. **Async clinical–financial paths**: Where billing and inventory follow async workers, document and preserve **idempotent, clinic-scoped** processing—no double charges or silent drops on retry.

---

## Verification

- **Path:** repository root [`CONTEXT.md`](./CONTEXT.md) (this file).  
- **Check:** `CONTEXT.md` exists and `## Glossary`, `## Code map`, and `## Invariants` are present for downstream phases.
