import type { IcaoCode } from "@/domain/models/common";
import {
  deriveFlightCategory,
  type FlightCategory,
} from "@/domain/models/flight-category";
import type {
  AirportWeather,
  CloudCover,
  CloudLayer,
  DecodedMetar,
  DecodedTaf,
  Sigmet,
  SigmetHazard,
  TafPeriod,
  WeatherPhenomenon,
  Wind,
} from "@/domain/models/weather";

function asIcao(code: string): IcaoCode {
  return code.toUpperCase() as IcaoCode;
}

function unixSecondsToIso(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return new Date().toISOString();
  }
  return new Date(seconds * 1000).toISOString();
}

function mapFlightCategory(raw: string | null | undefined): FlightCategory {
  switch ((raw ?? "").toUpperCase()) {
    case "VFR":
      return "VFR";
    case "MVFR":
      return "MVFR";
    case "IFR":
      return "IFR";
    case "LIFR":
      return "LIFR";
    default:
      return "UNKNOWN";
  }
}

function parseVisibilitySm(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }
  const cleaned = value.replace("+", "").trim();
  if (cleaned === "CAVOK") {
    return 10;
  }
  const asNumber = Number(cleaned);
  return Number.isFinite(asNumber) ? asNumber : null;
}

function mapCloudCover(cover: string | null | undefined): CloudCover {
  const normalized = (cover ?? "SKC").toUpperCase();
  if (
    normalized === "SKC" ||
    normalized === "CLR" ||
    normalized === "FEW" ||
    normalized === "SCT" ||
    normalized === "BKN" ||
    normalized === "OVC" ||
    normalized === "VV"
  ) {
    return normalized;
  }
  if (normalized === "NSC" || normalized === "NCD") {
    return "SKC";
  }
  return "SKC";
}

function mapClouds(
  clouds: ReadonlyArray<{ cover?: string; base?: number | null }> | null | undefined,
): CloudLayer[] {
  if (!clouds || clouds.length === 0) {
    return [];
  }
  return clouds.map((cloud) => ({
    cover: mapCloudCover(cloud.cover),
    baseFtAgl: cloud.base ?? null,
  }));
}

function ceilingFromClouds(clouds: readonly CloudLayer[]): number | null {
  const ceilingLayer = clouds.find(
    (layer) =>
      (layer.cover === "BKN" || layer.cover === "OVC" || layer.cover === "VV") &&
      layer.baseFtAgl !== null,
  );
  return ceilingLayer?.baseFtAgl ?? null;
}

function mapWind(input: {
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
}): Wind {
  const variable = input.wdir === "VRB" || input.wdir === null || input.wdir === undefined;
  const directionDeg =
    typeof input.wdir === "number"
      ? input.wdir
      : variable
        ? null
        : Number(input.wdir);

  return {
    directionDeg: Number.isFinite(directionDeg) ? directionDeg : null,
    speedKt: input.wspd ?? 0,
    gustKt: input.wgst ?? null,
    variable: variable || input.wdir === "VRB",
    variableFromDeg: null,
    variableToDeg: null,
  };
}

function mapPhenomena(wxString: string | null | undefined): WeatherPhenomenon[] {
  if (!wxString || wxString === "NSW") {
    return [];
  }
  const tokens = wxString.toUpperCase().split(/\s+/);
  const known: WeatherPhenomenon[] = [
    "TSRA",
    "FZRA",
    "SHRA",
    "VCSH",
    "TS",
    "RA",
    "SN",
    "FG",
    "BR",
    "HZ",
    "DZ",
  ];
  const matched: WeatherPhenomenon[] = [];
  for (const token of tokens) {
    const hit = known.find((code) => token.includes(code));
    if (hit && !matched.includes(hit)) {
      matched.push(hit);
    }
  }
  if (matched.length === 0 && tokens.length > 0) {
    matched.push("OTHER");
  }
  return matched;
}

function hpaToInHg(hpa: number | null | undefined): number | null {
  if (hpa === null || hpa === undefined) {
    return null;
  }
  return Math.round((hpa * 0.0295299830714) * 100) / 100;
}

export interface AwcMetarJson {
  readonly icaoId: string;
  readonly obsTime?: number;
  readonly reportTime?: string;
  readonly temp?: number | null;
  readonly dewp?: number | null;
  readonly wdir?: number | string | null;
  readonly wspd?: number | null;
  readonly wgst?: number | null;
  readonly visib?: string | number | null;
  readonly altim?: number | null;
  readonly rawOb?: string;
  readonly clouds?: ReadonlyArray<{ cover?: string; base?: number | null }>;
  readonly fltCat?: string | null;
  readonly cover?: string | null;
  readonly wxString?: string | null;
}

export interface AwcTafJson {
  readonly icaoId: string;
  readonly issueTime?: string;
  readonly validTimeFrom?: number;
  readonly validTimeTo?: number;
  readonly rawTAF?: string;
  readonly fcsts?: ReadonlyArray<{
    timeFrom?: number;
    timeTo?: number;
    fcstChange?: string | null;
    probability?: number | null;
    wdir?: number | string | null;
    wspd?: number | null;
    wgst?: number | null;
    visib?: string | number | null;
    wxString?: string | null;
    clouds?: ReadonlyArray<{ cover?: string; base?: number | null }>;
  }>;
}

export interface AwcSigmetJson {
  readonly icaoId?: string;
  readonly firId?: string;
  readonly firName?: string;
  readonly seriesId?: string | number;
  readonly hazard?: string;
  readonly qualifier?: string | null;
  readonly validTimeFrom?: number;
  readonly validTimeTo?: number;
  readonly rawSigmet?: string;
  readonly rawAirSigmet?: string;
  readonly coords?: ReadonlyArray<{ lat: number; lon: number }> | null;
  readonly base?: number | null;
  readonly top?: number | null;
  /** US domestic airsigmet altitudes are feet MSL. */
  readonly altitudeLow1?: number | null;
  readonly altitudeHi1?: number | null;
  readonly airSigmetType?: string;
}

export function mapAwcMetar(raw: AwcMetarJson): DecodedMetar {
  const clouds = mapClouds(raw.clouds);
  const ceilingFtAgl = ceilingFromClouds(clouds);
  const visibilitySm = parseVisibilitySm(raw.visib);
  const flightCategory =
    mapFlightCategory(raw.fltCat) === "UNKNOWN"
      ? deriveFlightCategory(ceilingFtAgl, visibilitySm)
      : mapFlightCategory(raw.fltCat);

  return {
    icao: asIcao(raw.icaoId),
    observedAt: raw.reportTime ?? unixSecondsToIso(raw.obsTime),
    raw: raw.rawOb ?? "",
    wind: mapWind(raw),
    visibilitySm,
    visibilityRaw: raw.visib === null || raw.visib === undefined ? null : String(raw.visib),
    ceilingFtAgl,
    clouds,
    temperatureC: raw.temp ?? null,
    dewpointC: raw.dewp ?? null,
    altimeterInHg: hpaToInHg(raw.altim),
    qnhHpa: raw.altim ?? null,
    phenomena: mapPhenomena(raw.wxString),
    flightCategory,
    remarks: null,
  };
}

function mapTafPeriodType(
  change: string | null | undefined,
  probability: number | null | undefined,
): TafPeriod["type"] {
  if (probability === 30) return "PROB30";
  if (probability === 40) return "PROB40";
  switch ((change ?? "").toUpperCase()) {
    case "TEMPO":
      return "TEMPO";
    case "BECMG":
      return "BECMG";
    default:
      return "FROM";
  }
}

export function mapAwcTaf(raw: AwcTafJson): DecodedTaf {
  const periods: TafPeriod[] = (raw.fcsts ?? []).map((fcst) => {
    const clouds = mapClouds(fcst.clouds);
    const ceilingFtAgl = ceilingFromClouds(clouds);
    const visibilitySm = parseVisibilitySm(fcst.visib);
    return {
      type: mapTafPeriodType(fcst.fcstChange, fcst.probability),
      from: unixSecondsToIso(fcst.timeFrom),
      to: unixSecondsToIso(fcst.timeTo),
      wind:
        fcst.wspd === null || fcst.wspd === undefined
          ? null
          : mapWind({
              wdir: fcst.wdir,
              wspd: fcst.wspd,
              wgst: fcst.wgst,
            }),
      visibilitySm,
      ceilingFtAgl,
      clouds,
      phenomena: mapPhenomena(fcst.wxString),
      flightCategory: deriveFlightCategory(ceilingFtAgl, visibilitySm),
      rawFragment: [
        fcst.fcstChange,
        fcst.probability ? `PROB${fcst.probability}` : null,
        fcst.wdir !== undefined && fcst.wdir !== null
          ? `${fcst.wdir}${fcst.wspd ?? ""}KT`
          : null,
        fcst.visib ? String(fcst.visib) : null,
        fcst.wxString,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  return {
    icao: asIcao(raw.icaoId),
    issuedAt: raw.issueTime ?? unixSecondsToIso(raw.validTimeFrom),
    validFrom: unixSecondsToIso(raw.validTimeFrom),
    validTo: unixSecondsToIso(raw.validTimeTo),
    raw: raw.rawTAF ?? "",
    periods,
  };
}

function mapHazard(raw: string | null | undefined): SigmetHazard {
  switch ((raw ?? "").toUpperCase()) {
    case "TURB":
      return "TURB";
    case "ICE":
    case "ICING":
      return "ICE";
    case "TS":
    case "CONVECTIVE":
    case "TSTM":
      return "CONVECTIVE";
    case "VA":
      return "VA";
    case "DS":
      return "DS";
    case "SS":
      return "SS";
    default:
      return "OTHER";
  }
}

function feetToFlightLevelLabel(feet: number | null | undefined): string | null {
  if (feet === null || feet === undefined || Number.isNaN(feet)) {
    return null;
  }
  if (feet <= 0) {
    return "SFC";
  }
  return `FL${String(Math.round(feet / 100)).padStart(3, "0")}`;
}

export function mapAwcSigmet(raw: AwcSigmetJson, index: number): Sigmet {
  const text = raw.rawSigmet ?? raw.rawAirSigmet ?? "";
  const hazard = mapHazard(raw.hazard);
  const severity =
    (raw.qualifier ?? "").toUpperCase().includes("SEV") || hazard === "CONVECTIVE"
      ? "SEV"
      : (raw.qualifier ?? "").toUpperCase().includes("MOD")
        ? "MOD"
        : "UNKNOWN";

  const series =
    raw.seriesId !== undefined && raw.seriesId !== null
      ? String(raw.seriesId)
      : String(index);

  const id = [
    raw.firId ?? raw.icaoId ?? "SIG",
    series,
    raw.validTimeFrom ?? index,
  ].join("-");

  const baseFeet = raw.base ?? raw.altitudeLow1 ?? null;
  const topFeet = raw.top ?? raw.altitudeHi1 ?? null;
  const baseLabel = feetToFlightLevelLabel(baseFeet) ?? "SFC";
  const topLabel = feetToFlightLevelLabel(topFeet) ?? "UNK";
  const region = raw.firName ?? raw.firId ?? raw.icaoId ?? "area";

  return {
    id,
    hazard,
    severity,
    raw: text,
    validFrom: unixSecondsToIso(raw.validTimeFrom),
    validTo: unixSecondsToIso(raw.validTimeTo),
    firs: raw.firId ? [raw.firId] : [],
    summary: `${hazard}${raw.qualifier ? ` ${raw.qualifier}` : ""} ${series} · ${region} · ${baseLabel}/${topLabel}`,
    polygon:
      raw.coords?.map((coord) => ({
        latitude: coord.lat,
        longitude: coord.lon,
      })) ?? null,
  };
}

export function buildAirportWeatherBundle(
  icao: string,
  metar: DecodedMetar | null,
  taf: DecodedTaf | null,
  operationalSummary: string,
): AirportWeather {
  return {
    icao: asIcao(icao),
    metar,
    taf,
    operationalSummary,
    fetchedAt: new Date().toISOString(),
  };
}
