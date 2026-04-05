// Alert logic — computed entirely on the frontend from the equipment list.
// No backend endpoint needed: all three alert types derive from fields
// already returned by GET /equipment.

export type AlertType = "overdue" | "issue" | "inactive";

export interface Alert {
  equipmentId: string;
  equipmentName: string;
  type: AlertType;
  detail: string;
}

// Number of days without any scan before an item is considered inactive.
export const INACTIVE_THRESHOLD_DAYS = 14;

interface EquipmentLike {
  id: string;
  name: string;
  lastSeen?: string | Date | null;
  lastStatus?: string | null;
  lastMaintenanceDate?: string | Date | null;
  maintenanceIntervalDays?: number | null;
}

function daysSince(date: string | Date): number {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

export function computeAlerts(equipment: EquipmentLike[]): Alert[] {
  const alerts: Alert[] = [];

  for (const item of equipment) {
    // ── OVERDUE ────────────────────────────────────────────────────────────
    // Triggered when a maintenance interval is configured and either:
    //   a) maintenance has never been performed, or
    //   b) more days have passed since last maintenance than the interval.
    if (item.maintenanceIntervalDays != null && item.maintenanceIntervalDays > 0) {
      if (item.lastMaintenanceDate == null) {
        alerts.push({
          equipmentId: item.id,
          equipmentName: item.name,
          type: "overdue",
          detail: `Maintenance never performed (interval: every ${item.maintenanceIntervalDays} days)`,
        });
      } else {
        const elapsed = Math.floor(daysSince(item.lastMaintenanceDate));
        if (elapsed > item.maintenanceIntervalDays) {
          alerts.push({
            equipmentId: item.id,
            equipmentName: item.name,
            type: "overdue",
            detail: `${elapsed} days since last maintenance (due every ${item.maintenanceIntervalDays} days)`,
          });
        }
      }
    }

    // ── UNRESOLVED ISSUE ───────────────────────────────────────────────────
    // Triggered when the most recent scan status is "issue".
    // Resolved automatically once a scan with "ok" or "maintenance" is recorded.
    if (item.lastStatus === "issue") {
      alerts.push({
        equipmentId: item.id,
        equipmentName: item.name,
        type: "issue",
        detail: "Last scan reported an issue — not yet resolved",
      });
    }

    // ── INACTIVE ───────────────────────────────────────────────────────────
    // Triggered when an item has never been scanned, or hasn't been scanned
    // in more than INACTIVE_THRESHOLD_DAYS days.
    if (item.lastSeen == null) {
      alerts.push({
        equipmentId: item.id,
        equipmentName: item.name,
        type: "inactive",
        detail: "Never scanned",
      });
    } else {
      const days = Math.floor(daysSince(item.lastSeen));
      if (days > INACTIVE_THRESHOLD_DAYS) {
        alerts.push({
          equipmentId: item.id,
          equipmentName: item.name,
          type: "inactive",
          detail: `No scan in ${days} days (threshold: ${INACTIVE_THRESHOLD_DAYS} days)`,
        });
      }
    }
  }

  return alerts;
}

// Helpers used by the equipment list and detail pages.
export function isOverdue(item: EquipmentLike): boolean {
  if (item.maintenanceIntervalDays == null || item.maintenanceIntervalDays <= 0) return false;
  if (item.lastMaintenanceDate == null) return true;
  return Math.floor(daysSince(item.lastMaintenanceDate)) > item.maintenanceIntervalDays;
}

export function daysUntilMaintenance(item: EquipmentLike): number | null {
  if (item.maintenanceIntervalDays == null || item.lastMaintenanceDate == null) return null;
  return item.maintenanceIntervalDays - Math.floor(daysSince(item.lastMaintenanceDate));
}
