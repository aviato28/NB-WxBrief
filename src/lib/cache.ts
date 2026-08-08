/** Simple in-memory TTL cache for BFF / provider responses. */

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly defaultTtlMs: number) {}

  /** True when a non-expired entry exists (including cached `null`). */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    ttlMs = this.defaultTtlMs,
  ): Promise<T> {
    if (this.has(key)) {
      return this.get<T>(key) as T;
    }
    const value = await loader();
    this.set(key, value, ttlMs);
    return value;
  }
}

export const briefingCache = new TtlCache(90_000);
export const upstreamCache = new TtlCache(60_000);
