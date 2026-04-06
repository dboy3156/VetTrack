import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format, isAfter, subDays } from "date-fns";
import type { Equipment, Alert, AlertType, AlertSeverity, EquipmentStatus } from "@/types";
import { ALERT_SEVERITY } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: string | null | undefined): string {
  if (!date) return "Never";
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return "Unknown";
  }
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return format(new Date(date), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return "—";
  }
}

export function isOverdue(equipment: Equipment): boolean {
  if (!equipment.maintenanceIntervalDays || !equipment.lastMaintenanceDate) {
    return false;
  }
  const dueDate = new Date(equipment.lastMaintenanceDate);
  dueDate.setDate(dueDate.getDate() + equipment.maintenanceIntervalDays);
  return isAfter(new Date(), dueDate);
}

export function isSterilizationDue(equipment: Equipment): boolean {
  if (!equipment.lastSterilizationDate) return false;
  const sevenDaysAgo = subDays(new Date(), 7);
  return isAfter(sevenDaysAgo, new Date(equipment.lastSterilizationDate));
}

export function isInactive(equipment: Equipment): boolean {
  if (!equipment.lastSeen) return true;
  const fourteenDaysAgo = subDays(new Date(), 14);
  return isAfter(fourteenDaysAgo, new Date(equipment.lastSeen));
}

/** Runtime allowlist — only these alert types may ever be emitted. Enforced by the filter below. */
const ALERT_TYPE_ALLOWLIST = new Set<Alert["type"]>(["issue", "overdue", "sterilization_due", "inactive"]);

/**
 * Compute alerts for the given equipment list.
 * ALLOWLIST: only the 4 types in ALERT_TYPE_ALLOWLIST are valid.
 * The else-if chain ensures exactly one alert per piece of equipment (priority: issue > overdue > sterilization_due > inactive).
 * The final filter is a runtime guard — it strips any alert whose type is not in the allowlist,
 * protecting against accidental regressions if this function is modified in future.
 * Do NOT add new alert types here without updating AlertType in @/types, ALERT_SEVERITY, and ALERT_TYPE_ALLOWLIST.
 */
export function computeAlerts(equipment: Equipment[]): Alert[] {
  const alerts: Alert[] = [];

  for (const eq of equipment) {
    if (eq.lastStatus === "issue") {
      alerts.push({
        type: "issue",
        severity: ALERT_SEVERITY["issue"],
        equipmentId: eq.id,
        equipmentName: eq.name,
        detail: "Reported issue not resolved",
      });
    } else if (isOverdue(eq)) {
      const dueDate = new Date(eq.lastMaintenanceDate!);
      dueDate.setDate(dueDate.getDate() + eq.maintenanceIntervalDays!);
      const daysOverdue = Math.ceil(
        (new Date().getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      alerts.push({
        type: "overdue",
        severity: ALERT_SEVERITY["overdue"],
        equipmentId: eq.id,
        equipmentName: eq.name,
        detail: `${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`,
        daysOverdue,
      });
    } else if (isSterilizationDue(eq)) {
      alerts.push({
        type: "sterilization_due",
        severity: ALERT_SEVERITY["sterilization_due"],
        equipmentId: eq.id,
        equipmentName: eq.name,
        detail: "Not sterilized in 7+ days",
      });
    } else if (isInactive(eq)) {
      alerts.push({
        type: "inactive",
        severity: ALERT_SEVERITY["inactive"],
        equipmentId: eq.id,
        equipmentName: eq.name,
        detail: "No scan in 14+ days",
      });
    }
  }

  // Runtime allowlist guard — strips any alert whose type is not in ALERT_TYPE_ALLOWLIST
  return alerts.filter((a) => ALERT_TYPE_ALLOWLIST.has(a.type));
}

/**
 * Normalize a phone number to E.164 format with a leading '+'.
 * Supports Israeli local format (05X...) → +972 5X...
 * and any number already in international format (+972... or +1...).
 * Use this when passing a phone number to Clerk or any auth service.
 *
 * NOTE (Clerk Dashboard): For Israeli SMS OTP to work, Israel (+972) must be
 * enabled in the Clerk Dashboard under Configure → User & Authentication →
 * Phone numbers → SMS sending → Allowed countries. This cannot be changed in code.
 */
export function normalizePhoneE164(phone: string): string {
  const trimmed = phone.trim();
  const stripped = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return "+" + stripped;
  }
  if (stripped.startsWith("972")) {
    return "+" + stripped;
  }
  if (stripped.startsWith("05") && stripped.length >= 9 && stripped.length <= 10) {
    return "+972" + stripped.slice(1);
  }
  return "+" + stripped;
}

/**
 * Normalize a phone number to digits-only format suitable for wa.me URLs.
 * wa.me expects the full number without '+' (e.g. 972501234567).
 * Supports Israeli local format (05X...) → 9725X...
 */
export function normalizePhoneNumber(phone: string): string {
  return normalizePhoneE164(phone).replace(/^\+/, "");
}

export function buildWhatsAppUrl(
  phone: string | undefined,
  equipmentName: string,
  status: EquipmentStatus | string,
  note?: string
): string {
  const timestamp = format(new Date(), "MMM d, yyyy 'at' h:mm a");
  let message = `🚨 VetTrack Alert\n\nEquipment: *${equipmentName}*\nStatus: *${String(status).toUpperCase()}*\nTime: ${timestamp}`;
  if (note) {
    message += `\nNote: ${note}`;
  }
  message += `\n\nPlease address this issue immediately.`;
  const encoded = encodeURIComponent(message);
  return phone
    ? `https://wa.me/${normalizePhoneNumber(phone)}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function generateQrUrl(equipmentId: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://vettrack.app";
  return `${origin}/equipment/${equipmentId}`;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}
