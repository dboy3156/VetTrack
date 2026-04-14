import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EquipmentPage } from "@/lib/api";

interface UsePaginatedEquipmentOptions {
  page?: number;
  pageSize?: number;
  enabled?: boolean;
  q?: string;
  status?: string;
  folder?: string;
  location?: string;
}

export function usePaginatedEquipment({
  page = 1,
  pageSize = 100,
  enabled = true,
  q,
  status,
  folder,
  location,
}: UsePaginatedEquipmentOptions = {}) {
  const normalizedFilters = {
    q: q?.trim() || undefined,
    status: status && status !== "all" ? status : undefined,
    folder: folder && folder !== "all" ? folder : undefined,
    location: location && location !== "all" ? location : undefined,
  };

  return useQuery<EquipmentPage>({
    queryKey: [
      "/api/equipment",
      "paginated",
      page,
      pageSize,
      normalizedFilters.q,
      normalizedFilters.status,
      normalizedFilters.folder,
      normalizedFilters.location,
    ],
    queryFn: () => api.equipment.listPaginated(page, pageSize, normalizedFilters),
    placeholderData: keepPreviousData,
    enabled,
  });
}
