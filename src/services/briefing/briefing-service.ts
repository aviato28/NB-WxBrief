import type { WeatherBriefing } from "@/domain/models/briefing";
import type { FlightRequest } from "@/domain/models/route";
import type { AirportWeather } from "@/domain/models/weather";
import { greatCircleDistanceNm, parseAtcRoute } from "@/lib/geo";
import type { ProviderRegistry } from "@/services/providers/registry";
import { getProviderRegistry } from "@/services/providers/registry";
import { buildOperationalSummary } from "@/services/weather/operational-summary";
import { buildThreatSummary } from "@/services/weather/threat-builder";
import { buildMockThreats } from "@/data/mock/weather";

export class BriefingError extends Error {
  readonly code:
    | "AIRPORT_NOT_FOUND"
    | "WEATHER_UNAVAILABLE"
    | "INVALID_REQUEST"
    | "UPSTREAM_FAILURE";

  constructor(
    code: BriefingError["code"],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "BriefingError";
    this.code = code;
  }
}

function withRoleSummary(
  role: "departure" | "destination" | "alternate",
  weather: AirportWeather,
): AirportWeather {
  return {
    ...weather,
    operationalSummary: buildOperationalSummary(role, weather),
  };
}

export class BriefingService {
  constructor(
    private readonly providers: ProviderRegistry = getProviderRegistry(),
  ) {}

  async generate(request: FlightRequest): Promise<WeatherBriefing> {
    try {
      const [departure, destination, alternate] = await Promise.all([
        this.providers.airports.lookup(request.departureIcao),
        this.providers.airports.lookup(request.destinationIcao),
        request.alternateIcao
          ? this.providers.airports.lookup(request.alternateIcao)
          : Promise.resolve(null),
      ]);

      if (!departure) {
        throw new BriefingError(
          "AIRPORT_NOT_FOUND",
          `Departure airport ${request.departureIcao} was not found in OurAirports data.`,
        );
      }
      if (!destination) {
        throw new BriefingError(
          "AIRPORT_NOT_FOUND",
          `Destination airport ${request.destinationIcao} was not found in OurAirports data.`,
        );
      }
      if (request.alternateIcao && !alternate) {
        throw new BriefingError(
          "AIRPORT_NOT_FOUND",
          `Alternate airport ${request.alternateIcao} was not found in OurAirports data.`,
        );
      }

      const [departureWx, destinationWx, alternateWx, enroute] =
        await Promise.all([
          this.providers.weather.getAirportWeather(request.departureIcao),
          this.providers.weather.getAirportWeather(request.destinationIcao),
          request.alternateIcao
            ? this.providers.weather.getAirportWeather(request.alternateIcao)
            : Promise.resolve(null),
          this.providers.weather.getEnrouteWeather({
            departureIcao: request.departureIcao,
            destinationIcao: request.destinationIcao,
            flightLevel: request.flightLevel,
            routeText: request.atcRoute,
          }),
        ]);

      if (!departureWx) {
        throw new BriefingError(
          "WEATHER_UNAVAILABLE",
          `No METAR/TAF available for departure ${request.departureIcao}.`,
        );
      }
      if (!destinationWx) {
        throw new BriefingError(
          "WEATHER_UNAVAILABLE",
          `No METAR/TAF available for destination ${request.destinationIcao}.`,
        );
      }

      const departureWeather = withRoleSummary("departure", departureWx);
      const destinationWeather = withRoleSummary("destination", destinationWx);
      const alternateWeather = alternateWx
        ? withRoleSummary("alternate", alternateWx)
        : null;

      const route = parseAtcRoute(
        request.atcRoute,
        departure.coordinates,
        destination.coordinates,
      );

      const distanceNm = Math.round(
        greatCircleDistanceNm(departure.coordinates, destination.coordinates),
      );

      const generatedAt = new Date().toISOString();

      const threats =
        this.providers.mode === "mock"
          ? buildMockThreats(
              request.departureIcao,
              request.destinationIcao,
              request.alternateIcao,
            )
          : buildThreatSummary({
              departure: departureWeather,
              destination: destinationWeather,
              alternate: alternateWeather,
              enroute,
            });

      return {
        id: `brief-${request.departureIcao}-${request.destinationIcao}-${request.flightLevel}-${generatedAt}`,
        request,
        summary: {
          departure,
          destination,
          alternate,
          flightLevel: request.flightLevel,
          routeDistanceNm: distanceNm,
          estimatedAirway: request.atcRoute.split(/\s+/).slice(0, 8).join(" "),
          generatedAt,
        },
        route,
        departureWeather,
        destinationWeather,
        alternateWeather,
        enroute,
        threats,
        dataMode: this.providers.mode,
      };
    } catch (error) {
      if (error instanceof BriefingError) {
        throw error;
      }
      throw new BriefingError(
        "UPSTREAM_FAILURE",
        error instanceof Error
          ? error.message
          : "Upstream weather services failed.",
        { cause: error },
      );
    }
  }
}

let briefingServiceSingleton: BriefingService | null = null;

export function getBriefingService(): BriefingService {
  if (!briefingServiceSingleton) {
    briefingServiceSingleton = new BriefingService();
  }
  return briefingServiceSingleton;
}
