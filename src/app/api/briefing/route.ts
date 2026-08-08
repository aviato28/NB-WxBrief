import { NextResponse } from "next/server";
import { flightBriefingRequestSchema } from "@/domain/schemas/flight-request";
import { defaultDepartureTimeUtc, toFlightRequest } from "@/lib/flight-request";
import {
  BriefingError,
  getBriefingService,
} from "@/services/briefing/briefing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BFF endpoint — required because NOAA AWC blocks browser CORS.
 * All live provider I/O stays on the server behind BriefingService.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  // Back-compat: older clients may omit ETD
  const normalized =
    body && typeof body === "object"
      ? {
          ...(body as Record<string, unknown>),
          departureTimeUtc:
            (body as { departureTimeUtc?: unknown }).departureTimeUtc ||
            defaultDepartureTimeUtc(),
        }
      : body;

  const parsed = flightBriefingRequestSchema.safeParse(normalized);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: firstIssue
            ? `Flight request validation failed: ${firstIssue.path.join(".")} — ${firstIssue.message}`
            : "Flight request validation failed.",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  try {
    const briefing = await getBriefingService().generate(
      toFlightRequest(parsed.data),
    );
    return NextResponse.json({ briefing });
  } catch (error) {
    if (error instanceof BriefingError) {
      const status =
        error.code === "AIRPORT_NOT_FOUND"
          ? 404
          : error.code === "WEATHER_UNAVAILABLE"
            ? 502
            : error.code === "INVALID_REQUEST"
              ? 400
              : 502;
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status },
      );
    }

    console.error("Unexpected briefing failure", error);
    return NextResponse.json(
      {
        error: {
          code: "UPSTREAM_FAILURE",
          message: "Unexpected server error while generating briefing.",
        },
      },
      { status: 500 },
    );
  }
}
