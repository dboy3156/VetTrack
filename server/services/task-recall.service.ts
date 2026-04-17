/**
 * Daily Recall Engine — optimized, clinic-scoped task queries + aggregated dashboard.
 * All reads enforce clinic_id; myTasks are additionally scoped by vet_id = userId.
 * Dashboard cache: Redis (`task_dashboard:...`) with safe no-cache fallback when Redis is down.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, notInArray, sql } from "drizzle-orm";
import { appointments, db } from "../db.js";
import { cacheDel, cacheGetOrSet, redisKey } from "../lib/redis.js";

export const RECALL_LIMIT = 50;
export const DASHBOARD_CACHE_TTL_MS = 20_000;
export const DASHBOARD_CACHE_TTL_SEC = Math.ceil(DASHBOARD_CACHE_TTL_MS / 1000);

const ACTIVE_RECALL_STATUSES = ["pending", "assigned", "in_progress"] as const;
const TERMINAL_STATUSES = ["completed", "cancelled"] as const;

const priorityCase = sql`(case ${appointments.priority} when 'critical' then 3 when 'high' then 2 else 1 end)`;

type AppointmentRow = typeof appointments.$inferSelect;

export type SerializedAppointment = ReturnType<typeof serializeAppointment>;

export interface TaskRecallItem extends SerializedAppointment {
  isOverdue: boolean;
}

function serializeAppointment(row: AppointmentRow) {
  return {
    ...row,
    vetId: row.vetId ?? null,
    startTime: new Date(row.startTime).toISOString(),
    endTime: new Date(row.endTime).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function withIsOverdue<T extends SerializedAppointment>(row: T, nowMs: number): TaskRecallItem {
  return {
    ...row,
    isOverdue: new Date(row.endTime).getTime() < nowMs,
  };
}

/** Exported for tests — overdue if end strictly before now. */
export function computeIsOverdue(endTimeIso: string, nowMs: number): boolean {
  return new Date(endTimeIso).getTime() < nowMs;
}

/** Exported for tests — recall sort: overdue first, then priority, then earliest start. */
export function priorityRank(p: string | undefined | null): number {
  if (p === "critical") return 3;
  if (p === "high") return 2;
  return 1;
}

export function sortRecallTasks<T extends { endTime: string; startTime: string; priority?: string | null }>(
  tasks: T[],
  nowMs: number,
): T[] {
  return [...tasks].sort((a, b) => {
    const ao = computeIsOverdue(a.endTime, nowMs) ? 1 : 0;
    const bo = computeIsOverdue(b.endTime, nowMs) ? 1 : 0;
    if (bo !== ao) return bo - ao;
    const pr = priorityRank(b.priority) - priorityRank(a.priority);
    if (pr !== 0) return pr;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}

function assertClinicId(clinicId: string): string {
  const c = clinicId?.trim();
  if (!c) throw new Error("clinicId is required");
  return c;
}

function dashboardRedisKey(clinicId: string, userId: string): string {
  return redisKey("vettrack", "task_dashboard", `${clinicId}:${userId}`);
}

/**
 * Active tasks for the current UTC calendar day (start_time falls on today UTC).
 * ORDER BY priority DESC, start_time ASC. LIMIT 50.
 */
export async function getTodayTasks(clinicIdInput: string): Promise<SerializedAppointment[]> {
  const clinicId = assertClinicId(clinicIdInput);
  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        inArray(appointments.status, [...ACTIVE_RECALL_STATUSES]),
        sql`(${appointments.startTime} AT TIME ZONE 'UTC')::date <= (now() AT TIME ZONE 'UTC')::date`,
      ),
    )
    .orderBy(desc(priorityCase), asc(appointments.startTime))
    .limit(RECALL_LIMIT);

  return rows.map(serializeAppointment);
}

/**
 * Late tasks — end before now, not completed/cancelled.
 * ORDER BY end_time ASC. LIMIT 50.
 */
export async function getOverdueTasks(clinicIdInput: string): Promise<SerializedAppointment[]> {
  const clinicId = assertClinicId(clinicIdInput);
  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        lt(appointments.endTime, sql`now()`),
        notInArray(appointments.status, [...TERMINAL_STATUSES]),
      ),
    )
    .orderBy(asc(appointments.endTime), desc(priorityCase))
    .limit(RECALL_LIMIT);

  return rows.map(serializeAppointment);
}

/**
 * Next 4 hours window, excluding terminal statuses.
 * ORDER BY start_time ASC. LIMIT 50.
 */
export async function getUpcomingTasks(clinicIdInput: string): Promise<SerializedAppointment[]> {
  const clinicId = assertClinicId(clinicIdInput);
  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        gte(appointments.startTime, sql`now()`),
        lte(appointments.startTime, sql`now() + interval '4 hours'`),
        notInArray(appointments.status, [...TERMINAL_STATUSES]),
      ),
    )
    .orderBy(asc(appointments.startTime))
    .limit(RECALL_LIMIT);

  return rows.map(serializeAppointment);
}

/**
 * Current user's assigned active tasks.
 * ORDER BY priority DESC, start_time ASC. LIMIT 50.
 */
export async function getMyTasks(userId: string, clinicIdInput: string): Promise<SerializedAppointment[]> {
  const clinicId = assertClinicId(clinicIdInput);
  const uid = userId?.trim();
  if (!uid) return [];

  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        eq(appointments.vetId, uid),
        inArray(appointments.status, [...ACTIVE_RECALL_STATUSES]),
      ),
    )
    .orderBy(desc(priorityCase), asc(appointments.startTime))
    .limit(RECALL_LIMIT);

  return rows.map(serializeAppointment);
}

/**
 * Users (technicians) with at least one overdue assigned task — for background reminder scan.
 */
export async function getUsersWithOverdueTaskCounts(): Promise<{ clinicId: string; userId: string; count: number }[]> {
  const rows = await db
    .select({
      clinicId: appointments.clinicId,
      userId: appointments.vetId,
      count: sql<number>`count(*)::int`,
    })
    .from(appointments)
    .where(
      and(
        lt(appointments.endTime, sql`now()`),
        notInArray(appointments.status, [...TERMINAL_STATUSES]),
        isNotNull(appointments.vetId),
      ),
    )
    .groupBy(appointments.clinicId, appointments.vetId);

  return rows
    .filter((r): r is typeof r & { userId: string } => r.userId != null)
    .map((r) => ({ clinicId: r.clinicId, userId: r.userId, count: Number(r.count) }));
}

export interface TaskDashboardPayload {
  today: TaskRecallItem[];
  overdue: TaskRecallItem[];
  upcoming: TaskRecallItem[];
  myTasks: TaskRecallItem[];
  counts: {
    today: number;
    overdue: number;
    myTasks: number;
  };
}

/**
 * Single round-trip dashboard: four parallel bounded queries, Redis cache (or uncached fallback).
 * GET handler has no side effects (no push).
 */
export async function getTaskDashboard(clinicIdInput: string, userId: string): Promise<TaskDashboardPayload> {
  const clinicId = assertClinicId(clinicIdInput);
  const uid = userId?.trim();
  if (!uid) {
    throw new Error("userId is required for dashboard");
  }

  const cacheKey = dashboardRedisKey(clinicId, uid);
  return await cacheGetOrSet<TaskDashboardPayload>(
    cacheKey,
    DASHBOARD_CACHE_TTL_SEC,
    async () => {
      const now = Date.now();
      const t0 = performance.now();

      const [rawToday, rawOverdue, rawUpcoming, rawMy] = await Promise.all([
        getTodayTasks(clinicId),
        getOverdueTasks(clinicId),
        getUpcomingTasks(clinicId),
        getMyTasks(uid, clinicId),
      ]);

      const overdueIds = new Set(rawOverdue.map((r) => r.id));
      const todayDeduped = rawToday.filter((r) => !overdueIds.has(r.id));

      const todaySorted = sortRecallTasks(todayDeduped, now);
      const mySorted = sortRecallTasks(rawMy, now);

      const overdueItems = rawOverdue.map((r) => withIsOverdue(r, now));
      const todayItems = todaySorted.map((r) => withIsOverdue(r, now));
      const upcomingItems = rawUpcoming.map((r) => withIsOverdue(r, now));
      const myItems = mySorted.map((r) => withIsOverdue(r, now));

      const payload: TaskDashboardPayload = {
        today: todayItems,
        overdue: overdueItems,
        upcoming: upcomingItems,
        myTasks: myItems,
        counts: {
          today: todayItems.length,
          overdue: overdueItems.length,
          myTasks: myItems.length,
        },
      };

      const durationMs = Math.round(performance.now() - t0);

      console.log("TASK_DASHBOARD_FETCH", {
        clinicId,
        durationMs,
        counts: payload.counts,
      });

      if (durationMs > 200) {
        console.warn("TASK_DASHBOARD_SLOW", { clinicId, durationMs, counts: payload.counts });
      }
      if (payload.counts.today === 0 && payload.counts.overdue === 0 && payload.counts.myTasks === 0) {
        console.log("TASK_DASHBOARD_EMPTY", { clinicId });
      }
      if (payload.counts.overdue > 10) {
        console.warn("TASK_DASHBOARD_HIGH_OVERDUE", { clinicId, overdue: payload.counts.overdue });
      }

      return payload;
    },
  );
}

export async function invalidateTaskDashboardCache(clinicId: string, userId: string): Promise<void> {
  await cacheDel(dashboardRedisKey(clinicId.trim(), userId.trim()));
}

/** @deprecated Use invalidateTaskDashboardCache */
export function __clearDashboardCacheForTests(): void {
  /* no-op: Redis-backed cache is cleared per-key in integration tests */
}
