import type { FlightLevel, GeoPoint, IcaoCode } from "@/domain/models/common";

export type RouteFixKind =
  | "airport"
  | "fix"
  | "navaid"
  | "latlon"
  | "estimated"
  | "unresolved"
  | "airway"
  | "procedure";

/** Structured ATC token after parse (airways retained). */
export type AtcTokenKind =
  | "airport"
  | "fix"
  | "navaid"
  | "latlon"
  | "airway"
  | "procedure"
  | "direct"
  | "unknown";

export interface AtcRouteToken {
  readonly raw: string;
  readonly kind: AtcTokenKind;
}

export interface RouteFix {
  readonly id: string;
  readonly name: string;
  readonly coordinates: GeoPoint | null;
  readonly kind: RouteFixKind;
  readonly resolved: boolean;
  /** Airway used outbound from this fix toward the next (e.g. J60), if filed. */
  readonly viaAirway?: string | null;
}

export interface RouteLeg {
  readonly id: string;
  readonly from: RouteFix;
  readonly to: RouteFix;
  readonly distanceNm: number;
  readonly path: readonly GeoPoint[];
}

export interface RouteSamplePoint {
  readonly id: string;
  readonly point: GeoPoint;
  readonly distanceFromStartNm: number;
  readonly legId: string;
  readonly fromFix: string;
  readonly toFix: string;
  readonly progressOnLeg: number;
}

export interface ParsedRoute {
  readonly raw: string;
  /** Filed string with airways preserved in order (normalized spacing). */
  readonly filedTokens: readonly AtcRouteToken[];
  /** Display string including airways, e.g. `RBV J60 PSB J6 HVQ`. */
  readonly resolvedRouteText: string;
  readonly fixes: readonly RouteFix[];
  /** Ordered polyline of the filed route (not dep→dest great-circle). */
  readonly pathPoints: readonly GeoPoint[];
  /** @deprecated Prefer pathPoints — retained for compatibility. */
  readonly greatCirclePoints: readonly GeoPoint[];
  readonly legs: readonly RouteLeg[];
  readonly samples: readonly RouteSamplePoint[];
  readonly totalDistanceNm: number;
  readonly unresolvedFixNames: readonly string[];
}

export interface FlightRequest {
  readonly departureIcao: IcaoCode;
  readonly destinationIcao: IcaoCode;
  readonly alternateIcao: IcaoCode | null;
  readonly atcRoute: string;
  readonly flightLevel: FlightLevel;
  /** Planned departure time as ISO-8601 UTC (e.g. 2026-08-08T18:30:00.000Z). */
  readonly departureTimeUtc: string;
  readonly flightNumber: string | null;
  readonly aircraftRegistration: string | null;
}
