import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EquipmentPage } from "@/lib/api";

interface UsePaginatedEquipmentOptions {
  page?: number;
  pageSize?: number;
}

export function usePaginatedEquipment({ page = 1, pageSize = 100 }: UsePaginatedEquipmentOptions = {}) {
  return useQuery<EquipmentPage>({
    queryKey: ["/api/equipment", "paginated", page, pageSize],
    queryFn: () => api.equipment.listPaginated(page, pageSize),
    placeholderData: keepPreviousData,
  });
}
