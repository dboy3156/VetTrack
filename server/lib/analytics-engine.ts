import { format, subDays } from "date-fns";

export interface ScanLogRow {
  timestamp: Date | string;
  status?: string;
  equipmentId?: string;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export function computeUsageTrends(scans: ScanLogRow[]): TrendPoint[] {
  const now = new Date();
  const scanMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const date = format(subDays(now, 29 - i), "yyyy-MM-dd");
    scanMap.set(date, 0);
  }
  for (const scan of scans) {
    const date = format(new Date(scan.timestamp), "yyyy-MM-dd");
    if (scanMap.has(date)) {
      scanMap.set(date, scanMap.get(date)! + 1);
    }
  }
  return Array.from(scanMap.entries()).map(([date, count]) => ({ date, count }));
}
