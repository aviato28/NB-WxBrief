import type { Airport } from "@/domain/models/airport";
import type { FlightRequest, ParsedRoute } from "@/domain/models/route";
import type {
  AirportWeather,
  EnrouteWeather,
  ThreatItem,
} from "@/domain/models/weather";

export interface FlightSummary {
  readonly departure: Airport;
  readonly destination: Airport;
  readonly alternate: Airport | null;
  readonly flightLevel: number;
  readonly departureTimeUtc: string;
  readonly routeDistanceNm: number;
  readonly estimatedAirway: string;
  readonly generatedAt: string;
}

export interface WeatherBriefing {
  readonly id: string;
  readonly request: FlightRequest;
  readonly summary: FlightSummary;
  readonly route: ParsedRoute;
  readonly departureWeather: AirportWeather;
  readonly destinationWeather: AirportWeather;
  readonly alternateWeather: AirportWeather | null;
  readonly enroute: EnrouteWeather;
  readonly threats: readonly ThreatItem[];
  readonly dataMode: "mock" | "live";
}
