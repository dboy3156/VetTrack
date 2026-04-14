import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, equipment, pushSubscriptions, shifts, users } from "../db.js";
import { resolveCurrentRole, type PermanentVetTrackRole } from "./role-resolution.js";
import { sendPushToUser } from "./push.js";

const scheduledReminderTimers = new Map<string, NodeJS.Timeout>();

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getMinuteBucket(date = new Date()): string {
  return date.toISOString().slice(0, 16);
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

async function userAllowsReminder(
  userId: string,
  settingField:
    | "technician_return_reminders_enabled"
    | "senior_own_return_reminders_enabled"
    | "senior_team_overdue_alerts_enabled"
    | "admin_hourly_summary_enabled"
): Promise<boolean> {
  const [row] = await db
    .select({
      enabled: sql<boolean>`COALESCE(bool_or(${sql.raw(settingField)} AND ${pushSubscriptions.alertsEnabled}), false)`,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  return Boolean(row?.enabled);
}

function parseDateTime(dateText: string, timeText: string): Date {
  return new Date(`${dateText}T${timeText}`);
}

function inferShiftWindow(shiftDate: string, startTime: string, endTime: string): { start: Date; end: Date } {
  const start = parseDateTime(shiftDate, startTime);
  let end = parseDateTime(shiftDate, endTime);
  if (end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

function isEquipmentOverdue(
  checkedOutAt: Date | string | null,
  expectedReturnMinutes: number | null,
  now: Date
): boolean {
  if (!checkedOutAt || !expectedReturnMinutes || expectedReturnMinutes <= 0) return false;
  const checkoutAtDate = typeof checkedOutAt === "string" ? new Date(checkedOutAt) : checkedOutAt;
  if (Number.isNaN(checkoutAtDate.getTime())) return false;
  return checkoutAtDate.getTime() + expectedReturnMinutes * 60_000 <= now.getTime();
}

function buildReminderMessage(equipmentName: string): string {
  return `תזכורת: החזר ${equipmentName} למקומו`;
}

function buildTeamOverdueMessage(equipmentName: string, userName: string): string {
  return `ציוד לא הוחזר: ${equipmentName} על ידי ${userName}`;
}

function buildAdminSummaryMessage(count: number): string {
  return `${count} פריטים לא הוחזרו במשמרת הנוכחית`;
}

async function sendTechnicianReminder(
  userId: string,
  equipmentId: string,
  equipmentName: string
): Promise<void> {
  const userWantsReminders = await userAllowsReminder(userId, "technician_return_reminders_enabled");
  if (!userWantsReminders) return;

  await sendPushToUser(userId, {
    title: "VetTrack",
    body: buildReminderMessage(equipmentName),
    tag: `smart-reminder:${equipmentId}`,
    url: `/equipment/${equipmentId}`,
  });
}

async function sendSeniorOwnReminder(
  userId: string,
  equipmentId: string,
  equipmentName: string
): Promise<void> {
  const userWantsReminders = await userAllowsReminder(userId, "senior_own_return_reminders_enabled");
  if (!userWantsReminders) return;

  await sendPushToUser(userId, {
    title: "VetTrack",
    body: buildReminderMessage(equipmentName),
    tag: `smart-reminder:${equipmentId}`,
    url: `/equipment/${equipmentId}`,
  });
}

export async function scheduleSmartReturnReminder(params: {
  equipmentId: string;
  equipmentName: string;
  expectedReturnMinutes: number | null;
  userId: string;
  checkedOutAt: Date | string | null;
}): Promise<void> {
  if (!params.expectedReturnMinutes || params.expectedReturnMinutes <= 0) return;
  if (!params.checkedOutAt) return;

  const checkoutDate = typeof params.checkedOutAt === "string" ? new Date(params.checkedOutAt) : params.checkedOutAt;
  if (Number.isNaN(checkoutDate.getTime())) return;

  const reminderAt = checkoutDate.getTime() + params.expectedReturnMinutes * 60_000;
  const delayMs = reminderAt - Date.now();
  if (delayMs <= 0) return;

  const timerKey = `${params.equipmentId}:${params.userId}`;
  const existingTimer = scheduledReminderTimers.get(timerKey);
  if (existingTimer) clearTimeout(existingTimer);

  const timeoutHandle = setTimeout(async () => {
    scheduledReminderTimers.delete(timerKey);
    try {
      const [item] = await db
        .select({
          id: equipment.id,
          name: equipment.name,
          checkedOutById: equipment.checkedOutById,
          checkedOutAt: equipment.checkedOutAt,
          expectedReturnMinutes: equipment.expectedReturnMinutes,
        })
        .from(equipment)
        .where(and(eq(equipment.id, params.equipmentId), isNull(equipment.deletedAt)))
        .limit(1);

      if (!item) return;
      if (item.checkedOutById !== params.userId) return;
      if (!isEquipmentOverdue(item.checkedOutAt, item.expectedReturnMinutes, new Date())) return;

      const [userRow] = await db
        .select({ name: users.name, role: users.role })
        .from(users)
        .where(eq(users.id, params.userId))
        .limit(1);

      const userName = userRow?.name ?? "";
      const fallbackRole = (userRow?.role as PermanentVetTrackRole | undefined) ?? "technician";
      const roleResolution = await resolveCurrentRole({
        userName,
        fallbackRole,
      });

      if (roleResolution.effectiveRole === "technician") {
        await sendTechnicianReminder(params.userId, params.equipmentId, item.name);
        return;
      }

      if (roleResolution.effectiveRole === "senior_technician") {
        await sendSeniorOwnReminder(params.userId, params.equipmentId, item.name);
      }
    } catch (error) {
      console.error("Failed to process scheduled smart reminder", error);
    }
  }, delayMs);

  scheduledReminderTimers.set(timerKey, timeoutHandle);
}

export function cancelSmartReturnReminder(equipmentId: string, userId: string | null | undefined): void {
  if (!userId) return;
  const key = `${equipmentId}:${userId}`;
  const timer = scheduledReminderTimers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  scheduledReminderTimers.delete(key);
}

async function getActiveShifts(now: Date): Promise<Array<{ employeeName: string; role: "technician" | "senior_technician" | "admin" }>> {
  const currentTime = toTimeString(now);
  const currentDate = toDateString(now);
  const previousDate = new Date(now);
  previousDate.setDate(now.getDate() - 1);
  const yesterdayDate = toDateString(previousDate);

  return db
    .select({
      employeeName: shifts.employeeName,
      role: shifts.role,
    })
    .from(shifts)
    .where(
      and(
        sql`(
          (${shifts.date} = ${currentDate}::date AND (
            (${shifts.startTime} <= ${shifts.endTime} AND ${shifts.startTime} <= ${currentTime}::time AND ${shifts.endTime} > ${currentTime}::time)
            OR
            (${shifts.startTime} > ${shifts.endTime} AND ${currentTime}::time >= ${shifts.startTime})
          ))
          OR
          (${shifts.date} = ${yesterdayDate}::date AND ${shifts.startTime} > ${shifts.endTime} AND ${currentTime}::time < ${shifts.endTime})
        )`
      )
    );
}

async function runSeniorHourlyTeamChecks(now: Date): Promise<void> {
  const activeShifts = await getActiveShifts(now);
  if (activeShifts.length === 0) return;

  const activeSeniorShifts = activeShifts.filter((shift) => shift.role === "senior_technician");
  if (activeSeniorShifts.length === 0) return;

  const allUsers = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(isNull(users.deletedAt));

  const activeShiftNames = activeShifts.map((shift) => normalizeName(shift.employeeName));
  const teamUsers = allUsers
    .filter((user) => activeShiftNames.includes(normalizeName(user.name)))
    .map((user) => ({ id: user.id, name: user.name }));

  if (teamUsers.length === 0) return;
  const teamUserIds = teamUsers.map((user) => user.id);

  const overdueItems = await db
    .select({
      id: equipment.id,
      name: equipment.name,
      checkedOutById: equipment.checkedOutById,
      checkedOutAt: equipment.checkedOutAt,
      expectedReturnMinutes: equipment.expectedReturnMinutes,
    })
    .from(equipment)
    .where(
      and(
        inArray(equipment.checkedOutById, teamUserIds),
        isNotNull(equipment.checkedOutById),
        isNull(equipment.deletedAt)
      )
    );

  const currentlyOverdue = overdueItems.filter((item) =>
    isEquipmentOverdue(item.checkedOutAt, item.expectedReturnMinutes, now)
  );

  if (currentlyOverdue.length === 0) return;

  for (const seniorShift of activeSeniorShifts) {
    const seniorUser = allUsers.find((user) => normalizeName(user.name) === normalizeName(seniorShift.employeeName));
    if (!seniorUser) continue;
    const seniorEnabled = await userAllowsReminder(seniorUser.id, "senior_team_overdue_alerts_enabled");
    if (!seniorEnabled) continue;

    for (const item of currentlyOverdue) {
      if (!item.checkedOutById) continue;
      const holder = teamUsers.find((user) => user.id === item.checkedOutById);
      const holderName = holder?.name ?? "Unknown";
      await sendPushToUser(seniorUser.id, {
        title: "VetTrack",
        body: buildTeamOverdueMessage(item.name, holderName),
        tag: `smart-team-overdue:${item.id}:${getMinuteBucket(now)}`,
        url: `/equipment/${item.id}`,
      });
    }
  }
}

async function runAdminHourlySummary(now: Date): Promise<void> {
  const items = await db
    .select({
      id: equipment.id,
      checkedOutAt: equipment.checkedOutAt,
      expectedReturnMinutes: equipment.expectedReturnMinutes,
    })
    .from(equipment)
    .where(and(isNotNull(equipment.checkedOutById), isNull(equipment.deletedAt)));

  const overdueCount = items.filter((item) => isEquipmentOverdue(item.checkedOutAt, item.expectedReturnMinutes, now)).length;
  if (overdueCount <= 0) return;

  const admins = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.role, "admin"));

  for (const admin of admins) {
    const enabled = await userAllowsReminder(admin.id, "admin_hourly_summary_enabled");
    if (!enabled) continue;
    await sendPushToUser(admin.id, {
      title: "VetTrack",
      body: buildAdminSummaryMessage(overdueCount),
      tag: `smart-admin-summary:${getMinuteBucket(now)}`,
      url: "/my-equipment",
    });
  }
}

async function runHourlySmartNotifications(): Promise<void> {
  const now = new Date();
  if (now.getMinutes() !== 0) return;
  await runSeniorHourlyTeamChecks(now);
  await runAdminHourlySummary(now);
}

let smartSchedulerStarted = false;

export function startSmartRoleNotificationScheduler(): void {
  if (smartSchedulerStarted) return;
  smartSchedulerStarted = true;
  setInterval(() => {
    runHourlySmartNotifications().catch((error) => {
      console.error("Failed smart hourly notifications", error);
    });
  }, 60_000);
}

