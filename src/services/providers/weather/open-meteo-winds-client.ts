import type { GeoPoint } from "@/domain/models/common";
import {
  flightLevelToPressureHpa,
  neighboringPressureLevels,
} from "@/lib/aviation-geo";
import { fetchJsonSoft } from "@/lib/http";
import type {
  TurbulenceAssessment,
  TurbulenceIntensity,
  WindsAloftSample,
} from "@/domain/models/weather";

interface OpenMeteoHourlyResponse {
  readonly hourly?: {
    readonly time?: string[];
    readonly [key: string]: number[] | string[] | undefined;
  };
}

function sampleLabel(index: number, total: number): string {
  if (index === 0) return "Departure segment";
  if (index === total - 1) return "Arrival segment";
  if (index === Math.floor(total / 2)) return "Mid-route";
  return `Route point ${index + 1}`;
}

function shearToIntensity(shear: number | null): TurbulenceIntensity {
  if (shear === null) return "NONE";
  if (shear >= 6) return "SEVERE";
  if (shear >= 3.5) return "MODERATE";
  if (shear >= 2) return "LIGHT";
  return "NONE";
}

/**
 * Open-Meteo pressure-level winds.
 * Advisory only — not an official FD winds product.
 */
export class OpenMeteoWindsClient {
  readonly id = "open-meteo-winds";

  async sampleRouteWinds(
    routePoints: readonly GeoPoint[],
    flightLevel: number,
  ): Promise<{
    windsAloft: WindsAloftSample[];
    turbulence: TurbulenceAssessment[];
  }> {
    const hpa = flightLevelToPressureHpa(flightLevel);
    const levels = neighboringPressureLevels(hpa);
    const samplePoints =
      routePoints.length <= 5
        ? routePoints
        : [
            routePoints[0],
            routePoints[Math.floor(routePoints.length * 0.33)],
            routePoints[Math.floor(routePoints.length * 0.5)],
            routePoints[Math.floor(routePoints.length * 0.66)],
            routePoints[routePoints.length - 1],
          ].filter((point): point is GeoPoint => Boolean(point));

    const windsAloft: WindsAloftSample[] = [];
    const turbulence: TurbulenceAssessment[] = [];

    await Promise.all(
      samplePoints.map(async (point, index) => {
        const hourlyVars = levels
          .flatMap((level) => [
            `temperature_${level}hPa`,
            `wind_speed_${level}hPa`,
            `wind_direction_${level}hPa`,
          ])
          .join(",");

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
          return;
        }

        const speedKey = `wind_speed_${hpa}hPa`;
        const dirKey = `wind_direction_${hpa}hPa`;
        const tempKey = `temperature_${hpa}hPa`;
        const speed = Number(payload?.hourly?.[speedKey]?.[0] ?? NaN);
        const direction = Number(payload?.hourly?.[dirKey]?.[0] ?? NaN);
        const temperature = Number(payload?.hourly?.[tempKey]?.[0] ?? NaN);

        let shear: number | null = null;
        if (levels.length >= 2) {
          const lower = levels[0] ?? hpa;
          const upper = levels[levels.length - 1] ?? hpa;
          const lowerSpeed = Number(
            payload?.hourly?.[`wind_speed_${lower}hPa`]?.[0] ?? NaN,
          );
          const upperSpeed = Number(
            payload?.hourly?.[`wind_speed_${upper}hPa`]?.[0] ?? NaN,
          );
          if (Number.isFinite(lowerSpeed) && Number.isFinite(upperSpeed)) {
            const deltaFl = Math.max(1, Math.abs(upper - lower) / 3.4);
            shear = Math.abs(upperSpeed - lowerSpeed) / deltaFl;
          }
        }

        if (Number.isFinite(speed) && Number.isFinite(direction)) {
          windsAloft[index] = {
            point,
            label: sampleLabel(index, samplePoints.length),
            flightLevel,
            windDirectionDeg: Math.round(direction),
            windSpeedKt: Math.round(speed),
            temperatureC: Number.isFinite(temperature)
              ? Math.round(temperature)
              : 0,
            shearProxyKtPer1000Ft:
              shear === null ? null : Math.round(shear * 10) / 10,
          };
        }

        const intensity = shearToIntensity(shear);
        if (intensity !== "NONE") {
          turbulence[index] = {
            segmentLabel: sampleLabel(index, samplePoints.length),
            intensity,
            notes: `Model shear proxy ~${shear?.toFixed(1) ?? "n/a"} kt/1000ft near FL${flightLevel}. Advisory only (Open-Meteo).`,
          };
        }
      }),
    );

    return {
      windsAloft: windsAloft.filter(Boolean),
      turbulence: turbulence.filter(Boolean),
    };
  }
}
