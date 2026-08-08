import type { GeoPoint } from "@/domain/models/common";
import {
  estimateSampleTimeUtc,
  flightLevelToPressureHpa,
  neighboringPressureLevels,
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
          const hpa = pressureByFl.get(fl) ?? flightLevelToPressureHpa(fl);
          const levels = neighboringPressureLevels(hpa);
          const parsed = this.parseLevels(
            payload,
            sample.point,
            fl,
            hpa,
            levels,
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

  private parseLevels(
    payload: OpenMeteoHourlyResponse,
    point: GeoPoint,
    flightLevel: number,
    hpa: number,
    levels: readonly number[],
    hourIndex: number,
  ): { wind: WindsAloftSample; shear: number | null } | null {
    const speed = Number(
      payload.hourly?.[`wind_speed_${hpa}hPa`]?.[hourIndex] ?? NaN,
    );
    const direction = Number(
      payload.hourly?.[`wind_direction_${hpa}hPa`]?.[hourIndex] ?? NaN,
    );
    const temperature = Number(
      payload.hourly?.[`temperature_${hpa}hPa`]?.[hourIndex] ?? NaN,
    );
    const cloud = Number(payload.hourly?.cloud_cover?.[hourIndex] ?? NaN);

    let shear: number | null = null;
    if (levels.length >= 2) {
      const lower = levels[0] ?? hpa;
      const upper = levels[levels.length - 1] ?? hpa;
      const lowerSpeed = Number(
        payload.hourly?.[`wind_speed_${lower}hPa`]?.[hourIndex] ?? NaN,
      );
      const upperSpeed = Number(
        payload.hourly?.[`wind_speed_${upper}hPa`]?.[hourIndex] ?? NaN,
      );
      if (Number.isFinite(lowerSpeed) && Number.isFinite(upperSpeed)) {
        // Previous /3.4 hPa heuristic overstated layer thickness (~3–4×) and
        // systematically under-called CAT. Use approx FL thickness instead.
        shear = verticalShearKtPer1000Ft(
          lower,
          upper,
          lowerSpeed,
          upperSpeed,
        );
      }
    }

    if (!Number.isFinite(speed) || !Number.isFinite(direction)) {
      return null;
    }

    return {
      shear,
      wind: {
        point,
        label: "sample",
        flightLevel,
        windDirectionDeg: Math.round(direction),
        windSpeedKt: Math.round(speed),
        temperatureC: Number.isFinite(temperature) ? Math.round(temperature) : 0,
        shearProxyKtPer1000Ft:
          shear === null ? null : Math.round(shear * 10) / 10,
        cloudCoverPct: Number.isFinite(cloud) ? Math.round(cloud) : null,
      },
    };
  }
}
