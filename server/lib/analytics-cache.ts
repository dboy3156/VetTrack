const TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache<T> {
  private entries = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + TTL_MS });
  }

  invalidate(key?: string): void {
    if (key) {
      this.entries.delete(key);
      return;
    }
    this.entries.clear();
  }
}

export const analyticsCache = new TtlCache<unknown>();

export function invalidateAnalyticsCache(clinicId?: string): void {
  analyticsCache.invalidate(clinicId);
}
