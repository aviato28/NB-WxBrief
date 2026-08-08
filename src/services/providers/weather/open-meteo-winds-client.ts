import type { GeoPoint } from "@/domain/models/common";
import {
  estimateSampleTimeUtc,
  flightLevelToPressureHpa,
  neighboringPressureLevels,
  pressureHpaToApproxFlightLevel,
  toOpenMeteoHour,
  verticalShearKtPer1000Ft,
} from "@/lib/aviation-geo";
import { fetchJsonSoft } from "@/lib/http";
import type {
  TurbulenceIntensity,
  WindsAloftSample,
} from "@/domain/models/weather";
import type { RouteSamplePoint } from "@/domain/models/route";
import { BRIEFING_ASSUMED_GROUNDSPEED_KT } from "@/domain/constants/app";

interface OpenMeteoHourlyResponse {
  readonly hourly?: {
    readonly time?: string[];
    readonly [key: string]: number[] | string[] | undefined;
  };
}

function shearToIntensity(shear: number | null): TurbulenceIntensity {
  if (shear === null) return "NONE";
  if (shear >= 5.5) return "SEVERE";
  if (shear >= 3.0) return "MODERATE";
  if (shear >= 1.5) return "LIGHT";
  return "NONE";
}

function pickHourIndex(times: readonly string[] | undefined, targetIso: string): number {
  if (!times || times.length === 0) return 0;
  const target = Date.parse(targetIso);
  if (Number.isNaN(target)) return 0;
  let best = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i += 1) {
    const t = Date.parse(times[i] ?? "");
    if (Number.isNaN(t)) continue;
    const delta = Math.abs(t - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}

/**
 * Open-Meteo pressure-level winds + cloud cover.
 * Advisory only — not an official FD winds product.
 */
export class OpenMeteoWindsClient {
  readonly id = "open-meteo-winds";

  /**
   * Sample winds at one or more flight levels along the route.
   * When `departureTimeUtc` is set, each sample uses the forecast hour nearest
   * to ETD + distance/groundspeed.
   */
  async sampleAlongRoute(
    samples: readonly RouteSamplePoint[],
    flightLevels: readonly number[],
    departureTimeUtc?: string | null,
  ): Promise<{
    windsAloft: WindsAloftSample[];
    shearBySampleId: Map<string, number | null>;
  }> {
    const uniqueLevels = Array.from(new Set(flightLevels)).sort((a, b) => a - b);
    const pressureByFl = new Map(
      uniqueLevels.map((fl) => [fl, flightLevelToPressureHpa(fl)] as const),
    );
    const allHpa = Array.from(
      new Set(
        uniqueLevels.flatMap((fl) =>
          neighboringPressureLevels(pressureByFl.get(fl) ?? 250),
        ),
      ),
    );

    const maxSamples = 12;
    const picked =
      samples.length <= maxSamples
        ? samples
        : samples.filter((_, index) => {
            if (index === 0 || index === samples.length - 1) return true;
            const step = Math.ceil(samples.length / maxSamples);
            return index % step === 0;
          });

    const windsAloft: WindsAloftSample[] = [];
    const shearBySampleId = new Map<string, number | null>();

    await Promise.all(
      picked.map(async (sample) => {
        const validAt = departureTimeUtc
          ? estimateSampleTimeUtc(
              departureTimeUtc,
              sample.distanceFromStartNm,
              BRIEFING_ASSUMED_GROUNDSPEED_KT,
            )
          : new Date().toISOString();

        const payload = await this.fetchHourly(sample.point, allHpa, validAt);
        if (!payload?.hourly) {
          shearBySampleId.set(sample.id, null);
          return;
        }

        const hourIndex = pickHourIndex(payload.hourly.time, validAt);

        for (const fl of uniqueLevels) {
          const parsed = this.parseLevels(
            payload,
            sample.point,
            fl,
            allHpa,
            hourIndex,
          );
          if (!parsed) continue;
          windsAloft.push({
            ...parsed.wind,
            label: `${sample.fromFix}→${sample.toFix}`,
          });
          if (fl === uniqueLevels[Math.floor(uniqueLevels.length / 2)]) {
            shearBySampleId.set(sample.id, parsed.shear);
          }
        }
      }),
    );

    return { windsAloft, shearBySampleId };
  }

  /** @deprecated Prefer sampleAlongRoute */
  async sampleRouteWinds(
    routePoints: readonly GeoPoint[],
    flightLevel: number,
    departureTimeUtc?: string | null,
  ): Promise<{
    windsAloft: WindsAloftSample[];
    turbulenceIntensity: TurbulenceIntensity[];
  }> {
    const synthetic: RouteSamplePoint[] = routePoints.map((point, index) => ({
      id: `legacy-${index}`,
      point,
      distanceFromStartNm: index * 40,
      legId: "legacy",
      fromFix: "A",
      toFix: "B",
      progressOnLeg: 0,
    }));
    const result = await this.sampleAlongRoute(
      synthetic,
      [flightLevel],
      departureTimeUtc,
    );
    return {
      windsAloft: result.windsAloft,
      turbulenceIntensity: result.windsAloft.map((w) =>
        shearToIntensity(w.shearProxyKtPer1000Ft),
      ),
    };
  }

  private async fetchHourly(
    point: GeoPoint,
    hpaLevels: readonly number[],
    validAtIso: string,
  ): Promise<OpenMeteoHourlyResponse | null> {
    const hourlyVars = [
      ...hpaLevels.flatMap((level) => [
        `temperature_${level}hPa`,
        `wind_speed_${level}hPa`,
        `wind_direction_${level}hPa`,
      ]),
      "cloud_cover",
    ].join(",");

    const hour = toOpenMeteoHour(validAtIso);
    // Small window around the sample hour so index picking is robust.
    const end = new Date(Date.parse(hour + "Z") || Date.now());
    end.setUTCHours(end.getUTCHours() + 1);
    const endHour = `${end.toISOString().slice(0, 13)}:00`;

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${point.latitude}` +
      `&longitude=${point.longitude}` +
      `&hourly=${hourlyVars}` +
      `&wind_speed_unit=kn&timezone=UTC` +
      `&start_hour=${encodeURIComponent(hour)}` +
      `&end_hour=${encodeURIComponent(endHour)}`;

    return fetchJsonSoft<OpenMeteoHourlyResponse>({
      provider: this.id,
      url,
    });
  }

  /**
   * Build a winds sample at an exact FL by interpolating between Open-Meteo
   * pressure surfaces (so 1000 ft steps are not identical when they share a
   * nearest discrete hPa level).
   */
  private parseLevels(
    payload: OpenMeteoHourlyResponse,
    point: GeoPoint,
    flightLevel: number,
    availableHpa: readonly number[],
    hourIndex: number,
  ): { wind: WindsAloftSample; shear: number | null } | null {
    type Surface = {
      hpa: number;
      fl: number;
      speed: number;
      direction: number;
      temperature: number;
    };

    const surfaces: Surface[] = [];
    for (const hpa of availableHpa) {
      const speed = Number(
        payload.hourly?.[`wind_speed_${hpa}hPa`]?.[hourIndex] ?? NaN,
      );
      const direction = Number(
        payload.hourly?.[`wind_direction_${hpa}hPa`]?.[hourIndex] ?? NaN,
      );
      const temperature = Number(
        payload.hourly?.[`temperature_${hpa}hPa`]?.[hourIndex] ?? NaN,
      );
      if (!Number.isFinite(speed) || !Number.isFinite(direction)) continue;
      surfaces.push({
        hpa,
        fl: pressureHpaToApproxFlightLevel(hpa),
        speed,
        direction,
        temperature: Number.isFinite(temperature) ? temperature : 0,
      });
    }
    surfaces.sort((a, b) => a.fl - b.fl);
    if (surfaces.length === 0) return null;

    let lo = surfaces[0]!;
    let hi = surfaces[surfaces.length - 1]!;
    for (let i = 0; i < surfaces.length - 1; i += 1) {
      const a = surfaces[i]!;
      const b = surfaces[i + 1]!;
      if (flightLevel >= a.fl && flightLevel <= b.fl) {
        lo = a;
        hi = b;
        break;
      }
      if (flightLevel < a.fl) {
        lo = a;
        hi = a;
        break;
      }
      if (flightLevel > b.fl) {
        lo = b;
        hi = b;
      }
    }

    const span = Math.max(1, hi.fl - lo.fl);
    const t = lo === hi ? 0 : (flightLevel - lo.fl) / span;
    const speed = lo.speed + (hi.speed - lo.speed) * t;
    const temperature = lo.temperature + (hi.temperature - lo.temperature) * t;
    // Circular lerp for wind direction.
    const d0 = lo.direction;
    const d1 = hi.direction;
    const delta = ((d1 - d0 + 540) % 360) - 180;
    const direction = (d0 + delta * t + 360) % 360;

    const cloud = Number(payload.hourly?.cloud_cover?.[hourIndex] ?? NaN);

    // Local shear from the bracketing surfaces (or nearest neighbors).
    let shear: number | null = null;
    if (lo.hpa !== hi.hpa) {
      shear = verticalShearKtPer1000Ft(lo.hpa, hi.hpa, lo.speed, hi.speed);
    } else {
      const nearest = flightLevelToPressureHpa(flightLevel);
      const neighbors = neighboringPressureLevels(nearest);
      if (neighbors.length >= 2) {
        const lower = neighbors[0]!;
        const upper = neighbors[neighbors.length - 1]!;
        const lowerSpeed = Number(
          payload.hourly?.[`wind_speed_${lower}hPa`]?.[hourIndex] ?? NaN,
        );
        const upperSpeed = Number(
          payload.hourly?.[`wind_speed_${upper}hPa`]?.[hourIndex] ?? NaN,
        );
        if (Number.isFinite(lowerSpeed) && Number.isFinite(upperSpeed)) {
          shear = verticalShearKtPer1000Ft(
            lower,
            upper,
            lowerSpeed,
            upperSpeed,
          );
        }
      }
    }

    return {
      shear,
      wind: {
        point,
        label: "sample",
        flightLevel,
        windDirectionDeg: Math.round(direction),
        windSpeedKt: Math.round(speed),
        temperatureC: Math.round(temperature),
        shearProxyKtPer1000Ft:
          shear === null ? null : Math.round(shear * 10) / 10,
        cloudCoverPct: Number.isFinite(cloud) ? Math.round(cloud) : null,
      },
    };
  }
}
