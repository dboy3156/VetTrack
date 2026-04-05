import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { getPendingCount, getFailedCount, getAllPendingSync, type PendingSync } from "@/lib/offline-db";
import { onSyncStateChange, processQueue } from "@/lib/sync-engine";

interface SyncState {
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  justSynced: boolean;
  recentItems: PendingSync[];
  triggerSync: () => void;
}

const SyncContext = createContext<SyncState>({
  pendingCount: 0,
  failedCount: 0,
  isSyncing: false,
  justSynced: false,
  recentItems: [],
  triggerSync: () => {},
});

export function SyncProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [recentItems, setRecentItems] = useState<PendingSync[]>([]);
  const prevPendingRef = useRef(0);
  const justSyncedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [p, f, all] = await Promise.all([
      getPendingCount(),
      getFailedCount(),
      getAllPendingSync(),
    ]);

    if (prevPendingRef.current > 0 && p === 0 && f === 0) {
      setJustSynced(true);
      if (justSyncedTimerRef.current) clearTimeout(justSyncedTimerRef.current);
      justSyncedTimerRef.current = setTimeout(() => setJustSynced(false), 3000);
    }
    prevPendingRef.current = p;

    setPendingCount(p);
    setFailedCount(f);
    setRecentItems(all.slice(-20));
  }, []);

  const triggerSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await processQueue();
    } finally {
      setIsSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    const unsubscribe = onSyncStateChange(refresh);
    const interval = setInterval(refresh, 2000);
    return () => {
      unsubscribe();
      clearInterval(interval);
      if (justSyncedTimerRef.current) clearTimeout(justSyncedTimerRef.current);
    };
  }, [refresh]);

  return (
    <SyncContext.Provider value={{ pendingCount, failedCount, isSyncing, justSynced, recentItems, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
