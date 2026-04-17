# Phase 4 Architecture Snapshot

## Core systems
- Task Engine
- Notification Engine
- Automation Engine
- Intelligence Layer
- Realtime Layer
- Reliability Layer

## Guarantees
- Idempotent side-effects
- At-least-once delivery (queue)
- No duplicate user notifications
- Deterministic recommendations
- Tenant isolation (clinicId)

## Failure handling
- Circuit breakers (push, redis, queue)
- DLQ for final failures
- Retry with backoff

## Limits
- Intelligence MAX_SCAN = 100
- SSE max clients per clinic
- Rate limits per user/clinic

## Metrics
- tasks / automation / notifications / queue / intelligence / realtime

## Known tradeoffs
- In-memory metrics (not persisted)
- SSE instead of WebSockets
- Redis optional fallback paths