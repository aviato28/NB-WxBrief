import type { GeoBounds, IcaoCode } from "@/domain/models/common";
import type { ParsedRoute } from "@/domain/models/route";
import type { GeoPoint } from "@/domain/models/common";
import type {
  AirportWeather,
  EnrouteWeather,
  Sigmet,
} from "@/domain/models/weather";

export interface EnrouteWeatherQuery {
  readonly departureIcao: IcaoCode | string;
  readonly destinationIcao: IcaoCode | string;
  readonly flightLevel: number;
  /** Planned departure (ISO UTC) — drives winds/turbulence valid time. */
  readonly departureTimeUtc: string;
  readonly routeText: string;
  /** Preferred: fully resolved filed route. */
  readonly route?: ParsedRoute;
  /** Legacy fallback path points. */
  readonly routePoints?: readonly GeoPoint[];
}

export interface WeatherProvider {
  readonly id: string;
  getAirportWeather(icao: IcaoCode | string): Promise<AirportWeather | null>;
  getEnrouteWeather(query: EnrouteWeatherQuery): Promise<EnrouteWeather>;
  getSigmets(bounds: GeoBounds | null): Promise<readonly Sigmet[]>;
}
