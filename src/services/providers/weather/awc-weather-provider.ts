import type { GeoBounds, GeoPoint } from "@/domain/models/common";
import type {
  AirportWeather,
  ConvectiveAssessment,
  EnrouteWeather,
  Sigmet,
} from "@/domain/models/weather";
import type { ParsedRoute } from "@/domain/models/route";
import { routeIntersectsSigmet } from "@/lib/aviation-geo";
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
import {
  buildDispatchBullets,
  buildTurbulenceBriefing,
  buildWaypointConditions,
} from "@/services/weather/turbulence-briefing";

const AWC_BASE = "https://aviationweather.gov/api/data";

/**
 * Live weather provider:
 * - NOAA AWC for METAR / TAF / SIGMET
 * - Open-Meteo for winds/cloud along the resolved route
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

    return [...(intl ?? []), ...(us ?? [])].map((item, index) =>
      mapAwcSigmet(item, index),
    );
  }

  async getEnrouteWeather(query: EnrouteWeatherQuery): Promise<EnrouteWeather> {
    const routePoints: GeoPoint[] = [
      ...(query.route?.pathPoints ?? query.routePoints ?? []),
    ];

    const [allSigmets, windsResult] = await Promise.all([
      this.getSigmets(null),
      query.route && query.route.samples.length > 0
        ? this.windsClient
            .sampleAlongRoute(query.route.samples, query.flightLevel)
            .catch((error: unknown) => {
              console.warn("[open-meteo-winds] soft-fail:", error);
              return { windsAloft: [], shearBySampleId: new Map() };
            })
        : routePoints.length > 0
          ? this.windsClient
              .sampleRouteWinds(routePoints, query.flightLevel)
              .then((r) => ({
                windsAloft: r.windsAloft.map((w) => ({
                  ...w,
                  cloudCoverPct: w.cloudCoverPct ?? null,
                })),
                shearBySampleId: new Map(),
              }))
              .catch(() => ({
                windsAloft: [],
                shearBySampleId: new Map(),
              }))
          : Promise.resolve({
              windsAloft: [],
              shearBySampleId: new Map(),
            }),
    ]);

    const winds = windsResult.windsAloft;

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
        notes: `${convectiveSigmets.length} convective SIGMET(s) intersect or are near the filed route corridor.`,
      });
    } else {
      convective.push({
        segmentLabel: "Route corridor",
        risk: "NONE",
        notes:
          "No convective SIGMETs currently intersecting the filed route corridor.",
      });
    }

    const emptyRoute: ParsedRoute = {
      raw: query.routeText,
      fixes: [],
      pathPoints: routePoints,
      greatCirclePoints: routePoints,
      legs: [],
      samples: [],
      totalDistanceNm: 0,
      unresolvedFixNames: [],
    };

    const route = query.route ?? emptyRoute;

    const turbulence = buildTurbulenceBriefing({
      route,
      winds,
      flightLevel: query.flightLevel,
      sigmets,
    });

    const alongRouteNotes = [
      `Winds/cloud sampled via Open-Meteo along the filed waypoint route at FL${query.flightLevel} (advisory).`,
      `Route distance ${Math.round(route.totalDistanceNm).toLocaleString()} NM across ${route.legs.length} leg(s).`,
    ];

    if (route.unresolvedFixNames.length > 0) {
      alongRouteNotes.push(
        `Estimated positions for unresolved fixes: ${route.unresolvedFixNames.join(", ")}.`,
      );
    }

    if (winds.length === 0) {
      alongRouteNotes.push(
        "Winds aloft samples unavailable; verify with official FD / company winds.",
      );
    } else {
      const maxWind = Math.max(...winds.map((sample) => sample.windSpeedKt));
      alongRouteNotes.push(`Peak sampled wind along route ≈ ${maxWind} kt.`);
    }

    // Placeholder terminal weather for dispatch bullets — filled by BriefingService.
    const stubWx = {
      icao: query.departureIcao as AirportWeather["icao"],
      metar: null,
      taf: null,
      operationalSummary: "",
      fetchedAt: new Date().toISOString(),
    };

    const waypointConditions = buildWaypointConditions({
      route,
      winds,
      turbulence,
      sigmets,
    });

    const dispatchBullets = buildDispatchBullets({
      turbulence,
      convective,
      winds,
      departure: stubWx,
      destination: {
        ...stubWx,
        icao: query.destinationIcao as AirportWeather["icao"],
      },
      alternate: null,
      route,
    });

    return {
      windsAloft: winds,
      turbulence:
        turbulence.length > 0
          ? turbulence
          : [
              {
                segmentLabel: "Route corridor",
                fromFix: query.departureIcao,
                toFix: query.destinationIcao,
                intensity: "NONE",
                flightLevelBand: `FL${query.flightLevel}`,
                expectedDuration: "Entire route",
                likelyCause: "UNKNOWN",
                confidence: "LOW",
                pilotText: "Route corridor\nSmooth.",
                notes: "No significant model shear detected at sampled points.",
              },
            ],
      convective,
      alongRouteNotes,
      sigmets,
      waypointConditions,
      dispatchBullets,
    };
  }
}
