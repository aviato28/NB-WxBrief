import type { GeoPoint } from "@/domain/models/common";
import type {
  ParsedRoute,
  RouteFix,
  RouteFixKind,
  RouteLeg,
  RouteSamplePoint,
} from "@/domain/models/route";
import {
  ROUTE_SAMPLE_INTERVAL_NM,
  ROUTE_SAMPLE_MAX_NM,
  ROUTE_SAMPLE_MIN_NM,
} from "@/domain/constants/app";

const ROUTE_TOKEN_SPLIT = /[\s/]+/;

/** Tokens that are routing instructions, not geographic fixes. */
const NON_FIX_TOKENS = new Set([
  "DCT",
  "DIRECT",
  "IFR",
  "VFR",
  "SID",
  "STAR",
  "SPEED",
  "LEVEL",
  "FL",
]);

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

export function pointAlongGreatCircle(
  start: GeoPoint,
  end: GeoPoint,
  fraction: number,
): GeoPoint {
  const clamped = Math.min(1, Math.max(0, fraction));
  const points = interpolateGreatCircle(start, end, 64);
  const index = Math.round(clamped * (points.length - 1));
  return points[index] ?? start;
}

/**
 * Parse ATC lat/lon tokens such as:
 * 50N050W, 5030N05000W, 50N50W, N5030W05000
 */
export function parseLatLonToken(token: string): GeoPoint | null {
  const normalized = token.trim().toUpperCase();

  const compact =
    /^(\d{2})(\d{2})?([NS])(\d{3})(\d{2})?([EW])$/.exec(normalized) ??
    /^(\d{2})([NS])(\d{2,3})([EW])$/.exec(normalized);

  if (compact) {
    if (compact.length === 7 || (compact[2] && /[NS]/.test(compact[3] ?? ""))) {
      const latDeg = Number(compact[1]);
      const latMin = compact[2] ? Number(compact[2]) : 0;
      const latHem = compact[3] as "N" | "S";
      const lonDeg = Number(compact[4]);
      const lonMin = compact[5] ? Number(compact[5]) : 0;
      const lonHem = compact[6] as "E" | "W";
      if (
        !Number.isFinite(latDeg) ||
        !Number.isFinite(lonDeg) ||
        latDeg > 90 ||
        lonDeg > 180
      ) {
        return null;
      }
      const latitude = (latDeg + latMin / 60) * (latHem === "S" ? -1 : 1);
      const longitude = (lonDeg + lonMin / 60) * (lonHem === "W" ? -1 : 1);
      return { latitude, longitude };
    }
  }

  const alt = /^([NS])(\d{2})(\d{2})?([EW])(\d{3})(\d{2})?$/.exec(normalized);
  if (alt) {
    const latHem = alt[1] as "N" | "S";
    const latDeg = Number(alt[2]);
    const latMin = alt[3] ? Number(alt[3]) : 0;
    const lonHem = alt[4] as "E" | "W";
    const lonDeg = Number(alt[5]);
    const lonMin = alt[6] ? Number(alt[6]) : 0;
    const latitude = (latDeg + latMin / 60) * (latHem === "S" ? -1 : 1);
    const longitude = (lonDeg + lonMin / 60) * (lonHem === "W" ? -1 : 1);
    return { latitude, longitude };
  }

  return null;
}

export function tokenizeAtcRoute(rawRoute: string): string[] {
  return rawRoute
    .trim()
    .toUpperCase()
    .split(ROUTE_TOKEN_SPLIT)
    .map((token) => token.replace(/[^A-Z0-9]/g, ""))
    .filter((token) => token.length > 0)
    .filter((token) => !NON_FIX_TOKENS.has(token))
    .filter((token) => !/^FL\d{2,3}$/.test(token));
}

/**
 * Airway-like tokens (e.g. J60, UL9, NATS) are excluded when they match
 * short alphanumeric airway patterns; 5-letter fixes and ICAOs are kept.
 */
export function isLikelyAirwayDesignator(token: string): boolean {
  return /^[A-Z]{1,2}\d{1,4}[A-Z]?$/.test(token) && token.length < 5;
}

export function createRouteFix(
  name: string,
  index: number,
  coordinates: GeoPoint | null,
  kind: RouteFixKind,
): RouteFix {
  return {
    id: `${name}-${index}`,
    name,
    coordinates,
    kind,
    resolved: coordinates !== null,
  };
}

export function buildLegsAndSamples(
  fixes: readonly RouteFix[],
  sampleIntervalNm = ROUTE_SAMPLE_INTERVAL_NM,
): Pick<
  ParsedRoute,
  "legs" | "samples" | "pathPoints" | "totalDistanceNm" | "greatCirclePoints"
> {
  const interval = Math.min(
    ROUTE_SAMPLE_MAX_NM,
    Math.max(ROUTE_SAMPLE_MIN_NM, sampleIntervalNm),
  );

  const resolved = fixes.filter(
    (fix): fix is RouteFix & { coordinates: GeoPoint } =>
      fix.coordinates !== null,
  );

  const legs: RouteLeg[] = [];
  const samples: RouteSamplePoint[] = [];
  const pathPoints: GeoPoint[] = [];
  let totalDistanceNm = 0;
  let distanceCursor = 0;

  for (let i = 0; i < resolved.length - 1; i += 1) {
    const from = resolved[i];
    const to = resolved[i + 1];
    if (!from || !to) continue;

    const distanceNm = greatCircleDistanceNm(from.coordinates, to.coordinates);
    const segmentCount = Math.max(2, Math.ceil(distanceNm / 25));
    const path = interpolateGreatCircle(
      from.coordinates,
      to.coordinates,
      segmentCount,
    );

    const legId = `leg-${from.name}-${to.name}-${i}`;
    legs.push({
      id: legId,
      from,
      to,
      distanceNm,
      path,
    });

    if (pathPoints.length === 0) {
      pathPoints.push(...path);
    } else {
      pathPoints.push(...path.slice(1));
    }

    samples.push({
      id: `sample-${from.name}-start`,
      point: from.coordinates,
      distanceFromStartNm: distanceCursor,
      legId,
      fromFix: from.name,
      toFix: to.name,
      progressOnLeg: 0,
    });

    if (distanceNm > interval) {
      const steps = Math.floor(distanceNm / interval);
      for (let step = 1; step < steps; step += 1) {
        const fraction = (step * interval) / distanceNm;
        samples.push({
          id: `sample-${from.name}-${to.name}-${step}`,
          point: pointAlongGreatCircle(from.coordinates, to.coordinates, fraction),
          distanceFromStartNm: distanceCursor + step * interval,
          legId,
          fromFix: from.name,
          toFix: to.name,
          progressOnLeg: fraction,
        });
      }
    }

    distanceCursor += distanceNm;
    totalDistanceNm += distanceNm;
  }

  const last = resolved[resolved.length - 1];
  if (last) {
    samples.push({
      id: `sample-${last.name}-end`,
      point: last.coordinates,
      distanceFromStartNm: totalDistanceNm,
      legId: legs[legs.length - 1]?.id ?? "leg-end",
      fromFix: legs[legs.length - 1]?.from.name ?? last.name,
      toFix: last.name,
      progressOnLeg: 1,
    });
  }

  return {
    legs,
    samples,
    pathPoints,
    greatCirclePoints: pathPoints,
    totalDistanceNm,
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

/** @deprecated Use RouteEngine.resolve — kept for mock path compatibility. */
export function parseAtcRoute(
  rawRoute: string,
  departure: GeoPoint,
  destination: GeoPoint,
): ParsedRoute {
  const tokens = tokenizeAtcRoute(rawRoute).filter(
    (token) => !isLikelyAirwayDesignator(token),
  );
  const fixes = [
    createRouteFix("DEP", 0, departure, "airport"),
    ...tokens.map((token, index) => {
      const latlon = parseLatLonToken(token);
      return createRouteFix(
        token,
        index + 1,
        latlon,
        latlon ? "latlon" : "unresolved",
      );
    }),
    createRouteFix("DEST", tokens.length + 1, destination, "airport"),
  ];

  // Estimate unresolved between neighbors
  const estimated = estimateUnresolvedFixes(fixes);
  const geometry = buildLegsAndSamples(estimated);

  return {
    raw: rawRoute.trim(),
    fixes: estimated,
    unresolvedFixNames: estimated
      .filter((fix) => fix.kind === "estimated" || fix.kind === "unresolved")
      .map((fix) => fix.name),
    ...geometry,
  };
}

export function estimateUnresolvedFixes(
  fixes: readonly RouteFix[],
): RouteFix[] {
  const result = fixes.map((fix) => ({ ...fix }));

  for (let i = 0; i < result.length; i += 1) {
    const current = result[i];
    if (!current || current.coordinates) continue;

    let prevIndex = -1;
    let nextIndex = -1;
    for (let p = i - 1; p >= 0; p -= 1) {
      if (result[p]?.coordinates) {
        prevIndex = p;
        break;
      }
    }
    for (let n = i + 1; n < result.length; n += 1) {
      if (result[n]?.coordinates) {
        nextIndex = n;
        break;
      }
    }

    if (prevIndex >= 0 && nextIndex >= 0) {
      const prev = result[prevIndex];
      const next = result[nextIndex];
      if (!prev?.coordinates || !next?.coordinates) continue;
      const span = nextIndex - prevIndex;
      const offset = i - prevIndex;
      const fraction = offset / span;
      result[i] = {
        ...current,
        coordinates: pointAlongGreatCircle(
          prev.coordinates,
          next.coordinates,
          fraction,
        ),
        kind: "estimated",
        resolved: true,
      };
    }
  }

  return result;
}
