import {
  safeStorageGetItem,
  safeStorageRemoveItem,
  safeStorageSetItem,
} from "@/lib/safe-browser";

const KEY = "vt_leader";
const TTL = 8000; // 8 seconds

function tabId(): string {
  let id = safeStorageGetItem("vt_tab_id", "session");
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    safeStorageSetItem("vt_tab_id", id, "session");
  }
  return id;
}

type Lease = { id: string; t: number };

function parseLease(raw: string | null): Lease | null {
  if (!raw) return null;
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && raw.trim() === String(asNum)) {
    return { id: "", t: asNum };
  }
  try {
    const o = JSON.parse(raw) as Lease;
    if (o && typeof o.t === "number" && typeof o.id === "string") return o;
  } catch {
    return null;
  }
  return null;
}

/**
 * Single-tab lease in localStorage. Only the tab whose id matches the lease may poll;
 * others stay passive until TTL expiry or release on unload.
 */
export function isLeader(): boolean {
  const now = Date.now();
  const me = tabId();
  const lease = parseLease(safeStorageGetItem(KEY));

  if (!lease) {
    safeStorageSetItem(KEY, JSON.stringify({ id: me, t: now }));
    return true;
  }

  // Legacy value was a plain timestamp — unknown owner; wait for expiry before competing
  if (!lease.id) {
    if (now - lease.t > TTL) {
      safeStorageSetItem(KEY, JSON.stringify({ id: me, t: now }));
      return true;
    }
    return false;
  }

  if (now - lease.t > TTL) {
    safeStorageSetItem(KEY, JSON.stringify({ id: me, t: now }));
    return true;
  }

  if (lease.id === me) {
    safeStorageSetItem(KEY, JSON.stringify({ id: me, t: now }));
    return true;
  }

  return false;
}

let heartbeatStarted = false;

export function startLeaderHeartbeat() {
  if (heartbeatStarted) return;
  heartbeatStarted = true;

  isLeader();

  setInterval(() => {
    isLeader();
  }, 3000);

  window.addEventListener("beforeunload", () => {
    try {
      const lease = parseLease(safeStorageGetItem(KEY));
      if (lease?.id && lease.id === tabId()) {
        safeStorageRemoveItem(KEY);
      }
    } catch {
      /* ignore */
    }
  });
}

/** React Query refetchInterval: poll only when visible and this tab holds the leader lease. */
export function leaderPoll(ms: number): () => number | false {
  return () => {
    if (document.hidden) return false;
    if (!isLeader()) return false;
    return ms;
  };
}
