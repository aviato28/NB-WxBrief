import type { GeoBounds, IcaoCode } from "@/domain/models/common";
import type {
  AirportWeather,
  EnrouteWeather,
  Sigmet,
} from "@/domain/models/weather";

export interface EnrouteWeatherQuery {
  readonly departureIcao: IcaoCode | string;
  readonly destinationIcao: IcaoCode | string;
  readonly flightLevel: number;
  readonly routeText: string;
}

export interface WeatherProvider {
  readonly id: string;
  getAirportWeather(icao: IcaoCode | string): Promise<AirportWeather | null>;
  getEnrouteWeather(query: EnrouteWeatherQuery): Promise<EnrouteWeather>;
  getSigmets(bounds: GeoBounds | null): Promise<readonly Sigmet[]>;
}
