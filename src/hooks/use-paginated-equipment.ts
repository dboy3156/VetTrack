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
  return useQuery<EquipmentPage>({
    queryKey: ["/api/equipment", "paginated", page, pageSize, q, status, folder, location],
    queryFn: () => api.equipment.listPaginated(page, pageSize, { q, status, folder, location }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
