import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Airport } from "@/domain/models/airport";
import type { IcaoCode } from "@/domain/models/common";
import type { AirportProvider } from "@/services/providers/airports/airport-provider";

interface AirportRecord {
  readonly icao: string;
  readonly iata: string | null;
  readonly name: string;
  readonly city: string | null;
  readonly country: string;
  readonly lat: number;
  readonly lon: number;
  readonly elevFt: number | null;
  readonly type: string;
}

function toAirport(record: AirportRecord): Airport {
  return {
    icao: record.icao as IcaoCode,
    iata: record.iata,
    name: record.name,
    city: record.city,
    country: record.country,
    coordinates: {
      latitude: record.lat,
      longitude: record.lon,
    },
    elevationFt: record.elevFt,
    timezone: null,
  };
}

/**
 * Worldwide airport lookup from OurAirports open data.
 * Data file is generated from the public CSV dump (see scripts/build-airports-index.mjs).
 * This is the source of truth — not a hard-coded airport list.
 */
export class OurAirportsProvider implements AirportProvider {
  readonly id = "ourairports";
  private indexPromise: Promise<Map<string, Airport>> | null = null;

  private async loadIndex(): Promise<Map<string, Airport>> {
    const filePath = path.join(process.cwd(), "data", "airports-icao.json");
    const raw = await readFile(filePath, "utf8");
    const records = JSON.parse(raw) as AirportRecord[];
    const map = new Map<string, Airport>();
    for (const record of records) {
      map.set(record.icao.toUpperCase(), toAirport(record));
    }
    return map;
  }

  private getIndex(): Promise<Map<string, Airport>> {
    if (!this.indexPromise) {
      this.indexPromise = this.loadIndex();
    }
    return this.indexPromise;
  }

  async lookup(icao: string): Promise<Airport | null> {
    const index = await this.getIndex();
    return index.get(icao.trim().toUpperCase()) ?? null;
  }

  async search(query: string, limit = 8): Promise<readonly Airport[]> {
    const index = await this.getIndex();
    const normalized = query.trim().toUpperCase();
    if (normalized.length < 2) {
      return [];
    }

    const results: Airport[] = [];
    for (const airport of index.values()) {
      if (
        airport.icao.includes(normalized) ||
        (airport.iata?.includes(normalized) ?? false) ||
        airport.name.toUpperCase().includes(normalized) ||
        (airport.city?.toUpperCase().includes(normalized) ?? false)
      ) {
        results.push(airport);
        if (results.length >= limit) {
          break;
        }
      }
    }
    return results;
  }
}
