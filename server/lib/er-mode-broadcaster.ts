/**
 * ER mode: outbox row for `/api/realtime` consumers + in-process SSE for
 * `GET /api/er/stream` and `GET /api/er/events`.
 */
import type { AuditDbExecutor } from "./audit.js";
import { insertRealtimeDomainEvent } from "./realtime-outbox.js";
import type { Response } from "express";
import type { ErModeState } from "../../shared/er-types.js";

export const ER_MODE_SSE_EVENT = "ER_MODE_CHANGED" as const;

export async function enqueueErModeChangedOutbox(
  tx: AuditDbExecutor,
  clinicId: string,
  state: ErModeState,
): Promise<void> {
  await insertRealtimeDomainEvent(tx, {
    clinicId,
    type: ER_MODE_SSE_EVENT,
    payload: { clinicId, state },
  });
}

type SseClient = { clinicId: string; res: Response };

const clients = new Set<SseClient>();

/** Call after SSE response headers are written (stream/events handlers). */
export function registerErModeSseClient(clinicId: string, res: Response): () => void {
  const client: SseClient = { clinicId, res };
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

/** Fan-out to connected tabs; pair with {@link setCachedClinicErMode} after durable writes. */
export function broadcastErModeChange(clinicId: string, newState: ErModeState): void {
  const payload = {
    type: ER_MODE_SSE_EVENT,
    clinicId,
    state: newState,
    at: new Date().toISOString(),
  };
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    if (client.clinicId !== clinicId) continue;
    try {
      client.res.write(line);
    } catch {
      clients.delete(client);
    }
  }
}
