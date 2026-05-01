import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { applyEvent, forceResyncWardErCaches, resetRealtimeCaches } from "@/lib/event-reducer";
import type { RealtimeEvent } from "@/types/realtime-events";
import { SUPPORTED_REALTIME_EVENT_SCHEMA_VERSION } from "../../shared/realtime-schema-version";

export type { RealtimeEventType, RealtimeEvent } from "@/types/realtime-events";

const LAST_OUTBOX_STORAGE_KEY = "vt_realtime_last_outbox_id";
const BC_CHANNEL = "vt_realtime_outbox_cursor";

let source: EventSource | null = null;
let broadcastChannel: BroadcastChannel | null = null;

/** Shared SSE connection: multiple {@link EventIngestor}s (ER + ward display, etc.) receive the same stream. */
const ingestors = new Set<EventIngestor>();
const legacyHandlers = new Set<(event: RealtimeEvent) => void>();
let streamSubscriptions = 0;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(BC_CHANNEL);
  }
  return broadcastChannel;
}

function readStoredLastOutboxId(): number | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LAST_OUTBOX_STORAGE_KEY);
    if (raw == null || raw === "") return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function writeStoredLastOutboxId(id: number): void {
  try {
    localStorage.setItem(LAST_OUTBOX_STORAGE_KEY, String(id));
    getBroadcastChannel()?.postMessage({ kind: "cursor", id });
  } catch {
    // ignore quota / private mode
  }
}

function clearStoredLastOutboxId(): void {
  try {
    localStorage.removeItem(LAST_OUTBOX_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function reportRealtimeTelemetry(body: { duplicateDrop?: boolean; gapResync?: boolean }): void {
  void api.realtime.telemetry(body).catch(() => {});
}

function resolveOutboxId(ev: RealtimeEvent): number | undefined {
  if (typeof ev.id === "number" && Number.isFinite(ev.id)) return ev.id;
  if (typeof ev.outboxId === "number" && Number.isFinite(ev.outboxId)) return ev.outboxId;
  return undefined;
}

function resolveEventVersion(ev: RealtimeEvent): number {
  if (typeof ev.eventVersion === "number" && Number.isFinite(ev.eventVersion)) {
    return ev.eventVersion;
  }
  return 1;
}

/** Highest `vt_event_outbox.id` in an HTTP replay batch (SSE uses separate path). */
function maxOutboxIdFromReplayBatch(events: readonly RealtimeEvent[]): number | null {
  let max: number | undefined;
  for (const ev of events) {
    const oid = resolveOutboxId(ev);
    if (oid !== undefined && (max === undefined || oid > max)) max = oid;
  }
  return max ?? null;
}

/** Maps `GET /api/realtime/replay` rows to the same shape as SSE payloads for {@link applyReplayBatch}. */
export function mapReplayApiRowToRealtimeEvent(row: {
  id: number;
  type: string;
  payload: unknown;
  timestamp: string;
  outboxId: number;
  eventVersion: number;
}): RealtimeEvent {
  const oid = Number(row.outboxId ?? row.id);
  return {
    type: row.type as RealtimeEvent["type"],
    payload: row.payload,
    timestamp: row.timestamp,
    id: oid,
    outboxId: oid,
    eventVersion: row.eventVersion,
  };
}

/**
 * Ordering + idempotency for outbox-backed SSE. Broadcast-only events (no `id`) skip sequence checks.
 */
export class EventIngestor {
  private lastAppliedEventId: number | null;

  /**
   * While HTTP replay is applied, live SSE may still deliver the same ids; drop those until replay
   * finishes (see {@link applyReplayBatch}). Cleared when replay completes.
   */
  private replaySuppressionMaxId: number | null = null;

  private gapRecoveryInFlight: Promise<void> | null = null;

  private peerRecoveryInFlight: Promise<void> | null = null;

  private readonly boundStorage: (e: StorageEvent) => void;

  private readonly boundBc: (ev: MessageEvent) => void;

  constructor(
    private readonly queryClient: QueryClient,
    seedLastId: number | null = readStoredLastOutboxId(),
  ) {
    this.lastAppliedEventId = seedLastId;
    this.boundStorage = (e: StorageEvent) => this.onPeerStorage(e);
    this.boundBc = (ev: MessageEvent) => this.onBroadcast(ev);
    if (typeof window !== "undefined") {
      window.addEventListener("storage", this.boundStorage);
      getBroadcastChannel()?.addEventListener("message", this.boundBc);
    }
  }

  dispose(): void {
    try {
      window.removeEventListener("storage", this.boundStorage);
      getBroadcastChannel()?.removeEventListener("message", this.boundBc);
    } catch {
      // ignore
    }
  }

  getLastAppliedEventId(): number | null {
    return this.lastAppliedEventId;
  }

  private onPeerStorage(ev: StorageEvent): void {
    if (ev.key !== LAST_OUTBOX_STORAGE_KEY || ev.newValue == null) return;
    const n = Number.parseInt(ev.newValue, 10);
    if (!Number.isFinite(n)) return;
    void this.handlePeerAhead(n);
  }

  private onBroadcast(ev: MessageEvent): void {
    const data = ev.data as { kind?: unknown; id?: unknown };
    if (data?.kind !== "cursor") return;
    const id = typeof data.id === "number" && Number.isFinite(data.id) ? data.id : undefined;
    if (id === undefined) return;
    void this.handlePeerAhead(id);
  }

  /** Another tab advanced the cursor — catch up without applying skipped ids locally. */
  private async handlePeerAhead(peerCursor: number): Promise<void> {
    if (this.lastAppliedEventId !== null && peerCursor <= this.lastAppliedEventId) return;
    if (this.peerRecoveryInFlight) {
      await this.peerRecoveryInFlight;
      return;
    }

    this.peerRecoveryInFlight = (async () => {
      await this.establishBaselineAfterFullRefresh();
    })().finally(() => {
      this.peerRecoveryInFlight = null;
    });

    await this.peerRecoveryInFlight;
  }

  private async establishBaselineAfterFullRefresh(): Promise<void> {
    await forceResyncWardErCaches(this.queryClient);
    try {
      const head = await api.realtime.outboxHead();
      const id = Number(head.maxPublishedId);
      if (!Number.isFinite(id) || id < 0) return;
      this.lastAppliedEventId = id;
      writeStoredLastOutboxId(id);
    } catch {
      // Keep prior cursor if head fetch fails.
    }
  }

  /** Gap detection + idempotent apply; coordinates cache updates via {@link applyEvent}. */
  ingest(ev: RealtimeEvent): void {
    if (ev.type === "RESET_STATE") {
      void this.handleResetState();
      return;
    }

    const oid = resolveOutboxId(ev);
    if (oid === undefined) {
      void applyEvent(this.queryClient, ev);
      return;
    }

    const evVersion = resolveEventVersion(ev);
    if (evVersion > SUPPORTED_REALTIME_EVENT_SCHEMA_VERSION) {
      console.warn("[realtime] event schema newer than client; forcing full resync", {
        type: ev.type,
        eventVersion: evVersion,
        supported: SUPPORTED_REALTIME_EVENT_SCHEMA_VERSION,
      });
      void this.establishBaselineAfterFullRefresh();
      return;
    }

    if (
      this.replaySuppressionMaxId !== null &&
      oid <= this.replaySuppressionMaxId
    ) {
      return;
    }

    if (this.lastAppliedEventId !== null) {
      if (oid <= this.lastAppliedEventId) {
        reportRealtimeTelemetry({ duplicateDrop: true });
        return;
      }
      if (oid !== this.lastAppliedEventId + 1) {
        if (!this.gapRecoveryInFlight) {
          this.gapRecoveryInFlight = (async () => {
            try {
              reportRealtimeTelemetry({ gapResync: true });
              await this.establishBaselineAfterFullRefresh();
            } finally {
              this.gapRecoveryInFlight = null;
            }
          })();
        }
        return;
      }
    }

    this.lastAppliedEventId = oid;
    writeStoredLastOutboxId(oid);
    void applyEvent(this.queryClient, ev);
  }

  /**
   * Apply events from `GET /api/realtime/replay` in order. Sets a suppression watermark so
   * concurrent SSE duplicates (id ≤ max replay id) are ignored in {@link ingest} without telemetry noise.
   */
  async applyReplayBatch(events: readonly RealtimeEvent[]): Promise<void> {
    const maxFromBatch = maxOutboxIdFromReplayBatch(events);
    if (maxFromBatch !== null) {
      this.replaySuppressionMaxId = maxFromBatch;
    }
    try {
      for (const ev of events) {
        if (ev.type === "RESET_STATE") {
          await this.handleResetState();
          continue;
        }

        const oid = resolveOutboxId(ev);
        if (oid === undefined) {
          await applyEvent(this.queryClient, ev);
          continue;
        }

        const evVersion = resolveEventVersion(ev);
        if (evVersion > SUPPORTED_REALTIME_EVENT_SCHEMA_VERSION) {
          console.warn("[realtime] replay batch event schema newer than client; forcing full resync", {
            type: ev.type,
            eventVersion: evVersion,
            supported: SUPPORTED_REALTIME_EVENT_SCHEMA_VERSION,
          });
          await this.establishBaselineAfterFullRefresh();
          return;
        }

        this.lastAppliedEventId = oid;
        writeStoredLastOutboxId(oid);
        await applyEvent(this.queryClient, ev);
      }
    } finally {
      this.replaySuppressionMaxId = null;
    }
  }

  /**
   * Fetches every replay page after `fromId` while the server reports `hasMore` (1000 events per page).
   * Skips when there is no stored cursor — initial loads rely on SSE + snapshot queries instead of full history.
   */
  async replayHttpCatchUpAfter(fromId: number | null): Promise<void> {
    if (fromId === null) return;
    if (!Number.isFinite(fromId) || fromId < 0) return;

    let cursor = fromId;
    for (;;) {
      const page = await api.realtime.replay(cursor);
      const events = page.events.map(mapReplayApiRowToRealtimeEvent);
      if (events.length > 0) {
        await this.applyReplayBatch(events);
        const maxId = maxOutboxIdFromReplayBatch(events);
        if (maxId !== null) cursor = maxId;
      }
      if (!page.hasMore) break;
      if (page.events.length === 0) break;
    }
  }

  private async handleResetState(): Promise<void> {
    clearStoredLastOutboxId();
    this.lastAppliedEventId = null;
    await resetRealtimeCaches(this.queryClient);
    try {
      const head = await api.realtime.outboxHead();
      const id = Number(head.maxPublishedId);
      if (!Number.isFinite(id) || id < 0) return;
      this.lastAppliedEventId = id;
      writeStoredLastOutboxId(id);
    } catch {
      // Cursor stays cleared if head fetch fails.
    }
  }
}

function attachSharedStream(): void {
  if (source) return;

  source = new EventSource("/api/realtime/stream");
  source.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as RealtimeEvent;
      for (const ing of ingestors) {
        ing.ingest(parsed);
      }
      for (const h of legacyHandlers) {
        h(parsed);
      }
    } catch {
      // Ignore malformed payloads to keep stream alive.
    }
  };
  source.onerror = () => {
    // Browser EventSource handles reconnect automatically.
  };
  source.addEventListener("CONNECTION_EVICTED", () => {
    source?.close();
    source = null;
    toast.info("Reconnecting real-time updates...");
    setTimeout(() => {
      if (streamSubscriptions <= 0) return;
      attachSharedStream();
    }, 2000);
  });
}

export function connectRealtime(
  onEvent: (event: RealtimeEvent) => void,
  options?: { queryClient?: QueryClient; ingestor?: EventIngestor },
): void {
  try {
    if (typeof window === "undefined") return;

    if (!options?.ingestor) {
      legacyHandlers.add(onEvent);
    }
    if (options?.ingestor) {
      ingestors.add(options.ingestor);
    }

    streamSubscriptions += 1;

    attachSharedStream();
  } catch {
    // Realtime is best-effort only.
  }
}

export function disconnectRealtime(options?: {
  ingestor?: EventIngestor;
  legacy?: (event: RealtimeEvent) => void;
}): void {
  try {
    if (options?.ingestor) {
      ingestors.delete(options.ingestor);
    }
    if (options?.legacy) {
      legacyHandlers.delete(options.legacy);
    }
    streamSubscriptions = Math.max(0, streamSubscriptions - 1);
    if (streamSubscriptions <= 0) {
      streamSubscriptions = 0;
      ingestors.clear();
      legacyHandlers.clear();
      source?.close();
      source = null;
    }
  } catch {
    // Ignore close errors.
  }
}
