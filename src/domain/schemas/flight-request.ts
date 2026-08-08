import { z } from "zod";

/** ICAO identifiers are 4 alphanumeric characters (e.g. KJFK, EGLL, OTBD). */
export const ICAO_REGEX = /^[A-Z0-9]{4}$/;

const icaoSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => ICAO_REGEX.test(value), {
    message: "Enter a valid 4-character ICAO identifier",
  });

const optionalIcaoSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value.toUpperCase()))
  .refine((value) => value === null || ICAO_REGEX.test(value), {
    message: "Enter a valid 4-character ICAO identifier or leave blank",
  });

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value.toUpperCase()))
  .refine((value) => value === null || value.length <= 16, {
    message: "Maximum 16 characters",
  });

/**
 * Flight levels for airline jets typically FL180–FL450.
 * Stored as the numeric FL (e.g. 350), not feet.
 */
export const MIN_FLIGHT_LEVEL = 180;
export const MAX_FLIGHT_LEVEL = 450;
export const FLIGHT_LEVEL_STEP = 10;

function defaultEtdIso(): string {
  const d = new Date(Date.now() + 90 * 60_000);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString();
}

/** Normalize any ETD-ish input to a UTC ISO string; never throw — fall back to default. */
export function normalizeDepartureTimeUtc(raw: unknown): string {
  if (raw == null) return defaultEtdIso();
  const value = String(raw).trim();
  if (!value || value === "undefined" || value === "null") {
    return defaultEtdIso();
  }

  let candidate = value;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(candidate)) {
    candidate = `${candidate}:00.000Z`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/i.test(candidate)) {
    // already ISO with Z
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(candidate)) {
    candidate = `${candidate}Z`;
  } else if (candidate.includes(" ")) {
    candidate = candidate.replace(" ", "T").replace(/ /g, ":");
    if (!candidate.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(candidate)) {
      candidate = `${candidate}Z`;
    }
  }

  const ms = Date.parse(candidate);
  if (Number.isNaN(ms)) {
    return defaultEtdIso();
  }
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  // Guard absurd parses (e.g. Date.parse("12345"))
  if (year < 2020 || year > 2100) {
    return defaultEtdIso();
  }
  return date.toISOString();
}

/**
 * Accepts datetime-local (`YYYY-MM-DDTHH:mm`) or full ISO; normalizes to UTC ISO.
 * Invalid / missing values silently default so briefings never die on ETD alone.
 */
export const departureTimeUtcSchema = z.preprocess(
  (raw) => normalizeDepartureTimeUtc(raw),
  z.string().min(1),
);

export const flightBriefingRequestSchema = z
  .object({
    departureIcao: icaoSchema,
    destinationIcao: icaoSchema,
    alternateIcao: optionalIcaoSchema,
    atcRoute: z
      .string()
      .trim()
      .min(3, "Enter the ATC route string")
      .max(2000, "Route is too long"),
    flightLevel: z.coerce
      .number()
      .int("Flight level must be a whole number")
      .min(MIN_FLIGHT_LEVEL, `Minimum FL${MIN_FLIGHT_LEVEL}`)
      .max(MAX_FLIGHT_LEVEL, `Maximum FL${MAX_FLIGHT_LEVEL}`)
      .refine((value) => value % FLIGHT_LEVEL_STEP === 0, {
        message: `Flight level must be in increments of ${FLIGHT_LEVEL_STEP}`,
      }),
    departureTimeUtc: departureTimeUtcSchema,
    flightNumber: optionalText,
    aircraftRegistration: optionalText,
  })
  .refine((data) => data.departureIcao !== data.destinationIcao, {
    message: "Departure and destination must differ",
    path: ["destinationIcao"],
  })
  .refine(
    (data) =>
      data.alternateIcao === null ||
      (data.alternateIcao !== data.departureIcao &&
        data.alternateIcao !== data.destinationIcao),
    {
      message: "Alternate must differ from departure and destination",
      path: ["alternateIcao"],
    },
  );

export type FlightBriefingFormValues = z.input<typeof flightBriefingRequestSchema>;
export type FlightBriefingRequestParsed = z.output<
  typeof flightBriefingRequestSchema
>;
