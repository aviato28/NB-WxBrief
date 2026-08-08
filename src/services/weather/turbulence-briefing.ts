import type {
  TurbulenceAssessment,
  TurbulenceAltitudeBand,
  TurbulenceCause,
  TurbulenceConfidence,
  TurbulenceIntensity,
  WindsAloftSample,
  ConvectiveAssessment,
  Sigmet,
  WaypointCondition,
  AirportWeather,
} from "@/domain/models/weather";
import type { ParsedRoute } from "@/domain/models/route";
import {
  TURBULENCE_ALTITUDE_OFFSET_FL,
  TURBULENCE_ALTITUDE_STEP_FL,
} from "@/domain/constants/app";
import {
  MAX_FLIGHT_LEVEL,
  MIN_FLIGHT_LEVEL,
} from "@/domain/schemas/flight-request";
import { cruiseAltitudeLadder } from "@/lib/aviation-geo";
import { formatFlightLevel } from "@/lib/format";

function intensityFromShear(shear: number | null): TurbulenceIntensity {
  if (shear === null) return "NONE";
  // Shear proxy is kt per ~1000 ft across neighboring pressure levels.
  if (shear >= 5.5) return "SEVERE";
  if (shear >= 3.0) return "MODERATE";
  if (shear >= 1.5) return "LIGHT";
  return "NONE";
}

/** Jet-core wind speed is an additional CAT risk cue when shear is modest. */
function intensityFromWind(windKt: number): TurbulenceIntensity {
  if (windKt >= 120) return "MODERATE";
  if (windKt >= 90) return "LIGHT";
  return "NONE";
}

function worseIntensity(
  a: TurbulenceIntensity,
  b: TurbulenceIntensity,
): TurbulenceIntensity {
  const rank: Record<TurbulenceIntensity, number> = {
    NONE: 0,
    LIGHT: 1,
    MODERATE: 2,
    SEVERE: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

function bandFromOffset(offsetFl: number): TurbulenceAltitudeBand {
  if (offsetFl < 0) return "below";
  if (offsetFl > 0) return "above";
  return "cruise";
}

function causeFromContext(
  intensity: TurbulenceIntensity,
  windSpeedKt: number,
  convectiveNearby: boolean,
): TurbulenceCause {
  if (intensity === "NONE") return "UNKNOWN";
  if (convectiveNearby) return "CONVECTIVE";
  if (windSpeedKt >= 80) return "JET_STREAM_SHEAR";
  if (windSpeedKt >= 50) return "CLEAR_AIR";
  return "CLEAR_AIR";
}

function confidenceFrom(
  intensity: TurbulenceIntensity,
  sigmetHit: boolean,
): TurbulenceConfidence {
  if (sigmetHit) return "HIGH";
  if (intensity === "MODERATE" || intensity === "SEVERE") return "MEDIUM";
  return "LOW";
}

function durationForDistance(distanceNm: number): string {
  if (distanceNm < 40) return "Short segment (< ~30 min)";
  if (distanceNm < 120) return "About 20–45 minutes";
  if (distanceNm < 250) return "About 45–90 minutes";
  return "Extended period (> 90 minutes)";
}

function pilotPhrase(intensity: TurbulenceIntensity): string {
  switch (intensity) {
    case "NONE":
      return "Smooth.";
    case "LIGHT":
      return "Occasional light turbulence.";
    case "MODERATE":
      return "Moderate CAT possible.";
    case "SEVERE":
      return "Severe turbulence possible — consider FL change.";
  }
}

function bandLabel(offsetFl: number, fl: number): string {
  const abs = formatFlightLevel(fl);
  if (offsetFl === 0) return `${abs} (cruise)`;
  const feet = Math.abs(offsetFl) * 100;
  const sign = offsetFl < 0 ? "−" : "+";
  return `${abs} (${sign}${feet} ft)`;
}

export function buildTurbulenceBriefing(input: {
  route: ParsedRoute;
  winds: readonly WindsAloftSample[];
  flightLevel: number;
  sigmets: readonly Sigmet[];
}): readonly TurbulenceAssessment[] {
  const { route, winds, flightLevel, sigmets } = input;
  const ladder = cruiseAltitudeLadder(
    flightLevel,
    TURBULENCE_ALTITUDE_OFFSET_FL,
    TURBULENCE_ALTITUDE_STEP_FL,
    MIN_FLIGHT_LEVEL,
    MAX_FLIGHT_LEVEL,
  );

  const turbSigmets = sigmets.filter((s) => s.hazard === "TURB");
  const assessments: TurbulenceAssessment[] = [];

  for (const leg of route.legs) {
    const fromCoord = leg.from.coordinates;
    const toCoord = leg.to.coordinates;
    if (!fromCoord || !toCoord) {
      continue;
    }

    for (const { offsetFl, fl } of ladder) {
      const levelWinds = winds.filter((sample) => sample.flightLevel === fl);
      const legWinds = levelWinds.filter((sample) => {
        const nearFrom =
          Math.abs(sample.point.latitude - fromCoord.latitude) < 4 &&
          Math.abs(sample.point.longitude - fromCoord.longitude) < 4;
        const nearTo =
          Math.abs(sample.point.latitude - toCoord.latitude) < 4 &&
          Math.abs(sample.point.longitude - toCoord.longitude) < 4;
        return (
          sample.label.includes(leg.from.name) ||
          sample.label.includes(leg.to.name) ||
          nearFrom ||
          nearTo
        );
      });

      const shearValues = legWinds
        .map((w) => w.shearProxyKtPer1000Ft)
        .filter((v): v is number => v !== null);
      const maxShear =
        shearValues.length > 0 ? Math.max(...shearValues) : null;
      const maxWind =
        legWinds.length > 0
          ? Math.max(...legWinds.map((w) => w.windSpeedKt))
          : 0;

      let intensity = worseIntensity(
        intensityFromShear(maxShear),
        intensityFromWind(maxWind),
      );

      // Route-corridor TURB SIGMET raises the floor — model shear alone under-calls CAT.
      if (turbSigmets.length > 0) {
        intensity = worseIntensity(intensity, "LIGHT");
        if (maxWind >= 80 || (maxShear !== null && maxShear >= 2.5)) {
          intensity = worseIntensity(intensity, "MODERATE");
        }
      }

      const sigmetHit = turbSigmets.length > 0 && intensity !== "NONE";
      const convectiveNearby = sigmets.some((s) => s.hazard === "CONVECTIVE");
      if (convectiveNearby && intensity === "NONE" && maxWind >= 40) {
        intensity = "LIGHT";
      }

      const cause = causeFromContext(intensity, maxWind, convectiveNearby);
      const confidence = confidenceFrom(intensity, sigmetHit);
      const flBand = bandLabel(offsetFl, fl);
      const phrase = pilotPhrase(intensity);
      const causeText =
        cause === "JET_STREAM_SHEAR"
          ? "Likely jet-stream related wind shear."
          : cause === "CONVECTIVE"
            ? "Associated with convective activity near route."
            : cause === "CLEAR_AIR"
              ? "Clear-air turbulence risk from vertical shear / jet."
              : "Cause indeterminate from available model fields.";
      const dataNote =
        maxShear === null && legWinds.length === 0
          ? " Limited wind samples on this leg."
          : maxShear === null
            ? " Shear proxy unavailable; wind-speed cue used."
            : "";

      assessments.push({
        segmentLabel: `${leg.from.name}–${leg.to.name}`,
        fromFix: leg.from.name,
        toFix: leg.to.name,
        intensity,
        flightLevel: fl,
        altitudeBand: bandFromOffset(offsetFl),
        altitudeOffsetFl: offsetFl,
        flightLevelBand: flBand,
        expectedDuration: durationForDistance(leg.distanceNm),
        likelyCause: cause,
        confidence,
        pilotText: `${leg.from.name}–${leg.to.name} @ ${formatFlightLevel(fl)}\n${phrase}${
          intensity === "MODERATE" || intensity === "SEVERE"
            ? ` ${formatFlightLevel(fl)}.`
            : ""
        }`,
        notes: `${causeText} Confidence ${confidence}.${dataNote} Advisory model product — verify with SIGMET/PIREPs.`,
      });
    }
  }

  return assessments;
}

export function buildDispatchBullets(input: {
  turbulence: readonly TurbulenceAssessment[];
  convective: readonly ConvectiveAssessment[];
  winds: readonly WindsAloftSample[];
  departure: AirportWeather;
  destination: AirportWeather;
  alternate: AirportWeather | null;
  route: ParsedRoute;
}): readonly string[] {
  const bullets: string[] = [];
  const rank: Record<TurbulenceIntensity, number> = {
    NONE: 0,
    LIGHT: 1,
    MODERATE: 2,
    SEVERE: 3,
  };

  const cruiseTurb = input.turbulence.filter((t) => t.altitudeOffsetFl === 0);
  const modTurb = cruiseTurb.filter(
    (t) => t.intensity === "MODERATE" || t.intensity === "SEVERE",
  );
  for (const turb of modTurb.slice(0, 3)) {
    bullets.push(
      `${turb.intensity === "SEVERE" ? "Severe" : "Moderate"} turbulence expected on ${turb.segmentLabel} (${turb.flightLevelBand}).`,
    );
  }

  // Prefer the smoothest alternate level within ±4000 ft (1000 ft steps).
  for (const cruise of modTurb.slice(0, 2)) {
    const alts = input.turbulence.filter(
      (t) =>
        t.segmentLabel === cruise.segmentLabel && t.altitudeOffsetFl !== 0,
    );
    const smoother = alts
      .filter((t) => rank[t.intensity] < rank[cruise.intensity])
      .sort(
        (a, b) =>
          rank[a.intensity] - rank[b.intensity] ||
          Math.abs(a.altitudeOffsetFl) - Math.abs(b.altitudeOffsetFl),
      )[0];
    if (smoother) {
      const feet = Math.abs(smoother.altitudeOffsetFl) * 100;
      const sign = smoother.altitudeOffsetFl < 0 ? "−" : "+";
      bullets.push(
        `Smoother ride likely ${formatFlightLevel(smoother.flightLevel)} (${sign}${feet} ft) on ${cruise.segmentLabel}.`,
      );
    }
  }

  const lightTurb = cruiseTurb.find((t) => t.intensity === "LIGHT");
  if (lightTurb && modTurb.length === 0) {
    bullets.push(
      `Occasional light turbulence possible after ${lightTurb.fromFix}.`,
    );
  }

  const conv = input.convective.find((c) => c.risk !== "NONE");
  if (conv) {
    bullets.push(
      `${conv.risk === "WIDESPREAD" ? "Widespread" : conv.risk === "SCATTERED" ? "Scattered" : "Isolated"} convective activity relative to planned route.`,
    );
  }

  const cruiseWinds = input.winds.filter(
    (w) =>
      w.flightLevel ===
      (cruiseTurb[0]?.flightLevel ??
        input.winds.find(() => true)?.flightLevel),
  );
  const windPool = cruiseWinds.length > 0 ? cruiseWinds : input.winds;
  if (windPool.length >= 2) {
    const mid = windPool[Math.floor(windPool.length / 2)];
    if (mid && mid.windSpeedKt >= 60) {
      const tailish =
        mid.windDirectionDeg >= 240 || mid.windDirectionDeg <= 30
          ? "tailwind"
          : "strong wind";
      bullets.push(
        `Strong ${tailish} component near ${mid.label} (~${mid.windSpeedKt} kt @ FL${mid.flightLevel}).`,
      );
    }
  }

  const destCat = input.destination.metar?.flightCategory;
  if (destCat === "VFR" || destCat === "MVFR") {
    bullets.push(
      `Destination ${input.destination.icao} ${destCat === "VFR" ? "VMC" : "marginal VMC / MVFR"} for the current observation; review TAF for arrival window.`,
    );
  } else if (destCat === "IFR" || destCat === "LIFR") {
    bullets.push(
      `Destination ${input.destination.icao} currently ${destCat} — plan fuel/holding and diversion strategy.`,
    );
  }

  if (input.alternate?.metar) {
    const altCat = input.alternate.metar.flightCategory;
    bullets.push(
      altCat === "IFR" || altCat === "LIFR"
        ? `Alternate ${input.alternate.icao} is ${altCat}; confirm suitability.`
        : `Alternate ${input.alternate.icao} weather suitable (${altCat}).`,
    );
  }

  if (input.route.unresolvedFixNames.length > 0) {
    bullets.push(
      `Route geometry estimated for unresolved fix(es): ${input.route.unresolvedFixNames.slice(0, 6).join(", ")}.`,
    );
  }

  if (bullets.length === 0) {
    bullets.push(
      "No significant enroute weather threats identified from current products.",
    );
  }

  return bullets;
}

export function buildWaypointConditions(input: {
  route: ParsedRoute;
  winds: readonly WindsAloftSample[];
  turbulence: readonly TurbulenceAssessment[];
  sigmets: readonly Sigmet[];
  cruiseFlightLevel?: number;
}): readonly WaypointCondition[] {
  const cruiseFl =
    input.cruiseFlightLevel ??
    input.turbulence.find((t) => t.altitudeOffsetFl === 0)?.flightLevel ??
    input.winds[0]?.flightLevel;

  return input.route.fixes.flatMap((fix) => {
    if (!fix.coordinates) {
      return [];
    }
    const coordinates = fix.coordinates;
    const levelWinds = cruiseFl
      ? input.winds.filter((w) => w.flightLevel === cruiseFl)
      : input.winds;
    const wind = levelWinds.find(
      (sample) =>
        sample.label.includes(fix.name) ||
        (Math.abs(sample.point.latitude - coordinates.latitude) < 0.6 &&
          Math.abs(sample.point.longitude - coordinates.longitude) < 0.6),
    );
    const turb =
      input.turbulence.find(
        (t) =>
          (t.fromFix === fix.name || t.toFix === fix.name) &&
          t.altitudeOffsetFl === 0,
      )?.intensity ??
      input.turbulence.find(
        (t) => t.fromFix === fix.name || t.toFix === fix.name,
      )?.intensity ??
      "NONE";

    const nearbySigmetIds = input.sigmets
      .filter((s) => s.polygon && s.polygon.length > 0)
      .slice(0, 3)
      .map((s) => s.id);

    return [
      {
        fixName: fix.name,
        point: coordinates,
        windDirectionDeg: wind?.windDirectionDeg ?? null,
        windSpeedKt: wind?.windSpeedKt ?? null,
        temperatureC: wind?.temperatureC ?? null,
        turbulence: turb,
        cloudCoverPct: wind?.cloudCoverPct ?? null,
        nearbySigmetIds,
        forecastNote:
          turb === "NONE"
            ? "No significant turbulence signal at sample."
            : `${turb} turbulence signal near this waypoint.`,
      },
    ];
  });
}
