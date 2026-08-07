import type { AirportWeather, DecodedMetar, DecodedTaf, TafPeriod } from "@/domain/models/weather";
import { formatCeiling, formatVisibilitySm, formatWind } from "@/lib/format";

function worstPeriod(periods: readonly TafPeriod[]): TafPeriod | null {
  if (periods.length === 0) {
    return null;
  }
  const rank = { LIFR: 4, IFR: 3, MVFR: 2, VFR: 1, UNKNOWN: 0 } as const;
  return [...periods].sort(
    (a, b) => rank[b.flightCategory] - rank[a.flightCategory],
  )[0] ?? null;
}

export function buildOperationalSummary(
  role: "departure" | "destination" | "alternate",
  weather: Pick<AirportWeather, "metar" | "taf">,
): string {
  const parts: string[] = [];
  const metar = weather.metar;
  const taf = weather.taf;

  if (metar) {
    parts.push(
      `${role === "departure" ? "Departure" : role === "destination" ? "Destination" : "Alternate"} currently ${metar.flightCategory}: wind ${formatWind(metar.wind)}, vis ${formatVisibilitySm(metar.visibilitySm)}, ceiling ${formatCeiling(metar.ceilingFtAgl)}.`,
    );
    if (metar.phenomena.length > 0) {
      parts.push(`Present weather: ${metar.phenomena.join(", ")}.`);
    }
  } else {
    parts.push("No current METAR available for this station.");
  }

  if (taf) {
    const tempoOrProb = taf.periods.filter(
      (period) =>
        period.type === "TEMPO" ||
        period.type === "PROB30" ||
        period.type === "PROB40",
    );
    const worst = worstPeriod(tempoOrProb.length > 0 ? tempoOrProb : taf.periods);
    if (worst && (worst.flightCategory === "IFR" || worst.flightCategory === "LIFR")) {
      parts.push(
        `TAF indicates ${worst.type} ${worst.flightCategory} conditions — plan fuel, holding, and diversion strategy.`,
      );
    } else if (worst && worst.flightCategory === "MVFR") {
      parts.push(`TAF trends include MVFR (${worst.type}). Monitor amendments.`);
    } else {
      parts.push("TAF indicates generally favorable terminal conditions.");
    }
  } else {
    parts.push("No TAF available — rely on METAR trend and enroute products.");
  }

  return parts.join(" ");
}

export function describeMetarShort(metar: DecodedMetar): string {
  return `${metar.flightCategory} · ${formatWind(metar.wind)} · ${formatVisibilitySm(metar.visibilitySm)}`;
}

export function describeTafShort(taf: DecodedTaf): string {
  const worst = worstPeriod(taf.periods);
  return worst
    ? `Valid through period · worst ${worst.flightCategory} (${worst.type})`
    : "TAF on file";
}
