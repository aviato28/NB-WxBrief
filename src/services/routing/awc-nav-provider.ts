import type { GeoPoint } from "@/domain/models/common";
import { fetchJsonSoft } from "@/lib/http";
import { upstreamCache } from "@/lib/cache";

const AWC_BASE = "https://aviationweather.gov/api/data";

interface AwcFixJson {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly type?: string;
}

interface AwcNavaidJson {
  readonly id?: string;
  readonly icaoId?: string;
  readonly lat: number;
  readonly lon: number;
}

export class AwcNavProvider {
  readonly id = "awc-nav";

  async lookupFix(id: string): Promise<GeoPoint | null> {
    const key = `fix:${id.toUpperCase()}`;
    return upstreamCache.getOrSet(key, async () => {
      const payload = await fetchJsonSoft<AwcFixJson[]>({
        provider: "awc-fix",
        url: `${AWC_BASE}/fix?ids=${encodeURIComponent(id)}&format=json`,
      });
      const hit = payload?.[0];
      if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lon)) {
        return null;
      }
      return { latitude: hit.lat, longitude: hit.lon };
    });
  }

  async lookupNavaid(id: string): Promise<GeoPoint | null> {
    const key = `navaid:${id.toUpperCase()}`;
    return upstreamCache.getOrSet(key, async () => {
      const payload = await fetchJsonSoft<AwcNavaidJson[]>({
        provider: "awc-navaid",
        url: `${AWC_BASE}/navaid?ids=${encodeURIComponent(id)}&format=json`,
      });
      const hit = payload?.[0];
      if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lon)) {
        return null;
      }
      return { latitude: hit.lat, longitude: hit.lon };
    });
  }

  async lookupManyFixes(
    ids: readonly string[],
  ): Promise<Map<string, GeoPoint>> {
    const unique = [...new Set(ids.map((id) => id.toUpperCase()))];
    const map = new Map<string, GeoPoint>();
    // Batch in groups of 20 to respect AWC entry caps / URL length.
    const chunkSize = 20;
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const unresolved: string[] = [];
      for (const id of chunk) {
        const cached = upstreamCache.get<GeoPoint | null>(`fix:${id}`);
        if (cached) {
          map.set(id, cached);
        } else if (cached === null) {
          // negative cache
        } else {
          unresolved.push(id);
        }
      }
      if (unresolved.length === 0) continue;

      const payload = await fetchJsonSoft<AwcFixJson[]>({
        provider: "awc-fix",
        url: `${AWC_BASE}/fix?ids=${encodeURIComponent(unresolved.join(","))}&format=json`,
      });
      const found = new Set<string>();
      for (const item of payload ?? []) {
        const point = { latitude: item.lat, longitude: item.lon };
        map.set(item.id.toUpperCase(), point);
        upstreamCache.set(`fix:${item.id.toUpperCase()}`, point);
        found.add(item.id.toUpperCase());
      }
      for (const id of unresolved) {
        if (!found.has(id)) {
          upstreamCache.set(`fix:${id}`, null);
        }
      }
    }
    return map;
  }
}
