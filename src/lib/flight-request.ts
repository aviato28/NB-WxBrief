import type { FlightLevel, IcaoCode } from "@/domain/models/common";
import type { FlightRequest } from "@/domain/models/route";
import type { FlightBriefingRequestParsed } from "@/domain/schemas/flight-request";
import {
  flightBriefingRequestSchema,
  normalizeDepartureTimeUtc,
} from "@/domain/schemas/flight-request";

export function toFlightRequest(
  parsed: FlightBriefingRequestParsed,
): FlightRequest {
  return {
    departureIcao: parsed.departureIcao as IcaoCode,
    destinationIcao: parsed.destinationIcao as IcaoCode,
    alternateIcao: (parsed.alternateIcao as IcaoCode | null) ?? null,
    atcRoute: parsed.atcRoute,
    flightLevel: parsed.flightLevel as FlightLevel,
    departureTimeUtc: normalizeDepartureTimeUtc(parsed.departureTimeUtc),
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
  params.set("etd", normalizeDepartureTimeUtc(request.departureTimeUtc));
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
    departureTimeUtc: params.get("etd") ?? defaultDepartureTimeUtc(),
    flightNumber: params.get("fn") ?? "",
    aircraftRegistration: params.get("reg") ?? "",
  });

  if (!result.success) {
    console.warn(
      "[flight-request] URL parse failed:",
      result.error.flatten(),
      Object.fromEntries(params.entries()),
    );
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
    request.departureTimeUtc,
    request.atcRoute,
    request.flightNumber,
    request.aircraftRegistration,
  ] as const;
}

/** Format ISO UTC for `<input type="datetime-local">` (no Z). */
export function toDatetimeLocalValue(isoUtc: string): string {
  const d = new Date(normalizeDepartureTimeUtc(isoUtc));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Default ETD: next whole UTC hour at least 90 minutes from now. */
export function defaultDepartureTimeUtc(now = new Date()): string {
  const d = new Date(now.getTime() + 90 * 60_000);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString();
}
