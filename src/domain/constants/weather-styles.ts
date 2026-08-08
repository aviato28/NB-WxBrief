import type { FlightCategory } from "@/domain/models/flight-category";
import type { ThreatSeverity } from "@/domain/models/weather";
import type { TurbulenceIntensity, ConvectiveRisk } from "@/domain/models/weather";

/** Tailwind-oriented semantic tokens for aviation flight category. */
export const FLIGHT_CATEGORY_STYLES: Record<
  FlightCategory,
  { readonly bg: string; readonly text: string; readonly border: string }
> = {
  VFR: {
    bg: "bg-[var(--wx-vfr)]/15",
    text: "text-[var(--wx-vfr)]",
    border: "border-[var(--wx-vfr)]/40",
  },
  MVFR: {
    bg: "bg-[var(--wx-mvfr)]/15",
    text: "text-[var(--wx-mvfr)]",
    border: "border-[var(--wx-mvfr)]/40",
  },
  IFR: {
    bg: "bg-[var(--wx-ifr)]/15",
    text: "text-[var(--wx-ifr)]",
    border: "border-[var(--wx-ifr)]/40",
  },
  LIFR: {
    bg: "bg-[var(--wx-lifr)]/15",
    text: "text-[var(--wx-lifr)]",
    border: "border-[var(--wx-lifr)]/40",
  },
  UNKNOWN: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
  },
};

export const THREAT_SEVERITY_STYLES: Record<
  ThreatSeverity,
  { readonly badge: string; readonly label: string }
> = {
  INFO: { badge: "bg-sky-500/15 text-sky-300 border-sky-500/30", label: "INFO" },
  CAUTION: {
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    label: "CAUTION",
  },
  WARNING: {
    badge: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    label: "WARNING",
  },
  CRITICAL: {
    badge: "bg-red-500/15 text-red-300 border-red-500/30",
    label: "CRITICAL",
  },
};

export const TURBULENCE_LABELS: Record<TurbulenceIntensity, string> = {
  NONE: "Smooth",
  LIGHT: "Light",
  MODERATE: "Moderate",
  SEVERE: "Severe",
};

export const TURBULENCE_STYLES: Record<
  TurbulenceIntensity,
  { readonly bg: string; readonly text: string; readonly border: string }
> = {
  NONE: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-300",
    border: "border-emerald-500/30",
  },
  LIGHT: {
    bg: "bg-sky-500/15",
    text: "text-sky-300",
    border: "border-sky-500/30",
  },
  MODERATE: {
    bg: "bg-amber-500/15",
    text: "text-amber-300",
    border: "border-amber-500/30",
  },
  SEVERE: {
    bg: "bg-red-500/15",
    text: "text-red-300",
    border: "border-red-500/30",
  },
};

export const CONVECTIVE_LABELS: Record<ConvectiveRisk, string> = {
  NONE: "None",
  ISOLATED: "Isolated",
  SCATTERED: "Scattered",
  WIDESPREAD: "Widespread",
};
