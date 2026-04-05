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
} from "@/types";

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  equipment: {
    list: () => request<Equipment[]>("/api/equipment"),
    get: (id: string) => request<Equipment>(`/api/equipment/${id}`),
    create: (data: CreateEquipmentRequest) =>
      request<Equipment>("/api/equipment", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: UpdateEquipmentRequest) =>
      request<Equipment>(`/api/equipment/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/api/equipment/${id}`, { method: "DELETE" }),
    scan: (id: string, data: ScanEquipmentRequest) =>
      request<{ equipment: Equipment; scanLog: ScanLog }>(
        `/api/equipment/${id}/scan`,
        { method: "POST", body: JSON.stringify(data) }
      ),
    bulkDelete: (data: BulkDeleteRequest) =>
      request<BulkResult>("/api/equipment/bulk-delete", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    bulkMove: (data: BulkMoveRequest) =>
      request<BulkResult>("/api/equipment/bulk-move", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    logs: (id: string) => request<ScanLog[]>(`/api/equipment/${id}/logs`),
    transfers: (id: string) =>
      request<TransferLog[]>(`/api/equipment/${id}/transfers`),
  },
  folders: {
    list: () => request<Folder[]>("/api/folders"),
    create: (name: string) =>
      request<Folder>("/api/folders", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    update: (id: string, name: string) =>
      request<Folder>(`/api/folders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    delete: (id: string) =>
      request<void>(`/api/folders/${id}`, { method: "DELETE" }),
  },
  activity: {
    feed: (cursor?: string) =>
      request<{ items: ActivityFeedItem[]; nextCursor: string | null }>(
        cursor ? `/api/activity?cursor=${cursor}` : "/api/activity"
      ),
  },
  analytics: {
    summary: () => request<AnalyticsSummary>("/api/analytics"),
  },
  users: {
    list: () => request<User[]>("/api/users"),
    updateRole: (id: string, role: "admin" | "technician") =>
      request<User>(`/api/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    me: () => request<User>("/api/users/me"),
  },
  storage: {
    requestUploadUrl: (data: UploadUrlRequest) =>
      request<UploadUrlResponse>("/api/storage/upload-url", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  whatsapp: {
    sendAlert: (data: {
      equipmentId: string;
      status: string;
      note?: string;
      phone?: string;
    }) =>
      request<{ success: boolean; waUrl: string }>("/api/whatsapp/alert", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
};
