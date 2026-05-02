# Engineering & agent rules — rollout report

**Date:** 2026-05-02  
**Repository:** VetTrack  
**Scope:** Integrate the new **Engineering & agent principles** Cursor rule with existing project rules, documentation, and team processes.

---

## 1. Identify new rules

### New or explicitly extended in this effort

| Artifact | Location | Role |
|----------|----------|------|
| **Engineering & agent principles** | `.cursor/rules/engineering-and-agent-principles.mdc` | `alwaysApply: true` umbrella: functional style, DRY/KISS, strict TS, errors, security/tenancy, testing bias, performance, agent workflow, commits, rule hygiene. |

### Pre-existing Cursor rules (unchanged set; composition matters)

These `.mdc` files remain the focused layer under the umbrella:

- `clean-code.mdc`
- `detailed-summarization.mdc`
- `express-server.mdc`
- `focused-edits.mdc`
- `react-patterns.mdc`
- `root-cause-fixes.mdc`
- `tailwind-ui.mdc`
- `typescript-standards.mdc`
- `ui-ux-design.mdc`
- `vettrack-stabilization-plan.mdc`

### Relationship

The **new** rule does not replace those files; it **coordinates** them (pointers to `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`, and specific `.mdc` names) so agents prefer canonical repo docs over duplicated prose.

---

## 2. Analyze impact

### Project structure

- **No folder moves or renames** required. Rules stay in `.cursor/rules/`.
- **Conflict resolution:** The umbrella rule was aligned with **`typescript-standards.mdc`** on typing: forbid `any`; allow **`unknown` at boundaries with narrowing** (stricter than a naive “avoid unknown” checklist).
- **Tenancy language:** Generic “RLS + `auth.uid()`” advice was **not** copied literally. VetTrack enforces **clinic-scoped data** in the app via **`clinicId`** on queries (see `CLAUDE.md`); optional DB RLS is deployment-specific.

### Processes

- **Developers & reviewers:** Expect Conventional Commits, guard-clause style, and “no silent catch” called out in PR review when diffs violate the umbrella rule.
- **AI-assisted work:** Cursor injects `alwaysApply` rules into context; the new rule **increases** consistency of multi-file edits, file-budget respect, and verification commands (`npx tsc --noEmit`, `pnpm test`) before “done.”
- **CI / timeline:** No new CI job is **mandated** by this rollout; existing `tsc` and `pnpm test` in developer workflow already support rule #14-style verification. Adding a dedicated “rules compliance” job is **optional** and not implemented here (would need concrete lint rules, not policy text).

### Outcomes (intended)

- Fewer drive-by refactors and scope creep (`focused-edits` + umbrella **file budget**).
- Stronger default toward **integration-style tests** when adding coverage (matches `CLAUDE.md` / `vite.config.ts` skip documentation).
- Clearer **onboarding** path: `AGENTS.md` and `CLAUDE.md` now point humans and agents at the same rule set.

### Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Rule stack feels heavy / contradictory | Umbrella **references** other `.mdc` files instead of duplicating; tenancy wording clarified to match `CLAUDE.md`. |
| Contributors ignore Cursor rules | **Stakeholder surfaces:** `AGENTS.md` (Cloud/agents), `CLAUDE.md` (Claude Code), this doc for prose summary. |
| Stale rule content | Umbrella instructs **pointers over pasting**; canonical behavior stays in code + `CLAUDE.md`. |

---

## 3. Plan adjustments

| Action | Owner | Notes |
|--------|--------|------|
| Keep umbrella rule concise and VetTrack-specific | Maintainers | Adjust `.mdc` when repeated mistakes appear (incremental rules). |
| Link docs → rules | Done in this rollout | `AGENTS.md`, `CLAUDE.md`, this file. |
| Avoid duplicating `CONTEXT.md` clinical glossary | — | Umbrella stays engineering/agent-focused; clinical language remains in `CONTEXT.md`. |
| Training | Team leads | Share this doc + `.cursor/rules/` in onboarding; optional 5-minute PR checklist sync. |

---

## 4. Implement changes

Delivered in-repo:

1. **`.cursor/rules/engineering-and-agent-principles.mdc`**
   - Tenancy bullet updated to cite **`CLAUDE.md` Multi-tenancy** explicitly and to separate optional DB RLS from mandatory app-layer **`clinicId`** filtering.

2. **`AGENTS.md`**
   - New subsection **Cursor project rules (IDE agents)** with paths and pointer to this rollout doc.

3. **`CLAUDE.md`**
   - New **Cursor project rules** subsection at end of file for Claude Code users.

4. **`docs/engineering-rules-rollout.md`** (this document)
   - Structured record for stakeholders and future audits.

### Not done (explicit non-goals)

- No mass refactor of existing classes/scripts to “functional only”—the rule applies **going forward** and at touched code; exceptions remain for external adapters.
- No new ESLint/CI rule packs—the repo has **no ESLint** today (`AGENTS.md`); adding mechanical enforcement is a separate initiative.

### Team communication

- **Stakeholders:** Engineers + anyone using Cursor/Claude Code on this repo—notify via README link or team channel: “See `AGENTS.md` → Cursor project rules and `docs/engineering-rules-rollout.md`.”
- **Training:** Read umbrella + `typescript-standards.mdc` + `focused-edits.mdc` once; skim others by area (server vs React).

---

## 5. Monitor and review

### Compliance signals (lightweight)

- **PRs:** Reviewers spot-check for silent `catch`, missing `clinicId` in new queries, `any` introduced without justification.
- **Agents:** Sessions that follow **file budget** and run **`npx tsc --noEmit`** before completion.
- **Quarterly (suggested):** Re-read `.cursor/rules/` for overlap; merge or split `.mdc` files if any exceed useful size (umbrella already recommends **split by domain**).

### Feedback loop

- When the same violation repeats (e.g., empty catches), add **one** concrete bullet or example to the smallest relevant `.mdc`, not a large paste.

### Challenges encountered

| Challenge | Resolution |
|-----------|------------|
| Generic best-practice list mixed Supabase/RLS with our Postgres+Drizzle model | Reworded tenancy to **`clinicId` + `CLAUDE.md`**, optional RLS noted separately. |
| Typing advice “avoid unknown” vs strict TS | Aligned with **`typescript-standards.mdc`**: `unknown` at boundaries + narrow. |

---

## Summary

The **new** material is primarily **`engineering-and-agent-principles.mdc`**, integrated by **cross-links** in `AGENTS.md` and `CLAUDE.md`, with this document as the **stakeholder-facing rollout record**. Implementation is **documentation and rule clarity**, not a sweeping code refactor—execution quality improves through reviews, agent context, and incremental `.mdc` updates as patterns emerge.
