import type { GeoPoint, IcaoCode } from "@/domain/models/common";

export interface Airport {
  readonly icao: IcaoCode;
  readonly iata: string | null;
  readonly name: string;
  readonly city: string | null;
  readonly country: string;
  readonly coordinates: GeoPoint;
  readonly elevationFt: number | null;
  readonly timezone: string | null;
}
