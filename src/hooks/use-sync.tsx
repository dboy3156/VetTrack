import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { liveQuery } from "dexie";
import {
  offlineDb,
  updatePendingSync,
  removePendingSync,
  type PendingSync,
} from "@/lib/offline-db";
import { processQueue } from "@/lib/sync-engine";

interface SyncState {
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  justSynced: boolean;
  recentItems: PendingSync[];
  items: PendingSync[];
  triggerSync: () => void;
  retry: (id: number) => Promise<void>;
  discard: (id: number) => Promise<void>;
}

const SyncContext = createContext<SyncState>({
  pendingCount: 0,
  failedCount: 0,
  isSyncing: false,
  justSynced: false,
  recentItems: [],
  items: [],
  triggerSync: () => {},
  retry: async () => {},
  discard: async () => {},
});

export function SyncProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [recentItems, setRecentItems] = useState<PendingSync[]>([]);
  const [items, setItems] = useState<PendingSync[]>([]);
  const prevPendingRef = useRef(0);
  const justSyncedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const applyAll = useCallback((all: PendingSync[]) => {
    const p = all.filter((i) => i.status === "pending").length;
    const f = all.filter((i) => i.status === "failed").length;

    if (prevPendingRef.current > 0 && p === 0 && f === 0) {
      setJustSynced(true);
      if (justSyncedTimerRef.current) clearTimeout(justSyncedTimerRef.current);
      justSyncedTimerRef.current = setTimeout(() => setJustSynced(false), 3000);
    }
    prevPendingRef.current = p;

    setPendingCount(p);
    setFailedCount(f);
    setRecentItems(all.slice(-20));
    setItems(all.filter((i) => i.status === "pending" || i.status === "failed"));
  }, []);

  useEffect(() => {
    const observable = liveQuery(() =>
      offlineDb.pendingSync.orderBy("createdAt").toArray()
    );

    const subscription = observable.subscribe({
      next: (all) => applyAll(all),
      error: () => {},
    });

    return () => subscription.unsubscribe();
  }, [applyAll]);


  const triggerSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await processQueue();
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const retry = useCallback(async (id: number) => {
    await updatePendingSync(id, { status: "pending", retries: 0, errorMessage: undefined });
    processQueue().catch(() => {});
  }, []);

  const discard = useCallback(async (id: number) => {
    await removePendingSync(id);
  }, []);

  useEffect(() => {
    return () => {
      if (justSyncedTimerRef.current) clearTimeout(justSyncedTimerRef.current);
    };
  }, []);

  return (
    <SyncContext.Provider value={{ pendingCount, failedCount, isSyncing, justSynced, recentItems, items, triggerSync, retry, discard }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}

export function useSyncQueue() {
  const { pendingCount, failedCount, items, retry, discard } = useContext(SyncContext);
  return { pendingCount, failedCount, items, retry, discard };
}
