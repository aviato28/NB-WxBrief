import type { FlightCategory } from "@/domain/models/flight-category";
import type { GeoPoint, IcaoCode } from "@/domain/models/common";

export type WeatherPhenomenon =
  | "RA"
  | "SN"
  | "TS"
  | "FG"
  | "BR"
  | "HZ"
  | "DZ"
  | "SHRA"
  | "TSRA"
  | "FZRA"
  | "VCSH"
  | "OTHER";

export type CloudCover = "SKC" | "CLR" | "FEW" | "SCT" | "BKN" | "OVC" | "VV";

export interface CloudLayer {
  readonly cover: CloudCover;
  readonly baseFtAgl: number | null;
}

export interface Wind {
  readonly directionDeg: number | null;
  readonly speedKt: number;
  readonly gustKt: number | null;
  readonly variable: boolean;
  readonly variableFromDeg: number | null;
  readonly variableToDeg: number | null;
}

export interface DecodedMetar {
  readonly icao: IcaoCode;
  readonly observedAt: string;
  readonly raw: string;
  readonly wind: Wind;
  readonly visibilitySm: number | null;
  readonly visibilityRaw: string | null;
  readonly ceilingFtAgl: number | null;
  readonly clouds: readonly CloudLayer[];
  readonly temperatureC: number | null;
  readonly dewpointC: number | null;
  readonly altimeterInHg: number | null;
  readonly qnhHpa: number | null;
  readonly phenomena: readonly WeatherPhenomenon[];
  readonly flightCategory: FlightCategory;
  readonly remarks: string | null;
}

export interface TafPeriod {
  readonly type: "FROM" | "BECMG" | "TEMPO" | "PROB30" | "PROB40";
  readonly from: string;
  readonly to: string;
  readonly wind: Wind | null;
  readonly visibilitySm: number | null;
  readonly ceilingFtAgl: number | null;
  readonly clouds: readonly CloudLayer[];
  readonly phenomena: readonly WeatherPhenomenon[];
  readonly flightCategory: FlightCategory;
  readonly rawFragment: string;
}

export interface DecodedTaf {
  readonly icao: IcaoCode;
  readonly issuedAt: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly raw: string;
  readonly periods: readonly TafPeriod[];
}

export interface AirportWeather {
  readonly icao: IcaoCode;
  readonly metar: DecodedMetar | null;
  readonly taf: DecodedTaf | null;
  readonly operationalSummary: string;
  readonly fetchedAt: string;
}

export type SigmetHazard =
  | "TURB"
  | "ICE"
  | "CONVECTIVE"
  | "VA"
  | "DS"
  | "SS"
  | "OTHER";

export interface Sigmet {
  readonly id: string;
  readonly hazard: SigmetHazard;
  readonly severity: "MOD" | "SEV" | "UNKNOWN";
  readonly raw: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly firs: readonly string[];
  readonly summary: string;
  readonly polygon: readonly GeoPoint[] | null;
}

export interface WindsAloftSample {
  readonly point: GeoPoint;
  readonly label: string;
  readonly flightLevel: number;
  readonly windDirectionDeg: number;
  readonly windSpeedKt: number;
  readonly temperatureC: number;
  readonly shearProxyKtPer1000Ft: number | null;
  readonly cloudCoverPct: number | null;
}

export type TurbulenceIntensity = "NONE" | "LIGHT" | "MODERATE" | "SEVERE";

export type TurbulenceConfidence = "LOW" | "MEDIUM" | "HIGH";

export type TurbulenceCause =
  | "JET_STREAM_SHEAR"
  | "CONVECTIVE"
  | "MOUNTAIN_WAVE"
  | "CLEAR_AIR"
  | "UNKNOWN";

export type TurbulenceAltitudeBand = "below" | "cruise" | "above";

export interface TurbulenceAssessment {
  readonly segmentLabel: string;
  readonly fromFix: string;
  readonly toFix: string;
  readonly intensity: TurbulenceIntensity;
  /** Absolute FL for this assessment. */
  readonly flightLevel: number;
  /**
   * Coarse bucket relative to cruise: below (&lt;0), cruise (0), above (&gt;0).
   * Prefer `altitudeOffsetFl` for 1000 ft ladder rows.
   */
  readonly altitudeBand: TurbulenceAltitudeBand;
  /**
   * Offset from cruise in FL units (10 = 1000 ft).
   * Example at cruise FL340: −40…+40 → FL300…FL380.
   */
  readonly altitudeOffsetFl: number;
  readonly flightLevelBand: string;
  readonly expectedDuration: string;
  readonly likelyCause: TurbulenceCause;
  readonly confidence: TurbulenceConfidence;
  readonly pilotText: string;
  readonly notes: string;
}

export type ConvectiveRisk = "NONE" | "ISOLATED" | "SCATTERED" | "WIDESPREAD";

export interface ConvectiveAssessment {
  readonly segmentLabel: string;
  readonly risk: ConvectiveRisk;
  readonly notes: string;
}

export interface WaypointCondition {
  readonly fixName: string;
  readonly point: GeoPoint;
  readonly windDirectionDeg: number | null;
  readonly windSpeedKt: number | null;
  readonly temperatureC: number | null;
  readonly turbulence: TurbulenceIntensity;
  readonly cloudCoverPct: number | null;
  readonly nearbySigmetIds: readonly string[];
  readonly forecastNote: string;
}

export interface EnrouteWeather {
  readonly windsAloft: readonly WindsAloftSample[];
  readonly turbulence: readonly TurbulenceAssessment[];
  readonly convective: readonly ConvectiveAssessment[];
  readonly alongRouteNotes: readonly string[];
  readonly sigmets: readonly Sigmet[];
  readonly waypointConditions: readonly WaypointCondition[];
  readonly dispatchBullets: readonly string[];
  /** Short plain-language onboard brief for the crew. */
  readonly crewBrief: CrewOnboardBrief;
}

export interface CrewOnboardBrief {
  readonly headline: string;
  readonly lines: readonly string[];
}

export type ThreatSeverity = "INFO" | "CAUTION" | "WARNING" | "CRITICAL";

export interface ThreatItem {
  readonly id: string;
  readonly severity: ThreatSeverity;
  readonly title: string;
  readonly detail: string;
  readonly relatedIcao: IcaoCode | null;
}
