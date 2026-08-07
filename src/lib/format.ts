import { format, parseISO } from "date-fns";
import type { Wind } from "@/domain/models/weather";

export function formatUtc(iso: string, pattern = "ddHHmm'Z'"): string {
  try {
    return format(parseISO(iso), pattern);
  } catch {
    return iso;
  }
}

export function formatFlightLevel(fl: number): string {
  return `FL${String(fl).padStart(3, "0")}`;
}

export function formatWind(wind: Wind): string {
  if (wind.variable && wind.directionDeg === null) {
    const gust = wind.gustKt ? `G${wind.gustKt}` : "";
    return `VRB${String(wind.speedKt).padStart(2, "0")}${gust}KT`;
  }

  const dir =
    wind.directionDeg === null
      ? "VRB"
      : String(wind.directionDeg).padStart(3, "0");
  const speed = String(wind.speedKt).padStart(2, "0");
  const gust = wind.gustKt ? `G${String(wind.gustKt).padStart(2, "0")}` : "";
  return `${dir}${speed}${gust}KT`;
}

export function formatVisibilitySm(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value >= 10) {
    return "10+ SM";
  }
  return `${value} SM`;
}

export function formatCeiling(ceilingFtAgl: number | null): string {
  if (ceilingFtAgl === null) {
    return "Unlimited / no ceiling";
  }
  return `${ceilingFtAgl.toLocaleString()} ft AGL`;
}
