# Smart COP — global enforcement audit (phase 1)

**Date:** 2026-05-02  
**Status:** Approved for audit execution (phase 1); implementation is phase 2 (separate sign-off)  
**Related:** [CONTEXT.md](../../../CONTEXT.md) (ER Wedge vocabulary), `.agents/skills/clinical-enterprise-integrity/SKILL.md`, [2026-04-21-medication-formulary-composite-design.md](./2026-04-21-medication-formulary-composite-design.md)

---

## 1. Objective

Produce a **data-driven audit** that verifies whether **Smart COP**–related behavior (clinical guardrails, medication integrity, dose verification, orphan/order alignment) is implemented as a **universal safety layer** — **not** gated on **ER Mode** — and whether **fail-safe** behavior blocks unsafe mutations server-side.

**Explicit scope addition:** **Formulary and dose-range checks** — trace where **`vt_drug_formulary`** bounds (`standard_dose`, `min_dose`, `max_dose`, `dose_unit`) are applied vs advisory-only, on **all** clinic modes.

Phase **1** delivers the audit report and gap matrix only. Phase **2** (implementation) begins only after this document is reviewed and a separate **`writing-plans`** output is approved.

---

## 2. Canonical terminology

| Term | Source | Audit usage |
|------|--------|-------------|
| **ER Mode**, **ER Allowlist**, **Concealment 404** | [CONTEXT.md](../../../CONTEXT.md) | Use verbatim when describing visibility/access. |
| **Smart COP** (orphan/order mismatch, realtime alerts) | Code comments, `.agents/skills/clinical-enterprise-integrity/SKILL.md` | Map to concrete symbols and routes. |
| **Dose Hard-Stop**, **Interaction Alert** | Not defined in CONTEXT.md | Audit records whether behavior exists in code; names match glossary **only after** product adds them to a canonical doc — do not invent UI strings in phase 1. |
| **Formulary / dose-range** | `vt_drug_formulary`, `src/lib/medicationHelpers.ts`, formulary API | Audit traces reads vs enforcement at mutation boundaries. |

---

## 3. Phase 1 — in scope

### 3.1 Logic location inventory

- Search and classify: **`server/lib/dispense-order-validation.ts`**, medication routes/services (**`completeTask`**, appointments service), **billing** linkage, **Code Blue** routes referencing Smart Cop / orphan reconciliation.
- **Client:** realtime reducer, Cop discrepancy banner, any calculator UI — classify as **surveillance** vs **authoritative** (server must block unsafe commits regardless of mode).

### 3.2 Decouple from ER Mode

- Enumerate **`er_mode_state`**, **`erMode`**, **`enforced`**, **`ER_MODE_*`** usage.
- **Expected:** **Concealment 404** (`server/middleware/er-mode-concealment.ts`, `ErModeGuard`) affects **route visibility**, not whether integrity logic runs on **allowlisted** APIs.
- **Flag:** Any conditional that skips clinical validation when ER Mode is not enforced.

### 3.3 Formulary and dose-range checks (mandatory)

Audit **end-to-end** for each relevant mutation path:

| Question | Evidence to capture |
|----------|---------------------|
| Where is **`vt_drug_formulary`** read for dosing? | Routes (`server/routes/formulary.ts`), services, `medicationHelpers.ts`, forecast pipelines. |
| Is **computed dose** or **entered dose** compared to **`min_dose` / `max_dose`** server-side? | File + function; if only client-side, state **P-tier gap**. |
| Does **task completion** or **dispense** reject out-of-range doses with a **clinical error** (4xx with stable reason code)? | Quote handler behavior; note soft warnings only. |
| Are **interaction** or **duplicate therapy** checks present anywhere authoritative? | If absent, record as gap (do not implement in phase 1). |

Reference implementation seams from existing formulary work: **`vt_drug_formulary`**, **`shared/drug-formulary-seed.ts`**, **`server/routes/formulary.ts`** — extend audit coverage beyond composite-key mechanics into **runtime enforcement**.

### 3.4 Clinic-scoped queries and RBAC

- Confirm **tenant isolation** on every audited query (`clinicId` consistent with project rules).
- Confirm **role gates** on sensitive actions align with **`vt_users.role`** patterns.

### 3.5 Fail-safe summary

- For each critical path: **what blocks the transaction** today vs **alert-only**.
- **Emergency / bypass** paths (e.g. `isEmergency` dispense): document whether bypass is intentional and what invariant is deferred.

---

## 4. Phase 1 — out of scope

- Code refactors, new middleware, wiring **`evaluateDispenseAgainstOrders`** into routes — **phase 2**.
- Editing **CONTEXT.md** unless the audit recommends a follow-up glossary ticket (recommendation only in phase 1).
- Hebrew/English copy changes.

---

## 5. Deliverables (phase 1)

1. **Executive summary** — One paragraph: is Smart COP globally enforcing integrity today? Evidence-backed **yes/partial/no**.
2. **File inventory table** — Path, role (hook | alert | formulary read | dead/unwired | ER-only visibility), notes.
3. **ER decoupling section** — Table of ER-related branches vs clinical validation branches.
4. **Formulary / dose-range section** — Trace matrix: mutation path × formulary lookup × min/max enforcement × block vs warn.
5. **Gap matrix** — **P0–P4**, file:line where possible, risk, effort (**XS–L**), recommended fix or test (no code).
6. **Glossary alignment** — Map findings to **CONTEXT.md** where applicable; list undefined terms (**Dose Hard-Stop**, **Interaction Alert**) as **spec gaps**, not as implemented features.

---

## 6. Phase 2 gate

Implementation work (**writing-plans** → code) starts only after:

- Stakeholder sign-off on this audit document’s findings (and any amendments), and  
- A separate scope agreement for phase 2 (e.g. wire orphan validation, introduce server-side dose-range hard-stop policy).

---

## 7. Self-review (2026-05-02)

- **Placeholders:** None; phase 1 is an audit process with concrete sections.
- **Consistency:** ER vocabulary from CONTEXT.md; Smart COP / formulary from code and enterprise-integrity skill.
- **Scope:** Single cohesive audit; formulary/dose-range explicitly included per stakeholder request.
- **Ambiguity:** “Hard-stop” means **HTTP rejection of the mutating request with a clinical reason code**, not toast-only or SSE-only.
