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

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function processQueue(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  syncing = true;

  try {
    const queue = await getPendingSync();
    if (queue.length === 0) {
      syncing = false;
      return;
    }

    for (const item of queue) {
      await processSingleItemWithRetry(item);
      notifyListeners();
    }

    if (queryClientRef) {
      queryClientRef.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClientRef.invalidateQueries({ queryKey: ["/api/equipment/my"] });
      const processedIds = queue
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
    notifyListeners();
  }
}

function extractEquipmentId(endpoint: string): string | null {
  const match = endpoint.match(/\/api\/equipment\/([^/]+)/);
  return match ? match[1] : null;
}

async function processSingleItemWithRetry(item: PendingSync): Promise<void> {
  if (!item.id) return;

  let currentRetries = item.retries || 0;

  while (currentRetries < MAX_RETRIES && navigator.onLine) {
    const result = await attemptSync(item);

    if (result === "success") {
      await updatePendingSync(item.id, { status: "synced" });
      setTimeout(() => removePendingSync(item.id!), 3000);
      return;
    } else if (result === "conflict" || result === "auth_failure" || result === "client_error") {
      return;
    } else {
      currentRetries++;
      await updatePendingSync(item.id, { retries: currentRetries });
      notifyListeners();

      if (currentRetries >= MAX_RETRIES) {
        await updatePendingSync(item.id, {
          status: "failed",
          retries: currentRetries,
          errorMessage: `Failed after ${MAX_RETRIES} attempts`,
        });
        return;
      }

      if (navigator.onLine) {
        const delay = RETRY_DELAYS_MS[currentRetries - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        await sleep(delay);
      } else {
        return;
      }
    }
  }
}

type AttemptResult = "success" | "conflict" | "auth_failure" | "client_error" | "transient_failure";

async function attemptSync(item: PendingSync): Promise<AttemptResult> {
  if (!item.id) return "transient_failure";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(item.authHeaders || {}),
  };

  try {
    const res = await fetch(item.endpoint, {
      method: item.method,
      headers,
      body: item.body || undefined,
    });

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
      await updatePendingSync(item.id, {
        status: "failed",
        errorMessage: "Auth error — please reload the app and try again",
      });
      return "auth_failure";
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
  } catch (_err) {
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
      "Another user's action was recorded first (last-write-wins). Your action could not be applied — please review the current state.",
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
