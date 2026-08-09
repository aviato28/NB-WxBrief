import type {
  AirportWeather,
  ConvectiveAssessment,
  CrewOnboardBrief,
  TurbulenceAssessment,
  TurbulenceIntensity,
} from "@/domain/models/weather";
import type { ParsedRoute } from "@/domain/models/route";
import { BRIEFING_ASSUMED_GROUNDSPEED_KT } from "@/domain/constants/app";
import { formatFlightLevel } from "@/lib/format";

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

function ridePhrase(intensity: TurbulenceIntensity): string {
  switch (intensity) {
    case "NONE":
      return "smooth";
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

/**
 * Short, plain-language onboard weather brief for the crew.
 * Timed from assumed groundspeed along the filed route — advisory only.
 */
export function buildCrewOnboardBrief(input: {
  route: ParsedRoute;
  turbulence: readonly TurbulenceAssessment[];
  convective: readonly ConvectiveAssessment[];
  departure: AirportWeather;
  destination: AirportWeather;
  cruiseFlightLevel: number;
  groundspeedKt?: number;
}): CrewOnboardBrief {
  const gs = input.groundspeedKt ?? BRIEFING_ASSUMED_GROUNDSPEED_KT;
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
      // Preserve route order via leg index when possible.
      const ai = input.route.legs.findIndex(
        (leg) => `${leg.from.name}–${leg.to.name}` === a.segmentLabel,
      );
      const bi = input.route.legs.findIndex(
        (leg) => `${leg.from.name}–${leg.to.name}` === b.segmentLabel,
      );
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });

  // Cumulative distance to the start of each leg.
  const legStartNm = new Map<string, number>();
  let cursor = 0;
  for (const leg of input.route.legs) {
    legStartNm.set(`${leg.from.name}–${leg.to.name}`, cursor);
    cursor += leg.distanceNm;
  }

  const lines: string[] = [];

  // Departure convective cue.
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

  const first = cruiseTurb[0];
  if (first && first.intensity === "NONE" && !earlyConv) {
    lines.push("Climb and early cruise look smooth.");
  } else if (first && turbRank(first.intensity) >= 1) {
    const startNm = legStartNm.get(first.segmentLabel) ?? 0;
    const midNm = startNm + (input.route.legs.find(
      (l) => `${l.from.name}–${l.to.name}` === first.segmentLabel,
    )?.distanceNm ?? 0) / 2;
    const when = formatHoursIntoFlight(midNm / gs);
    if (midNm / gs < 1.0) {
      lines.push(
        `Early on — expect ${ridePhrase(first.intensity)}${first.intensity === "SEVERE" ? ". Seatbelt sign — brief the cabin." : "."}`,
      );
    } else {
      lines.push(
        `${when.charAt(0).toUpperCase()}${when.slice(1)} — expect ${ridePhrase(first.intensity)}.`,
      );
    }
  }

  // Mid-route bumps (skip first if already mentioned; pick notable legs).
  for (const turb of cruiseTurb.slice(1, -1)) {
    if (turbRank(turb.intensity) < 1) continue;
    const startNm = legStartNm.get(turb.segmentLabel) ?? totalNm / 2;
    const leg = input.route.legs.find(
      (l) => `${l.from.name}–${l.to.name}` === turb.segmentLabel,
    );
    const midNm = startNm + (leg?.distanceNm ?? 0) / 2;
    const when = formatHoursIntoFlight(midNm / gs);
    if (turb.intensity === "SEVERE") {
      lines.push(
        `${when.charAt(0).toUpperCase()}${when.slice(1)} — significant turbulence. Seatbelt sign on; consider a level change.`,
      );
    } else if (turb.intensity === "MODERATE") {
      lines.push(
        `${when.charAt(0).toUpperCase()}${when.slice(1)} — expect a bumpier ride for a stretch.`,
      );
    } else {
      lines.push(
        `${when.charAt(0).toUpperCase()}${when.slice(1)} — some light chop.`,
      );
    }
    if (lines.length >= 5) break;
  }

  // If nothing bumpy mid-route was said and overall cruise is quiet.
  const maxCruise = cruiseTurb.reduce(
    (max, t) => Math.max(max, turbRank(t.intensity)),
    0,
  );
  if (maxCruise === 0 && lines.every((l) => !l.toLowerCase().includes("chop") && !l.toLowerCase().includes("bumpy") && !l.toLowerCase().includes("turbulence"))) {
    lines.push("Cruise looks smooth the whole way — nothing noteworthy in the ride.");
  } else if (maxCruise === 1 && !lines.some((l) => l.includes("chop") || l.includes("bumpy"))) {
    lines.push("Most of the cruise is fine — only light chop in places.");
  }

  // Descent / last portion (~last 20% of distance).
  const descentThresholdNm = totalNm * 0.8;
  const lateTurb = cruiseTurb.filter((t) => {
    const start = legStartNm.get(t.segmentLabel) ?? 0;
    return start >= descentThresholdNm || t === cruiseTurb[cruiseTurb.length - 1];
  });
  const lateMax = lateTurb.reduce(
    (max, t) => Math.max(max, turbRank(t.intensity)),
    0,
  );
  if (lateTurb.length === 0 || lateMax === 0) {
    lines.push(`Descent into ${dest} should be smooth.`);
  } else if (lateMax === 1) {
    lines.push(`Descent into ${dest} — maybe a little light chop, nothing major.`);
  } else if (lateMax === 2) {
    lines.push(`Descent into ${dest} — expect a bumpier ride on the way down.`);
  } else {
    lines.push(
      `Descent into ${dest} — significant turbulence possible. Brief the cabin early.`,
    );
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

  // Cap length — crew brief stays short.
  const trimmed = lines.slice(0, 7);
  if (trimmed.length === 0) {
    trimmed.push("Nothing significant in the weather for this sector — normal ops.");
  }

  return { headline, lines: trimmed };
}
