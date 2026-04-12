# System-Ready Code Improvements

## What & Why
Code snippets were reviewed against the actual codebase and the `PRODUCTION_READINESS.md` criteria. Several gaps were identified across Pillar 1 (Stability), Pillar 2 (Performance), and Pillar 3 (Data Reliability). This task closes those gaps. Items already fully implemented (push Sentry instrumentation, sync failure events, `searchEquipment`, `detectAnomalies`) are left untouched.

## Done looks like

**Pillar 3 — Data Reliability**
- The `statusBreakdown.inactive` computation in `server/routes/analytics.ts` and `detectAnomalies` in `src/lib/equipment-utils.ts` use the same threshold. Currently analytics uses 14 days and the utility uses 24h — this inconsistency is resolved: the analytics route delegates to a shared constant or the utility so both surfaces agree.

**Pillar 2 — Performance (P1a / P1b / P3 thresholds)**
- A `usePaginatedEquipment` hook exists in `src/hooks/use-paginated-equipment.ts` using TanStack Query v5 (`placeholderData: keepPreviousData`, not the deprecated `keepPreviousData: true`) wired to the existing paginated equipment API endpoint (the backend already supports `?page=&limit=`).
- `react-window` is installed and a `VirtualizedEquipmentList` component exists in `src/components/VirtualizedEquipmentList.tsx` with proper imports, an `itemData` prop pattern for passing data into item renderers, and integration into the equipment list page for datasets over 100 items. This directly supports the ≤ 4s TTI (§2.3) and p95 ≤ 500ms read-endpoint thresholds (§2.1).
- A `computeUsageTrends` utility function is extracted into `server/lib/analytics-engine.ts` with full TypeScript types. The analytics route uses it instead of the inlined map loop, making the computation unit-testable and ensuring the 30-day scan-activity series is computed consistently.

**Pillar 1 — Stability (metrics route)**
- The `pendingSyncCount` stub in `server/routes/metrics.ts` is replaced with a real counter. A `syncMetrics` singleton module tracks `syncSuccess` and `syncFail` counts (in-process, reset on server restart — appropriate for this scale). The metrics route reads from this singleton. The sync engine increments the counters on each permanent success or failure. This allows the admin metrics panel to show live sync health data as required by Pillar 1.

## Out of scope
- True fuzzy/typo-tolerant search (e.g. Fuse.js, full-text SQL) — separate feature
- Event sourcing persistence to DB — the `rebuildState` pattern is conceptual and not in production
- Replacing Sentry with a custom observability stack
- Changing the push notification or sync failure Sentry instrumentation (already compliant with S4/S5)
- Changing the backend scan endpoint (already production-grade)

## Tasks

1. **Fix inactive threshold inconsistency (Pillar 3)** — Reconcile the 14-day `inactive` window in `server/routes/analytics.ts` with the 24-hour threshold in `detectAnomalies` in `src/lib/equipment-utils.ts`. Extract the threshold as a shared constant (e.g. `INACTIVE_THRESHOLD_MS`) used by both the analytics route and the utility, so the dashboard and the anomaly detector always agree.

2. **Extract `computeUsageTrends` utility (Pillar 2)** — Create `server/lib/analytics-engine.ts` with a fully typed `computeUsageTrends(scans: ScanLogRow[]): TrendPoint[]` function. Update `server/routes/analytics.ts` to call it instead of the inlined map loop. This makes the trend computation independently testable.

3. **Create `usePaginatedEquipment` hook (Pillar 2 — P1a/P1b)** — Add `src/hooks/use-paginated-equipment.ts` using TanStack Query v5 (`placeholderData: keepPreviousData`), wired to the existing `GET /api/equipment?page=&limit=` endpoint. Use the existing `api` client pattern already in `src/lib/api.ts`.

4. **Install react-window and create virtualized list (Pillar 2 — P1a/P1b, §2.3 TTI)** — Install `react-window` and `@types/react-window`. Create `src/components/VirtualizedEquipmentList.tsx` with correct imports and `itemData` prop pattern. Integrate into the equipment list page for datasets over 100 items, using the paginated hook from Task 3 to feed it.

5. **Wire sync metrics into the metrics route (Pillar 1 — Stability)** — Create `server/lib/sync-metrics.ts` with a `trackSyncSuccess()` / `trackSyncFail()` / `getSyncMetrics()` singleton. Call `trackSyncSuccess()` and `trackSyncFail()` from the appropriate places in the sync flow (permanent success and permanent failure paths). Update `server/routes/metrics.ts` to include `syncMetrics` in its JSON response, replacing the hardcoded `pendingSyncCount: 0`.

## Relevant files
- `server/routes/analytics.ts`
- `server/lib/analytics-cache.ts`
- `server/routes/metrics.ts`
- `src/lib/sync-engine.ts`
- `src/lib/equipment-utils.ts`
- `src/lib/api.ts`
- `src/types/index.ts`
- `src/pages/equipment-list.tsx`
- `PRODUCTION_READINESS.md`
