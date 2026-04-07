import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getPendingSync,
  updatePendingSync,
  removePendingSync,
  type PendingSync,
} from "./offline-db";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2000, 5000, 10000];
const BURST_LIMIT = 50;
const BURST_DELAY_MS = 500;
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 60_000;

type SyncListener = () => void;
const listeners: Set<SyncListener> = new Set();

export function onSyncStateChange(fn: SyncListener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

let syncing = false;
let queryClientRef: QueryClient | undefined;
let haltQueue = false;

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

let batchCurrent = 0;
let batchTotal = 0;

type AuthStateGetter = () => { isSignedIn: boolean } | null;
let authStateGetter: AuthStateGetter | null = null;

export function setAuthStateRef(getter: AuthStateGetter) {
  authStateGetter = getter;
}

export function clearHaltQueue() {
  haltQueue = false;
}

export function getSyncProgress() {
  return {
    batchCurrent,
    batchTotal,
    isCircuitOpen: Date.now() < circuitOpenUntil,
    circuitResetsAt: circuitOpenUntil,
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function jitteredDelay(base: number): number {
  return Math.round(base * (1 + Math.random() * 0.5));
}

export async function processQueue(): Promise<void> {
  if (syncing || !navigator.onLine) return;

  if (Date.now() < circuitOpenUntil) {
    notifyListeners();
    return;
  }

  if (haltQueue) return;

  if (authStateGetter) {
    const authSnap = authStateGetter();
    if (!authSnap?.isSignedIn) return;
  }

  syncing = true;
  notifyListeners();

  try {
    const allPending = await getPendingSync();
    if (allPending.length === 0) return;

    const burst = allPending.slice(0, BURST_LIMIT);
    const hasMore = allPending.length > BURST_LIMIT;
    batchTotal = burst.length;
    batchCurrent = 0;

    for (const item of burst) {
      if (haltQueue) break;
      if (Date.now() < circuitOpenUntil) break;
      const result = await processSingleItemWithRetry(item);
      if (result === "transient_failure") {
        consecutiveFailures++;
        if (consecutiveFailures >= CIRCUIT_THRESHOLD) {
          circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
          notifyListeners();
          break;
        }
      } else if (result === "success") {
        consecutiveFailures = 0;
      } else if (result === "auth_halt") {
        break;
      }
      batchCurrent++;
      notifyListeners();
    }

    if (hasMore && !haltQueue && Date.now() >= circuitOpenUntil) {
      setTimeout(() => processQueue(), BURST_DELAY_MS);
    }

    if (queryClientRef && !haltQueue) {
      queryClientRef.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClientRef.invalidateQueries({ queryKey: ["/api/equipment/my"] });
      const processedIds = burst
        .map((item) => extractEquipmentId(item.endpoint))
        .filter((id): id is string => !!id);
      const uniqueIds = [...new Set(processedIds)];
      for (const id of uniqueIds) {
        queryClientRef.invalidateQueries({ queryKey: [`/api/equipment/${id}`] });
        queryClientRef.invalidateQueries({ queryKey: [`/api/equipment/${id}/logs`] });
      }
    }
  } finally {
    syncing = false;
    batchCurrent = 0;
    batchTotal = 0;
    notifyListeners();
  }
}

function extractEquipmentId(endpoint: string): string | null {
  const match = endpoint.match(/\/api\/equipment\/([^/]+)/);
  return match ? match[1] : null;
}

type ItemResult = "success" | "conflict" | "auth_halt" | "client_error" | "transient_failure";

async function processSingleItemWithRetry(item: PendingSync): Promise<ItemResult> {
  if (!item.id) return "transient_failure";

  let currentRetries = item.retries || 0;
  let lastResult: ItemResult = "transient_failure";

  while (currentRetries < MAX_RETRIES && navigator.onLine && !haltQueue) {
    const result = await attemptSync(item);
    lastResult = result;

    if (result === "success") {
      await updatePendingSync(item.id, { status: "synced" });
      setTimeout(() => removePendingSync(item.id!), 3000);
      return "success";
    }

    if (result === "conflict" || result === "auth_halt" || result === "client_error") {
      return result;
    }

    currentRetries++;
    await updatePendingSync(item.id, { retries: currentRetries });
    notifyListeners();

    if (currentRetries >= MAX_RETRIES) {
      await updatePendingSync(item.id, {
        status: "failed",
        retries: currentRetries,
        errorMessage: `Failed after ${MAX_RETRIES} attempts`,
      });
      return "transient_failure";
    }

    if (navigator.onLine) {
      const base = RETRY_DELAYS_MS[currentRetries - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      await sleep(jitteredDelay(base));
    } else {
      return "transient_failure";
    }
  }

  return lastResult;
}

async function attemptSync(item: PendingSync): Promise<ItemResult> {
  if (!item.id) return "transient_failure";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(item.authHeaders || {}),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(item.endpoint, {
        method: item.method,
        headers,
        body: item.body || undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (res.ok) {
      return "success";
    }

    if (res.status === 409) {
      const conflictData = await res.json().catch(() => ({}));
      await updatePendingSync(item.id, {
        status: "failed",
        errorMessage: conflictData.error || "Conflict: another change was made to this item",
      });
      notifyConflict(item, conflictData);
      return "conflict";
    }

    if (res.status === 401) {
      haltQueue = true;
      if (queryClientRef) queryClientRef.clear();
      await updatePendingSync(item.id, {
        status: "failed",
        errorMessage: "Auth error — please sign in again",
      });
      return "auth_halt";
    }

    if (res.status >= 400 && res.status < 500) {
      const errData = await res.json().catch(() => ({}));
      await updatePendingSync(item.id, {
        status: "failed",
        errorMessage: errData.error || `Request failed: ${res.status}`,
      });
      return "client_error";
    }

    return "transient_failure";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return "transient_failure";
    }
    return "transient_failure";
  }
}

function notifyConflict(item: PendingSync, conflictData: Record<string, unknown>) {
  const actionName =
    item.type === "checkout"
      ? "checkout"
      : item.type === "return"
      ? "return"
      : item.type === "scan"
      ? "status update"
      : "change";

  const detail = conflictData.conflictInfo
    ? ` (${conflictData.conflictInfo})`
    : "";

  toast.warning(`Sync conflict on ${actionName}${detail}`, {
    description:
      "Another user's action was recorded first. Your action could not be applied — please review the current state.",
    duration: 8000,
  });
}

export function initSyncEngine(queryClient?: QueryClient) {
  queryClientRef = queryClient;

  const handleOnline = () => {
    processQueue();
  };

  window.addEventListener("online", handleOnline);

  if (navigator.onLine) {
    setTimeout(() => processQueue(), 1000);
  }

  return () => {
    window.removeEventListener("online", handleOnline);
  };
}
