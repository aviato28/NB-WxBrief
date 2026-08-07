/** FAA flight category for terminal weather. Magenta for LIFR is the aviation standard. */

export const FLIGHT_CATEGORIES = ["VFR", "MVFR", "IFR", "LIFR", "UNKNOWN"] as const;

export type FlightCategory = (typeof FLIGHT_CATEGORIES)[number];

export const FLIGHT_CATEGORY_LABELS: Record<FlightCategory, string> = {
  VFR: "VFR",
  MVFR: "MVFR",
  IFR: "IFR",
  LIFR: "LIFR",
  UNKNOWN: "—",
};

/**
 * Ceiling in feet AGL and visibility in statute miles.
 * Thresholds per FAA AIM / ASOS flight category definitions.
 */
export function deriveFlightCategory(
  ceilingFtAgl: number | null,
  visibilitySm: number | null,
): FlightCategory {
  if (ceilingFtAgl === null && visibilitySm === null) {
    return "UNKNOWN";
  }

  const ceiling = ceilingFtAgl ?? Number.POSITIVE_INFINITY;
  const visibility = visibilitySm ?? Number.POSITIVE_INFINITY;

  if (ceiling < 500 || visibility < 1) {
    return "LIFR";
  }
  if (ceiling < 1000 || visibility < 3) {
    return "IFR";
  }
  if (ceiling <= 3000 || visibility <= 5) {
    return "MVFR";
  }
  return "VFR";
}
