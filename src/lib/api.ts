import type {
  Equipment,
  CreateEquipmentRequest,
  UpdateEquipmentRequest,
  ScanEquipmentRequest,
  ScanLog,
  TransferLog,
  Folder,
  Room,
  CreateRoomRequest,
  UpdateRoomRequest,
  BulkVerifyRoomResult,
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
  Shift,
  UserRole,
  ShiftRole,
  ShiftImport,
  ShiftImportPreview,
  ShiftImportResult,
  Appointment,
  CreateAppointmentRequest,
  UpdateAppointmentRequest,
} from "@/types";
import { getStoredLocale, t } from "@/lib/i18n";
import { toast } from "sonner";
import type { PendingSyncType } from "./offline-db";
import {
  addPendingSync,
  getCachedEquipment,
  getCachedEquipmentById,
  getCachedScanLogs,
  getCachedFolders,
  getCachedRooms,
  cacheEquipment,
  cacheScanLogs,
  cacheFolders,
  cacheRooms,
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
  return { ...BASE_HEADERS, ...getAuthHeaders(), "X-Locale": getStoredLocale() };
}

interface OfflineOptions {
  offlineType: PendingSyncType;
  offlineEquipmentId?: string;
  optimisticResult?: unknown;
}

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

class OfflineResponseError extends Error {
  constructor() {
    super("Offline response received");
    this.name = "OfflineResponseError";
  }
}

function isOfflineResponse(status: number, payload: unknown): boolean {
  if (status !== 503) return false;
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as { offline?: unknown; error?: unknown };
  if (candidate.offline === true) return true;
  return typeof candidate.error === "string" && candidate.error.toLowerCase().includes("network unavailable");
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  if (err instanceof OfflineResponseError) return true;
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (!navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof Error && err.message.includes("Failed to fetch")) return true;
  return false;
}

const FETCH_TIMEOUT_MS = 30_000;
let authRedirectInProgress = false;

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const outer = init.signal as AbortSignal | undefined | null;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (outer) {
    const onAbort = () => controller.abort();
    outer.addEventListener("abort", onAbort, { once: true });
    controller.signal.addEventListener("abort", () => outer.removeEventListener("abort", onAbort), { once: true });
  }

  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer))
    .catch((err) => {
      if (timedOut && err instanceof DOMException && err.name === "AbortError") {
        throw new TimeoutError(timeoutMs);
      }
      throw err;
    });
}

export async function request<T>(
  url: string,
  init: RequestInit = {},
  offline?: OfflineOptions,
  silent?: boolean
): Promise<T> {
  const headers = { ...buildHeaders(), ...(init.headers as Record<string, string> | undefined) };

  try {
    const res = await fetchWithTimeout(url, { ...init, headers });
    if (res.status === 401) {
      // Token expired/invalid. Avoid reload loops; route to sign-in once.
      if (!authRedirectInProgress) {
        authRedirectInProgress = true;
        toast.error(t.api.sessionExpired);
      }
      if (typeof window !== "undefined" && window.location.pathname !== "/signin" && authRedirectInProgress) {
        window.location.assign("/signin");
      }
      throw new Error("Session expired");
    }
    if (!res.ok) {
      if (!silent && res.status >= 500) {
        toast.error(t.api.serverError);
      }
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      if (isOfflineResponse(res.status, error)) {
        throw new OfflineResponseError();
      }
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err) {
    if (!silent && isNetworkError(err)) {
      toast.error(t.api.networkUnavailable);
    }
    if (isNetworkError(err) && offline) {
      const clientTimestamp = Date.now();
      await addPendingSync({
        type: offline.offlineType,
        endpoint: url,
        method: (init.method as string) || "GET",
        body: (init.body as string) || "",
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
        if (cached) return cached as T;
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
    const res = await fetchWithTimeout(url, { ...init, headers });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      if (isOfflineResponse(res.status, error)) {
        throw new OfflineResponseError();
      }
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (isNetworkError(err)) {
      return fallback();
    }
    throw err;
  }
}

export interface EquipmentPage {
  items: Equipment[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface MutationResponse {
  equipment: Equipment;
  undoToken: string | undefined;
  pendingSyncId?: number;
}

async function handleOptimisticMutation(opts: {
  id: string;
  endpoint: string;
  syncType: PendingSyncType;
  requestBody: Record<string, unknown>;
  optimisticEquipment: Partial<Equipment>;
  cachedEquipment: Equipment | undefined;
}): Promise<MutationResponse> {
  const clientTimestamp = Date.now();
  try {
    const result = await request<{ equipment: Equipment; undoToken: string }>(
      opts.endpoint,
      {
        method: "POST",
        body: JSON.stringify(opts.requestBody),
        headers: { "X-Client-Timestamp": String(clientTimestamp) },
      }
    );
    updateCachedEquipment(opts.id, result.equipment).catch(() => {});
    return { ...result, pendingSyncId: undefined };
  } catch (err) {
    if (isNetworkError(err)) {
      const pendingSyncId = await addPendingSync({
        type: opts.syncType,
        endpoint: opts.endpoint,
        method: "POST",
        body: JSON.stringify(opts.requestBody),
        createdAt: new Date(),
        retries: 0,
        status: "pending",
        clientTimestamp,
        optimisticData: JSON.stringify(opts.optimisticEquipment),
        equipmentName: opts.cachedEquipment?.name,
      });
      const updated = { ...(opts.cachedEquipment || {}), ...opts.optimisticEquipment, id: opts.id } as Equipment;
      await updateCachedEquipment(opts.id, opts.optimisticEquipment);
      return { equipment: updated, undoToken: undefined, pendingSyncId: pendingSyncId as number };
    }
    throw err;
  }
}

export const api = {
  equipment: {
    list: async () => {
      try {
        const result = await request<EquipmentPage>("/api/equipment");
        cacheEquipment(result.items).catch(() => {});
        return result.items;
      } catch (err) {
        if (isNetworkError(err)) {
          return getCachedEquipment();
        }
        throw err;
      }
    },
    listPaginated: async (page = 1, pageSize = 100, filters?: { q?: string; status?: string; folder?: string; location?: string }): Promise<EquipmentPage> => {
      try {
        const params = new URLSearchParams({ limit: String(pageSize), page: String(page) });
        const q = filters?.q?.trim();
        if (q) params.set("q", q);
        if (filters?.status && filters.status !== "all") params.set("status", filters.status);
        if (filters?.folder && filters.folder !== "all") params.set("folder", filters.folder);
        if (filters?.location && filters.location !== "all") params.set("location", filters.location);
        const result = await request<EquipmentPage>(`/api/equipment?${params}`);
        cacheEquipment(result.items).catch(() => {});
        return result;
      } catch (err) {
        if (isNetworkError(err)) {
          const cached = await getCachedEquipment();
          const start = (page - 1) * pageSize;
          const slice = cached.slice(start, start + pageSize);
          return {
            items: slice,
            total: cached.length,
            page,
            pageSize,
            hasMore: start + pageSize < cached.length,
          };
        }
        throw err;
      }
    },
    listMy: async () => {
      try {
        const items = await request<Equipment[]>("/api/equipment/my");
        return items;
      } catch (err) {
        if (isNetworkError(err)) {
          const all = await getCachedEquipment();
          const userId = getCurrentUserId();
          // checkedOutById stores DB user IDs; compare against DB user ID from auth-store.
          if (userId) return all.filter((e) => e.checkedOutById === userId);
          return [];
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
        if (isNetworkError(err)) {
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
      const res = await fetchWithTimeout(
        "/api/equipment/import",
        { method: "POST", body: form, headers },
        FETCH_TIMEOUT_MS
      );
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
      return handleOptimisticMutation({
        id,
        endpoint: `/api/equipment/${id}/checkout`,
        syncType: "checkout",
        requestBody: { location },
        optimisticEquipment: {
          checkedOutById: getCurrentUserId(),
          checkedOutByEmail: getCurrentUserEmail(),
          checkedOutAt: now,
          checkedOutLocation: location || null,
        },
        cachedEquipment: cached,
      });
    },
    return: async (id: string) => {
      const cached = await getCachedEquipmentById(id);
      const now = new Date().toISOString();
      return handleOptimisticMutation({
        id,
        endpoint: `/api/equipment/${id}/return`,
        syncType: "return",
        requestBody: {},
        optimisticEquipment: {
          checkedOutById: null,
          checkedOutByEmail: null,
          checkedOutAt: null,
          checkedOutLocation: null,
          status: "ok",
          lastSeen: now,
          lastStatus: "ok",
        },
        cachedEquipment: cached,
      });
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
        const result = await request<{ items: ScanLog[]; total: number; hasMore: boolean }>(
          `/api/equipment/${id}/logs?limit=50`
        );
        cacheScanLogs(id, result.items).catch(() => {});
        return result.items;
      } catch (err) {
        if (isNetworkError(err)) {
          return getCachedScanLogs(id);
        }
        throw err;
      }
    },
    logsPaginated: async (
      id: string,
      page = 1,
      pageSize = 50
    ): Promise<{ items: ScanLog[]; total: number; page: number; pageSize: number; hasMore: boolean }> => {
      try {
        const result = await request<{ items: ScanLog[]; total: number; page: number; pageSize: number; hasMore: boolean }>(
          `/api/equipment/${id}/logs?limit=${pageSize}&page=${page}`
        );
        cacheScanLogs(id, result.items).catch(() => {});
        return result;
      } catch (err) {
        if (isNetworkError(err)) {
          const cached = await getCachedScanLogs(id);
          const start = (page - 1) * pageSize;
          const slice = cached.slice(start, start + pageSize);
          return { items: slice, total: cached.length, page, pageSize, hasMore: start + pageSize < cached.length };
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
        if (isNetworkError(err)) {
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
        cursor ? `/api/activity?cursor=${encodeURIComponent(cursor)}` : "/api/activity",
        () => Promise.resolve({ items: [], nextCursor: null })
      ),
    myScanCount: () =>
      request<{ count: number }>("/api/activity/my-scan-count", {}, undefined, true),
  },
  analytics: {
    summary: () => request<AnalyticsSummary>("/api/analytics"),
  },
  users: {
    list: async (status?: "pending" | "active" | "blocked"): Promise<User[]> => {
      const url = status ? `/api/users?status=${status}` : "/api/users";
      const result = await request<{ items: User[]; total: number }>(url);
      return result.items;
    },
    listPaginated: async (
      page = 1,
      pageSize = 100,
      status?: "pending" | "active" | "blocked"
    ): Promise<{ items: User[]; total: number; page: number; pageSize: number; hasMore: boolean }> => {
      const url = `/api/users?page=${page}&limit=${pageSize}${status ? `&status=${status}` : ""}`;
      return request<{ items: User[]; total: number; page: number; pageSize: number; hasMore: boolean }>(
        url
      );
    },
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
      request<User>(`/api/users/${id}/delete`, { method: "PATCH" }),
    restore: (id: string) =>
      request<User>(`/api/users/${id}/restore`, { method: "PATCH" }),
    me: () => request<User & {
      effectiveRole?: UserRole | ShiftRole;
      roleSource?: "shift" | "permanent";
      activeShift?: Shift | null;
      resolvedAt?: string;
    }>("/api/users/me"),
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
    subscribe: (subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      soundEnabled?: boolean;
      alertsEnabled?: boolean;
      technicianReturnRemindersEnabled?: boolean;
      seniorOwnReturnRemindersEnabled?: boolean;
      seniorTeamOverdueAlertsEnabled?: boolean;
      adminHourlySummaryEnabled?: boolean;
    }) =>
      request<{ success: boolean; id: string }>(
        "/api/push/subscribe",
        { method: "POST", body: JSON.stringify(subscription) }
      ),
    update: (payload: {
      endpoint: string;
      soundEnabled?: boolean;
      alertsEnabled?: boolean;
      technicianReturnRemindersEnabled?: boolean;
      seniorOwnReturnRemindersEnabled?: boolean;
      seniorTeamOverdueAlertsEnabled?: boolean;
      adminHourlySummaryEnabled?: boolean;
    }) =>
      request<void>(
        "/api/push/subscribe",
        { method: "PATCH", body: JSON.stringify(payload) }
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
  shifts: {
    list: (date?: string) =>
      request<Shift[]>(date ? `/api/shifts?date=${encodeURIComponent(date)}` : "/api/shifts"),
    imports: () => request<ShiftImport[]>("/api/shifts/imports"),
    previewImport: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const headers: Record<string, string> = { ...getAuthHeaders() };
      const res = await fetchWithTimeout(
        "/api/shifts/import/preview",
        { method: "POST", body: form, headers },
        FETCH_TIMEOUT_MS
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Preview failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json() as Promise<ShiftImportPreview>;
    },
    confirmImport: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const headers: Record<string, string> = { ...getAuthHeaders() };
      const res = await fetchWithTimeout(
        "/api/shifts/import/confirm",
        { method: "POST", body: form, headers },
        FETCH_TIMEOUT_MS
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Import failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json() as Promise<ShiftImportResult>;
    },
  },
  appointments: {
    list: (params: { day?: string; start?: string; end?: string; vetId?: string }) => {
      const qs = new URLSearchParams();
      if (params.day) qs.set("day", params.day);
      if (params.start) qs.set("start", params.start);
      if (params.end) qs.set("end", params.end);
      if (params.vetId) qs.set("vetId", params.vetId);
      return request<{ appointments: Appointment[] }>(`/api/appointments?${qs.toString()}`).then((r) => r.appointments);
    },
    create: (data: CreateAppointmentRequest) =>
      request<{ appointment: Appointment }>(
        "/api/appointments",
        { method: "POST", body: JSON.stringify(data) }
      ).then((r) => r.appointment),
    update: (id: string, data: UpdateAppointmentRequest) =>
      request<{ appointment: Appointment }>(
        `/api/appointments/${id}`,
        { method: "PATCH", body: JSON.stringify(data) }
      ).then((r) => r.appointment),
    cancel: (id: string, reason?: string) =>
      request<{ appointment: Appointment }>(
        `/api/appointments/${id}`,
        { method: "DELETE", body: JSON.stringify(reason ? { reason } : {}) }
      ).then((r) => r.appointment),
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
  rooms: {
    list: async (): Promise<Room[]> => {
      try {
        const items = await request<Room[]>("/api/rooms");
        cacheRooms(items).catch(() => {});
        return items;
      } catch (err) {
        if (isNetworkError(err)) {
          return getCachedRooms();
        }
        throw err;
      }
    },
    get: async (id: string): Promise<Room> => {
      try {
        return await request<Room>(`/api/rooms/${id}`);
      } catch (err) {
        if (isNetworkError(err)) {
          const { getCachedRoomById } = await import("./offline-db");
          const cached = await getCachedRoomById(id);
          if (cached) return cached;
        }
        throw err;
      }
    },
    create: (data: CreateRoomRequest) =>
      request<Room>("/api/rooms", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: UpdateRoomRequest) =>
      request<Room>(`/api/rooms/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/rooms/${id}`, { method: "DELETE" }),
    bulkVerify: (roomId: string) =>
      request<BulkVerifyRoomResult>("/api/equipment/bulk-verify-room", {
        method: "POST",
        body: JSON.stringify({ roomId }),
      }),
    activity: (roomId: string) =>
      request<import("@/types").RoomActivityEntry[]>(`/api/rooms/${roomId}/activity`),
  },
};
