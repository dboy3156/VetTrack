import { useSync } from "@/hooks/use-sync";

export function SyncStatusBanner() {
  const { isSyncing, pendingCount, failedCount, triggerSync } = useSync();

  if (failedCount > 0) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-2 bg-red-600 px-4 py-2 text-white text-sm font-medium shadow-md">
        <span>⚠ {failedCount} failed</span>
        <button
          onClick={() => triggerSync()}
          className="rounded-md border border-white/40 px-3 py-0.5 text-xs font-semibold hover:bg-red-700 active:bg-red-800 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isSyncing || pendingCount > 0) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex items-center gap-2 bg-amber-500 px-4 py-2 text-white text-sm font-medium shadow-md">
        <span>● {pendingCount} pending</span>
      </div>
    );
  }

  return null;
}
