import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { WeatherBriefing } from "@/domain/models/briefing";
import type { Airport } from "@/domain/models/airport";
import type {
  AirportWeather,
  ConvectiveRisk,
  ThreatSeverity,
  TurbulenceIntensity,
} from "@/domain/models/weather";
import {
  APP_NAME,
  DATA_SOURCE_FOOTER,
} from "@/domain/constants/app";
import {
  CONVECTIVE_LABELS,
  TURBULENCE_LABELS,
} from "@/domain/constants/weather-styles";
import { PdfBrandLockup } from "@/components/brand/pdf-logo";
import { PdfVectorMap } from "@/components/briefing/pdf-vector-map";
import {
  formatCeiling,
  formatFlightLevel,
  formatUtc,
  formatVisibilitySm,
  formatWind,
} from "@/lib/format";

/** Restrained aviation print palette. */
const ink = "#0b1524";
const slate = "#334155";
const mute = "#64748b";
const line = "#e2e8f0";
const soft = "#f1f5f9";
const softAlt = "#e8eef5";
const navy = "#0b1f33";
const navyBand = "#132a42";
const cyan = "#0e7490";
const white = "#ffffff";
const green = "#047857";
const greenBg = "#ecfdf5";
const blue = "#1d4ed8";
const blueBg = "#eff6ff";
const amber = "#b45309";
const amberBg = "#fffbeb";
const red = "#b91c1c";
const redBg = "#fef2f2";
const purple = "#7e22ce";
const purpleBg = "#faf5ff";

const TURB_RANK: Record<TurbulenceIntensity, number> = {
  NONE: 0,
  LIGHT: 1,
  MODERATE: 2,
  SEVERE: 3,
};
const CONV_RANK: Record<ConvectiveRisk, number> = {
  NONE: 0,
  ISOLATED: 1,
  SCATTERED: 2,
  WIDESPREAD: 3,
};
const THREAT_RANK: Record<ThreatSeverity, number> = {
  INFO: 0,
  CAUTION: 1,
  WARNING: 2,
  CRITICAL: 3,
};

function turbTone(v: TurbulenceIntensity): { fg: string; bg: string; bd: string } {
  switch (v) {
    case "SEVERE":
      return { fg: red, bg: redBg, bd: "#fecaca" };
    case "MODERATE":
      return { fg: amber, bg: amberBg, bd: "#fde68a" };
    case "LIGHT":
      return { fg: blue, bg: blueBg, bd: "#bfdbfe" };
    default:
      return { fg: green, bg: greenBg, bd: "#a7f3d0" };
  }
}

function catTone(v: string | undefined): { fg: string; bg: string; bd: string } {
  switch (v) {
    case "VFR":
      return { fg: green, bg: greenBg, bd: "#a7f3d0" };
    case "MVFR":
      return { fg: blue, bg: blueBg, bd: "#bfdbfe" };
    case "IFR":
      return { fg: red, bg: redBg, bd: "#fecaca" };
    case "LIFR":
      return { fg: purple, bg: purpleBg, bd: "#e9d5ff" };
    default:
      return { fg: mute, bg: soft, bd: line };
  }
}

function maxOf<T extends string>(
  items: readonly T[],
  rank: Record<T, number>,
  fallback: T,
): T {
  let best = fallback;
  for (const item of items) {
    if (rank[item] > rank[best]) best = item;
  }
  return best;
}

function riskTone(
  turb: TurbulenceIntensity,
  conv: ConvectiveRisk,
  threat: ThreatSeverity | null,
): { label: string; fg: string; bg: string; bd: string } {
  const score = Math.max(
    TURB_RANK[turb],
    CONV_RANK[conv],
    threat ? THREAT_RANK[threat] : 0,
  );
  if (score >= 3) return { label: "HIGH", fg: red, bg: redBg, bd: "#fecaca" };
  if (score >= 2)
    return { label: "ELEVATED", fg: amber, bg: amberBg, bd: "#fde68a" };
  if (score >= 1) return { label: "WATCH", fg: blue, bg: blueBg, bd: "#bfdbfe" };
  return { label: "LOW", fg: green, bg: greenBg, bd: "#a7f3d0" };
}

function clouds(metar: AirportWeather["metar"]): string {
  if (!metar?.clouds.length) return "—";
  return metar.clouds
    .map((c) =>
      c.baseFtAgl === null
        ? c.cover
        : `${c.cover}${String(Math.round(c.baseFtAgl / 100)).padStart(3, "0")}`,
    )
    .join(" ");
}

function shortLine(text: string): string {
  const parts = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? text;
}

function clip(text: string, n: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

const s = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 34,
    paddingHorizontal: 0,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    color: ink,
    backgroundColor: white,
  },
  content: {
    paddingHorizontal: 26,
  },
  masthead: {
    backgroundColor: navy,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 26,
    marginBottom: 10,
  },
  mastTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  brand: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: white,
    letterSpacing: 1.6,
  },
  brandSub: {
    fontSize: 6.5,
    color: "#94a3b8",
    marginTop: 2,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  mastStamp: {
    fontSize: 7,
    color: "#cbd5e1",
    textAlign: "right",
  },
  mastGrid: {
    flexDirection: "row",
    backgroundColor: navyBand,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  mastCell: {
    width: "16.66%",
    paddingRight: 4,
  },
  mastLabel: {
    fontSize: 5.5,
    color: "#7c8aa0",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  mastValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: white,
  },
  routeBand: {
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: "#1e3a5f",
  },
  routeText: {
    fontSize: 6.5,
    color: "#94a3b8",
    lineHeight: 1.3,
  },
  section: {
    marginTop: 2,
    marginBottom: 6,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: soft,
    borderLeftWidth: 3,
    borderLeftColor: navy,
    paddingVertical: 4,
    paddingHorizontal: 7,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: navy,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sectionHint: {
    marginLeft: "auto",
    fontSize: 6,
    color: mute,
  },
  execRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  execCard: {
    flex: 1,
    marginRight: 5,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: white,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  execCardLast: {
    flex: 1,
    marginRight: 0,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: white,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  execLabel: {
    fontSize: 6,
    color: mute,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  execValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  execHint: {
    fontSize: 6.5,
    color: mute,
  },
  badge: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  summaryRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: line,
    marginBottom: 8,
  },
  summaryCell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderRightWidth: 1,
    borderRightColor: line,
    backgroundColor: soft,
  },
  summaryCellLast: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 7,
    backgroundColor: soft,
  },
  kicker: {
    fontSize: 6,
    color: mute,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  strong: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: ink,
  },
  faint: {
    fontSize: 6.5,
    color: mute,
    marginTop: 1,
  },
  mapShell: {
    borderWidth: 1,
    borderColor: "#64748b",
    marginBottom: 4,
    backgroundColor: "#d9e6f2",
  },
  mapImage: {
    width: "100%",
    height: 300,
    objectFit: "cover",
  },
  mapFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: soft,
    borderTopWidth: 1,
    borderTopColor: line,
    paddingVertical: 4,
    paddingHorizontal: 7,
  },
  mapFooterText: {
    fontSize: 6,
    color: mute,
  },
  airportCard: {
    borderWidth: 1,
    borderColor: line,
    marginBottom: 7,
  },
  airportHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: navy,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  airportRole: {
    fontSize: 6,
    color: "#94a3b8",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  airportIcao: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: white,
    marginTop: 1,
  },
  airportName: {
    fontSize: 7,
    color: "#cbd5e1",
    marginTop: 1,
  },
  callout: {
    backgroundColor: "#ecfeff",
    borderBottomWidth: 1,
    borderBottomColor: line,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  calloutText: {
    fontSize: 7.5,
    color: slate,
    lineHeight: 1.3,
  },
  opsRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: line,
  },
  opsCell: {
    width: "20%",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: line,
    backgroundColor: soft,
  },
  opsLabel: {
    fontSize: 5.5,
    color: mute,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  opsValue: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: ink,
  },
  airportBody: {
    padding: 6,
  },
  tafRow: {
    flexDirection: "row",
    marginBottom: 1,
  },
  tafType: {
    width: 42,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
  },
  tafText: {
    flex: 1,
    fontSize: 6.5,
    color: slate,
  },
  rawBox: {
    backgroundColor: softAlt,
    paddingVertical: 3,
    paddingHorizontal: 5,
    marginTop: 3,
  },
  rawLabel: {
    fontSize: 5,
    color: mute,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  mono: {
    fontFamily: "Courier",
    fontSize: 6,
    color: slate,
    lineHeight: 1.25,
  },
  table: {
    borderWidth: 1,
    borderColor: line,
    marginBottom: 6,
  },
  thead: {
    flexDirection: "row",
    backgroundColor: navy,
    paddingVertical: 4,
    paddingHorizontal: 5,
  },
  th: {
    fontSize: 5.5,
    fontFamily: "Helvetica-Bold",
    color: "#cbd5e1",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: line,
    alignItems: "center",
  },
  td: {
    fontSize: 7,
    color: ink,
  },
  tdMute: {
    fontSize: 6.5,
    color: mute,
  },
  note: {
    backgroundColor: soft,
    borderWidth: 1,
    borderColor: line,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 3,
  },
  noteText: {
    fontSize: 7.5,
    color: slate,
    lineHeight: 1.25,
  },
  turbCard: {
    borderWidth: 1,
    borderColor: line,
    paddingVertical: 5,
    paddingHorizontal: 7,
    marginBottom: 4,
  },
  turbTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  turbSeg: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 2,
  },
  metaItem: {
    fontSize: 6.5,
    color: mute,
    marginRight: 10,
  },
  metaStrong: {
    fontFamily: "Helvetica-Bold",
    color: slate,
  },
  bullet: {
    flexDirection: "row",
    backgroundColor: soft,
    borderLeftWidth: 2,
    borderLeftColor: cyan,
    paddingVertical: 5,
    paddingHorizontal: 7,
    marginBottom: 3,
  },
  bulletMark: {
    width: 9,
    color: cyan,
    fontFamily: "Helvetica-Bold",
  },
  bulletText: {
    flex: 1,
    fontSize: 8,
    color: ink,
    lineHeight: 1.25,
  },
  footer: {
    position: "absolute",
    left: 26,
    right: 26,
    bottom: 8,
    borderTopWidth: 1,
    borderTopColor: line,
    paddingTop: 3,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6,
    color: mute,
  },
  legendRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 9,
  },
  legendDot: {
    width: 6,
    height: 6,
    marginRight: 3,
    borderWidth: 1,
  },
  legendText: {
    fontSize: 6,
    color: mute,
  },
});

function Section({
  title,
  hint,
}: {
  readonly title: string;
  readonly hint?: string;
}) {
  return (
    <View style={s.sectionHead} wrap={false}>
      <Text style={s.sectionTitle}>{title}</Text>
      {hint ? <Text style={s.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

function Badge({
  label,
  fg,
  bg,
  bd,
}: {
  readonly label: string;
  readonly fg: string;
  readonly bg: string;
  readonly bd: string;
}) {
  return (
    <Text style={[s.badge, { color: fg, backgroundColor: bg, borderColor: bd }]}>
      {label}
    </Text>
  );
}

function AirportCard({
  role,
  airport,
  weather,
}: {
  readonly role: string;
  readonly airport: Airport;
  readonly weather: AirportWeather;
}) {
  const cat = weather.metar?.flightCategory ?? "UNKNOWN";
  const tone = catTone(cat);

  return (
    <View style={s.airportCard}>
      <View style={s.airportHead} wrap={false}>
        <View>
          <Text style={s.airportRole}>{role}</Text>
          <Text style={s.airportIcao}>{airport.icao}</Text>
          <Text style={s.airportName}>{airport.name}</Text>
        </View>
        <Badge label={cat} fg={tone.fg} bg={tone.bg} bd={tone.bd} />
      </View>

      <View style={s.callout} wrap={false}>
        <Text style={s.calloutText}>
          {clip(weather.operationalSummary, 160)}
        </Text>
      </View>

      <View style={s.opsRow} wrap={false}>
        {(
          [
            ["Wind", weather.metar ? formatWind(weather.metar.wind) : "—"],
            ["Visibility", formatVisibilitySm(weather.metar?.visibilitySm ?? null)],
            ["Clouds", clouds(weather.metar)],
            ["Ceiling", formatCeiling(weather.metar?.ceilingFtAgl ?? null)],
            [
              "Temp / QNH",
              `${weather.metar?.temperatureC ?? "—"}°C · ${weather.metar?.qnhHpa ?? "—"} hPa`,
            ],
          ] as const
        ).map(([label, value], index) => (
          <View
            key={label}
            style={
              index === 4
                ? [s.opsCell, { borderRightWidth: 0 }]
                : s.opsCell
            }
          >
            <Text style={s.opsLabel}>{label}</Text>
            <Text style={s.opsValue}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={s.airportBody}>
        {weather.taf?.periods.slice(0, 2).map((period) => {
          const toneP = catTone(period.flightCategory);
          return (
            <View key={`${period.type}-${period.from}`} style={s.tafRow}>
              <Text style={[s.tafType, { color: toneP.fg }]}>{period.type}</Text>
              <Text style={s.tafText}>
                {period.flightCategory} · {clip(period.rawFragment, 90)}
              </Text>
            </View>
          );
        })}
        <View style={s.rawBox}>
          <Text style={s.rawLabel}>Raw METAR</Text>
          <Text style={s.mono}>
            {clip(weather.metar?.raw ?? "METAR unavailable", 220)}
          </Text>
        </View>
        <View style={s.rawBox}>
          <Text style={s.rawLabel}>Raw TAF</Text>
          <Text style={s.mono}>
            {clip(weather.taf?.raw ?? "TAF unavailable", 220)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Footer({ generatedAt }: { readonly generatedAt: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>
        {APP_NAME} · {formatUtc(generatedAt, "yyyy-MM-dd HH:mm")}Z UTC ·{" "}
        {DATA_SOURCE_FOOTER}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

export function BriefingPdfDocument({
  briefing,
  mapImageDataUrl,
}: {
  readonly briefing: WeatherBriefing;
  readonly mapImageDataUrl?: string | null;
}) {
  const { summary, request, enroute } = briefing;

  const cruiseTurb = enroute.turbulence.filter(
    (t) => t.altitudeBand === "cruise",
  );
  const maxTurb = maxOf(
    (cruiseTurb.length > 0 ? cruiseTurb : enroute.turbulence).map(
      (t) => t.intensity,
    ),
    TURB_RANK,
    "NONE",
  );
  const maxConv = maxOf(
    enroute.convective.map((c) => c.risk),
    CONV_RANK,
    "NONE",
  );
  const topThreat =
    briefing.threats.length === 0
      ? null
      : maxOf(
          briefing.threats.map((t) => t.severity),
          THREAT_RANK,
          "INFO",
        );
  const risk = riskTone(maxTurb, maxConv, topThreat);
  const destCat =
    briefing.destinationWeather.metar?.flightCategory ?? "UNKNOWN";
  const ride = turbTone(maxTurb);
  const dest = catTone(destCat);
  const conv =
    maxConv === "NONE"
      ? { fg: green, bg: greenBg, bd: "#a7f3d0" }
      : maxConv === "ISOLATED"
        ? { fg: blue, bg: blueBg, bd: "#bfdbfe" }
        : maxConv === "SCATTERED"
          ? { fg: amber, bg: amberBg, bd: "#fde68a" }
          : { fg: red, bg: redBg, bd: "#fecaca" };

  const byFix = new Map(
    enroute.waypointConditions.map((c) => [c.fixName, c] as const),
  );
  const turbFrom = new Map(
    cruiseTurb.map((t) => [t.fromFix, t] as const),
  );
  const turbSegments = Array.from(
    new Map(enroute.turbulence.map((t) => [t.segmentLabel, true] as const)).keys(),
  );
  const cruiseWinds = enroute.windsAloft.filter(
    (w) => w.flightLevel === summary.flightLevel,
  );
  const windsForTable =
    cruiseWinds.length > 0 ? cruiseWinds : enroute.windsAloft;

  return (
    <Document
      title={`${APP_NAME} ${summary.departure.icao}-${summary.destination.icao}`}
      author={APP_NAME}
    >
      {/* PAGE 1 — masthead, executive cards, live map */}
      <Page size="A4" style={s.page}>
        <View style={s.masthead}>
          <View style={s.mastTop}>
            <PdfBrandLockup />
            <Text style={s.mastStamp}>
              {formatUtc(summary.generatedAt, "yyyy-MM-dd HH:mm")}Z
            </Text>
          </View>

          <View style={s.mastGrid}>
            {(
              [
                ["Flight", request.flightNumber ?? "—"],
                ["Aircraft", request.aircraftRegistration ?? "—"],
                ["ETD UTC", formatUtc(summary.departureTimeUtc, "ddHH:mm")],
                ["Level", formatFlightLevel(summary.flightLevel)],
                ["Departure", summary.departure.icao],
                ["Destination", summary.destination.icao],
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={s.mastCell}>
                <Text style={s.mastLabel}>{label}</Text>
                <Text style={s.mastValue}>{value}</Text>
              </View>
            ))}
          </View>

          <View style={s.routeBand}>
            <Text style={s.routeText}>ROUTE  {briefing.route.raw}</Text>
            {briefing.route.resolvedRouteText ? (
              <Text style={[s.routeText, { marginTop: 3, color: cyan }]}>
                PARSED  {briefing.route.resolvedRouteText}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={s.content}>
          <View style={s.section}>
            <Section title="Executive summary" hint="Quick-glance operational status" />
            <View style={s.execRow} wrap={false}>
              {(
                [
                  {
                    label: "Expected ride",
                    value: TURBULENCE_LABELS[maxTurb],
                    hint:
                      cruiseTurb.find((t) => t.intensity === maxTurb)
                        ?.segmentLabel ?? "Route",
                    tone: ride,
                    last: false,
                  },
                  {
                    label: "Max turbulence",
                    value: TURBULENCE_LABELS[maxTurb],
                    hint:
                      cruiseTurb.find((t) => t.intensity === maxTurb)
                        ?.flightLevelBand ??
                      formatFlightLevel(summary.flightLevel),
                    tone: ride,
                    last: false,
                  },
                  {
                    label: "Convective",
                    value: CONVECTIVE_LABELS[maxConv],
                    hint:
                      enroute.convective.find((c) => c.risk === maxConv)
                        ?.segmentLabel ?? "Along route",
                    tone: conv,
                    last: false,
                  },
                  {
                    label: "Destination",
                    value: destCat,
                    hint: summary.destination.icao,
                    tone: dest,
                    last: false,
                  },
                  {
                    label: "Op. risk",
                    value: risk.label,
                    hint: topThreat
                      ? `${briefing.threats.length} threat item(s)`
                      : "No elevated threats",
                    tone: risk,
                    last: true,
                  },
                ] as const
              ).map((card) => (
                <View
                  key={card.label}
                  style={[
                    card.last ? s.execCardLast : s.execCard,
                    {
                      backgroundColor: card.tone.bg,
                      borderColor: card.tone.bd,
                    },
                  ]}
                >
                  <Text style={s.execLabel}>{card.label}</Text>
                  <Text style={[s.execValue, { color: card.tone.fg }]}>
                    {card.value}
                  </Text>
                  <Text style={s.execHint}>{card.hint}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={s.section}>
            <Section
              title="Crew onboard brief"
              hint="Plain-language ride call for the flight deck"
            />
            <View
              style={{
                borderWidth: 1,
                borderColor: cyan,
                backgroundColor: softAlt,
                padding: 8,
                marginBottom: 4,
              }}
              wrap={false}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontFamily: "Helvetica-Bold",
                  color: ink,
                  marginBottom: 5,
                }}
              >
                {enroute.crewBrief.headline}
              </Text>
              {enroute.crewBrief.lines.map((line) => (
                <View key={line} style={s.bullet} wrap={false}>
                  <Text style={s.bulletMark}>•</Text>
                  <Text style={s.bulletText}>{line}</Text>
                </View>
              ))}
              <Text style={{ fontSize: 6, color: mute, marginTop: 4 }}>
                Timed from filed route · assumed cruise groundspeed · advisory
              </Text>
            </View>
          </View>

          <View style={s.section}>
            <Section
              title="1. Flight summary"
              hint={`${summary.alternate?.icao ? `ALTN ${summary.alternate.icao}` : "No alternate"} · ${briefing.dataMode.toUpperCase()}`}
            />
            <View style={s.summaryRow} wrap={false}>
              <View style={s.summaryCell}>
                <Text style={s.kicker}>City pair</Text>
                <Text style={s.strong}>
                  {summary.departure.icao} - {summary.destination.icao}
                </Text>
                <Text style={s.faint}>
                  {summary.departure.name.split("/")[0]?.trim()}
                </Text>
              </View>
              <View style={s.summaryCell}>
                <Text style={s.kicker}>Alternate</Text>
                <Text style={s.strong}>{summary.alternate?.icao ?? "—"}</Text>
                <Text style={s.faint}>
                  {summary.alternate?.name.split("/")[0]?.trim() ?? "None filed"}
                </Text>
              </View>
              <View style={s.summaryCell}>
                <Text style={s.kicker}>Level / distance</Text>
                <Text style={s.strong}>
                  {formatFlightLevel(summary.flightLevel)}
                </Text>
                <Text style={s.faint}>
                  {Math.round(summary.routeDistanceNm).toLocaleString()} NM filed
                </Text>
              </View>
              <View style={s.summaryCellLast}>
                <Text style={s.kicker}>Threats</Text>
                <Text style={s.strong}>{briefing.threats.length}</Text>
                <Text style={s.faint}>
                  {topThreat ? `Highest: ${topThreat}` : "None raised"}
                </Text>
              </View>
            </View>
          </View>

          <View style={s.section}>
            <Section
              title="5. Route weather map"
              hint="Basemap + filed route · weather overlays"
            />
            <View style={s.legendRow}>
              {(
                [
                  ["NONE", "Smooth turb"],
                  ["LIGHT", "Light turb"],
                  ["MODERATE", "Moderate turb"],
                  ["SEVERE", "Severe turb"],
                ] as const
              ).map(([key, label]) => {
                const tone = turbTone(key);
                return (
                  <View key={key} style={s.legendItem}>
                    <View
                      style={[
                        s.legendDot,
                        {
                          backgroundColor: tone.fg,
                          borderColor: tone.bd,
                          borderRadius: 3,
                        },
                      ]}
                    />
                    <Text style={s.legendText}>{label}</Text>
                  </View>
                );
              })}
              <View style={s.legendItem}>
                <View
                  style={[
                    s.legendDot,
                    {
                      backgroundColor: "#0ea5e9",
                      borderColor: "#0b1524",
                      borderRadius: 1,
                    },
                  ]}
                />
                <Text style={s.legendText}>Waypoint</Text>
              </View>
            </View>

            {mapImageDataUrl ? (
              <View style={s.mapShell} wrap={false}>
                {/* react-pdf Image — not a DOM <img>; a11y rule does not apply */}
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={mapImageDataUrl} style={s.mapImage} />
                <View style={s.mapFooter}>
                  <Text style={s.mapFooterText}>
                    CARTO basemap · filed route · cyan waypoints · turb dots by
                    intensity (advisory)
                  </Text>
                  <Text style={s.mapFooterText}>
                    {Math.round(summary.routeDistanceNm).toLocaleString()} NM ·{" "}
                    {briefing.route.fixes.length} waypoints
                  </Text>
                </View>
              </View>
            ) : (
              <PdfVectorMap briefing={briefing} />
            )}
          </View>
        </View>

        <Footer generatedAt={summary.generatedAt} />
      </Page>

      {/* PAGE 2 — airport weather */}
      <Page size="A4" style={s.page}>
        <View style={[s.content, { paddingTop: 22 }]}>
          <Section title="2. Departure weather" />
          <AirportCard
            role="Departure"
            airport={summary.departure}
            weather={briefing.departureWeather}
          />

          <Section title="3. Destination weather" />
          <AirportCard
            role="Destination"
            airport={summary.destination}
            weather={briefing.destinationWeather}
          />

          {summary.alternate && briefing.alternateWeather ? (
            <>
              <Section title="4. Alternate weather" />
              <AirportCard
                role="Alternate"
                airport={summary.alternate}
                weather={briefing.alternateWeather}
              />
            </>
          ) : null}
        </View>
        <Footer generatedAt={summary.generatedAt} />
      </Page>

      {/* PAGE 3 — enroute tables + turbulence */}
      <Page size="A4" style={s.page}>
        <View style={[s.content, { paddingTop: 22 }]}>
          <Section title="6. Enroute weather" hint="Along the filed ATC route" />

          {enroute.alongRouteNotes.map((note) => (
            <View key={note} style={s.note} wrap={false}>
              <Text style={s.noteText}>{note}</Text>
            </View>
          ))}

          <Text
            style={{
              fontSize: 7,
              fontFamily: "Helvetica-Bold",
              color: mute,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              marginTop: 8,
              marginBottom: 4,
            }}
          >
            Waypoint conditions
          </Text>
          <View style={s.table}>
            <View style={s.thead} wrap={false}>
              <Text style={[s.th, { width: "13%" }]}>Fix</Text>
              <Text style={[s.th, { width: "12%" }]}>Ride</Text>
              <Text style={[s.th, { width: "16%" }]}>Wind</Text>
              <Text style={[s.th, { width: "10%" }]}>Temp</Text>
              <Text style={[s.th, { width: "10%" }]}>Cloud</Text>
              <Text style={[s.th, { width: "39%" }]}>Remark</Text>
            </View>
            {briefing.route.fixes.map((fix, index) => {
              const condition = byFix.get(fix.name);
              const turb = turbFrom.get(fix.name);
              const intensity =
                condition?.turbulence ?? turb?.intensity ?? "NONE";
              const tone = turbTone(intensity);
              const wind =
                condition?.windDirectionDeg != null &&
                condition.windSpeedKt != null
                  ? `${String(condition.windDirectionDeg).padStart(3, "0")}/${condition.windSpeedKt}kt`
                  : "—";
              const remark = turb
                ? shortLine(turb.pilotText)
                : (condition?.forecastNote ?? "—");
              return (
                <View
                  key={fix.id}
                  style={[
                    s.tr,
                    { backgroundColor: index % 2 ? softAlt : white },
                  ]}
                  wrap={false}
                >
                  <Text
                    style={[
                      s.td,
                      { width: "13%", fontFamily: "Helvetica-Bold" },
                    ]}
                  >
                    {fix.name}
                  </Text>
                  <View style={{ width: "12%" }}>
                    <Badge
                      label={TURBULENCE_LABELS[intensity].toUpperCase()}
                      fg={tone.fg}
                      bg={tone.bg}
                      bd={tone.bd}
                    />
                  </View>
                  <Text
                    style={[s.td, { width: "16%", fontFamily: "Courier" }]}
                  >
                    {wind}
                  </Text>
                  <Text style={[s.td, { width: "10%" }]}>
                    {condition?.temperatureC != null
                      ? `${condition.temperatureC}°C`
                      : "—"}
                  </Text>
                  <Text style={[s.td, { width: "10%" }]}>
                    {condition?.cloudCoverPct != null
                      ? `${condition.cloudCoverPct}%`
                      : "—"}
                  </Text>
                  <Text style={[s.tdMute, { width: "39%" }]}>{remark}</Text>
                </View>
              );
            })}
          </View>

          <Text
            style={{
              fontSize: 7,
              fontFamily: "Helvetica-Bold",
              color: mute,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              marginTop: 4,
              marginBottom: 4,
            }}
          >
            Winds aloft
          </Text>
          <View style={s.table}>
            <View style={s.thead} wrap={false}>
              <Text style={[s.th, { width: "28%" }]}>Segment</Text>
              <Text style={[s.th, { width: "12%" }]}>FL</Text>
              <Text style={[s.th, { width: "20%" }]}>Wind</Text>
              <Text style={[s.th, { width: "14%" }]}>Temp</Text>
              <Text style={[s.th, { width: "13%" }]}>Cloud</Text>
              <Text style={[s.th, { width: "13%" }]}>Shear</Text>
            </View>
            {windsForTable.slice(0, 14).map((sample, index) => (
              <View
                key={`${sample.label}-${sample.flightLevel}-${index}`}
                style={[
                  s.tr,
                  { backgroundColor: index % 2 ? softAlt : white },
                ]}
                wrap={false}
              >
                <Text style={[s.td, { width: "28%" }]}>{sample.label}</Text>
                <Text style={[s.td, { width: "12%", fontFamily: "Courier" }]}>
                  {sample.flightLevel}
                </Text>
                <Text style={[s.td, { width: "20%", fontFamily: "Courier" }]}>
                  {String(sample.windDirectionDeg).padStart(3, "0")}/
                  {sample.windSpeedKt}kt
                </Text>
                <Text style={[s.td, { width: "14%" }]}>
                  {sample.temperatureC}°C
                </Text>
                <Text style={[s.td, { width: "13%" }]}>
                  {sample.cloudCoverPct != null
                    ? `${sample.cloudCoverPct}%`
                    : "—"}
                </Text>
                <Text style={[s.td, { width: "13%" }]}>
                  {sample.shearProxyKtPer1000Ft ?? "—"}
                </Text>
              </View>
            ))}
          </View>

          <Section
            title="7. Turbulence briefing"
            hint="Cruise ±4000 ft · 1000 ft steps"
          />
          {turbSegments.map((segment) => {
            const items = enroute.turbulence
              .filter((t) => t.segmentLabel === segment)
              .slice()
              .sort((a, b) => a.altitudeOffsetFl - b.altitudeOffsetFl);
            return (
              <View key={segment} style={s.turbCard} wrap={false}>
                <Text style={[s.turbSeg, { marginBottom: 4 }]}>{segment}</Text>
                {items.map((turb) => {
                  const tone = turbTone(turb.intensity);
                  return (
                    <View
                      key={`${segment}-${turb.altitudeOffsetFl}`}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 3,
                      }}
                    >
                      <Text style={[s.tdMute, { width: "34%" }]}>
                        {turb.flightLevelBand}
                      </Text>
                      <View style={{ width: "18%" }}>
                        <Badge
                          label={TURBULENCE_LABELS[turb.intensity].toUpperCase()}
                          fg={tone.fg}
                          bg={tone.bg}
                          bd={tone.bd}
                        />
                      </View>
                      <Text style={[s.td, { width: "48%" }]}>
                        {shortLine(turb.pilotText)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
        <Footer generatedAt={summary.generatedAt} />
      </Page>

      {/* PAGE 4 — SIGMETs + ops summary */}
      <Page size="A4" style={s.page}>
        <View style={[s.content, { paddingTop: 22 }]}>
          <Section title="SIGMETs" hint="Route corridor" />
          {enroute.sigmets.length === 0 ? (
            <View style={s.note}>
              <Text style={s.noteText}>No route-corridor SIGMETs.</Text>
            </View>
          ) : (
            enroute.sigmets.map((sigmet) => (
              <View
                key={sigmet.id}
                style={[
                  s.turbCard,
                  { borderLeftWidth: 3, borderLeftColor: amber },
                ]}
                wrap={false}
              >
                <View style={s.turbTop}>
                  <Text style={s.turbSeg}>{sigmet.summary}</Text>
                  <Badge
                    label={sigmet.hazard}
                    fg={amber}
                    bg={amberBg}
                    bd="#fde68a"
                  />
                </View>
                <Text style={{ fontSize: 7, color: mute, marginBottom: 3 }}>
                  {formatUtc(sigmet.validFrom, "ddHHmm")}–
                  {formatUtc(sigmet.validTo, "ddHHmm")}Z
                  {sigmet.severity !== "UNKNOWN" ? ` · ${sigmet.severity}` : ""}
                </Text>
                <View style={s.rawBox}>
                  <Text style={s.rawLabel}>Raw SIGMET</Text>
                  <Text style={s.mono}>{clip(sigmet.raw, 260)}</Text>
                </View>
              </View>
            ))
          )}

          <Section title="8. Operational weather summary" />
          {enroute.dispatchBullets.map((bullet) => (
            <View key={bullet} style={s.bullet} wrap={false}>
              <Text style={s.bulletMark}>•</Text>
              <Text style={s.bulletText}>{bullet}</Text>
            </View>
          ))}

          {briefing.threats.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Section title="Threat board" />
              {briefing.threats.map((item) => {
                const tone =
                  item.severity === "CRITICAL" || item.severity === "WARNING"
                    ? { fg: red, bg: redBg, bd: "#fecaca" }
                    : item.severity === "CAUTION"
                      ? { fg: amber, bg: amberBg, bd: "#fde68a" }
                      : { fg: blue, bg: blueBg, bd: "#bfdbfe" };
                return (
                  <View
                    key={item.id}
                    style={[
                      s.turbCard,
                      { backgroundColor: tone.bg, borderColor: tone.bd },
                    ]}
                    wrap={false}
                  >
                    <View style={s.turbTop}>
                      <Text style={s.turbSeg}>{item.title}</Text>
                      <Badge
                        label={item.severity}
                        fg={tone.fg}
                        bg={white}
                        bd={tone.bd}
                      />
                    </View>
                    <Text style={{ fontSize: 8, color: slate }}>
                      {item.detail}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
        <Footer generatedAt={summary.generatedAt} />
      </Page>
    </Document>
  );
}
