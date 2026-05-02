import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/lib/i18n";

/**
 * Suspense fallback for lazy routes — stable min-height + skeleton to reduce layout jump when chunks load.
 */
export function RouteFallback() {
  return (
    <div
      className="min-h-[72dvh] w-full max-w-2xl mx-auto px-4 py-6 space-y-4 bg-background"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={t.auth.guard.loadingApp}
    >
      <Skeleton className="h-9 w-2/3 max-w-sm" />
      <Skeleton className="h-4 w-full max-w-lg" />
      <Skeleton className="h-4 w-11/12 max-w-md" />
      <div className="pt-2 space-y-3">
        <Skeleton className="h-[88px] w-full rounded-2xl" />
        <Skeleton className="h-[88px] w-full rounded-2xl" />
        <Skeleton className="h-[120px] w-full rounded-2xl" />
      </div>
      <p className="text-center text-sm text-muted-foreground pt-4">{t.auth.guard.loadingApp}</p>
    </div>
  );
}
