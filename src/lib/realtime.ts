import { toast } from "sonner";

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

let source: EventSource | null = null;

export function connectRealtime(onEvent: (event: RealtimeEvent) => void): void {
  try {
    if (typeof window === "undefined") return;
    if (source) return;

    source = new EventSource("/api/realtime");
    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as RealtimeEvent;
        onEvent(parsed);
      } catch {
        // Ignore malformed payloads to keep stream alive.
      }
    };
    source.onerror = () => {
      // Browser EventSource handles reconnect automatically.
    };
    source.addEventListener('CONNECTION_EVICTED', () => {
      source?.close();
      source = null;
      toast.info("Reconnecting real-time updates...");
      setTimeout(() => connectRealtime(onEvent), 2000);
    });
  } catch {
    // Realtime is best-effort only.
  }
}

export function disconnectRealtime(): void {
  try {
    source?.close();
    source = null;
  } catch {
    // Ignore close errors.
  }
}
