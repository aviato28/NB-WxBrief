import type { GeoPoint } from "@/domain/models/common";
import {
  flightLevelToPressureHpa,
  neighboringPressureLevels,
} from "@/lib/aviation-geo";
import { fetchJsonSoft } from "@/lib/http";
import type {
  TurbulenceIntensity,
  WindsAloftSample,
} from "@/domain/models/weather";
import type { RouteSamplePoint } from "@/domain/models/route";

interface OpenMeteoHourlyResponse {
  readonly hourly?: {
    readonly time?: string[];
    readonly [key: string]: number[] | string[] | undefined;
  };
}

function shearToIntensity(shear: number | null): TurbulenceIntensity {
  if (shear === null) return "NONE";
  if (shear >= 6) return "SEVERE";
  if (shear >= 3.5) return "MODERATE";
  if (shear >= 2) return "LIGHT";
  return "NONE";
}

/**
 * Open-Meteo pressure-level winds + cloud cover.
 * Advisory only — not an official FD winds product.
 */
export class OpenMeteoWindsClient {
  readonly id = "open-meteo-winds";

  async sampleAlongRoute(
    samples: readonly RouteSamplePoint[],
    flightLevel: number,
  ): Promise<{
    windsAloft: WindsAloftSample[];
    shearBySampleId: Map<string, number | null>;
  }> {
    const hpa = flightLevelToPressureHpa(flightLevel);
    const levels = neighboringPressureLevels(hpa);

    // Cap concurrent samples to protect rate limits while covering the route.
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
        const result = await this.samplePoint(sample.point, flightLevel, hpa, levels);
        if (!result) {
          shearBySampleId.set(sample.id, null);
          return;
        }
        windsAloft.push({
          ...result.wind,
          label: `${sample.fromFix}→${sample.toFix}`,
        });
        shearBySampleId.set(sample.id, result.shear);
      }),
    );

    return { windsAloft, shearBySampleId };
  }

  /** @deprecated Prefer sampleAlongRoute */
  async sampleRouteWinds(
    routePoints: readonly GeoPoint[],
    flightLevel: number,
  ): Promise<{
    windsAloft: WindsAloftSample[];
    turbulenceIntensity: TurbulenceIntensity[];
  }> {
    const synthetic: RouteSamplePoint[] = routePoints.map((point, index) => ({
      id: `legacy-${index}`,
      point,
      distanceFromStartNm: index,
      legId: "legacy",
      fromFix: "A",
      toFix: "B",
      progressOnLeg: 0,
    }));
    const result = await this.sampleAlongRoute(synthetic, flightLevel);
    return {
      windsAloft: result.windsAloft,
      turbulenceIntensity: result.windsAloft.map((w) =>
        shearToIntensity(w.shearProxyKtPer1000Ft),
      ),
    };
  }

  private async samplePoint(
    point: GeoPoint,
    flightLevel: number,
    hpa: number,
    levels: readonly number[],
  ): Promise<{ wind: WindsAloftSample; shear: number | null } | null> {
    const hourlyVars = [
      ...levels.flatMap((level) => [
        `temperature_${level}hPa`,
        `wind_speed_${level}hPa`,
        `wind_direction_${level}hPa`,
      ]),
      "cloud_cover",
    ].join(",");

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${point.latitude}` +
      `&longitude=${point.longitude}` +
      `&hourly=${hourlyVars}` +
      `&wind_speed_unit=kn&forecast_hours=1&timezone=UTC`;

    const payload = await fetchJsonSoft<OpenMeteoHourlyResponse>({
      provider: this.id,
      url,
    });
    if (!payload) {
      return null;
    }

    const speed = Number(payload.hourly?.[`wind_speed_${hpa}hPa`]?.[0] ?? NaN);
    const direction = Number(
      payload.hourly?.[`wind_direction_${hpa}hPa`]?.[0] ?? NaN,
    );
    const temperature = Number(
      payload.hourly?.[`temperature_${hpa}hPa`]?.[0] ?? NaN,
    );
    const cloud = Number(payload.hourly?.cloud_cover?.[0] ?? NaN);

    let shear: number | null = null;
    if (levels.length >= 2) {
      const lower = levels[0] ?? hpa;
      const upper = levels[levels.length - 1] ?? hpa;
      const lowerSpeed = Number(
        payload.hourly?.[`wind_speed_${lower}hPa`]?.[0] ?? NaN,
      );
      const upperSpeed = Number(
        payload.hourly?.[`wind_speed_${upper}hPa`]?.[0] ?? NaN,
      );
      if (Number.isFinite(lowerSpeed) && Number.isFinite(upperSpeed)) {
        const deltaFl = Math.max(1, Math.abs(upper - lower) / 3.4);
        shear = Math.abs(upperSpeed - lowerSpeed) / deltaFl;
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
