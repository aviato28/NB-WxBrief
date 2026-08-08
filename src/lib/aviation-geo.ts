import type { GeoPoint } from "@/domain/models/common";
import { greatCircleDistanceNm } from "@/lib/geo";

/** Approximate point-in-polygon (ray casting). */
export function pointInPolygon(
  point: GeoPoint,
  polygon: readonly GeoPoint[],
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i]?.longitude ?? 0;
    const yi = polygon[i]?.latitude ?? 0;
    const xj = polygon[j]?.longitude ?? 0;
    const yj = polygon[j]?.latitude ?? 0;

    const intersect =
      yi > point.latitude !== yj > point.latitude &&
      point.longitude <
        ((xj - xi) * (point.latitude - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * True if any route sample is inside the polygon, or within corridorNm of
 * any polygon vertex (handles sparse oceanic SIGMET geometries).
 */
export function routeIntersectsSigmet(
  routePoints: readonly GeoPoint[],
  polygon: readonly GeoPoint[] | null,
  corridorNm = 120,
): boolean {
  if (!polygon || polygon.length === 0) {
    return false;
  }

  for (const point of routePoints) {
    if (pointInPolygon(point, polygon)) {
      return true;
    }
    for (const vertex of polygon) {
      if (greatCircleDistanceNm(point, vertex) <= corridorNm) {
        return true;
      }
    }
  }
  return false;
}

/** Standard atmosphere pressure (hPa) nearest to a flight level. */
export function flightLevelToPressureHpa(flightLevel: number): number {
  const altitudeFt = flightLevel * 100;
  const levels: ReadonlyArray<{ flMax: number; hpa: number }> = [
    { flMax: 100, hpa: 700 },
    { flMax: 180, hpa: 500 },
    { flMax: 240, hpa: 400 },
    { flMax: 300, hpa: 300 },
    { flMax: 340, hpa: 250 },
    { flMax: 390, hpa: 200 },
    { flMax: 450, hpa: 150 },
  ];

  for (const level of levels) {
    if (altitudeFt <= level.flMax * 100) {
      return level.hpa;
    }
  }
  return 150;
}

export function neighboringPressureLevels(hpa: number): readonly number[] {
  const available = [700, 500, 400, 300, 250, 200, 150] as const;
  const index = available.indexOf(hpa as (typeof available)[number]);
  if (index === -1) {
    return [hpa];
  }
  const lower = available[Math.max(0, index - 1)] ?? hpa;
  const upper = available[Math.min(available.length - 1, index + 1)] ?? hpa;
  return Array.from(new Set([lower, hpa, upper]));
}

/**
 * Approximate flight level for a standard Open-Meteo pressure surface.
 * Used to convert ΔV across neighboring levels into kt / 1000 ft.
 */
export function pressureHpaToApproxFlightLevel(hpa: number): number {
  const table: ReadonlyArray<{ hpa: number; fl: number }> = [
    { hpa: 700, fl: 100 },
    { hpa: 500, fl: 180 },
    { hpa: 400, fl: 240 },
    { hpa: 300, fl: 300 },
    { hpa: 250, fl: 340 },
    { hpa: 200, fl: 390 },
    { hpa: 150, fl: 450 },
  ];
  const exact = table.find((row) => row.hpa === hpa);
  if (exact) return exact.fl;
  // Nearest known surface if an unexpected level appears.
  let best = table[0]!;
  let bestDelta = Math.abs(hpa - best.hpa);
  for (const row of table) {
    const delta = Math.abs(hpa - row.hpa);
    if (delta < bestDelta) {
      best = row;
      bestDelta = delta;
    }
  }
  return best.fl;
}

/**
 * Vertical speed shear (kt per 1000 ft) between two pressure surfaces.
 */
export function verticalShearKtPer1000Ft(
  lowerHpa: number,
  upperHpa: number,
  lowerSpeedKt: number,
  upperSpeedKt: number,
): number {
  const flSpan = Math.abs(
    pressureHpaToApproxFlightLevel(upperHpa) -
      pressureHpaToApproxFlightLevel(lowerHpa),
  );
  // FL units are hundreds of feet → /10 yields thousands of feet.
  const thousandsOfFt = Math.max(1, flSpan / 10);
  return Math.abs(upperSpeedKt - lowerSpeedKt) / thousandsOfFt;
}

/**
 * Cruise FL ± offset (default 40 = 4000 ft), clamped to jet FL envelope.
 */
export function cruiseAltitudeBands(
  cruiseFl: number,
  offsetFl: number,
  minFl: number,
  maxFl: number,
): { readonly below: number; readonly cruise: number; readonly above: number } {
  return {
    below: Math.max(minFl, cruiseFl - offsetFl),
    cruise: cruiseFl,
    above: Math.min(maxFl, cruiseFl + offsetFl),
  };
}

/** Estimate UTC time when a route sample is overflown. */
export function estimateSampleTimeUtc(
  departureTimeUtc: string,
  distanceFromStartNm: number,
  groundspeedKt: number,
): string {
  const etd = Date.parse(departureTimeUtc);
  if (Number.isNaN(etd) || groundspeedKt <= 0) {
    return departureTimeUtc;
  }
  const hours = distanceFromStartNm / groundspeedKt;
  return new Date(etd + hours * 3_600_000).toISOString();
}

/** Format hour for Open-Meteo start_hour / end_hour (UTC). */
export function toOpenMeteoHour(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 13) + ":00";
  }
  d.setUTCMinutes(0, 0, 0);
  return `${d.toISOString().slice(0, 13)}:00`;
}

