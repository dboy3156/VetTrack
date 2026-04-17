import type { Response } from "express";
import { incrementMetric } from "./metrics.js";

export type RealtimeEventType =
  | "TASK_CREATED"
  | "TASK_STARTED"
  | "TASK_COMPLETED"
  | "TASK_UPDATED"
  | "AUTOMATION_TRIGGERED"
  | "NOTIFICATION_SENT";

export type RealtimeEvent = {
  type: RealtimeEventType;
  payload: unknown;
  timestamp: string;
};

const clientsByClinic = new Map<string, Set<Response>>();
const heartbeats = new Map<Response, NodeJS.Timeout>();
const MAX_CLIENTS_PER_CLINIC = 200;

function toSse(event: RealtimeEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function safeWrite(res: Response, chunk: string): boolean {
  try {
    res.write(chunk);
    return true;
  } catch {
    return false;
  }
}

function connectionCount(): number {
  let total = 0;
  for (const set of clientsByClinic.values()) total += set.size;
  return total;
}

function setConnectionMetric(): void {
  incrementMetric("realtime_connections", connectionCount());
}

export function subscribe(clinicId: string, res: Response): void {
  try {
    const normalizedClinicId = clinicId.trim();
    if (!normalizedClinicId) return;
    const current = clientsByClinic.get(normalizedClinicId) ?? new Set<Response>();
    if (current.size >= MAX_CLIENTS_PER_CLINIC) {
      const oldest = current.values().next().value as Response | undefined;
      if (oldest) {
        unsubscribe(oldest);
        try {
          oldest.end();
        } catch {
          // Ignore close errors.
        }
      }
    }
    current.add(res);
    clientsByClinic.set(normalizedClinicId, current);

    safeWrite(res, ": connected\n\n");
    const heartbeat = setInterval(() => {
      safeWrite(res, ": keep-alive\n\n");
    }, 20_000);
    heartbeats.set(res, heartbeat);
    setConnectionMetric();
  } catch {
    // Best-effort realtime channel only.
  }
}

export function unsubscribe(res: Response): void {
  try {
    for (const [clinicId, clients] of clientsByClinic.entries()) {
      if (!clients.delete(res)) continue;
      if (clients.size === 0) clientsByClinic.delete(clinicId);
      break;
    }
    const heartbeat = heartbeats.get(res);
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeats.delete(res);
    }
    setConnectionMetric();
  } catch {
    // Best-effort cleanup.
  }
}

export function broadcast(clinicId: string, event: Omit<RealtimeEvent, "timestamp">): void {
  try {
    const normalizedClinicId = clinicId.trim();
    if (!normalizedClinicId) return;
    const clients = clientsByClinic.get(normalizedClinicId);
    if (!clients || clients.size === 0) return;

    const payload: RealtimeEvent = { ...event, timestamp: new Date().toISOString() };
    const data = toSse(payload);
    const stale: Response[] = [];
    for (const client of clients) {
      if (!safeWrite(client, data)) stale.push(client);
      else incrementMetric("realtime_events_sent");
    }
    for (const dead of stale) unsubscribe(dead);
  } catch {
    // Never throw from broadcast.
  }
}
