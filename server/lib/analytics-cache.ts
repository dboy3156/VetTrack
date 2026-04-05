const TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache<T> {
  private entry: CacheEntry<T> | null = null;

  get(): T | null {
    if (!this.entry) return null;
    if (Date.now() > this.entry.expiresAt) {
      this.entry = null;
      return null;
    }
    return this.entry.value;
  }

  set(value: T): void {
    this.entry = { value, expiresAt: Date.now() + TTL_MS };
  }

  invalidate(): void {
    this.entry = null;
  }
}

export const analyticsCache = new TtlCache<unknown>();

export function invalidateAnalyticsCache(): void {
  analyticsCache.invalidate();
}
