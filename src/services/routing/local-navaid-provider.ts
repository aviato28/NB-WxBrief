import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GeoPoint } from "@/domain/models/common";
import { upstreamCache } from "@/lib/cache";

interface NavaidRecord {
  readonly lat: number;
  readonly lon: number;
  readonly type: string;
}

/**
 * Local OurAirports navaid index — reliable fallback when AWC /navaid is empty
 * or returning 204/502. Built by scripts/build-navaids-index.mjs.
 */
export class LocalNavaidProvider {
  readonly id = "ourairports-navaids";
  private indexPromise: Promise<Map<string, GeoPoint>> | null = null;

  private async loadIndex(): Promise<Map<string, GeoPoint>> {
    const filePath = path.join(process.cwd(), "data", "navaids-ident.json");
    const raw = await readFile(filePath, "utf8");
    const records = JSON.parse(raw) as Record<string, NavaidRecord>;
    const map = new Map<string, GeoPoint>();
    for (const [ident, record] of Object.entries(records)) {
      if (
        Number.isFinite(record.lat) &&
        Number.isFinite(record.lon)
      ) {
        map.set(ident.toUpperCase(), {
          latitude: record.lat,
          longitude: record.lon,
        });
      }
    }
    return map;
  }

  private getIndex(): Promise<Map<string, GeoPoint>> {
    if (!this.indexPromise) {
      this.indexPromise = this.loadIndex();
    }
    return this.indexPromise;
  }

  async lookup(ident: string): Promise<GeoPoint | null> {
    const key = `local-navaid:${ident.toUpperCase()}`;
    return upstreamCache.getOrSet(key, async () => {
      const index = await this.getIndex();
      return index.get(ident.trim().toUpperCase()) ?? null;
    });
  }
}
