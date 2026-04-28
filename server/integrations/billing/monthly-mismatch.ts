/**
 * Billing ledger vs integration sync_log reconciliation — Phase D Sprint 3.
 */

import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db, billingLedger, integrationSyncLog } from "../../db.js";

export interface MonthlyBillingMismatchReport {
  month: string;
  expected: number;
  synced: number;
  delta: number;
}

/** Parse YYYY-MM; returns UTC month bounds. */
export function parseMonthBounds(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!m) return null;
  const y = parseInt(m[1]!, 10);
  const mo = parseInt(m[2]!, 10);
  if (mo < 1 || mo > 12) return null;
  const start = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, 1, 0, 0, 0, 0));
  return { start, end };
}

/**
 * expected = ledger rows marked synced in the month (by external_synced_at).
 * synced = sum of records_succeeded from outbound billing sync runs completed in the month (success/partial).
 */
export async function buildMonthlyBillingMismatchReport(
  clinicId: string,
  month: string,
): Promise<MonthlyBillingMismatchReport | null> {
  const bounds = parseMonthBounds(month);
  if (!bounds) return null;

  const expectedRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(billingLedger)
    .where(
      and(
        eq(billingLedger.clinicId, clinicId),
        eq(billingLedger.status, "synced"),
        isNotNull(billingLedger.externalSyncedAt),
        gte(billingLedger.externalSyncedAt, bounds.start),
        lt(billingLedger.externalSyncedAt, bounds.end),
      ),
    )
    .then((r) => r[0]?.n ?? 0);

  const syncedRows = await db
    .select({
      sumSucceeded: sql<number>`coalesce(sum(${integrationSyncLog.recordsSucceeded}), 0)::int`,
    })
    .from(integrationSyncLog)
    .where(
      and(
        eq(integrationSyncLog.clinicId, clinicId),
        eq(integrationSyncLog.syncType, "billing"),
        eq(integrationSyncLog.direction, "outbound"),
        inArray(integrationSyncLog.status, ["success", "partial"]),
        isNotNull(integrationSyncLog.completedAt),
        gte(integrationSyncLog.completedAt, bounds.start),
        lt(integrationSyncLog.completedAt, bounds.end),
      ),
    )
    .then((r) => r[0]?.sumSucceeded ?? 0);

  const expected = expectedRow;
  const synced = syncedRows;
  return {
    month: month.trim(),
    expected,
    synced,
    delta: expected - synced,
  };
}
