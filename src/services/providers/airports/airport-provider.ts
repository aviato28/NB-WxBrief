import type { Airport } from "@/domain/models/airport";
import type { IcaoCode } from "@/domain/models/common";

export interface AirportProvider {
  readonly id: string;
  lookup(icao: IcaoCode | string): Promise<Airport | null>;
  search(query: string, limit?: number): Promise<readonly Airport[]>;
}
