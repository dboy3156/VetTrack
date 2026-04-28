# Adapter certification checklist

Use this before marking a vendor adapter **production-ready**. Phase A skeleton — extend as Certification gate matures (plan §16).

## Identity & registry

- [ ] Adapter id is stable (`vt_integration_configs.adapter_id`) and documented.
- [ ] Semantic version bumped when credential schema or wire format changes.
- [ ] Capabilities flags match implemented methods (`IntegrationAdapter`).

## Correctness

- [ ] **Idempotency**: outbound operations (especially billing) use stable keys; retries do not duplicate charges externally.
- [ ] **Tenant scope**: every API call is scoped to the VetTrack `clinicId` (no cross-clinic bleed).
- [ ] **Canonical mapping**: patient/appointment shapes align with `server/integrations/contracts/canonical.v1.ts` where applicable.

## Security & compliance

- [ ] No secrets logged (credentials stay in `vt_server_config` via credential manager).
- [ ] PHI/PII minimized in logs and sync metadata (plan §5).

## Resilience

- [ ] Timeouts and bounded retries on HTTP (vendor-specific).
- [ ] Circuit breaker / rate limits respected when framework enforces them (later phases).

## Validation

- [ ] `validateCredentials` performs a lightweight live check (not a no-op in production adapters).
- [ ] Contract tests pass (`tests/integration-adapter-contract.test.ts` when enabled).

## Sign-off

| Role        | Name | Date |
|------------|------|------|
| Engineering |      |      |
| Security    |      |      |
