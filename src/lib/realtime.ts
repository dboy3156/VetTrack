import type { QueryClient } from "@tanstack/react-query";
import type { Equipment } from "@/types";
import { getAuthHeaders } from "@/lib/auth-store";

let socket: WebSocket | null = null;
let retryDelay = 1000;
const MAX_RETRY_DELAY = 30000;

export function connectRealtime(queryClient: QueryClient) {
  const headers = getAuthHeaders();
  const token = (headers.Authorization ?? "").split(" ")[1];
  if (!token) return;

  const wsUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (!wsUrl) return;

  socket = new WebSocket(`${wsUrl}?token=${token}`);

  socket.onopen = () => {
    retryDelay = 1000;
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string) as {
        type: string;
        payload: Equipment & { id: string };
      };
      switch (data.type) {
        case "equipment.updated":
          queryClient.setQueryData(
            ["/api/equipment"],
            (old: Equipment[] | undefined) =>
              old?.map((e) => (e.id === data.payload.id ? data.payload : e))
          );
          break;
        case "equipment.created":
          queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
          break;
        case "equipment.deleted":
          queryClient.setQueryData(
            ["/api/equipment"],
            (old: Equipment[] | undefined) =>
              old?.filter((e) => e.id !== data.payload.id)
          );
          break;
      }
    } catch {
      // ignore malformed messages
    }
  };

  socket.onclose = () => {
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
    setTimeout(() => connectRealtime(queryClient), retryDelay);
  };
}

export function disconnectRealtime() {
  socket?.close();
  socket = null;
}
