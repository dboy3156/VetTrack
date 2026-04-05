import { db } from "./db";

const DAYS_BEFORE_ALERT = 7;

export async function checkMaintenanceAlerts() {
  const today = new Date();
  const alertDate = new Date();
  alertDate.setDate(today.getDate() + DAYS_BEFORE_ALERT);

  const equipment = await db.equipment.toArray();

  const dueSoon = equipment.filter((item) => {
    if (!item.nextMaintenanceDate) return false;
    const next = new Date(item.nextMaintenanceDate);
    return next <= alertDate && next >= today;
  });

  const overdue = equipment.filter((item) => {
    if (!item.nextMaintenanceDate) return false;
    const next = new Date(item.nextMaintenanceDate);
    return next < today;
  });

  return { dueSoon, overdue };
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export async function sendMaintenanceNotifications() {
  const permitted = await requestNotificationPermission();
  if (!permitted) return;

  const { dueSoon, overdue } = await checkMaintenanceAlerts();

  overdue.forEach((item) => {
    new Notification("⚠️ תחזוקה באיחור", {
      body: `${item.name} — תחזוקה היתה אמורה להתבצע`,
      icon: "/favicon.svg",
    });
  });

  dueSoon.forEach((item) => {
    new Notification("🔧 תחזוקה קרובה", {
      body: `${item.name} — נדרשת תחזוקה בקרוב`,
      icon: "/favicon.svg",
    });
  });
}
