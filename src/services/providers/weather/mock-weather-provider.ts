import { MOCK_NETWORK_DELAY_MS } from "@/domain/constants/app";
import type { GeoBounds } from "@/domain/models/common";
import type {
  AirportWeather,
  EnrouteWeather,
  Sigmet,
} from "@/domain/models/weather";
import {
  buildMockAirportWeather,
  buildMockEnrouteWeather,
  MOCK_SIGMETS,
} from "@/data/mock/weather";
import type {
  EnrouteWeatherQuery,
  WeatherProvider,
} from "@/services/providers/weather/weather-provider";

async function simulateLatency(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, MOCK_NETWORK_DELAY_MS / 2);
  });
}

export class MockWeatherProvider implements WeatherProvider {
  readonly id = "mock-weather";

  async getAirportWeather(icao: string): Promise<AirportWeather | null> {
    await simulateLatency();
    return buildMockAirportWeather(icao);
  }

  async getEnrouteWeather(query: EnrouteWeatherQuery): Promise<EnrouteWeather> {
    await simulateLatency();
    void query.departureIcao;
    void query.destinationIcao;
    void query.routeText;
    void query.departureTimeUtc;
    return buildMockEnrouteWeather(query.flightLevel);
  }

  async getSigmets(bounds: GeoBounds | null): Promise<readonly Sigmet[]> {
    void bounds;
    await simulateLatency();
    return MOCK_SIGMETS;
  }
}
