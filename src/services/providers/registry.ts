import type { AirportProvider } from "@/services/providers/airports/airport-provider";
import { MockAirportProvider } from "@/services/providers/airports/mock-airport-provider";
import { OurAirportsProvider } from "@/services/providers/airports/ourairports-provider";
import type { WeatherProvider } from "@/services/providers/weather/weather-provider";
import { AwcWeatherProvider } from "@/services/providers/weather/awc-weather-provider";
import { MockWeatherProvider } from "@/services/providers/weather/mock-weather-provider";

export type DataMode = "mock" | "live";

export interface ProviderRegistry {
  readonly mode: DataMode;
  readonly airports: AirportProvider;
  readonly weather: WeatherProvider;
}

function resolveMode(explicit?: DataMode): DataMode {
  if (explicit) {
    return explicit;
  }
  const fromEnv = process.env.DATA_MODE;
  if (fromEnv === "mock" || fromEnv === "live") {
    return fromEnv;
  }
  return "live";
}

/**
 * Central provider wiring.
 * Live mode (default): OurAirports + NOAA AWC + Open-Meteo.
 * Mock mode: deterministic fixtures for offline UI work (`DATA_MODE=mock`).
 */
export function createProviderRegistry(mode?: DataMode): ProviderRegistry {
  const resolved = resolveMode(mode);

  if (resolved === "mock") {
    return {
      mode: "mock",
      airports: new MockAirportProvider(),
      weather: new MockWeatherProvider(),
    };
  }

  const airports = new OurAirportsProvider();
  return {
    mode: "live",
    airports,
    weather: new AwcWeatherProvider(airports),
  };
}

let singleton: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!singleton) {
    singleton = createProviderRegistry();
  }
  return singleton;
}

/** Test helper — resets singleton between suites. */
export function resetProviderRegistry(): void {
  singleton = null;
}
