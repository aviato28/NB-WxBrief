import type { FlightLevel, IcaoCode } from "@/domain/models/common";
import type { FlightRequest } from "@/domain/models/route";
import type { FlightBriefingRequestParsed } from "@/domain/schemas/flight-request";
import { flightBriefingRequestSchema } from "@/domain/schemas/flight-request";

export function toFlightRequest(
  parsed: FlightBriefingRequestParsed,
): FlightRequest {
  return {
    departureIcao: parsed.departureIcao as IcaoCode,
    destinationIcao: parsed.destinationIcao as IcaoCode,
    alternateIcao: (parsed.alternateIcao as IcaoCode | null) ?? null,
    atcRoute: parsed.atcRoute,
    flightLevel: parsed.flightLevel as FlightLevel,
    flightNumber: parsed.flightNumber,
    aircraftRegistration: parsed.aircraftRegistration,
  };
}

export function flightRequestToSearchParams(
  request: FlightRequest,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("dep", request.departureIcao);
  params.set("dest", request.destinationIcao);
  params.set("fl", String(request.flightLevel));
  params.set("route", request.atcRoute);
  if (request.alternateIcao) {
    params.set("altn", request.alternateIcao);
  }
  if (request.flightNumber) {
    params.set("fn", request.flightNumber);
  }
  if (request.aircraftRegistration) {
    params.set("reg", request.aircraftRegistration);
  }
  return params;
}

export function flightRequestFromSearchParams(
  params: URLSearchParams,
): FlightRequest | null {
  const result = flightBriefingRequestSchema.safeParse({
    departureIcao: params.get("dep") ?? "",
    destinationIcao: params.get("dest") ?? "",
    alternateIcao: params.get("altn") ?? "",
    atcRoute: params.get("route") ?? "",
    flightLevel: params.get("fl") ?? "",
    flightNumber: params.get("fn") ?? "",
    aircraftRegistration: params.get("reg") ?? "",
  });

  if (!result.success) {
    return null;
  }

  return toFlightRequest(result.data);
}

export function briefingQueryKey(request: FlightRequest): readonly unknown[] {
  return [
    "briefing",
    request.departureIcao,
    request.destinationIcao,
    request.alternateIcao,
    request.flightLevel,
    request.atcRoute,
    request.flightNumber,
    request.aircraftRegistration,
  ] as const;
}
