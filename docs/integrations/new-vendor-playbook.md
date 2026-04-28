# New vendor adapter playbook (Phase D)

Use this when onboarding a second (or Nth) production adapter alongside `generic-pms-v1` and `vendor-x-v1`.

## 1. Credentials schema

- Declare `requiredCredentials` on the adapter (flat string map keys).
- Document each key in this file and in `AGENTS.md` / tenant runbooks — never log values.
- Prefer separate sandbox vs production base URLs via env vars (see vendor-x pattern).

## 2. `validateCredentials`

- Implement a lightweight `/health` or `/ping` (timeout ≤ 5s for interactive validate).
- Return `{ valid: true }` or `{ valid: false, error: "safe message" }` — never echo raw vendor bodies.
- Route-level resilience (circuit breaker + rate limits) may wrap validation for specific adapters.

## 3. `fetchPatients`

- Call **documented** vendor endpoints only; paginate when required.
- Map to `ExternalPatient` (or canonical → mapper → `ExternalPatient`).
- Support incremental `since` via `SyncParams.since` (ISO string).
- No DB writes inside the adapter.

## 4. PHI-safe logs

- Prefix operational logs with `[integration]`; include `adapterId`, `correlationId` / `runId`, `environment`.
- Never log patient names, phone numbers, or free-text clinical data.

## 5. Circuit breaker compatibility

- Inbound sync uses `guardedAdapterCall` (worker) — adapters should not double-wrap HTTP unless the route explicitly does for validate-only paths.
- Failures increment breaker state per `clinicId` + `adapterId`.

## 6. Tests required

- Adapter unit tests with `fetch` mocked (validate + at least one `fetchPatients` path).
- Contract / mapper tests for canonical shapes.
- Add a row to `tests/integration-adapter-template.test.ts` checklist for the new adapter id.

## 7. Rollout steps

1. Feature-flag registration in `server/integrations/index.ts` (env-gated if needed).
2. `INTEGRATION_*` env for URLs and enablement; document in deployment.
3. Store credentials via `POST /api/integrations/configs/:id/credentials`.
4. `POST .../validate` → dry-run sync → enable flags in config metadata → production promote when ready.
5. Use rollback controls if the integration must be stopped quickly without deleting credentials.

## References

- `server/integrations/adapters/base.ts` — `IntegrationAdapter`
- `server/integrations/contracts/canonical.v1.ts` — canonical shapes
- `docs/integrations/adapter-certification-checklist.md` — certification gate
