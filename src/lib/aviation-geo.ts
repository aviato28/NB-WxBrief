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
