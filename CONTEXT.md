# VetTrack ER Wedge

VetTrack is defining an emergency-room wedge for veterinary clinics, optimized for high-pressure shift operations and measurable pilot outcomes. This context captures canonical ER terms so product, clinical, and engineering decisions use the same language.

## Language

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

## Relationships

- A clinic in **ER Mode** is constrained by the **ER Allowlist**
- In ER Mode, non-allowlisted routes resolve through **Concealment 404**
- An **Intake Event** starts in a **Queue Severity** level and may change via **Time Aging Escalation**
- Each board item has exactly one **Primary Lane** and zero or more **Risk Badges**
- A **Structured Clinical Handoff** closes through **Incoming Assignee Ack** or **Forced Ack Override**
- **Outcome KPI** values are interpreted against the **Pre-Go-Live Baseline**
- Board freshness depends on the **Unified ER Event Stream**

## Example dialogue

> **Dev:** "In ER Mode, if someone opens a procurement URL directly, should we show forbidden?"
> **Domain expert:** "No, apply Concealment 404 because that route is outside the ER Allowlist."
>
> **Dev:** "This patient is both overdue and handoff risk; do we duplicate the card?"
> **Domain expert:** "No, keep one Primary Lane and add Risk Badges."

## Flagged ambiguities

- "priority" was used to mean both **Queue Severity** and **Primary Lane** — resolved: severity drives urgency, lane is the board placement outcome.
- "handoff acknowledged" was used to mean either any team member or assigned owner — resolved: default is **Incoming Assignee Ack**, with **Forced Ack Override** for admin/vet only.
