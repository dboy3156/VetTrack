import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const RECOMMENDATIONS_REFETCH_MS = 90_000;

export function useTaskRecommendations(enabled: boolean = true) {
  return useQuery({
    queryKey: ["/api/tasks/recommendations"],
    queryFn: () => api.tasks.recommendations(),
    enabled,
    refetchInterval: RECOMMENDATIONS_REFETCH_MS,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}
