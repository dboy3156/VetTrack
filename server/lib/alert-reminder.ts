import { db, alertAcks, equipment } from "../db.js";
import { eq, isNull } from "drizzle-orm";
import { sendPushToUser } from "./push.js";

const ALERT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function isAlertStillActive(alertType: string, eq_row: {
  status: string;
  lastMaintenanceDate: Date | string | null;
  lastSterilizationDate: Date | string | null;
  lastSeen: Date | string | null;
  maintenanceIntervalDays: number | null;
}): boolean {
  const now = Date.now();

  if (alertType === "issue") {
    return eq_row.status === "issue";
  }

  if (alertType === "overdue") {
    if (!eq_row.maintenanceIntervalDays) return false;
    const lastMaint = eq_row.lastMaintenanceDate ? new Date(eq_row.lastMaintenanceDate).getTime() : 0;
    const intervalMs = eq_row.maintenanceIntervalDays * 24 * 60 * 60 * 1000;
    return now - lastMaint > intervalMs;
  }

  if (alertType === "sterilization_due") {
    const lastSteril = eq_row.lastSterilizationDate ? new Date(eq_row.lastSterilizationDate).getTime() : 0;
    const STERILIZATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
    return now - lastSteril > STERILIZATION_INTERVAL_MS;
  }

  if (alertType === "inactive") {
    const lastSeen = eq_row.lastSeen ? new Date(eq_row.lastSeen).getTime() : 0;
    const INACTIVE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
    return now - lastSeen > INACTIVE_THRESHOLD_MS;
  }

  return false;
}

async function checkAndSendReminders(): Promise<void> {
  try {
    const now = new Date();

    const pendingAcks = await db
      .select()
      .from(alertAcks)
      .where(isNull(alertAcks.remindedAt));

    const due = pendingAcks.filter(
      (ack) => ack.remindAt && ack.remindAt <= now
    );

    if (due.length === 0) return;

    for (const ack of due) {
      const [eqRow] = await db
        .select({
          status: equipment.status,
          lastMaintenanceDate: equipment.lastMaintenanceDate,
          lastSterilizationDate: equipment.lastSterilizationDate,
          lastSeen: equipment.lastSeen,
          maintenanceIntervalDays: equipment.maintenanceIntervalDays,
          name: equipment.name,
        })
        .from(equipment)
        .where(eq(equipment.id, ack.equipmentId))
        .limit(1);

      if (!eqRow) continue;

      const stillActive = isAlertStillActive(ack.alertType, eqRow);

      await db
        .update(alertAcks)
        .set({ remindedAt: now })
        .where(eq(alertAcks.id, ack.id));

      if (stillActive) {
        await sendPushToUser(ack.acknowledgedById, {
          title: "Alert Still Active",
          body: `Reminder: "${eqRow.name}" still has an unresolved ${ack.alertType.replace(/_/g, " ")} alert`,
          tag: `reminder:${ack.equipmentId}:${ack.alertType}`,
          url: `/equipment/${ack.equipmentId}`,
        });
      }
    }
  } catch (err) {
    console.error("Alert reminder check failed:", err);
  }
}

export function startAlertReminderScheduler(): void {
  setInterval(checkAndSendReminders, ALERT_CHECK_INTERVAL_MS);
  checkAndSendReminders();
}
