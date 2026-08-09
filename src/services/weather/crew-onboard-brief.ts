import type {
  AirportWeather,
  ConvectiveAssessment,
  CrewOnboardBrief,
  TurbulenceAssessment,
  TurbulenceIntensity,
  WindsAloftSample,
} from "@/domain/models/weather";
import type { ParsedRoute, RouteSamplePoint } from "@/domain/models/route";
import {
  AIRCRAFT_FAMILY_CRUISE_GS_KT,
  BRIEFING_AIRCRAFT_FAMILY,
  BRIEFING_ASSUMED_GROUNDSPEED_KT,
  ROUTE_SAMPLE_INTERVAL_NM,
} from "@/domain/constants/app";
import { formatFlightLevel } from "@/lib/format";
import { greatCircleDistanceNm } from "@/lib/geo";

function turbRank(intensity: TurbulenceIntensity): number {
  switch (intensity) {
    case "NONE":
      return 0;
    case "LIGHT":
      return 1;
    case "MODERATE":
      return 2;
    case "SEVERE":
      return 3;
  }
}

function worseIntensity(
  a: TurbulenceIntensity,
  b: TurbulenceIntensity,
): TurbulenceIntensity {
  return turbRank(a) >= turbRank(b) ? a : b;
}

function intensityFromShear(shear: number | null): TurbulenceIntensity {
  if (shear === null) return "NONE";
  if (shear >= 5.5) return "SEVERE";
  if (shear >= 3.0) return "MODERATE";
  if (shear >= 1.5) return "LIGHT";
  return "NONE";
}

function intensityFromWind(windKt: number): TurbulenceIntensity {
  if (windKt >= 120) return "MODERATE";
  if (windKt >= 90) return "LIGHT";
  return "NONE";
}

function rideNoun(intensity: TurbulenceIntensity): string {
  switch (intensity) {
    case "NONE":
      return "smooth air";
    case "LIGHT":
      return "light chop";
    case "MODERATE":
      return "a bumpier ride";
    case "SEVERE":
      return "significant turbulence";
  }
}

/** "about 45 minutes" / "around 2 hours" / "around 2 and a half hours" */
function formatHoursIntoFlight(hours: number): string {
  if (hours < 0.35) return "in the first half hour";
  if (hours < 0.75) return "around 45 minutes in";
  if (hours < 1.25) return "around 1 hour in";
  const whole = Math.floor(hours);
  const frac = hours - whole;
  if (frac < 0.25) return `around ${whole} hour${whole === 1 ? "" : "s"} in`;
  if (frac < 0.75) {
    return `around ${whole} and a half hours in`;
  }
  return `around ${whole + 1} hours in`;
}

function formatTotalTime(hours: number): string {
  if (hours < 1.2) return "about 1 hour";
  const whole = Math.round(hours);
  return `about ${whole} hours`;
}

/** Crew-friendly duration buckets. */
function formatDurationMinutes(minutes: number): string {
  const m = Math.max(5, Math.round(minutes));
  if (m < 8) return "about 5 minutes";
  if (m < 13) return "about 10 minutes";
  if (m < 18) return "about 15 minutes";
  if (m < 25) return "about 20 minutes";
  if (m < 40) return "about 30 minutes";
  if (m < 55) return "about 45 minutes";
  if (m < 75) return "about an hour";
  if (m < 100) return "about an hour and a half";
  return "for a couple of hours";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function categoryArrivalNote(
  weather: AirportWeather | null,
  icao: string,
): string | null {
  const cat = weather?.metar?.flightCategory;
  if (!cat) return null;
  if (cat === "VFR") {
    return `Arrival into ${icao} looks straightforward — VFR conditions at the field.`;
  }
  if (cat === "MVFR") {
    return `Arrival into ${icao} — a bit of weather at the field (MVFR); nothing dramatic, just brief the approach.`;
  }
  if (cat === "IFR") {
    return `Arrival into ${icao} — IFR at the field. Expect weather on the approach and have holding/divert in mind.`;
  }
  return `Arrival into ${icao} — LIFR. Plan for a messy approach and protect fuel.`;
}

interface TurbStretch {
  readonly startNm: number;
  readonly endNm: number;
  readonly intensity: TurbulenceIntensity;
}

/**
 * A320-family planning GS, lightly biased by cruise wind samples when present.
 * Kept conservative — not a performance calculation.
 */
export function resolveCrewBriefGroundspeedKt(input: {
  winds?: readonly WindsAloftSample[];
  cruiseFlightLevel?: number;
  family?: keyof typeof AIRCRAFT_FAMILY_CRUISE_GS_KT;
}): number {
  const family = input.family ?? BRIEFING_AIRCRAFT_FAMILY;
  const base = AIRCRAFT_FAMILY_CRUISE_GS_KT[family] ?? BRIEFING_ASSUMED_GROUNDSPEED_KT;
  const winds = input.winds ?? [];
  const cruiseFl = input.cruiseFlightLevel;
  const pool =
    cruiseFl != null
      ? winds.filter((w) => w.flightLevel === cruiseFl)
      : winds;
  if (pool.length < 2) return base;

  // Mean wind speed as a soft GS bias (strong jet → slightly faster/slower timing).
  // Cap ±25 kt so we never invent unrealistic A320 block times.
  const meanWind =
    pool.reduce((sum, w) => sum + w.windSpeedKt, 0) / pool.length;
  const bias = Math.max(-25, Math.min(25, (meanWind - 55) * 0.2));
  return Math.round(base + bias);
}

function intensityAtSample(
  sample: RouteSamplePoint,
  cruiseWinds: readonly WindsAloftSample[],
): TurbulenceIntensity {
  let best: WindsAloftSample | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const wind of cruiseWinds) {
    const d = greatCircleDistanceNm(sample.point, wind.point);
    if (d < bestDist) {
      bestDist = d;
      best = wind;
    }
  }
  if (!best || bestDist > 120) return "NONE";
  return worseIntensity(
    intensityFromShear(best.shearProxyKtPer1000Ft),
    intensityFromWind(best.windSpeedKt),
  );
}

/**
 * Build contiguous bumpy stretches from route samples + cruise winds.
 * Each sample represents ~ROUTE_SAMPLE_INTERVAL_NM of track.
 */
export function estimateTurbulenceStretches(input: {
  route: ParsedRoute;
  winds: readonly WindsAloftSample[];
  cruiseFlightLevel: number;
  cruiseTurbulence: readonly TurbulenceAssessment[];
}): readonly TurbStretch[] {
  const cruiseWinds = input.winds.filter(
    (w) => w.flightLevel === input.cruiseFlightLevel,
  );
  const samples = input.route.samples
    .slice()
    .sort((a, b) => a.distanceFromStartNm - b.distanceFromStartNm);

  const halfInterval = ROUTE_SAMPLE_INTERVAL_NM / 2;
  const stretches: TurbStretch[] = [];

  if (samples.length >= 2 && cruiseWinds.length > 0) {
    let active: TurbStretch | null = null;
    for (const sample of samples) {
      const intensity = intensityAtSample(sample, cruiseWinds);
      const startNm = Math.max(0, sample.distanceFromStartNm - halfInterval);
      const endNm = sample.distanceFromStartNm + halfInterval;
      if (turbRank(intensity) < 1) {
        if (active) {
          stretches.push(active);
          active = null;
        }
        continue;
      }
      if (!active) {
        active = { startNm, endNm, intensity };
        continue;
      }
      // Merge if contiguous and similar intensity (within 1 rank).
      if (
        startNm <= active.endNm + halfInterval &&
        Math.abs(turbRank(intensity) - turbRank(active.intensity)) <= 1
      ) {
        active = {
          startNm: active.startNm,
          endNm: Math.max(active.endNm, endNm),
          intensity: worseIntensity(active.intensity, intensity),
        };
      } else {
        stretches.push(active);
        active = { startNm, endNm, intensity };
      }
    }
    if (active) stretches.push(active);
  }

  // Fallback: leg-level cruise assessments when sample shear is sparse.
  if (stretches.length === 0) {
    let cursor = 0;
    for (const leg of input.route.legs) {
      const label = `${leg.from.name}–${leg.to.name}`;
      const turb = input.cruiseTurbulence.find((t) => t.segmentLabel === label);
      if (turb && turbRank(turb.intensity) >= 1) {
        stretches.push({
          startNm: cursor,
          endNm: cursor + leg.distanceNm,
          intensity: turb.intensity,
        });
      }
      cursor += leg.distanceNm;
    }
  }

  // Merge overlapping / back-to-back stretches after fallback mix.
  const merged: TurbStretch[] = [];
  for (const stretch of stretches
    .slice()
    .sort((a, b) => a.startNm - b.startNm)) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      stretch.startNm <= prev.endNm + ROUTE_SAMPLE_INTERVAL_NM &&
      Math.abs(turbRank(stretch.intensity) - turbRank(prev.intensity)) <= 1
    ) {
      merged[merged.length - 1] = {
        startNm: prev.startNm,
        endNm: Math.max(prev.endNm, stretch.endNm),
        intensity: worseIntensity(prev.intensity, stretch.intensity),
      };
    } else {
      merged.push(stretch);
    }
  }

  return merged;
}

function stretchLine(stretch: TurbStretch, gs: number): string {
  const midNm = (stretch.startNm + stretch.endNm) / 2;
  const when = formatHoursIntoFlight(midNm / gs);
  const durationMin = ((stretch.endNm - stretch.startNm) / gs) * 60;
  const forHowLong = formatDurationMinutes(durationMin);
  const ride = rideNoun(stretch.intensity);

  if (stretch.intensity === "SEVERE") {
    return `${capitalize(when)} — ${ride} for ${forHowLong}. Seatbelt sign on; consider a level change.`;
  }
  if (stretch.intensity === "MODERATE") {
    return `${capitalize(when)} — expect ${ride} for ${forHowLong}.`;
  }
  // Light — only say "early on" for the first ~25 minutes.
  if (midNm / gs < 0.4) {
    return `Early on — ${ride} for ${forHowLong}.`;
  }
  return `${capitalize(when)} — ${ride} for ${forHowLong}.`;
}

/**
 * Short, plain-language onboard weather brief for the crew.
 * Timed for A320-family cruise GS; duration from sample/leg turb stretches.
 */
export function buildCrewOnboardBrief(input: {
  route: ParsedRoute;
  turbulence: readonly TurbulenceAssessment[];
  convective: readonly ConvectiveAssessment[];
  departure: AirportWeather;
  destination: AirportWeather;
  cruiseFlightLevel: number;
  winds?: readonly WindsAloftSample[];
  groundspeedKt?: number;
}): CrewOnboardBrief {
  const gs =
    input.groundspeedKt ??
    resolveCrewBriefGroundspeedKt({
      winds: input.winds,
      cruiseFlightLevel: input.cruiseFlightLevel,
    });
  const dep = input.route.fixes[0]?.name ?? input.departure.icao;
  const dest =
    input.route.fixes[input.route.fixes.length - 1]?.name ??
    input.destination.icao;
  const totalNm = Math.max(1, input.route.totalDistanceNm);
  const totalHours = totalNm / gs;

  const headline = `${dep} → ${dest} · ${formatTotalTime(totalHours)} · ${formatFlightLevel(input.cruiseFlightLevel)}`;

  const cruiseTurb = input.turbulence
    .filter((t) => t.altitudeOffsetFl === 0)
    .slice()
    .sort((a, b) => {
      const ai = input.route.legs.findIndex(
        (leg) => `${leg.from.name}–${leg.to.name}` === a.segmentLabel,
      );
      const bi = input.route.legs.findIndex(
        (leg) => `${leg.from.name}–${leg.to.name}` === b.segmentLabel,
      );
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });

  const lines: string[] = [];

  const earlyConv = input.convective.find(
    (c) =>
      c.risk !== "NONE" &&
      (c.segmentLabel.toLowerCase().includes("depart") ||
        c.segmentLabel.toLowerCase().includes("climb") ||
        c.segmentLabel.toLowerCase().includes("coastal") ||
        c.segmentLabel.startsWith(dep)),
  );
  if (earlyConv) {
    lines.push(
      earlyConv.risk === "ISOLATED"
        ? "Departure — keep an eye out for isolated storms on the climb-out."
        : "Departure — convective weather in the area; expect deviations early on.",
    );
  }

  const stretches = estimateTurbulenceStretches({
    route: input.route,
    winds: input.winds ?? [],
    cruiseFlightLevel: input.cruiseFlightLevel,
    cruiseTurbulence: cruiseTurb,
  });

  const descentNm = totalNm * 0.8;
  const cruiseStretches = stretches.filter(
    (s) => s.startNm < descentNm || s.endNm < descentNm,
  );
  const descentStretches = stretches.filter((s) => s.endNm >= descentNm);

  if (cruiseStretches.length === 0 && !earlyConv) {
    lines.push("Climb and early cruise look smooth.");
  }

  for (const stretch of cruiseStretches) {
    lines.push(stretchLine(stretch, gs));
    if (lines.length >= 5) break;
  }

  const maxCruise = cruiseStretches.reduce(
    (max, s) => Math.max(max, turbRank(s.intensity)),
    0,
  );
  if (
    maxCruise === 0 &&
    lines.every(
      (l) =>
        !l.toLowerCase().includes("chop") &&
        !l.toLowerCase().includes("bumpy") &&
        !l.toLowerCase().includes("turbulence"),
    )
  ) {
    if (!lines.some((l) => l.includes("smooth"))) {
      lines.push(
        "Cruise looks smooth the whole way — nothing noteworthy in the ride.",
      );
    }
  }

  const lateMax = descentStretches.reduce(
    (max, s) => Math.max(max, turbRank(s.intensity)),
    0,
  );
  if (descentStretches.length === 0 || lateMax === 0) {
    lines.push(`Descent into ${dest} should be smooth.`);
  } else {
    const worst = descentStretches.reduce((a, b) =>
      turbRank(a.intensity) >= turbRank(b.intensity) ? a : b,
    );
    const durationMin = ((worst.endNm - worst.startNm) / gs) * 60;
    const forHowLong = formatDurationMinutes(durationMin);
    if (lateMax === 1) {
      lines.push(
        `Descent into ${dest} — light chop for ${forHowLong}, nothing major.`,
      );
    } else if (lateMax === 2) {
      lines.push(
        `Descent into ${dest} — bumpier ride for ${forHowLong} on the way down.`,
      );
    } else {
      lines.push(
        `Descent into ${dest} — significant turbulence for ${forHowLong}. Brief the cabin early.`,
      );
    }
  }

  const arrival = categoryArrivalNote(input.destination, dest);
  if (arrival) {
    lines.push(arrival);
  }

  const depCat = input.departure.metar?.flightCategory;
  if (depCat === "IFR" || depCat === "LIFR") {
    lines.unshift(
      `Departure from ${dep} is ${depCat} — expect weather on the takeoff roll / climb.`,
    );
  }

  const trimmed = lines.slice(0, 7);
  if (trimmed.length === 0) {
    trimmed.push(
      "Nothing significant in the weather for this sector — normal ops.",
    );
  }

  return { headline, lines: trimmed };
}
