import { useCallback, useEffect, useRef, useState } from "react";
import { readQueue, dequeue, type PendingAction } from "@/lib/offline-queue";

interface UseOfflineSyncOptions {
  // Called once per queued action when connection is restored.
  // Should return a promise that resolves on success.
  onFlush: (action: PendingAction) => Promise<void>;
}

interface OfflineSyncState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
}

export function useOfflineSync({ onFlush }: UseOfflineSyncOptions): OfflineSyncState {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(() => readQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const flush = useCallback(async () => {
    const queue = readQueue();
    if (queue.length === 0) return;
    setIsSyncing(true);
    for (const action of queue) {
      try {
        await onFlushRef.current(action);
        dequeue(action);
      } catch {
        // Leave failed items in the queue to retry next time.
      }
    }
    setPendingCount(readQueue().length);
    setIsSyncing(false);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flush();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Attempt flush on mount in case items were queued in a previous session.
    if (navigator.onLine && readQueue().length > 0) {
      flush();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flush]);

  // Keep pendingCount in sync when it changes from outside.
  useEffect(() => {
    setPendingCount(readQueue().length);
  }, [isOnline]);

  return { isOnline, pendingCount, isSyncing };
}
