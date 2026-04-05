import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";

// ==========================================
// Types
// ==========================================
export type Status = "ok" | "issue" | "maintenance" | "sterilized";

export interface Equipment {
  id: string;
  name: string;
  status: Status;
  [key: string]: unknown;
}

// ==========================================
// Core API Fetcher Hook
// ==========================================
export function useApi() {
  const { getToken } = useAuth();

  const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const token = await getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`/api${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} - ${response.statusText}`);
    }

    // Safe JSON parsing for 204 No Content / Empty responses
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  };

  return apiFetch;
}

// ==========================================
// Query Keys Utils
// ==========================================
export function getListEquipmentQueryKey() {
  return ["equipment"];
}

export function getListLogsQueryKey() {
  return ["logs"];
}

export function getAnalyticsQueryKey() {
  return ["analytics"];
}

export function getGetEquipmentTransfersQueryKey() {
  return ["equipment-transfers"];
}

// ==========================================
// Queries
// ==========================================
export function useListEquipment() {
  const api = useApi();
  return useQuery({
    queryKey: getListEquipmentQueryKey(),
    queryFn: () => api("/equipment"),
  });
}

// Note: Added explicitly based on UI needs
export function useGetEquipment(id?: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["equipment", id],
    queryFn: () => api(`/equipment/${id}`),
    enabled: !!id,
  });
}

export function useListLogs() {
  const api = useApi();
  return useQuery({
    queryKey: getListLogsQueryKey(),
    queryFn: () => api("/logs"),
  });
}

export function useListFolders() {
  const api = useApi();
  return useQuery({
    queryKey: ["folders"],
    queryFn: () => api("/folders"),
  });
}

export function useListUsers() {
  const api = useApi();
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users"),
  });
}

export function useGetAnalyticsSummary() {
  const api = useApi();
  return useQuery({
    queryKey: [...getAnalyticsQueryKey(), "summary"],
    queryFn: () => api("/analytics/summary"),
  });
}

export function useGetAnalytics() {
  const api = useApi();
  return useQuery({
    queryKey: getAnalyticsQueryKey(),
    queryFn: () => api("/analytics"),
  });
}

export function useGetCurrentUser() {
  const api = useApi();
  return useQuery({
    queryKey: ["current-user"],
    queryFn: () => api("/users/me"),
  });
}

export function useScanQr(qrData?: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["scan-qr", qrData],
    queryFn: () => api(`/scan?qr=${encodeURIComponent(qrData || "")}`),
    enabled: !!qrData, // Won't execute if qrData is empty/undefined
  });
}

// ==========================================
// Mutations
// ==========================================
export function useCreateEquipment() {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: Partial<Equipment>) =>
      api("/equipment", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
    },
  });
  // Ensuring isLoading is exported regardless of React Query version (v4/v5 bridging)
  return { ...mutation, isLoading: mutation.isPending };
}

export function useUpdateEquipment() {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<Equipment> & { id: string }) =>
      api(`/equipment/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["equipment", variables.id] });
    },
  });
  return { ...mutation, isLoading: mutation.isPending };
}

export function useDeleteEquipment() {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) => api(`/equipment/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
    },
  });
  return { ...mutation, isLoading: mutation.isPending };
}

export function useScanEquipment() {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (equipmentId: string) =>
      api(`/equipment/${equipmentId}/scan`, { method: "POST" }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["equipment", id] });
      queryClient.invalidateQueries({ queryKey: getListLogsQueryKey() });
    },
  });
  return { ...mutation, isLoading: mutation.isPending };
}

export function useUpdateStatus() {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      api(`/equipment/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["equipment", variables.id] });
      queryClient.invalidateQueries({ queryKey: getListLogsQueryKey() });
    },
  });
  return { ...mutation, isLoading: mutation.isPending };
}

// ==========================================
// Legacy Utils
// ==========================================
export async function customFetch(endpoint?: string, options?: RequestInit) {
  if (!endpoint) return Promise.resolve({}); // Fallback for pure mock calls without breaking
  const response = await fetch(`/api${endpoint}`, options);
  if (!response.ok) return Promise.resolve({});
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
