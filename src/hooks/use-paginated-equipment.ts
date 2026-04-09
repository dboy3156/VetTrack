import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EquipmentPage } from "@/lib/api";

interface UsePaginatedEquipmentOptions {
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}

export function usePaginatedEquipment({ page = 1, pageSize = 100, enabled = true }: UsePaginatedEquipmentOptions = {}) {
  return useQuery<EquipmentPage>({
    queryKey: ["/api/equipment", "paginated", page, pageSize],
    queryFn: () => api.equipment.listPaginated(page, pageSize),
    placeholderData: keepPreviousData,
    enabled,
  });
}
