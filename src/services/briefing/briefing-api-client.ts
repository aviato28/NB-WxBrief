import { z } from "zod";
import type { WeatherBriefing } from "@/domain/models/briefing";
import type { FlightRequest } from "@/domain/models/route";

const briefingErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export class BriefingApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "BriefingApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Client-side API adapter. UI/hooks call this — never providers directly.
 */
export async function fetchBriefing(
  request: FlightRequest,
): Promise<WeatherBriefing> {
  const response = await fetch("/api/briefing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      departureIcao: request.departureIcao,
      destinationIcao: request.destinationIcao,
      alternateIcao: request.alternateIcao ?? "",
      atcRoute: request.atcRoute,
      flightLevel: request.flightLevel,
      departureTimeUtc: request.departureTimeUtc,
      flightNumber: request.flightNumber ?? "",
      aircraftRegistration: request.aircraftRegistration ?? "",
    }),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = briefingErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new BriefingApiError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
      );
    }
    throw new BriefingApiError(
      "UPSTREAM_FAILURE",
      "Briefing request failed.",
      response.status,
    );
  }

  const briefing = (payload as { briefing?: WeatherBriefing } | null)?.briefing;
  if (!briefing) {
    throw new BriefingApiError(
      "UPSTREAM_FAILURE",
      "Briefing response was empty.",
      502,
    );
  }

  return briefing;
}
