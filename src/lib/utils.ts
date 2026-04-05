import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format, isAfter, subDays } from "date-fns";
import type { Equipment, Alert, EquipmentStatus } from "@/types";

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

export function computeAlerts(equipment: Equipment[]): Alert[] {
  const alerts: Alert[] = [];

  for (const eq of equipment) {
    if (eq.lastStatus === "issue") {
      alerts.push({
        type: "issue",
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
        equipmentId: eq.id,
        equipmentName: eq.name,
        detail: `${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`,
        daysOverdue,
      });
    } else if (isSterilizationDue(eq)) {
      alerts.push({
        type: "sterilization_due",
        equipmentId: eq.id,
        equipmentName: eq.name,
        detail: "Not sterilized in 7+ days",
      });
    } else if (isInactive(eq)) {
      alerts.push({
        type: "inactive",
        equipmentId: eq.id,
        equipmentName: eq.name,
        detail: "No scan in 14+ days",
      });
    }
  }

  return alerts;
}

export function buildWhatsAppUrl(
  phone: string | undefined,
  equipmentName: string,
  status: EquipmentStatus,
  note?: string
): string {
  const timestamp = format(new Date(), "MMM d, yyyy 'at' h:mm a");
  let message = `🚨 VetTrack Alert\n\nEquipment: *${equipmentName}*\nStatus: *${status.toUpperCase()}*\nTime: ${timestamp}`;
  if (note) {
    message += `\nNote: ${note}`;
  }
  message += `\n\nPlease address this issue immediately.`;
  const encoded = encodeURIComponent(message);
  return phone
    ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encoded}`
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
