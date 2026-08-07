import type { FlightLevel, GeoPoint, IcaoCode } from "@/domain/models/common";

export interface RouteFix {
  readonly id: string;
  readonly name: string;
  readonly coordinates: GeoPoint | null;
}

export interface ParsedRoute {
  readonly raw: string;
  readonly fixes: readonly RouteFix[];
  readonly greatCirclePoints: readonly GeoPoint[];
}

export interface FlightRequest {
  readonly departureIcao: IcaoCode;
  readonly destinationIcao: IcaoCode;
  readonly alternateIcao: IcaoCode | null;
  readonly atcRoute: string;
  readonly flightLevel: FlightLevel;
}
