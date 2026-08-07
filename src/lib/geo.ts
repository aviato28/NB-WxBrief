import type { GeoPoint } from "@/domain/models/common";
import type { ParsedRoute, RouteFix } from "@/domain/models/route";

const ROUTE_TOKEN_SPLIT = /[\s/]+/;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in nautical miles (spherical Earth). */
export function greatCircleDistanceNm(a: GeoPoint, b: GeoPoint): number {
  const earthRadiusNm = 3440.065;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusNm * Math.asin(Math.min(1, Math.sqrt(hav)));
}

export function interpolateGreatCircle(
  start: GeoPoint,
  end: GeoPoint,
  segments: number,
): GeoPoint[] {
  const points: GeoPoint[] = [];
  const lat1 = toRadians(start.latitude);
  const lon1 = toRadians(start.longitude);
  const lat2 = toRadians(end.latitude);
  const lon2 = toRadians(end.longitude);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat1 - lat2) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon1 - lon2) / 2) ** 2,
      ),
    );

  if (d === 0) {
    return [start, end];
  }

  for (let i = 0; i <= segments; i += 1) {
    const f = i / segments;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x =
      a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y =
      a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    points.push({
      latitude: (lat * 180) / Math.PI,
      longitude: (lon * 180) / Math.PI,
    });
  }

  return points;
}

export function parseAtcRoute(
  rawRoute: string,
  departure: GeoPoint,
  destination: GeoPoint,
): ParsedRoute {
  const tokens = rawRoute
    .trim()
    .toUpperCase()
    .split(ROUTE_TOKEN_SPLIT)
    .filter((token) => token.length > 0);

  const fixes: RouteFix[] = tokens.map((token, index) => ({
    id: `${token}-${index}`,
    name: token,
    coordinates: null,
  }));

  const greatCirclePoints = interpolateGreatCircle(departure, destination, 32);

  return {
    raw: rawRoute.trim(),
    fixes,
    greatCirclePoints,
  };
}

export function approximateBoundingBox(
  points: readonly GeoPoint[],
  paddingDeg = 2,
): { north: number; south: number; east: number; west: number } | null {
  if (points.length === 0) {
    return null;
  }

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (const point of points) {
    north = Math.max(north, point.latitude);
    south = Math.min(south, point.latitude);
    east = Math.max(east, point.longitude);
    west = Math.min(west, point.longitude);
  }

  return {
    north: Math.min(90, north + paddingDeg),
    south: Math.max(-90, south - paddingDeg),
    east: Math.min(180, east + paddingDeg),
    west: Math.max(-180, west - paddingDeg),
  };
}
