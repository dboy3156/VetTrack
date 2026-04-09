import type { Equipment, ScanLog } from "@/types";

const MISSING_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function detectAnomalies(equipment: Equipment[]): Equipment[] {
  return equipment.filter((eq) => {
    const lastSeen = eq.lastSeen ? Date.parse(eq.lastSeen) : 0;
    return (
      !eq.checkedOutById &&
      Date.now() - lastSeen > MISSING_THRESHOLD_MS
    );
  });
}

export function searchEquipment(
  equipment: Equipment[],
  query: string
): Equipment[] {
  const q = query.toLowerCase();
  return equipment.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      (e.location || "").toLowerCase().includes(q) ||
      (e.department || "").toLowerCase().includes(q) ||
      (e.serialNumber || "").toLowerCase().includes(q)
  );
}

export function groupLogsByDate(
  logs: ScanLog[]
): Record<string, ScanLog[]> {
  return logs.reduce(
    (acc, log) => {
      const date = new Date(log.timestamp).toISOString().split("T")[0];
      if (!acc[date]) acc[date] = [];
      acc[date].push(log);
      return acc;
    },
    {} as Record<string, ScanLog[]>
  );
}
