import type { FlightLevel, GeoPoint, IcaoCode } from "@/domain/models/common";

export type RouteFixKind =
  | "airport"
  | "fix"
  | "navaid"
  | "latlon"
  | "estimated"
  | "unresolved";

export interface RouteFix {
  readonly id: string;
  readonly name: string;
  readonly coordinates: GeoPoint | null;
  readonly kind: RouteFixKind;
  readonly resolved: boolean;
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
  readonly flightNumber: string | null;
  readonly aircraftRegistration: string | null;
}
