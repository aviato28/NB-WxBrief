import type { IcaoCode } from "@/domain/models/common";
import type {
  AirportWeather,
  EnrouteWeather,
  Sigmet,
  ThreatItem,
  ThreatSeverity,
} from "@/domain/models/weather";

function icao(code: string): IcaoCode {
  return code.toUpperCase() as IcaoCode;
}

function pushUnique(items: ThreatItem[], item: ThreatItem): void {
  if (!items.some((existing) => existing.id === item.id)) {
    items.push(item);
  }
}

function severityForCategory(
  category: string,
): ThreatSeverity | null {
  if (category === "LIFR") return "CRITICAL";
  if (category === "IFR") return "WARNING";
  if (category === "MVFR") return "CAUTION";
  return null;
}

function threatsFromAirport(
  role: string,
  weather: AirportWeather | null,
): ThreatItem[] {
  if (!weather) {
    return [];
  }
  const items: ThreatItem[] = [];
  const station = weather.icao;

  if (!weather.metar) {
    pushUnique(items, {
      id: `missing-metar-${station}`,
      severity: "WARNING",
      title: `${role} METAR missing`,
      detail: `No current observation for ${station}.`,
      relatedIcao: icao(station),
    });
  } else {
    const sev = severityForCategory(weather.metar.flightCategory);
    if (sev) {
      pushUnique(items, {
        id: `metar-cat-${station}`,
        severity: sev,
        title: `${role} ${weather.metar.flightCategory}`,
        detail: `${station} observation is ${weather.metar.flightCategory}.`,
        relatedIcao: icao(station),
      });
    }
    if (weather.metar.wind.gustKt && weather.metar.wind.gustKt >= 25) {
      pushUnique(items, {
        id: `gusts-${station}`,
        severity: "CAUTION",
        title: `${role} gusty winds`,
        detail: `${station} gusts to ${weather.metar.wind.gustKt} kt.`,
        relatedIcao: icao(station),
      });
    }
  }

  if (weather.taf) {
    for (const period of weather.taf.periods) {
      if (
        (period.type === "TEMPO" ||
          period.type === "PROB30" ||
          period.type === "PROB40") &&
        (period.flightCategory === "IFR" || period.flightCategory === "LIFR")
      ) {
        pushUnique(items, {
          id: `taf-${period.type}-${station}-${period.from}`,
          severity: period.flightCategory === "LIFR" ? "CRITICAL" : "WARNING",
          title: `${role} TAF ${period.type} ${period.flightCategory}`,
          detail: `${station} ${period.type} ${period.flightCategory} in forecast period.`,
          relatedIcao: icao(station),
        });
      }
    }
  }

  return items;
}

function threatsFromSigmets(sigmets: readonly Sigmet[]): ThreatItem[] {
  return sigmets.slice(0, 12).map((sigmet) => {
    let severity: ThreatSeverity = "INFO";
    if (sigmet.hazard === "CONVECTIVE" || sigmet.hazard === "VA") {
      severity = "WARNING";
    } else if (sigmet.severity === "SEV" || sigmet.hazard === "TURB") {
      severity = "CAUTION";
    }

    return {
      id: `sigmet-${sigmet.id}`,
      severity,
      title: `SIGMET ${sigmet.hazard}`,
      detail: sigmet.summary,
      relatedIcao: null,
    };
  });
}

export function buildThreatSummary(input: {
  departure: AirportWeather;
  destination: AirportWeather;
  alternate: AirportWeather | null;
  enroute: EnrouteWeather;
}): readonly ThreatItem[] {
  const items: ThreatItem[] = [
    ...threatsFromAirport("Departure", input.departure),
    ...threatsFromAirport("Destination", input.destination),
    ...threatsFromAirport("Alternate", input.alternate),
    ...threatsFromSigmets(input.enroute.sigmets),
  ];

  for (const turb of input.enroute.turbulence) {
    if (turb.intensity === "MODERATE" || turb.intensity === "SEVERE") {
      items.push({
        id: `turb-${turb.segmentLabel}`,
        severity: turb.intensity === "SEVERE" ? "WARNING" : "CAUTION",
        title: `${turb.intensity} turbulence`,
        detail: `${turb.segmentLabel}: ${turb.notes}`,
        relatedIcao: null,
      });
    }
  }

  for (const convective of input.enroute.convective) {
    if (convective.risk === "SCATTERED" || convective.risk === "WIDESPREAD") {
      items.push({
        id: `conv-${convective.segmentLabel}`,
        severity: convective.risk === "WIDESPREAD" ? "WARNING" : "CAUTION",
        title: `${convective.risk} convection`,
        detail: `${convective.segmentLabel}: ${convective.notes}`,
        relatedIcao: null,
      });
    }
  }

  const order: Record<ThreatSeverity, number> = {
    CRITICAL: 0,
    WARNING: 1,
    CAUTION: 2,
    INFO: 3,
  };

  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}
