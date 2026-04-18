import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { leaderPoll } from "@/lib/leader";

const RECOMMENDATIONS_REFETCH_MS = 90_000;

export function useTaskRecommendations(enabled: boolean = true) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["/api/tasks/recommendations"],
    queryFn: () => api.tasks.recommendations(),
    enabled: enabled && !!userId,
    refetchInterval: leaderPoll(RECOMMENDATIONS_REFETCH_MS),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    retry: false,
  });
}
