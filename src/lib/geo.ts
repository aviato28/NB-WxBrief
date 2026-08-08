import type { GeoPoint } from "@/domain/models/common";
import type {
  AtcRouteToken,
  AtcTokenKind,
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

const DIRECT_TOKENS = new Set(["DCT", "DIRECT"]);

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
  return classifyAtcRouteTokens(rawRoute)
    .filter(
      (token) =>
        token.kind !== "direct" &&
        token.kind !== "airway" &&
        token.kind !== "unknown",
    )
    .map((token) => token.raw);
}

/**
 * Parse a filed ATC route string into typed tokens.
 * Preserves airways (J60, UL9, N96A) and splits ICAO `.` / `..` separators.
 */
export function classifyAtcRouteTokens(rawRoute: string): AtcRouteToken[] {
  const normalized = rawRoute
    .trim()
    .toUpperCase()
    // ICAO field-10 style: KJFK..RBV..J60..PSB or KJFK.SHIPP5.SHIPP
    .replace(/\.\.+/g, " ")
    .replace(/\./g, " ")
    .replace(/\//g, " ");

  const parts = normalized
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Z0-9]/g, ""))
    .filter((token) => token.length > 0)
    .filter((token) => !/^FL\d{2,3}$/.test(token));

  return parts.map((raw) => ({ raw, kind: classifyAtcToken(raw) }));
}

export function classifyAtcToken(token: string): AtcTokenKind {
  if (DIRECT_TOKENS.has(token)) return "direct";
  if (NON_FIX_TOKENS.has(token)) return "unknown";
  if (parseLatLonToken(token)) return "latlon";
  if (isLikelyAirwayDesignator(token)) return "airway";
  // SID/STAR procedure names often end with a digit (SHIPP5, BERDS2).
  if (/^[A-Z]{3,5}\d[A-Z]?$/.test(token)) return "procedure";
  if (/^[A-Z]{4}$/.test(token)) return "airport";
  if (/^[A-Z]{5}$/.test(token)) return "fix";
  if (/^[A-Z]{3}$/.test(token)) return "navaid";
  return "unknown";
}

/**
 * Airway-like tokens (e.g. J60, UL9, N96A, T213).
 * Kept in the filed token list; skipped for geographic fix lookup.
 */
export function isLikelyAirwayDesignator(token: string): boolean {
  if (token.length < 2 || token.length > 6) return false;
  // Domestic/jet/victor/RNAV/Q/T routes and common Euro airways (Ux n, Nx).
  return (
    /^[A-Z]{1,2}\d{1,4}[A-Z]?$/.test(token) ||
    /^[TQ]\d{1,4}[A-Z]?$/.test(token)
  );
}

/** Build a display string that keeps airways between bounding fixes. */
export function formatResolvedRouteText(
  tokens: readonly AtcRouteToken[],
): string {
  return tokens
    .filter((token) => token.kind !== "direct" && token.kind !== "unknown")
    .map((token) => token.raw)
    .join(" ");
}

export function createRouteFix(
  name: string,
  index: number,
  coordinates: GeoPoint | null,
  kind: RouteFixKind,
  viaAirway: string | null = null,
): RouteFix {
  return {
    id: `${name}-${index}`,
    name,
    coordinates,
    kind,
    resolved: coordinates !== null,
    viaAirway,
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
  const filedTokens = classifyAtcRouteTokens(rawRoute);
  const tokens = filedTokens.filter(
    (token) =>
      token.kind !== "direct" &&
      token.kind !== "airway" &&
      token.kind !== "unknown",
  );
  const fixes = [
    createRouteFix("DEP", 0, departure, "airport"),
    ...tokens.map((token, index) => {
      const latlon = parseLatLonToken(token.raw);
      return createRouteFix(
        token.raw,
        index + 1,
        latlon,
        latlon ? "latlon" : "unresolved",
      );
    }),
    createRouteFix("DEST", tokens.length + 1, destination, "airport"),
  ];

  // Estimate unresolved between neighbors
  const estimated = estimateUnresolvedFixes(fixes);
  const withAirways = attachViaAirways(estimated, filedTokens);
  const geometry = buildLegsAndSamples(withAirways);

  return {
    raw: rawRoute.trim(),
    filedTokens,
    resolvedRouteText: formatResolvedRouteText(filedTokens),
    fixes: withAirways,
    unresolvedFixNames: withAirways
      .filter((fix) => fix.kind === "estimated" || fix.kind === "unresolved")
      .map((fix) => fix.name),
    ...geometry,
  };
}

/**
 * Attach the airway designator that follows each fix in the filed token list
 * onto that fix (`viaAirway`), so UI can show RBV → PSB via J60.
 */
export function attachViaAirways(
  fixes: readonly RouteFix[],
  tokens: readonly AtcRouteToken[],
): RouteFix[] {
  const result = fixes.map((fix) => ({ ...fix, viaAirway: fix.viaAirway ?? null }));
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || token.kind !== "airway") continue;
    // Find the nearest preceding geographic token name among fixes.
    let prevName: string | null = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      const prev = tokens[j];
      if (!prev) continue;
      if (
        prev.kind === "airway" ||
        prev.kind === "direct" ||
        prev.kind === "unknown"
      ) {
        continue;
      }
      prevName = prev.raw;
      break;
    }
    if (!prevName) continue;
    const fixIndex = result.findIndex((fix) => fix.name === prevName);
    if (fixIndex >= 0 && result[fixIndex]) {
      result[fixIndex] = { ...result[fixIndex], viaAirway: token.raw };
    }
  }
  return result;
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
