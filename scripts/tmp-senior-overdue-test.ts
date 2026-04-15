import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { db, equipment, pushSubscriptions, shifts, users } from "../server/db.js";
import { initVapid } from "../server/lib/push.js";
import { runHourlySmartNotifications } from "../server/lib/role-notification-scheduler.js";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toTimeString(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

async function main() {
  const suffix = Date.now().toString();
  const seniorUserId = `test-senior-${suffix}`;
  const techUserId = `test-tech-${suffix}`;
  const shiftSeniorId = `test-shift-senior-${suffix}`;
  const shiftTechId = `test-shift-tech-${suffix}`;
  const equipmentId = `test-eq-${suffix}`;
  const pushSubId = `test-sub-${suffix}`;

  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000);
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  const checkoutAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const date = toDateString(now);

  let attemptedSeniorDispatch = false;

  try {
    await db.insert(users).values([
      {
        id: seniorUserId,
        clerkId: `clerk-${seniorUserId}`,
        email: `${seniorUserId}@vettrack.dev`,
        name: "Senior Test User",
        role: "technician",
        status: "active",
      },
      {
        id: techUserId,
        clerkId: `clerk-${techUserId}`,
        email: `${techUserId}@vettrack.dev`,
        name: "Tech Test User",
        role: "technician",
        status: "active",
      },
    ]);

    await db.insert(shifts).values([
      {
        id: shiftSeniorId,
        date,
        startTime: toTimeString(start),
        endTime: toTimeString(end),
        employeeName: "Senior Test User",
        role: "senior_technician",
      },
      {
        id: shiftTechId,
        date,
        startTime: toTimeString(start),
        endTime: toTimeString(end),
        employeeName: "Tech Test User",
        role: "technician",
      },
    ]);

    await db.insert(equipment).values({
      id: equipmentId,
      name: `Overdue Test Equipment ${suffix}`,
      checkedOutById: techUserId,
      checkedOutByEmail: `${techUserId}@vettrack.dev`,
      checkedOutAt: checkoutAt,
      expectedReturnMinutes: 30,
    });

    // Intentionally invalid endpoint to force delivery failure if dispatch is attempted.
    await db.insert(pushSubscriptions).values({
      id: pushSubId,
      userId: seniorUserId,
      endpoint: `https://invalid.push.local/${suffix}`,
      p256dh: "invalid-p256dh",
      auth: "invalid-auth",
      seniorTeamOverdueAlertsEnabled: true,
      alertsEnabled: true,
      soundEnabled: true,
    });

    await initVapid();

    try {
      await runHourlySmartNotifications({ force: true });
      console.log("RESULT: Scheduler completed without push error.");
      console.log("NOTE: This usually means no senior dispatch was attempted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes(`Push delivery failed for user ${seniorUserId}`)) {
        attemptedSeniorDispatch = true;
      }
      console.log("SCHEDULER_ERROR:", message);
    }

    if (attemptedSeniorDispatch) {
      console.log("ASSERTION: PASS — senior technician notification dispatch was attempted for overdue team item.");
    } else {
      console.log("ASSERTION: FAIL — no senior technician dispatch attempt detected.");
    }
  } finally {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, pushSubId)).catch(() => {});
    await db.delete(equipment).where(eq(equipment.id, equipmentId)).catch(() => {});
    await db.delete(shifts).where(inArray(shifts.id, [shiftSeniorId, shiftTechId])).catch(() => {});
    await db.delete(users).where(and(eq(users.id, seniorUserId))).catch(() => {});
    await db.delete(users).where(and(eq(users.id, techUserId))).catch(() => {});
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("TEST_SCRIPT_FATAL:", err);
    process.exit(1);
  });
