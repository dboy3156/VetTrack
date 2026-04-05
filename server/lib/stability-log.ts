export type LogLevel = "info" | "success" | "warn" | "error";

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: string;
  action: string;
  detail?: string;
  durationMs?: number;
  userId?: string;
}

const MAX_ENTRIES = 1000;
const actionLog: ActionLogEntry[] = [];
let seq = 0;

export function logAction(
  level: LogLevel,
  category: string,
  action: string,
  detail?: string,
  durationMs?: number,
  userId?: string
): ActionLogEntry {
  const entry: ActionLogEntry = {
    id: `log-${Date.now()}-${++seq}`,
    timestamp: new Date().toISOString(),
    level,
    category,
    action,
    detail,
    durationMs,
    userId,
  };
  actionLog.push(entry);
  if (actionLog.length > MAX_ENTRIES) actionLog.splice(0, actionLog.length - MAX_ENTRIES);
  return entry;
}

export function getActionLogs(limit = 200, search?: string): ActionLogEntry[] {
  let entries = [...actionLog].reverse();
  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.detail ?? "").toLowerCase().includes(q)
    );
  }
  return entries.slice(0, limit);
}

export function clearActionLogs(): void {
  actionLog.splice(0, actionLog.length);
}
