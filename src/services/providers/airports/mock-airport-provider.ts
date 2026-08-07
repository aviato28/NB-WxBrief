import { MOCK_NETWORK_DELAY_MS } from "@/domain/constants/app";
import type { Airport } from "@/domain/models/airport";
import { getMockAirport, MOCK_AIRPORTS } from "@/data/mock/airports";
import type { AirportProvider } from "@/services/providers/airports/airport-provider";

async function simulateLatency(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, MOCK_NETWORK_DELAY_MS / 3);
  });
}

export class MockAirportProvider implements AirportProvider {
  readonly id = "mock-airports";

  async lookup(icao: string): Promise<Airport | null> {
    await simulateLatency();
    return getMockAirport(icao);
  }

  async search(query: string, limit = 8): Promise<readonly Airport[]> {
    await simulateLatency();
    const normalized = query.trim().toUpperCase();
    if (normalized.length === 0) {
      return [];
    }

    return Object.values(MOCK_AIRPORTS)
      .filter((airport) => {
        return (
          airport.icao.includes(normalized) ||
          (airport.iata?.includes(normalized) ?? false) ||
          airport.name.toUpperCase().includes(normalized) ||
          (airport.city?.toUpperCase().includes(normalized) ?? false)
        );
      })
      .slice(0, limit);
  }
}
