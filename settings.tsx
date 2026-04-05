// Offline queue — persists pending scan actions in localStorage.
// When the device goes offline during a scan, the action is queued
// instead of silently failing. On reconnect, the queue is flushed
// automatically by the useOfflineSync hook.

const STORAGE_KEY = "eq-pending-scans";

export interface PendingAction {
  equipmentId: string;
  status: string;
  note?: string;
  queuedAt: number;
}

export function readQueue(): PendingAction[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function enqueue(action: PendingAction): void {
  const q = readQueue();
  q.push(action);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
}

export function dequeue(action: PendingAction): void {
  const q = readQueue().filter(
    (a) => !(a.equipmentId === action.equipmentId && a.queuedAt === action.queuedAt)
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
}

export function clearQueue(): void {
  localStorage.removeItem(STORAGE_KEY);
}
