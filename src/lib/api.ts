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
  DeletedEquipment,
  UploadUrlRequest,
  UploadUrlResponse,
  AlertAcknowledgment,
  SystemMetrics,
  SupportTicket,
  CreateSupportTicketRequest,
} from "@/types";
import { toast } from "sonner";
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
  offline?: OfflineOptions,
  silent?: boolean
): Promise<T> {
  const headers = { ...buildHeaders(), ...(init.headers as Record<string, string> | undefined) };

  try {
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      if (!silent && res.status >= 500) {
        toast.error("The server encountered an error. Please try again or reload the page.");
      }
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err) {
    if (!silent && isNetworkError(err)) {
      toast.error("Server is unreachable. You may be offline or the server is down.");
    }
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
    importCsv: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      // Do NOT set Content-Type — browser sets it automatically with multipart boundary
      const headers: Record<string, string> = { ...getAuthHeaders() };
      const res = await fetch("/api/equipment/import", { method: "POST", body: form, headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Import failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ inserted: number; skipped: Array<{ row: number; reason: string; data: Record<string, string> }> }>;
    },
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
            equipmentName: cached?.name,
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
            equipmentName: cached?.name,
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
            equipmentName: cached?.name,
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
    listDeleted: () => request<DeletedEquipment[]>("/api/equipment/deleted"),
    restore: (id: string) => request<Equipment>(`/api/equipment/${id}/restore`, { method: "POST" }),
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
    myScanCount: () =>
      request<{ count: number }>("/api/activity/my-scan-count", {}, undefined, true),
  },
  analytics: {
    summary: () => request<AnalyticsSummary>("/api/analytics"),
  },
  users: {
    list: (status?: "pending" | "active" | "blocked") =>
      request<User[]>(status ? `/api/users?status=${status}` : "/api/users"),
    listPending: () => request<User[]>("/api/users/pending"),
    listDeleted: () => request<User[]>("/api/users/deleted"),
    updateRole: (id: string, role: "admin" | "vet" | "technician" | "viewer") =>
      request<User>(
        `/api/users/${id}/role`,
        { method: "PATCH", body: JSON.stringify({ role }) }
      ),
    updateStatus: (id: string, status: "pending" | "active" | "blocked") =>
      request<User>(
        `/api/users/${id}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) }
      ),
    delete: (id: string) =>
      request<void>(`/api/users/${id}`, { method: "DELETE" }),
    restore: (id: string) =>
      request<User>(`/api/users/${id}/restore`, { method: "POST" }),
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
        `/api/alert-acks?equipmentId=${encodeURIComponent(equipmentId)}&alertType=${encodeURIComponent(alertType)}`,
        { method: "DELETE" }
      ),
  },
  push: {
    getVapidPublicKey: () =>
      request<{ publicKey: string }>("/api/push/vapid-public-key"),
    subscribe: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
      request<{ success: boolean; id: string }>(
        "/api/push/subscribe",
        { method: "POST", body: JSON.stringify(subscription) }
      ),
    unsubscribe: (endpoint: string) =>
      request<void>(
        "/api/push/subscribe",
        { method: "DELETE", body: JSON.stringify({ endpoint }) }
      ),
    sendTest: () =>
      request<{ success: boolean }>(
        "/api/push/test",
        { method: "POST" }
      ),
  },
  metrics: {
    get: () => request<SystemMetrics>("/api/metrics", {}, undefined, true),
  },
  support: {
    create: (data: CreateSupportTicketRequest) =>
      request<SupportTicket>(
        "/api/support",
        { method: "POST", body: JSON.stringify(data) }
      ),
    list: () => request<SupportTicket[]>("/api/support"),
    unresolvedCount: () => request<{ count: number }>("/api/support/unresolved-count"),
    update: (id: string, data: { status?: string; adminNote?: string }) =>
      request<SupportTicket>(
        `/api/support/${id}`,
        { method: "PATCH", body: JSON.stringify(data) }
      ),
  },
  auditLogs: {
    list: (params?: { actionType?: string; performedBy?: string; from?: string; to?: string; page?: number }) => {
      const qs = new URLSearchParams();
      if (params?.actionType) qs.set("actionType", params.actionType);
      if (params?.performedBy) qs.set("performedBy", params.performedBy);
      if (params?.from) qs.set("from", params.from);
      if (params?.to) qs.set("to", params.to);
      if (params?.page) qs.set("page", String(params.page));
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return request<{ items: import("@/types").AuditLog[]; hasMore: boolean; page: number; pageSize: number }>(`/api/audit-logs${query}`);
    },
  },
};
