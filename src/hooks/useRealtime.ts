import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { connectRealtime, disconnectRealtime } from "@/lib/realtime";

export function useRealtime(queryClient: QueryClient) {
  useEffect(() => {
    connectRealtime(queryClient);
    return () => disconnectRealtime();
  }, []);
}
