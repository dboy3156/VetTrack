import type {
  Equipment,
  CreateEquipmentRequest,
  UpdateEquipmentRequest,
  ScanEquipmentRequest,
  ScanLog,
  TransferLog,
  Folder,
  ActivityFeedItem,
  AnalyticsSummary,
  BulkDeleteRequest,
  BulkMoveRequest,
  BulkResult,
  User,
  UploadUrlRequest,
  UploadUrlResponse,
  AlertAcknowledgment,
} from "@/types";
import type { PendingSyncType } from "./offline-db";
import {
  addPendingSync,
  getCachedEquipment,
  getCachedEquipmentById,
  getCachedScanLogs,
  getCachedFolders,
  cacheEquipment,
  cacheScanLogs,
  cacheFolders,
  updateCachedEquipment,
} from "./offline-db";
import {
  getAuthHeaders,
  getCurrentUserId,
  getCurrentUserEmail,
} from "./auth-store";

const BASE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
};

function buildHeaders(): Record<string, string> {
  return { ...BASE_HEADERS, ...getAuthHeaders() };
}

interface OfflineOptions {
  offlineType: PendingSyncType;
  offlineEquipmentId?: string;
  optimisticResult?: unknown;
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (!navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof Error && err.message.includes("Failed to fetch")) return true;
  return false;
}

async function request<T>(
  url: string,
  init: RequestInit = {},
  offline?: OfflineOptions
): Promise<T> {
  const headers = { ...buildHeaders(), ...(init.headers as Record<string, string> | undefined) };

  try {
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err) {
    if (isNetworkError(err) && offline) {
      const clientTimestamp = Date.now();
      await addPendingSync({
        type: offline.offlineType,
        endpoint: url,
        method: (init.method as string) || "GET",
        body: (init.body as string) || "",
        authHeaders: getAuthHeaders(),
        createdAt: new Date(),
        retries: 0,
        status: "pending",
        clientTimestamp,
        optimisticData: offline.optimisticResult
          ? JSON.stringify(offline.optimisticResult)
          : undefined,
      });

      if (offline.optimisticResult !== undefined) {
        return offline.optimisticResult as T;
      }

      if (offline.offlineEquipmentId) {
        const cached = await getCachedEquipmentById(offline.offlineEquipmentId);
        if (cached) return cached as unknown as T;
      }

      throw new Error("Action queued for sync when back online");
    }
    throw err;
  }
}

async function requestWithOfflineFallback<T>(
  url: string,
  fallback: () => Promise<T>,
  init: RequestInit = {}
): Promise<T> {
  const headers = { ...buildHeaders(), ...(init.headers as Record<string, string> | undefined) };
  try {
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (!navigator.onLine) {
      return fallback();
    }
    throw err;
  }
}

export const api = {
  equipment: {
    list: async () => {
      try {
        const items = await request<Equipment[]>("/api/equipment");
        cacheEquipment(items).catch(() => {});
        return items;
      } catch (err) {
        if (!navigator.onLine) {
          return getCachedEquipment();
        }
        throw err;
      }
    },
    listMy: async () => {
      try {
        const items = await request<Equipment[]>("/api/equipment/my");
        return items;
      } catch (err) {
        if (!navigator.onLine) {
          const all = await getCachedEquipment();
          const userId = getCurrentUserId();
          if (userId) return all.filter((e) => e.checkedOutById === userId);
          return all.filter((e) => !!e.checkedOutById);
        }
        throw err;
      }
    },
    get: async (id: string) => {
      try {
        const item = await request<Equipment>(`/api/equipment/${id}`);
        updateCachedEquipment(id, item).catch(() => {});
        return item;
      } catch (err) {
        if (!navigator.onLine) {
          const cached = await getCachedEquipmentById(id);
          if (cached) return cached;
        }
        throw err;
      }
    },
    create: (data: CreateEquipmentRequest, signal?: AbortSignal) =>
      request<Equipment>(
        "/api/equipment",
        { method: "POST", body: JSON.stringify(data), signal },
        { offlineType: "create" }
      ),
    update: (id: string, data: UpdateEquipmentRequest) =>
      request<Equipment>(
        `/api/equipment/${id}`,
        { method: "PATCH", body: JSON.stringify(data) },
        { offlineType: "update", offlineEquipmentId: id, optimisticResult: data }
      ),
    delete: (id: string) =>
      request<void>(
        `/api/equipment/${id}`,
        { method: "DELETE" },
        { offlineType: "delete" }
      ),
    scan: async (id: string, data: ScanEquipmentRequest) => {
      const cached = await getCachedEquipmentById(id);
      const now = new Date().toISOString();
      const clientTimestamp = Date.now();

      const optimisticEquipment: Partial<Equipment> = {
        status: data.status,
        lastSeen: now,
        lastStatus: data.status,
        ...(data.status === "maintenance" && { lastMaintenanceDate: now }),
        ...(data.status === "sterilized" && { lastSterilizationDate: now }),
      };

      const optimisticScanLog: ScanLog = {
        id: `pending-${clientTimestamp}`,
        equipmentId: id,
        userId: data.userId || getCurrentUserId(),
        userEmail: data.userEmail || getCurrentUserEmail(),
        status: data.status,
        note: data.note || null,
        photoUrl: data.photoUrl || null,
        timestamp: now,
      };

      const optimistic = {
        equipment: { ...(cached || {}), ...optimisticEquipment, id } as Equipment,
        scanLog: optimisticScanLog,
        undoToken: undefined as string | undefined,
        pendingSyncId: undefined as number | undefined,
      };

      try {
        const result = await request<{ equipment: Equipment; scanLog: ScanLog; undoToken: string }>(
          `/api/equipment/${id}/scan`,
          {
            method: "POST",
            body: JSON.stringify(data),
            headers: { "X-Client-Timestamp": String(clientTimestamp) },
          }
        );
        updateCachedEquipment(id, result.equipment).catch(() => {});
        cacheScanLogs(id, [result.scanLog]).catch(() => {});
        return { ...result, pendingSyncId: undefined as number | undefined };
      } catch (err) {
        if (isNetworkError(err)) {
          const pendingSyncId = await addPendingSync({
            type: "scan",
            endpoint: `/api/equipment/${id}/scan`,
            method: "POST",
            body: JSON.stringify(data),
            authHeaders: { ...getAuthHeaders(), "X-Client-Timestamp": String(clientTimestamp) },
            createdAt: new Date(),
            retries: 0,
            status: "pending",
            clientTimestamp,
            optimisticData: JSON.stringify(optimistic),
          });
          await updateCachedEquipment(id, optimisticEquipment);
          cacheScanLogs(id, [optimisticScanLog]).catch(() => {});
          return { ...optimistic, pendingSyncId: pendingSyncId as number };
        }
        throw err;
      }
    },
    checkout: async (id: string, location?: string) => {
      const cached = await getCachedEquipmentById(id);
      const now = new Date().toISOString();
      const clientTimestamp = Date.now();
      const userId = getCurrentUserId();
      const userEmail = getCurrentUserEmail();

      const optimisticEquipment: Partial<Equipment> = {
        checkedOutById: userId,
        checkedOutByEmail: userEmail,
        checkedOutAt: now,
        checkedOutLocation: location || null,
      };

      try {
        const result = await request<{ equipment: Equipment; undoToken: string }>(
          `/api/equipment/${id}/checkout`,
          {
            method: "POST",
            body: JSON.stringify({ location }),
            headers: { "X-Client-Timestamp": String(clientTimestamp) },
          }
        );
        updateCachedEquipment(id, result.equipment).catch(() => {});
        return { ...result, pendingSyncId: undefined as number | undefined };
      } catch (err) {
        if (isNetworkError(err)) {
          const pendingSyncId = await addPendingSync({
            type: "checkout",
            endpoint: `/api/equipment/${id}/checkout`,
            method: "POST",
            body: JSON.stringify({ location }),
            authHeaders: { ...getAuthHeaders(), "X-Client-Timestamp": String(clientTimestamp) },
            createdAt: new Date(),
            retries: 0,
            status: "pending",
            clientTimestamp,
            optimisticData: JSON.stringify(optimisticEquipment),
          });
          const updated = { ...(cached || {}), ...optimisticEquipment, id } as Equipment;
          await updateCachedEquipment(id, optimisticEquipment);
          return { equipment: updated, undoToken: undefined as unknown as string, pendingSyncId: pendingSyncId as number };
        }
        throw err;
      }
    },
    return: async (id: string) => {
      const cached = await getCachedEquipmentById(id);
      const now = new Date().toISOString();
      const clientTimestamp = Date.now();

      const optimisticEquipment: Partial<Equipment> = {
        checkedOutById: null,
        checkedOutByEmail: null,
        checkedOutAt: null,
        checkedOutLocation: null,
        status: "ok",
        lastSeen: now,
        lastStatus: "ok",
      };

      try {
        const result = await request<{ equipment: Equipment; undoToken: string }>(
          `/api/equipment/${id}/return`,
          {
            method: "POST",
            body: JSON.stringify({}),
            headers: { "X-Client-Timestamp": String(clientTimestamp) },
          }
        );
        updateCachedEquipment(id, result.equipment).catch(() => {});
        return { ...result, pendingSyncId: undefined as number | undefined };
      } catch (err) {
        if (isNetworkError(err)) {
          const pendingSyncId = await addPendingSync({
            type: "return",
            endpoint: `/api/equipment/${id}/return`,
            method: "POST",
            body: JSON.stringify({}),
            authHeaders: { ...getAuthHeaders(), "X-Client-Timestamp": String(clientTimestamp) },
            createdAt: new Date(),
            retries: 0,
            status: "pending",
            clientTimestamp,
            optimisticData: JSON.stringify(optimisticEquipment),
          });
          const updated = { ...(cached || {}), ...optimisticEquipment, id } as Equipment;
          await updateCachedEquipment(id, optimisticEquipment);
          return { equipment: updated, undoToken: undefined as unknown as string, pendingSyncId: pendingSyncId as number };
        }
        throw err;
      }
    },
    bulkDelete: (data: BulkDeleteRequest) =>
      request<BulkResult>(
        "/api/equipment/bulk-delete",
        { method: "POST", body: JSON.stringify(data) }
      ),
    bulkMove: (data: BulkMoveRequest) =>
      request<BulkResult>("/api/equipment/bulk-move", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    revert: (id: string, undoToken: string) =>
      request<Equipment>(`/api/equipment/${id}/revert`, {
        method: "POST",
        body: JSON.stringify({ undoToken }),
      }),
    logs: async (id: string) => {
      try {
        const logs = await request<ScanLog[]>(`/api/equipment/${id}/logs`);
        cacheScanLogs(id, logs).catch(() => {});
        return logs;
      } catch (err) {
        if (!navigator.onLine) {
          return getCachedScanLogs(id);
        }
        throw err;
      }
    },
    transfers: (id: string) =>
      requestWithOfflineFallback<TransferLog[]>(
        `/api/equipment/${id}/transfers`,
        () => Promise.resolve([])
      ),
  },
  folders: {
    list: async () => {
      try {
        const items = await request<Folder[]>("/api/folders");
        cacheFolders(items).catch(() => {});
        return items;
      } catch (err) {
        if (!navigator.onLine) {
          return getCachedFolders();
        }
        throw err;
      }
    },
    create: (name: string) =>
      request<Folder>(
        "/api/folders",
        { method: "POST", body: JSON.stringify({ name }) }
      ),
    update: (id: string, name: string) =>
      request<Folder>(
        `/api/folders/${id}`,
        { method: "PATCH", body: JSON.stringify({ name }) }
      ),
    delete: (id: string) =>
      request<void>(`/api/folders/${id}`, { method: "DELETE" }),
  },
  activity: {
    feed: (cursor?: string) =>
      requestWithOfflineFallback<{ items: ActivityFeedItem[]; nextCursor: string | null }>(
        cursor ? `/api/activity?cursor=${cursor}` : "/api/activity",
        () => Promise.resolve({ items: [], nextCursor: null })
      ),
  },
  analytics: {
    summary: () => request<AnalyticsSummary>("/api/analytics"),
  },
  users: {
    list: () => request<User[]>("/api/users"),
    updateRole: (id: string, role: "admin" | "technician") =>
      request<User>(
        `/api/users/${id}/role`,
        { method: "PATCH", body: JSON.stringify({ role }) }
      ),
    me: () => request<User>("/api/users/me"),
  },
  storage: {
    requestUploadUrl: (data: UploadUrlRequest) =>
      request<UploadUrlResponse>(
        "/api/storage/upload-url",
        { method: "POST", body: JSON.stringify(data) }
      ),
  },
  whatsapp: {
    sendAlert: (data: {
      equipmentId: string;
      status: string;
      note?: string;
      phone?: string;
    }) =>
      request<{ success: boolean; waUrl: string }>(
        "/api/whatsapp/alert",
        { method: "POST", body: JSON.stringify(data) }
      ),
  },
  alertAcks: {
    list: () => request<AlertAcknowledgment[]>("/api/alert-acks"),
    acknowledge: (equipmentId: string, alertType: string) =>
      request<AlertAcknowledgment>(
        "/api/alert-acks",
        { method: "POST", body: JSON.stringify({ equipmentId, alertType }) }
      ),
    remove: (equipmentId: string, alertType: string) =>
      request<void>(
        "/api/alert-acks",
        { method: "DELETE", body: JSON.stringify({ equipmentId, alertType }) }
      ),
  },
};
