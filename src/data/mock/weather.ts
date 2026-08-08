import type { IcaoCode } from "@/domain/models/common";
import type {
  AirportWeather,
  DecodedMetar,
  DecodedTaf,
  EnrouteWeather,
  Sigmet,
  ThreatItem,
} from "@/domain/models/weather";

function icao(code: string): IcaoCode {
  return code as IcaoCode;
}

const NOW = "2026-08-07T18:45:00.000Z";

export const MOCK_METARS: Record<string, DecodedMetar> = {
  KJFK: {
    icao: icao("KJFK"),
    observedAt: "2026-08-07T18:51:00.000Z",
    raw: "KJFK 071851Z 28014G22KT 10SM FEW050 SCT250 27/16 A2992 RMK AO2 SLP132",
    wind: {
      directionDeg: 280,
      speedKt: 14,
      gustKt: 22,
      variable: false,
      variableFromDeg: null,
      variableToDeg: null,
    },
    visibilitySm: 10,
    visibilityRaw: "10SM",
    ceilingFtAgl: null,
    clouds: [
      { cover: "FEW", baseFtAgl: 5000 },
      { cover: "SCT", baseFtAgl: 25000 },
    ],
    temperatureC: 27,
    dewpointC: 16,
    altimeterInHg: 29.92,
    qnhHpa: 1013,
    phenomena: [],
    flightCategory: "VFR",
    remarks: "AO2 SLP132",
  },
  EGLL: {
    icao: icao("EGLL"),
    observedAt: "2026-08-07T18:50:00.000Z",
    raw: "EGLL 071850Z AUTO 24012KT 9999 -RA BKN014 OVC025 16/14 Q1011 NOSIG",
    wind: {
      directionDeg: 240,
      speedKt: 12,
      gustKt: null,
      variable: false,
      variableFromDeg: null,
      variableToDeg: null,
    },
    visibilitySm: 6.2,
    visibilityRaw: "9999",
    ceilingFtAgl: 1400,
    clouds: [
      { cover: "BKN", baseFtAgl: 1400 },
      { cover: "OVC", baseFtAgl: 2500 },
    ],
    temperatureC: 16,
    dewpointC: 14,
    altimeterInHg: 29.85,
    qnhHpa: 1011,
    phenomena: ["RA"],
    flightCategory: "MVFR",
    remarks: "NOSIG",
  },
  EIDW: {
    icao: icao("EIDW"),
    observedAt: "2026-08-07T18:30:00.000Z",
    raw: "EIDW 071830Z 25018G28KT 9999 SCT018 BKN030 15/12 Q1009 NOSIG",
    wind: {
      directionDeg: 250,
      speedKt: 18,
      gustKt: 28,
      variable: false,
      variableFromDeg: null,
      variableToDeg: null,
    },
    visibilitySm: 6.2,
    visibilityRaw: "9999",
    ceilingFtAgl: 3000,
    clouds: [
      { cover: "SCT", baseFtAgl: 1800 },
      { cover: "BKN", baseFtAgl: 3000 },
    ],
    temperatureC: 15,
    dewpointC: 12,
    altimeterInHg: 29.8,
    qnhHpa: 1009,
    phenomena: [],
    flightCategory: "MVFR",
    remarks: "NOSIG",
  },
  KORD: {
    icao: icao("KORD"),
    observedAt: "2026-08-07T18:51:00.000Z",
    raw: "KORD 071851Z 32008KT 10SM FEW040 24/12 A3008 RMK AO2",
    wind: {
      directionDeg: 320,
      speedKt: 8,
      gustKt: null,
      variable: false,
      variableFromDeg: null,
      variableToDeg: null,
    },
    visibilitySm: 10,
    visibilityRaw: "10SM",
    ceilingFtAgl: null,
    clouds: [{ cover: "FEW", baseFtAgl: 4000 }],
    temperatureC: 24,
    dewpointC: 12,
    altimeterInHg: 30.08,
    qnhHpa: 1019,
    phenomena: [],
    flightCategory: "VFR",
    remarks: "AO2",
  },
  KLAX: {
    icao: icao("KLAX"),
    observedAt: "2026-08-07T18:53:00.000Z",
    raw: "KLAX 071853Z 25008KT 6SM BR SCT008 BKN012 19/17 A2995 RMK AO2",
    wind: {
      directionDeg: 250,
      speedKt: 8,
      gustKt: null,
      variable: false,
      variableFromDeg: null,
      variableToDeg: null,
    },
    visibilitySm: 6,
    visibilityRaw: "6SM",
    ceilingFtAgl: 1200,
    clouds: [
      { cover: "SCT", baseFtAgl: 800 },
      { cover: "BKN", baseFtAgl: 1200 },
    ],
    temperatureC: 19,
    dewpointC: 17,
    altimeterInHg: 29.95,
    qnhHpa: 1014,
    phenomena: ["BR"],
    flightCategory: "MVFR",
    remarks: "AO2",
  },
};

export const MOCK_TAFS: Record<string, DecodedTaf> = {
  KJFK: {
    icao: icao("KJFK"),
    issuedAt: "2026-08-07T17:32:00.000Z",
    validFrom: "2026-08-07T18:00:00.000Z",
    validTo: "2026-08-09T00:00:00.000Z",
    raw: "KJFK 071732Z 0718/0824 28012G20KT P6SM FEW050 SCT250\n  FM080200 30008KT P6SM SCT040\n  FM081600 31012KT P6SM FEW050",
    periods: [
      {
        type: "FROM",
        from: "2026-08-07T18:00:00.000Z",
        to: "2026-08-08T02:00:00.000Z",
        wind: {
          directionDeg: 280,
          speedKt: 12,
          gustKt: 20,
          variable: false,
          variableFromDeg: null,
          variableToDeg: null,
        },
        visibilitySm: 6,
        ceilingFtAgl: null,
        clouds: [
          { cover: "FEW", baseFtAgl: 5000 },
          { cover: "SCT", baseFtAgl: 25000 },
        ],
        phenomena: [],
        flightCategory: "VFR",
        rawFragment: "28012G20KT P6SM FEW050 SCT250",
      },
      {
        type: "FROM",
        from: "2026-08-08T02:00:00.000Z",
        to: "2026-08-08T16:00:00.000Z",
        wind: {
          directionDeg: 300,
          speedKt: 8,
          gustKt: null,
          variable: false,
          variableFromDeg: null,
          variableToDeg: null,
        },
        visibilitySm: 6,
        ceilingFtAgl: null,
        clouds: [{ cover: "SCT", baseFtAgl: 4000 }],
        phenomena: [],
        flightCategory: "VFR",
        rawFragment: "30008KT P6SM SCT040",
      },
      {
        type: "FROM",
        from: "2026-08-08T16:00:00.000Z",
        to: "2026-08-09T00:00:00.000Z",
        wind: {
          directionDeg: 310,
          speedKt: 12,
          gustKt: null,
          variable: false,
          variableFromDeg: null,
          variableToDeg: null,
        },
        visibilitySm: 6,
        ceilingFtAgl: null,
        clouds: [{ cover: "FEW", baseFtAgl: 5000 }],
        phenomena: [],
        flightCategory: "VFR",
        rawFragment: "31012KT P6SM FEW050",
      },
    ],
  },
  EGLL: {
    icao: icao("EGLL"),
    issuedAt: "2026-08-07T16:59:00.000Z",
    validFrom: "2026-08-07T18:00:00.000Z",
    validTo: "2026-08-09T00:00:00.000Z",
    raw: "EGLL 071659Z 0718/0824 24012KT 9999 BKN014\n  TEMPO 0718/0802 4000 -RA BKN010\n  BECMG 0808/0811 25010KT 9999 SCT020",
    periods: [
      {
        type: "FROM",
        from: "2026-08-07T18:00:00.000Z",
        to: "2026-08-09T00:00:00.000Z",
        wind: {
          directionDeg: 240,
          speedKt: 12,
          gustKt: null,
          variable: false,
          variableFromDeg: null,
          variableToDeg: null,
        },
        visibilitySm: 6.2,
        ceilingFtAgl: 1400,
        clouds: [{ cover: "BKN", baseFtAgl: 1400 }],
        phenomena: [],
        flightCategory: "MVFR",
        rawFragment: "24012KT 9999 BKN014",
      },
      {
        type: "TEMPO",
        from: "2026-08-07T18:00:00.000Z",
        to: "2026-08-08T02:00:00.000Z",
        wind: null,
        visibilitySm: 2.5,
        ceilingFtAgl: 1000,
        clouds: [{ cover: "BKN", baseFtAgl: 1000 }],
        phenomena: ["RA"],
        flightCategory: "IFR",
        rawFragment: "TEMPO 0718/0802 4000 -RA BKN010",
      },
      {
        type: "BECMG",
        from: "2026-08-08T08:00:00.000Z",
        to: "2026-08-08T11:00:00.000Z",
        wind: {
          directionDeg: 250,
          speedKt: 10,
          gustKt: null,
          variable: false,
          variableFromDeg: null,
          variableToDeg: null,
        },
        visibilitySm: 6.2,
        ceilingFtAgl: null,
        clouds: [{ cover: "SCT", baseFtAgl: 2000 }],
        phenomena: [],
        flightCategory: "VFR",
        rawFragment: "BECMG 0808/0811 25010KT 9999 SCT020",
      },
    ],
  },
  EIDW: {
    icao: icao("EIDW"),
    issuedAt: "2026-08-07T17:00:00.000Z",
    validFrom: "2026-08-07T18:00:00.000Z",
    validTo: "2026-08-08T18:00:00.000Z",
    raw: "EIDW 071700Z 0718/0818 25015G25KT 9999 SCT018 BKN030\n  TEMPO 0718/0806 25020G32KT SHRA BKN014",
    periods: [
      {
        type: "FROM",
        from: "2026-08-07T18:00:00.000Z",
        to: "2026-08-08T18:00:00.000Z",
        wind: {
          directionDeg: 250,
          speedKt: 15,
          gustKt: 25,
          variable: false,
          variableFromDeg: null,
          variableToDeg: null,
        },
        visibilitySm: 6.2,
        ceilingFtAgl: 3000,
        clouds: [
          { cover: "SCT", baseFtAgl: 1800 },
          { cover: "BKN", baseFtAgl: 3000 },
        ],
        phenomena: [],
        flightCategory: "MVFR",
        rawFragment: "25015G25KT 9999 SCT018 BKN030",
      },
      {
        type: "TEMPO",
        from: "2026-08-07T18:00:00.000Z",
        to: "2026-08-08T06:00:00.000Z",
        wind: {
          directionDeg: 250,
          speedKt: 20,
          gustKt: 32,
          variable: false,
          variableFromDeg: null,
          variableToDeg: null,
        },
        visibilitySm: 6.2,
        ceilingFtAgl: 1400,
        clouds: [{ cover: "BKN", baseFtAgl: 1400 }],
        phenomena: ["SHRA"],
        flightCategory: "MVFR",
        rawFragment: "TEMPO 0718/0806 25020G32KT SHRA BKN014",
      },
    ],
  },
};

const OPERATIONAL_SUMMARIES: Record<string, string> = {
  KJFK: "VFR. Crosswind component from the west with gusts to 22 kt. No significant ceiling or visibility restrictions for departure.",
  EGLL: "MVFR. Broken 1400 ft with light rain. TEMPO IFR possible through 02Z with visibility 4000 m and BKN010. Plan for possible low approach minima and wet runway.",
  EIDW: "MVFR. Strong southwesterly flow with gusts. TEMPO showers and BKN014 overnight. Suitable alternate with wind as primary consideration.",
  KORD: "VFR. Light northwesterly wind. No operational constraints for terminal weather.",
  KLAX: "MVFR marine layer. SCT008 BKN012 with BR. Monitor ceiling for approach category and possible delay program.",
};

export function buildMockAirportWeather(code: string): AirportWeather | null {
  const normalized = code.trim().toUpperCase();
  const metar = MOCK_METARS[normalized] ?? null;
  const taf = MOCK_TAFS[normalized] ?? null;

  if (!metar && !taf) {
    return null;
  }

  return {
    icao: icao(normalized),
    metar,
    taf,
    operationalSummary:
      OPERATIONAL_SUMMARIES[normalized] ??
      "Limited mock coverage for this station. Live providers will supply full products in a later milestone.",
    fetchedAt: NOW,
  };
}

export const MOCK_SIGMETS: readonly Sigmet[] = [
  {
    id: "SIGMET-EGGX-01",
    hazard: "TURB",
    severity: "MOD",
    raw: "EGGX SIGMET 01 VALID 071800/072200 EGTT- EGGX SHANWICK FIR SEV TURB FCST WI N5200 W02000 - N5600 W01000 - N5400 W00800 - N5000 W01800 FL280/380 STNR NC=",
    validFrom: "2026-08-07T18:00:00.000Z",
    validTo: "2026-08-07T22:00:00.000Z",
    firs: ["EGGX"],
    summary: "Moderate/severe turbulence forecast Shanwick FIR FL280–380",
    polygon: [
      { latitude: 52, longitude: -20 },
      { latitude: 56, longitude: -10 },
      { latitude: 54, longitude: -8 },
      { latitude: 50, longitude: -18 },
    ],
  },
  {
    id: "SIGMET-KZNY-02",
    hazard: "CONVECTIVE",
    severity: "SEV",
    raw: "KZNY SIGMET Papa 2 VALID 071700/072100 KZNY- KZNY NEW YORK FIR EMBD TS OBS WI 40NM OF N4000 W07400 TOP FL420 MOV ENE 25KT NC=",
    validFrom: "2026-08-07T17:00:00.000Z",
    validTo: "2026-08-07T21:00:00.000Z",
    firs: ["KZNY"],
    summary: "Embedded thunderstorms near NYC coastal area, tops FL420, moving ENE",
    polygon: null,
  },
];

export function buildMockEnrouteWeather(flightLevel: number): EnrouteWeather {
  return {
    windsAloft: [
      {
        point: { latitude: 41.5, longitude: -65 },
        label: "NAT Entry / Gander",
        flightLevel,
        windDirectionDeg: 270,
        windSpeedKt: 85,
        temperatureC: -48,
        shearProxyKtPer1000Ft: 2.1,
        cloudCoverPct: 40,
      },
      {
        point: { latitude: 48, longitude: -40 },
        label: "Mid NAT",
        flightLevel,
        windDirectionDeg: 265,
        windSpeedKt: 110,
        temperatureC: -52,
        shearProxyKtPer1000Ft: 3.4,
        cloudCoverPct: 55,
      },
      {
        point: { latitude: 51, longitude: -15 },
        label: "Shanwick",
        flightLevel,
        windDirectionDeg: 255,
        windSpeedKt: 95,
        temperatureC: -50,
        shearProxyKtPer1000Ft: 4.2,
        cloudCoverPct: 70,
      },
    ],
    turbulence: [
      {
        segmentLabel: "KJFK–50N050W",
        fromFix: "KJFK",
        toFix: "50N050W",
        intensity: "LIGHT",
        flightLevelBand: `FL${flightLevel - 20}-${flightLevel + 20}`,
        expectedDuration: "About 20–45 minutes",
        likelyCause: "CLEAR_AIR",
        confidence: "MEDIUM",
        pilotText: "KJFK–50N050W\nOccasional light turbulence.",
        notes: "Clear-air turbulence risk from vertical shear. Confidence MEDIUM.",
      },
      {
        segmentLabel: "50N050W–EGLL",
        fromFix: "50N050W",
        toFix: "EGLL",
        intensity: "MODERATE",
        flightLevelBand: `FL${flightLevel - 20}-${flightLevel + 20}`,
        expectedDuration: "About 45–90 minutes",
        likelyCause: "JET_STREAM_SHEAR",
        confidence: "HIGH",
        pilotText: `50N050W–EGLL\nModerate CAT possible. FL${flightLevel - 20}-${flightLevel + 20}.`,
        notes: "Likely jet-stream related wind shear. Confidence HIGH.",
      },
    ],
    convective: [
      {
        segmentLabel: "Departure coastal NY",
        risk: "ISOLATED",
        notes: "Isolated embedded TS possible within KZNY FIR early in climb/departure.",
      },
      {
        segmentLabel: "Oceanic / arrival UK",
        risk: "NONE",
        notes: "No organized convective activity expected along oceanic track.",
      },
    ],
    alongRouteNotes: [
      "Strong westerly jet. Expect reduced eastbound groundspeed penalty vs average.",
      "Monitor Shanwick SIGMET for turbulence and coordinate FL change early if needed.",
      "Destination TEMPO IFR overnight — plan fuel/holding strategy accordingly.",
    ],
    sigmets: MOCK_SIGMETS,
    waypointConditions: [],
    dispatchBullets: [
      "Moderate turbulence expected after oceanic entry.",
      "Strong tailwinds in mid-NAT jet core.",
      "Destination MVFR with TEMPO IFR overnight.",
      "Alternate weather suitable with strong winds.",
    ],
  };
}

export function buildMockThreats(
  departureIcao: string,
  destinationIcao: string,
  alternateIcao: string | null,
): readonly ThreatItem[] {
  return [
    {
      id: "threat-dest-tempo-ifr",
      severity: "WARNING",
      title: "Destination TEMPO IFR",
      detail: `${destinationIcao.toUpperCase()} TEMPO 0718/0802 visibility 4000 m / BKN010 with light rain.`,
      relatedIcao: icao(destinationIcao.toUpperCase()),
    },
    {
      id: "threat-sigmet-turb",
      severity: "CAUTION",
      title: "Enroute turbulence SIGMET",
      detail: "Shanwick FIR moderate/severe turbulence FL280–380 valid through 22Z.",
      relatedIcao: null,
    },
    {
      id: "threat-dep-gusts",
      severity: "INFO",
      title: "Departure gusty crosswind",
      detail: `${departureIcao.toUpperCase()} wind 280/14G22. Review runway and company crosswind limits.`,
      relatedIcao: icao(departureIcao.toUpperCase()),
    },
    ...(alternateIcao
      ? [
          {
            id: "threat-alt-gusts",
            severity: "CAUTION" as const,
            title: "Alternate strong winds",
            detail: `${alternateIcao.toUpperCase()} gusts to 28–32 kt with showers. Confirm landing performance and runway suitability.`,
            relatedIcao: icao(alternateIcao.toUpperCase()),
          },
        ]
      : []),
  ];
}
