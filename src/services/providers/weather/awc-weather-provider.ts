import type { GeoBounds, GeoPoint } from "@/domain/models/common";
import type {
  AirportWeather,
  ConvectiveAssessment,
  EnrouteWeather,
  Sigmet,
} from "@/domain/models/weather";
import type { ParsedRoute } from "@/domain/models/route";
import {
  BRIEFING_ASSUMED_GROUNDSPEED_KT,
  TURBULENCE_ALTITUDE_OFFSET_FL,
  TURBULENCE_ALTITUDE_STEP_FL,
} from "@/domain/constants/app";
import {
  MAX_FLIGHT_LEVEL,
  MIN_FLIGHT_LEVEL,
} from "@/domain/schemas/flight-request";
import { cruiseAltitudeLadder, routeIntersectsSigmet } from "@/lib/aviation-geo";
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
import { buildCrewOnboardBrief } from "@/services/weather/crew-onboard-brief";

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

    const ladder = cruiseAltitudeLadder(
      query.flightLevel,
      TURBULENCE_ALTITUDE_OFFSET_FL,
      TURBULENCE_ALTITUDE_STEP_FL,
      MIN_FLIGHT_LEVEL,
      MAX_FLIGHT_LEVEL,
    );
    const flightLevels = ladder.map((row) => row.fl);
    const cruiseFl = query.flightLevel;

    const windowStart = Date.parse(query.departureTimeUtc);
    const etaMs =
      windowStart +
      (query.route
        ? (query.route.totalDistanceNm / BRIEFING_ASSUMED_GROUNDSPEED_KT) *
          3_600_000
        : 8 * 3_600_000);
    const windowEnd = Number.isFinite(etaMs)
      ? etaMs
      : windowStart + 8 * 3_600_000;

    const [allSigmets, windsResult] = await Promise.all([
      this.getSigmets(null),
      query.route && query.route.samples.length > 0
        ? this.windsClient
            .sampleAlongRoute(
              query.route.samples,
              flightLevels,
              query.departureTimeUtc,
            )
            .catch((error: unknown) => {
              console.warn("[open-meteo-winds] soft-fail:", error);
              return { windsAloft: [], shearBySampleId: new Map() };
            })
        : routePoints.length > 0
          ? this.windsClient
              .sampleRouteWinds(
                routePoints,
                query.flightLevel,
                query.departureTimeUtc,
              )
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
      .filter((sigmet) => {
        if (!sigmet.polygon) return false;
        if (!routeIntersectsSigmet(routePoints, sigmet.polygon, 150)) {
          return false;
        }
        const from = Date.parse(sigmet.validFrom);
        const to = Date.parse(sigmet.validTo);
        if (Number.isNaN(from) || Number.isNaN(to) || Number.isNaN(windowStart)) {
          return true;
        }
        return from <= windowEnd && to >= windowStart;
      })
      .slice(0, 20);

    const convective: ConvectiveAssessment[] = [];
    const convectiveSigmets = sigmets.filter((s) => s.hazard === "CONVECTIVE");
    if (convectiveSigmets.length > 0) {
      convective.push({
        segmentLabel: "Route corridor",
        risk: convectiveSigmets.length >= 3 ? "SCATTERED" : "ISOLATED",
        notes: `${convectiveSigmets.length} convective SIGMET(s) intersect or are near the filed route corridor for the planned departure window.`,
      });
    } else {
      convective.push({
        segmentLabel: "Route corridor",
        risk: "NONE",
        notes:
          "No convective SIGMETs intersecting the filed route corridor for the planned departure window.",
      });
    }

    const emptyRoute: ParsedRoute = {
      raw: query.routeText,
      filedTokens: [],
      resolvedRouteText: query.routeText,
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

    const flLo = ladder[0]?.fl ?? cruiseFl;
    const flHi = ladder[ladder.length - 1]?.fl ?? cruiseFl;
    const alongRouteNotes = [
      `Winds/turbulence timed from ETD ${query.departureTimeUtc.slice(0, 16).replace("T", " ")}Z along the filed route.`,
      `Sampled ${ladder.length} levels FL${flLo}–FL${flHi} in 1000 ft steps (±4000 ft around cruise FL${cruiseFl}) via Open-Meteo (advisory).`,
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
      const cruiseWinds = winds.filter((w) => w.flightLevel === cruiseFl);
      const pool = cruiseWinds.length > 0 ? cruiseWinds : winds;
      const maxWind = Math.max(...pool.map((sample) => sample.windSpeedKt));
      alongRouteNotes.push(`Peak sampled wind @ cruise ≈ ${maxWind} kt.`);
    }

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
      cruiseFlightLevel: cruiseFl,
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

    const crewBrief = buildCrewOnboardBrief({
      route,
      turbulence: turbulence.length > 0 ? turbulence : [],
      convective,
      departure: stubWx,
      destination: {
        ...stubWx,
        icao: query.destinationIcao as AirportWeather["icao"],
      },
      cruiseFlightLevel: cruiseFl,
      winds,
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
                intensity: "NONE" as const,
                flightLevel: cruiseFl,
                altitudeBand: "cruise" as const,
                altitudeOffsetFl: 0,
                flightLevelBand: `FL${cruiseFl} (cruise)`,
                expectedDuration: "Entire route",
                likelyCause: "UNKNOWN" as const,
                confidence: "LOW" as const,
                pilotText: "Route corridor\nSmooth.",
                notes: "No significant model shear detected at sampled points.",
              },
            ],
      convective,
      alongRouteNotes,
      sigmets,
      waypointConditions,
      dispatchBullets,
      crewBrief,
    };
  }
}
