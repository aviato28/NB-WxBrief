import type { GeoBounds } from "@/domain/models/common";
import type {
  AirportWeather,
  ConvectiveAssessment,
  EnrouteWeather,
  Sigmet,
} from "@/domain/models/weather";
import { routeIntersectsSigmet } from "@/lib/aviation-geo";
import { interpolateGreatCircle } from "@/lib/geo";
import { fetchJson, fetchJsonSoft } from "@/lib/http";
import {
  buildAirportWeatherBundle,
  mapAwcMetar,
  mapAwcSigmet,
  mapAwcTaf,
  type AwcMetarJson,
  type AwcSigmetJson,
  type AwcTafJson,
} from "@/services/weather/awc-mappers";
import { buildOperationalSummary } from "@/services/weather/operational-summary";
import { OpenMeteoWindsClient } from "@/services/providers/weather/open-meteo-winds-client";
import type {
  EnrouteWeatherQuery,
  WeatherProvider,
} from "@/services/providers/weather/weather-provider";
import type { AirportProvider } from "@/services/providers/airports/airport-provider";

const AWC_BASE = "https://aviationweather.gov/api/data";

/**
 * Live weather provider:
 * - NOAA AWC for METAR / TAF / SIGMET (authoritative aviation products)
 * - Open-Meteo for winds-aloft advisory samples along the route
 *
 * Must run server-side — AWC does not allow browser CORS.
 * Non-critical upstream failures degrade the briefing instead of aborting it.
 */
export class AwcWeatherProvider implements WeatherProvider {
  readonly id = "awc+open-meteo";

  constructor(
    private readonly airports: AirportProvider,
    private readonly windsClient: OpenMeteoWindsClient = new OpenMeteoWindsClient(),
  ) {}

  async getAirportWeather(icaoCode: string): Promise<AirportWeather | null> {
    const icao = icaoCode.trim().toUpperCase();

    const [metarResult, tafResult] = await Promise.allSettled([
      fetchJson<AwcMetarJson[]>({
        provider: "awc-metar",
        url: `${AWC_BASE}/metar?ids=${encodeURIComponent(icao)}&format=json`,
      }),
      fetchJson<AwcTafJson[]>({
        provider: "awc-taf",
        url: `${AWC_BASE}/taf?ids=${encodeURIComponent(icao)}&format=json`,
      }),
    ]);

    const metarPayload =
      metarResult.status === "fulfilled" ? metarResult.value : null;
    const tafPayload = tafResult.status === "fulfilled" ? tafResult.value : null;

    if (metarResult.status === "rejected") {
      console.warn(`[awc-metar] ${icao}:`, metarResult.reason);
    }
    if (tafResult.status === "rejected") {
      console.warn(`[awc-taf] ${icao}:`, tafResult.reason);
    }

    const metarRaw = metarPayload?.[0] ?? null;
    const tafRaw = tafPayload?.[0] ?? null;
    if (!metarRaw && !tafRaw) {
      return null;
    }

    const metar = metarRaw ? mapAwcMetar(metarRaw) : null;
    const taf = tafRaw ? mapAwcTaf(tafRaw) : null;
    const bundle = buildAirportWeatherBundle(icao, metar, taf, "");
    return {
      ...bundle,
      operationalSummary: buildOperationalSummary("destination", bundle),
    };
  }

  async getSigmets(bounds: GeoBounds | null): Promise<readonly Sigmet[]> {
    void bounds;
    const [intl, us] = await Promise.all([
      fetchJsonSoft<AwcSigmetJson[]>({
        provider: "awc-isigmet",
        url: `${AWC_BASE}/isigmet?format=json`,
      }),
      fetchJsonSoft<AwcSigmetJson[]>({
        provider: "awc-airsigmet",
        url: `${AWC_BASE}/airsigmet?format=json`,
      }),
    ]);

    const mapped = [...(intl ?? []), ...(us ?? [])].map((item, index) =>
      mapAwcSigmet(item, index),
    );
    return mapped;
  }

  async getEnrouteWeather(query: EnrouteWeatherQuery): Promise<EnrouteWeather> {
    const [departure, destination] = await Promise.all([
      this.airports.lookup(query.departureIcao),
      this.airports.lookup(query.destinationIcao),
    ]);

    const routePoints =
      departure && destination
        ? interpolateGreatCircle(
            departure.coordinates,
            destination.coordinates,
            48,
          )
        : [];

    const [allSigmets, windsResult] = await Promise.all([
      this.getSigmets(null),
      routePoints.length > 0
        ? this.windsClient
            .sampleRouteWinds(routePoints, query.flightLevel)
            .catch((error: unknown) => {
              console.warn("[open-meteo-winds] soft-fail:", error);
              return { windsAloft: [], turbulence: [] };
            })
        : Promise.resolve({ windsAloft: [], turbulence: [] }),
    ]);

    const winds = windsResult;

    // Only keep SIGMETs that geometrically intersect the route corridor.
    // Do NOT fall back to unrelated global products — that creates false threats.
    const sigmets = allSigmets
      .filter((sigmet) =>
        sigmet.polygon
          ? routeIntersectsSigmet(routePoints, sigmet.polygon, 150)
          : false,
      )
      .slice(0, 20);

    const convective: ConvectiveAssessment[] = [];
    const convectiveSigmets = sigmets.filter((s) => s.hazard === "CONVECTIVE");
    if (convectiveSigmets.length > 0) {
      convective.push({
        segmentLabel: "Route corridor",
        risk: convectiveSigmets.length >= 3 ? "SCATTERED" : "ISOLATED",
        notes: `${convectiveSigmets.length} convective SIGMET(s) intersect or are near the route corridor.`,
      });
    } else {
      convective.push({
        segmentLabel: "Route corridor",
        risk: "NONE",
        notes:
          "No convective SIGMETs currently intersecting the sampled route corridor.",
      });
    }

    const alongRouteNotes = [
      `Winds aloft sampled via Open-Meteo at FL${query.flightLevel} (advisory model data, not official FD winds).`,
      `SIGMET filter applied against great-circle route ${query.departureIcao}–${query.destinationIcao}. ATC route string is retained for briefing context: ${query.routeText.slice(0, 120)}${query.routeText.length > 120 ? "…" : ""}`,
    ];

    if (allSigmets.length === 0) {
      alongRouteNotes.push(
        "SIGMET feed was empty or temporarily unavailable; treat enroute SIGMET coverage as incomplete.",
      );
    }

    if (winds.windsAloft.length === 0) {
      alongRouteNotes.push(
        "Winds aloft samples unavailable for this request; verify with official FD / company winds.",
      );
    } else {
      const maxWind = Math.max(
        ...winds.windsAloft.map((sample) => sample.windSpeedKt),
      );
      alongRouteNotes.push(`Peak sampled wind along route ≈ ${maxWind} kt.`);
    }

    return {
      windsAloft: winds.windsAloft,
      turbulence:
        winds.turbulence.length > 0
          ? winds.turbulence
          : [
              {
                segmentLabel: "Route corridor",
                intensity: "NONE",
                notes: "No significant model shear detected at sampled points.",
              },
            ],
      convective,
      alongRouteNotes,
      sigmets,
    };
  }
}
