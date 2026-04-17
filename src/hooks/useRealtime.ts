import { useEffect } from "react";
import type { RealtimeEvent } from "@/lib/realtime";
import { connectRealtime, disconnectRealtime } from "@/lib/realtime";

export function useRealtime(onEvent: (event: RealtimeEvent) => void) {
  useEffect(() => {
    connectRealtime(onEvent);
    return () => disconnectRealtime();
  }, [onEvent]);
}
