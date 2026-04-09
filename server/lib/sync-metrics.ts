interface SyncMetrics {
  syncSuccessCount: number;
  syncFailCount: number;
}

const metrics: SyncMetrics = {
  syncSuccessCount: 0,
  syncFailCount: 0,
};

export function trackSyncSuccess(): void {
  metrics.syncSuccessCount++;
}

export function trackSyncFail(): void {
  metrics.syncFailCount++;
}

export function getSyncMetrics(): SyncMetrics {
  return { ...metrics };
}
