import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const RECOMMENDATIONS_REFETCH_MS = 45_000;

export function useTaskRecommendations(enabled: boolean = true) {
  return useQuery({
    queryKey: ["/api/tasks/recommendations"],
    queryFn: () => api.tasks.recommendations(),
    enabled,
    refetchInterval: RECOMMENDATIONS_REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    placeholderData: (previous) => previous,
  });
}
