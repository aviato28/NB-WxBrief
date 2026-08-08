import React from "react";
import {
  Circle,
  Document,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  Polyline as SvgPolyline,
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
  PDF_PAGE_MARGIN_PT,
} from "@/domain/constants/app";
import { TURBULENCE_LABELS, CONVECTIVE_LABELS } from "@/domain/constants/weather-styles";
import {
  formatCeiling,
  formatFlightLevel,
  formatUtc,
  formatVisibilitySm,
  formatWind,
} from "@/lib/format";

/** Airline briefing palette — high contrast, scan-friendly. */
const C = {
  ink: "#0a1628",
  inkSoft: "#1e293b",
  paper: "#ffffff",
  panel: "#f7f9fc",
  panelAlt: "#eef2f7",
  line: "#d8e0ea",
  lineStrong: "#b8c4d4",
  muted: "#64748b",
  mutedLight: "#94a3b8",
  navy: "#0b1f33",
  navyMid: "#143049",
  cyan: "#0e7490",
  cyanSoft: "#ecfeff",
  green: "#047857",
  greenBg: "#ecfdf5",
  blue: "#1d4ed8",
  blueBg: "#eff6ff",
  amber: "#b45309",
  amberBg: "#fffbeb",
  orange: "#c2410c",
  orangeBg: "#fff7ed",
  red: "#b91c1c",
  redBg: "#fef2f2",
  purple: "#7e22ce",
  purpleBg: "#faf5ff",
  white: "#ffffff",
} as const;

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

function turbColors(intensity: TurbulenceIntensity): {
  fg: string;
  bg: string;
  border: string;
} {
  switch (intensity) {
    case "SEVERE":
      return { fg: C.red, bg: C.redBg, border: "#fecaca" };
    case "MODERATE":
      return { fg: C.amber, bg: C.amberBg, border: "#fde68a" };
    case "LIGHT":
      return { fg: C.blue, bg: C.blueBg, border: "#bfdbfe" };
    default:
      return { fg: C.green, bg: C.greenBg, border: "#a7f3d0" };
  }
}

function categoryColors(category: string | undefined): {
  fg: string;
  bg: string;
  border: string;
} {
  switch (category) {
    case "VFR":
      return { fg: C.green, bg: C.greenBg, border: "#a7f3d0" };
    case "MVFR":
      return { fg: C.blue, bg: C.blueBg, border: "#bfdbfe" };
    case "IFR":
      return { fg: C.red, bg: C.redBg, border: "#fecaca" };
    case "LIFR":
      return { fg: C.purple, bg: C.purpleBg, border: "#e9d5ff" };
    default:
      return { fg: C.muted, bg: C.panelAlt, border: C.line };
  }
}

function maxTurbulence(
  items: readonly { readonly intensity: TurbulenceIntensity }[],
): TurbulenceIntensity {
  let max: TurbulenceIntensity = "NONE";
  for (const item of items) {
    if (TURB_RANK[item.intensity] > TURB_RANK[max]) {
      max = item.intensity;
    }
  }
  return max;
}

function maxConvective(
  items: readonly { readonly risk: ConvectiveRisk }[],
): ConvectiveRisk {
  let max: ConvectiveRisk = "NONE";
  for (const item of items) {
    if (CONV_RANK[item.risk] > CONV_RANK[max]) {
      max = item.risk;
    }
  }
  return max;
}

function maxThreat(
  items: readonly { readonly severity: ThreatSeverity }[],
): ThreatSeverity | null {
  if (items.length === 0) return null;
  let max: ThreatSeverity = "INFO";
  for (const item of items) {
    if (THREAT_RANK[item.severity] > THREAT_RANK[max]) {
      max = item.severity;
    }
  }
  return max;
}

function riskLabel(
  turb: TurbulenceIntensity,
  conv: ConvectiveRisk,
  threat: ThreatSeverity | null,
): { label: string; fg: string; bg: string; border: string } {
  const threatRank = threat ? THREAT_RANK[threat] : 0;
  const score = Math.max(TURB_RANK[turb], CONV_RANK[conv], threatRank);
  if (score >= 3) {
    return { label: "HIGH", fg: C.red, bg: C.redBg, border: "#fecaca" };
  }
  if (score >= 2) {
    return { label: "ELEVATED", fg: C.amber, bg: C.amberBg, border: "#fde68a" };
  }
  if (score >= 1) {
    return { label: "MODERATE", fg: C.blue, bg: C.blueBg, border: "#bfdbfe" };
  }
  return { label: "LOW", fg: C.green, bg: C.greenBg, border: "#a7f3d0" };
}

function cloudLine(
  clouds: AirportWeather["metar"],
): string {
  if (!clouds?.clouds.length) return "—";
  return clouds.clouds
    .map((c) =>
      c.baseFtAgl === null
        ? c.cover
        : `${c.cover}${String(Math.round(c.baseFtAgl / 100)).padStart(3, "0")}`,
    )
    .join(" ");
}

function shortPilotLine(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? text;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: PDF_PAGE_MARGIN_PT,
    paddingBottom: PDF_PAGE_MARGIN_PT + 22,
    paddingHorizontal: PDF_PAGE_MARGIN_PT,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: C.ink,
    backgroundColor: C.paper,
  },
  header: {
    backgroundColor: C.navy,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  brand: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.6,
    color: C.white,
  },
  brandTag: {
    fontSize: 7,
    color: "#94a3b8",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headerMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metaCell: {
    width: "25%",
    marginBottom: 5,
    paddingRight: 6,
  },
  metaLabel: {
    fontSize: 6.5,
    color: "#7c8aa0",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  metaValue: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  routeStrip: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#1e3a5f",
  },
  routeText: {
    fontSize: 7,
    color: "#cbd5e1",
    lineHeight: 1.35,
  },
  section: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  sectionBar: {
    width: 3,
    height: 11,
    backgroundColor: C.cyan,
    marginRight: 7,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.1,
    color: C.navy,
    textTransform: "uppercase",
  },
  execRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  execCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
    paddingVertical: 8,
    paddingHorizontal: 7,
    minHeight: 58,
    marginRight: 5,
  },
  execCardLast: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
    paddingVertical: 8,
    paddingHorizontal: 7,
    minHeight: 58,
    marginRight: 0,
  },
  execLabel: {
    fontSize: 6.5,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: C.muted,
    marginBottom: 4,
  },
  execValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  execHint: {
    fontSize: 7,
    color: C.muted,
    lineHeight: 1.25,
  },
  badge: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  summaryGrid: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
    marginBottom: 2,
  },
  summaryCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: C.line,
  },
  summaryCellLast: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  summaryLabel: {
    fontSize: 6.5,
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
  },
  summarySub: {
    fontSize: 7,
    color: C.muted,
    marginTop: 2,
  },
  airportCard: {
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 8,
  },
  airportHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.navy,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  airportRole: {
    fontSize: 7,
    color: "#94a3b8",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  airportIcao: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  airportName: {
    fontSize: 7.5,
    color: "#cbd5e1",
    marginTop: 1,
  },
  opsGrid: {
    flexDirection: "row",
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  opsCell: {
    width: "20%",
    paddingVertical: 7,
    paddingHorizontal: 7,
    borderRightWidth: 1,
    borderRightColor: C.line,
  },
  opsLabel: {
    fontSize: 6,
    color: C.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  opsValue: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
  },
  airportBody: {
    padding: 9,
  },
  callout: {
    backgroundColor: C.cyanSoft,
    borderLeftWidth: 2,
    borderLeftColor: C.cyan,
    paddingVertical: 5,
    paddingHorizontal: 7,
    marginBottom: 7,
  },
  calloutText: {
    fontSize: 8,
    color: C.inkSoft,
    lineHeight: 1.3,
  },
  rawBlock: {
    backgroundColor: C.panelAlt,
    paddingVertical: 5,
    paddingHorizontal: 7,
    marginTop: 5,
  },
  rawLabel: {
    fontSize: 6,
    color: C.mutedLight,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  mono: {
    fontFamily: "Courier",
    fontSize: 6.8,
    color: C.inkSoft,
    lineHeight: 1.3,
  },
  tafRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  tafType: {
    width: 48,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },
  tafText: {
    flex: 1,
    fontSize: 7,
    color: C.inkSoft,
  },
  mapFrame: {
    borderWidth: 1,
    borderColor: C.lineStrong,
    backgroundColor: "#f1f5f9",
    marginBottom: 6,
  },
  mapCaption: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.panel,
  },
  mapCaptionText: {
    fontSize: 7,
    color: C.muted,
  },
  table: {
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 6,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: C.navy,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  th: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: "#cbd5e1",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    alignItems: "center",
  },
  td: {
    fontSize: 7.5,
    color: C.ink,
  },
  tdMuted: {
    fontSize: 7,
    color: C.muted,
  },
  noteChip: {
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
    paddingVertical: 5,
    paddingHorizontal: 7,
    marginBottom: 4,
  },
  noteText: {
    fontSize: 8,
    color: C.inkSoft,
    lineHeight: 1.3,
  },
  turbCard: {
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 5,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  turbTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  turbSeg: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
  },
  turbMeta: {
    flexDirection: "row",
    marginTop: 3,
  },
  turbMetaItem: {
    fontSize: 7,
    color: C.muted,
    marginRight: 10,
  },
  turbMetaStrong: {
    fontFamily: "Helvetica-Bold",
    color: C.inkSoft,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 4,
    paddingVertical: 5,
    paddingHorizontal: 7,
    backgroundColor: C.panel,
    borderLeftWidth: 2,
    borderLeftColor: C.cyan,
  },
  bulletMark: {
    width: 10,
    fontSize: 9,
    color: C.cyan,
    fontFamily: "Helvetica-Bold",
  },
  bulletText: {
    flex: 1,
    fontSize: 8.5,
    color: C.ink,
    lineHeight: 1.3,
  },
  footer: {
    position: "absolute",
    left: PDF_PAGE_MARGIN_PT,
    right: PDF_PAGE_MARGIN_PT,
    bottom: 10,
    fontSize: 6.5,
    color: C.muted,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  legendRow: {
    flexDirection: "row",
    marginBottom: 6,
    flexWrap: "wrap",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    marginRight: 3,
    borderWidth: 1,
  },
  legendText: {
    fontSize: 6.5,
    color: C.muted,
  },
});

function SectionHeading({ title }: { readonly title: string }) {
  return (
    <View style={styles.section} wrap={false}>
      <View style={styles.sectionBar} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function RideBadge({ intensity }: { readonly intensity: TurbulenceIntensity }) {
  const colors = turbColors(intensity);
  return (
    <Text
      style={[
        styles.badge,
        {
          color: colors.fg,
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
      ]}
    >
      {TURBULENCE_LABELS[intensity].toUpperCase()}
    </Text>
  );
}

function IconPlane() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path
        d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
        fill="#94a3b8"
      />
    </Svg>
  );
}

function ExecCard({
  label,
  value,
  hint,
  fg,
  bg,
  border,
  last = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly fg: string;
  readonly bg: string;
  readonly border: string;
  readonly last?: boolean;
}) {
  return (
    <View
      style={[
        last ? styles.execCardLast : styles.execCard,
        { backgroundColor: bg, borderColor: border },
      ]}
    >
      <Text style={styles.execLabel}>{label}</Text>
      <Text style={[styles.execValue, { color: fg }]}>{value}</Text>
      <Text style={styles.execHint}>{hint}</Text>
    </View>
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
  const catStyle = categoryColors(cat);

  return (
    <View style={styles.airportCard} wrap={false}>
      <View style={styles.airportHead}>
        <View>
          <Text style={styles.airportRole}>{role}</Text>
          <Text style={styles.airportIcao}>{airport.icao}</Text>
          <Text style={styles.airportName}>{airport.name}</Text>
        </View>
        <View
          style={{
            backgroundColor: catStyle.bg,
            borderWidth: 1,
            borderColor: catStyle.border,
            paddingVertical: 4,
            paddingHorizontal: 8,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontFamily: "Helvetica-Bold",
              color: catStyle.fg,
            }}
          >
            {cat}
          </Text>
        </View>
      </View>

      <View style={styles.callout}>
        <Text style={styles.calloutText}>{weather.operationalSummary}</Text>
      </View>

      <View style={styles.opsGrid}>
        <View style={styles.opsCell}>
          <Text style={styles.opsLabel}>Wind</Text>
          <Text style={styles.opsValue}>
            {weather.metar ? formatWind(weather.metar.wind) : "—"}
          </Text>
        </View>
        <View style={styles.opsCell}>
          <Text style={styles.opsLabel}>Visibility</Text>
          <Text style={styles.opsValue}>
            {formatVisibilitySm(weather.metar?.visibilitySm ?? null)}
          </Text>
        </View>
        <View style={styles.opsCell}>
          <Text style={styles.opsLabel}>Clouds</Text>
          <Text style={styles.opsValue}>{cloudLine(weather.metar)}</Text>
        </View>
        <View style={styles.opsCell}>
          <Text style={styles.opsLabel}>Ceiling</Text>
          <Text style={styles.opsValue}>
            {formatCeiling(weather.metar?.ceilingFtAgl ?? null)}
          </Text>
        </View>
        <View style={[styles.opsCell, { borderRightWidth: 0, width: "20%" }]}>
          <Text style={styles.opsLabel}>Temp / QNH</Text>
          <Text style={styles.opsValue}>
            {weather.metar?.temperatureC ?? "—"}°C ·{" "}
            {weather.metar?.qnhHpa ?? "—"} hPa
          </Text>
        </View>
      </View>

      <View style={styles.airportBody}>
        {weather.taf?.periods.slice(0, 4).map((period) => {
          const pStyle = categoryColors(period.flightCategory);
          return (
            <View key={`${period.type}-${period.from}`} style={styles.tafRow}>
              <Text style={[styles.tafType, { color: pStyle.fg }]}>
                {period.type}
              </Text>
              <Text style={styles.tafText}>
                {period.flightCategory} · {period.rawFragment}
              </Text>
            </View>
          );
        })}

        <View style={styles.rawBlock}>
          <Text style={styles.rawLabel}>Raw METAR</Text>
          <Text style={styles.mono}>
            {weather.metar?.raw ?? "METAR unavailable"}
          </Text>
        </View>
        <View style={styles.rawBlock}>
          <Text style={styles.rawLabel}>Raw TAF</Text>
          <Text style={styles.mono}>
            {weather.taf?.raw ?? "TAF unavailable"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function truncateRaw(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 1)}…`;
}

function RouteChart({ briefing }: { readonly briefing: WeatherBriefing }) {
  const points = briefing.route.pathPoints;
  if (points.length < 2) {
    return (
      <Text style={{ fontSize: 8, color: C.muted }}>
        Route geometry unavailable.
      </Text>
    );
  }

  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // Primary visual — full content width, tall plot.
  const width = 539;
  const height = 360;
  const pad = 22;

  const project = (lat: number, lon: number): [number, number] => {
    const x =
      pad +
      ((lon - minLon) / Math.max(0.0001, maxLon - minLon)) * (width - pad * 2);
    const y =
      pad +
      (1 - (lat - minLat) / Math.max(0.0001, maxLat - minLat)) *
        (height - pad * 2);
    return [x, y];
  };

  const poly = points
    .map((p) => project(p.latitude, p.longitude).join(","))
    .join(" ");

  const turbByFix = new Map<string, TurbulenceIntensity>();
  for (const turb of briefing.enroute.turbulence) {
    turbByFix.set(turb.fromFix, turb.intensity);
  }

  const dep = briefing.route.fixes[0];
  const dest = briefing.route.fixes[briefing.route.fixes.length - 1];

  return (
    <View style={styles.mapFrame} wrap={false}>
      <Svg width={width} height={height}>
        <SvgPolyline
          points={`${pad},${pad} ${width - pad},${pad} ${width - pad},${height - pad} ${pad},${height - pad} ${pad},${pad}`}
          stroke="#e2e8f0"
          strokeWidth={0.75}
          fill="#f8fafc"
        />

        {[0.25, 0.5, 0.75].map((f) => (
          <SvgPolyline
            key={`h-${f}`}
            points={`${pad},${pad + f * (height - pad * 2)} ${width - pad},${pad + f * (height - pad * 2)}`}
            stroke="#e2e8f0"
            strokeWidth={0.5}
            fill="none"
          />
        ))}
        {[0.25, 0.5, 0.75].map((f) => (
          <SvgPolyline
            key={`v-${f}`}
            points={`${pad + f * (width - pad * 2)},${pad} ${pad + f * (width - pad * 2)},${height - pad}`}
            stroke="#e2e8f0"
            strokeWidth={0.5}
            fill="none"
          />
        ))}

        <SvgPolyline
          points={poly}
          stroke={C.cyan}
          strokeWidth={3}
          fill="none"
        />

        {briefing.route.fixes.map((fix, index) => {
          if (!fix.coordinates) return null;
          const [x, y] = project(
            fix.coordinates.latitude,
            fix.coordinates.longitude,
          );
          const intensity = turbByFix.get(fix.name) ?? "NONE";
          const color = turbColors(intensity).fg;
          const isEnd =
            index === 0 || index === briefing.route.fixes.length - 1;
          return (
            <Circle
              key={fix.id}
              cx={x}
              cy={y}
              r={isEnd ? 5 : 3.2}
              fill={isEnd ? C.navy : color}
            />
          );
        })}
      </Svg>
      <View style={styles.mapCaption}>
        <Text style={styles.mapCaptionText}>
          {dep?.name ?? "DEP"} - {dest?.name ?? "DEST"} ·{" "}
          {Math.round(briefing.route.totalDistanceNm)} NM ·{" "}
          {briefing.route.fixes.length} waypoints
        </Text>
        <Text style={styles.mapCaptionText}>
          Filed route plot · waypoint markers by ride quality
        </Text>
      </View>
    </View>
  );
}

function WaypointTable({ briefing }: { readonly briefing: WeatherBriefing }) {
  const byFix = new Map(
    briefing.enroute.waypointConditions.map((c) => [c.fixName, c]),
  );
  const turbByFrom = new Map(
    briefing.enroute.turbulence.map((t) => [t.fromFix, t]),
  );

  return (
    <View style={styles.table}>
      <View style={styles.tableHead} wrap={false}>
        <Text style={[styles.th, { width: "14%" }]}>Waypoint</Text>
        <Text style={[styles.th, { width: "12%" }]}>Ride</Text>
        <Text style={[styles.th, { width: "16%" }]}>Wind</Text>
        <Text style={[styles.th, { width: "10%" }]}>Temp</Text>
        <Text style={[styles.th, { width: "10%" }]}>Cloud</Text>
        <Text style={[styles.th, { width: "38%" }]}>Operational remark</Text>
      </View>
      {briefing.route.fixes.map((fix, index) => {
        const condition = byFix.get(fix.name);
        const turb = turbByFrom.get(fix.name);
        const intensity =
          condition?.turbulence ?? turb?.intensity ?? ("NONE" as const);
        const wind =
          condition?.windDirectionDeg !== null &&
          condition?.windDirectionDeg !== undefined &&
          condition.windSpeedKt !== null
            ? `${String(condition.windDirectionDeg).padStart(3, "0")}/${condition.windSpeedKt}kt`
            : "—";
        const remark =
          turb?.pilotText
            ? shortPilotLine(turb.pilotText)
            : (condition?.forecastNote ?? "—");
        const alt = index % 2 === 1;

        return (
          <View
            key={fix.id}
            style={[
              styles.tr,
              { backgroundColor: alt ? C.panelAlt : C.white },
            ]}
            wrap={false}
          >
            <Text
              style={[
                styles.td,
                { width: "14%", fontFamily: "Helvetica-Bold" },
              ]}
            >
              {fix.name}
            </Text>
            <View style={{ width: "12%" }}>
              <RideBadge intensity={intensity} />
            </View>
            <Text style={[styles.td, { width: "16%", fontFamily: "Courier" }]}>
              {wind}
            </Text>
            <Text style={[styles.td, { width: "10%" }]}>
              {condition?.temperatureC !== null &&
              condition?.temperatureC !== undefined
                ? `${condition.temperatureC}°C`
                : "—"}
            </Text>
            <Text style={[styles.td, { width: "10%" }]}>
              {condition?.cloudCoverPct !== null &&
              condition?.cloudCoverPct !== undefined
                ? `${condition.cloudCoverPct}%`
                : "—"}
            </Text>
            <Text style={[styles.tdMuted, { width: "38%" }]}>{remark}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Footer({ generatedAt }: { readonly generatedAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        {APP_NAME} · Generated{" "}
        {formatUtc(generatedAt, "yyyy-MM-dd HH:mm")}Z UTC · {DATA_SOURCE_FOOTER}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

export function BriefingPdfDocument({
  briefing,
}: {
  readonly briefing: WeatherBriefing;
}) {
  const { summary, request, enroute } = briefing;

  const maxTurb = maxTurbulence(enroute.turbulence);
  const maxConv = maxConvective(enroute.convective);
  const threat = maxThreat(briefing.threats);
  const risk = riskLabel(maxTurb, maxConv, threat);
  const destCat =
    briefing.destinationWeather.metar?.flightCategory ?? "UNKNOWN";
  const destColors = categoryColors(destCat);
  const rideColors = turbColors(maxTurb);
  const convColors =
    maxConv === "NONE"
      ? { fg: C.green, bg: C.greenBg, border: "#a7f3d0" }
      : maxConv === "ISOLATED"
        ? { fg: C.blue, bg: C.blueBg, border: "#bfdbfe" }
        : maxConv === "SCATTERED"
          ? { fg: C.amber, bg: C.amberBg, border: "#fde68a" }
          : { fg: C.orange, bg: C.orangeBg, border: "#fed7aa" };

  const expectedRideHint =
    enroute.turbulence.find((t) => t.intensity === maxTurb)?.segmentLabel ??
    "Route assessment";

  return (
    <Document
      title={`${APP_NAME} ${summary.departure.icao}-${summary.destination.icao}`}
      author={APP_NAME}
    >
      {/* ── Page 1: Header, executive cards, flight summary, map ── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ marginRight: 6 }}>
                <IconPlane />
              </View>
              <Text style={styles.brand}>{APP_NAME}</Text>
            </View>
            <Text style={styles.brandTag}>Operational weather brief</Text>
          </View>
          <View style={styles.headerMeta}>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Flight</Text>
              <Text style={styles.metaValue}>
                {request.flightNumber ?? "—"}
              </Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Aircraft</Text>
              <Text style={styles.metaValue}>
                {request.aircraftRegistration ?? "—"}
              </Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Flight level</Text>
              <Text style={styles.metaValue}>
                {formatFlightLevel(summary.flightLevel)}
              </Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Generated UTC</Text>
              <Text style={styles.metaValue}>
                {formatUtc(summary.generatedAt, "yyyy-MM-dd HH:mm")}Z
              </Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Departure</Text>
              <Text style={styles.metaValue}>{summary.departure.icao}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Destination</Text>
              <Text style={styles.metaValue}>{summary.destination.icao}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Alternate</Text>
              <Text style={styles.metaValue}>
                {summary.alternate?.icao ?? "—"}
              </Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Distance</Text>
              <Text style={styles.metaValue}>
                {Math.round(summary.routeDistanceNm).toLocaleString()} NM
              </Text>
            </View>
          </View>
          <View style={styles.routeStrip}>
            <Text style={styles.routeText}>ROUTE  {briefing.route.raw}</Text>
          </View>
        </View>

        <SectionHeading title="Executive summary" />
        <View style={styles.execRow} wrap={false}>
          <ExecCard
            label="Expected ride"
            value={TURBULENCE_LABELS[maxTurb]}
            hint={expectedRideHint}
            fg={rideColors.fg}
            bg={rideColors.bg}
            border={rideColors.border}
          />
          <ExecCard
            label="Max turbulence"
            value={TURBULENCE_LABELS[maxTurb]}
            hint={
              enroute.turbulence.find((t) => t.intensity === maxTurb)
                ?.flightLevelBand ?? formatFlightLevel(summary.flightLevel)
            }
            fg={rideColors.fg}
            bg={rideColors.bg}
            border={rideColors.border}
          />
          <ExecCard
            label="Convective"
            value={CONVECTIVE_LABELS[maxConv]}
            hint={
              enroute.convective.find((c) => c.risk === maxConv)?.segmentLabel ??
              "Along route"
            }
            fg={convColors.fg}
            bg={convColors.bg}
            border={convColors.border}
          />
          <ExecCard
            label="Destination"
            value={destCat}
            hint={summary.destination.icao}
            fg={destColors.fg}
            bg={destColors.bg}
            border={destColors.border}
          />
          <ExecCard
            label="Op. risk"
            value={risk.label}
            hint={
              threat
                ? `${briefing.threats.length} threat item(s)`
                : "No elevated threats"
            }
            fg={risk.fg}
            bg={risk.bg}
            border={risk.border}
            last
          />
        </View>

        <SectionHeading title="5. Route map" />
        <View style={styles.legendRow}>
          {(
            [
              ["NONE", "Smooth"],
              ["LIGHT", "Light"],
              ["MODERATE", "Moderate"],
              ["SEVERE", "Severe"],
            ] as const
          ).map(([key, label]) => {
            const colors = turbColors(key);
            return (
              <View key={key} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendSwatch,
                    {
                      backgroundColor: colors.fg,
                      borderColor: colors.border,
                    },
                  ]}
                />
                <Text style={styles.legendText}>{label}</Text>
              </View>
            );
          })}
        </View>
        <RouteChart briefing={briefing} />

        <SectionHeading title="1. Flight summary" />
        <View style={styles.summaryGrid} wrap={false}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>City pair</Text>
            <Text style={styles.summaryValue}>
              {summary.departure.icao} - {summary.destination.icao}
            </Text>
            <Text style={styles.summarySub}>
              {summary.departure.name.split("/")[0]?.trim()}
            </Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Alternate</Text>
            <Text style={styles.summaryValue}>
              {summary.alternate?.icao ?? "—"}
            </Text>
            <Text style={styles.summarySub}>
              {summary.alternate?.name.split("/")[0]?.trim() ?? "None filed"}
            </Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Level / distance</Text>
            <Text style={styles.summaryValue}>
              {formatFlightLevel(summary.flightLevel)}
            </Text>
            <Text style={styles.summarySub}>
              {Math.round(summary.routeDistanceNm).toLocaleString()} NM filed
            </Text>
          </View>
          <View style={styles.summaryCellLast}>
            <Text style={styles.summaryLabel}>Data / threats</Text>
            <Text style={styles.summaryValue}>
              {briefing.dataMode.toUpperCase()}
            </Text>
            <Text style={styles.summarySub}>
              {briefing.threats.length} threat item(s)
            </Text>
          </View>
        </View>

        <Footer generatedAt={summary.generatedAt} />
      </Page>

      {/* ── Page 2: Airport weather cards ── */}
      <Page size="A4" style={styles.page}>
        <SectionHeading title="2. Departure weather" />
        <AirportCard
          role="Departure"
          airport={summary.departure}
          weather={briefing.departureWeather}
        />

        <SectionHeading title="3. Destination weather" />
        <AirportCard
          role="Destination"
          airport={summary.destination}
          weather={briefing.destinationWeather}
        />

        {summary.alternate && briefing.alternateWeather ? (
          <>
            <SectionHeading title="4. Alternate weather" />
            <AirportCard
              role="Alternate"
              airport={summary.alternate}
              weather={briefing.alternateWeather}
            />
          </>
        ) : null}

        <Footer generatedAt={summary.generatedAt} />
      </Page>

      {/* ── Page 3: Enroute + waypoint table + turbulence ── */}
      <Page size="A4" style={styles.page}>
        <SectionHeading title="6. Enroute weather" />
        {enroute.alongRouteNotes.map((note) => (
          <View key={note} style={styles.noteChip} wrap={false}>
            <Text style={styles.noteText}>{note}</Text>
          </View>
        ))}

        <Text
          style={{
            fontSize: 7.5,
            fontFamily: "Helvetica-Bold",
            color: C.muted,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginTop: 6,
            marginBottom: 4,
          }}
        >
          Waypoint conditions
        </Text>
        <WaypointTable briefing={briefing} />

        <Text
          style={{
            fontSize: 7.5,
            fontFamily: "Helvetica-Bold",
            color: C.muted,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginTop: 8,
            marginBottom: 4,
          }}
        >
          Winds aloft
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHead} wrap={false}>
            <Text style={[styles.th, { width: "28%" }]}>Segment</Text>
            <Text style={[styles.th, { width: "12%" }]}>FL</Text>
            <Text style={[styles.th, { width: "20%" }]}>Wind</Text>
            <Text style={[styles.th, { width: "16%" }]}>Temp</Text>
            <Text style={[styles.th, { width: "12%" }]}>Cloud</Text>
            <Text style={[styles.th, { width: "12%" }]}>Shear</Text>
          </View>
          {enroute.windsAloft.slice(0, 14).map((sample, index) => (
            <View
              key={`${sample.label}-${sample.point.latitude}-${index}`}
              style={[
                styles.tr,
                {
                  backgroundColor: index % 2 === 1 ? C.panelAlt : C.white,
                },
              ]}
              wrap={false}
            >
              <Text style={[styles.td, { width: "28%" }]}>{sample.label}</Text>
              <Text style={[styles.td, { width: "12%", fontFamily: "Courier" }]}>
                {sample.flightLevel}
              </Text>
              <Text style={[styles.td, { width: "20%", fontFamily: "Courier" }]}>
                {String(sample.windDirectionDeg).padStart(3, "0")}/
                {sample.windSpeedKt}kt
              </Text>
              <Text style={[styles.td, { width: "16%" }]}>
                {sample.temperatureC}°C
              </Text>
              <Text style={[styles.td, { width: "12%" }]}>
                {sample.cloudCoverPct !== null
                  ? `${sample.cloudCoverPct}%`
                  : "—"}
              </Text>
              <Text style={[styles.td, { width: "12%" }]}>
                {sample.shearProxyKtPer1000Ft ?? "—"}
              </Text>
            </View>
          ))}
        </View>

        <SectionHeading title="7. Turbulence briefing" />
        {enroute.turbulence.map((turb) => (
          <View key={turb.segmentLabel} style={styles.turbCard} wrap={false}>
            <View style={styles.turbTop}>
              <Text style={styles.turbSeg}>{turb.segmentLabel}</Text>
              <RideBadge intensity={turb.intensity} />
            </View>
            <Text style={{ fontSize: 8.5, color: C.ink, lineHeight: 1.3 }}>
              {shortPilotLine(turb.pilotText)}
            </Text>
            <View style={styles.turbMeta}>
              <Text style={styles.turbMetaItem}>
                FL{" "}
                <Text style={styles.turbMetaStrong}>{turb.flightLevelBand}</Text>
              </Text>
              <Text style={styles.turbMetaItem}>
                Duration{" "}
                <Text style={styles.turbMetaStrong}>
                  {turb.expectedDuration}
                </Text>
              </Text>
              <Text style={styles.turbMetaItem}>
                Cause{" "}
                <Text style={styles.turbMetaStrong}>
                  {turb.likelyCause.split("_").join(" ")}
                </Text>
              </Text>
              <Text style={styles.turbMetaItem}>
                Confidence{" "}
                <Text style={styles.turbMetaStrong}>{turb.confidence}</Text>
              </Text>
            </View>
          </View>
        ))}

        <Footer generatedAt={summary.generatedAt} />
      </Page>

      {/* ── Page 4: SIGMETs + operational summary ── */}
      <Page size="A4" style={styles.page}>
        <SectionHeading title="SIGMETs" />
        {enroute.sigmets.length === 0 ? (
          <View style={styles.noteChip}>
            <Text style={styles.noteText}>No route-corridor SIGMETs.</Text>
          </View>
        ) : (
          enroute.sigmets.map((sigmet) => (
            <View
              key={sigmet.id}
              style={[
                styles.turbCard,
                { borderLeftWidth: 3, borderLeftColor: C.amber },
              ]}
              wrap={false}
            >
              <View style={styles.turbTop}>
                <Text style={styles.turbSeg}>{sigmet.summary}</Text>
                <Text
                  style={[
                    styles.badge,
                    {
                      color: C.amber,
                      backgroundColor: C.amberBg,
                      borderColor: "#fde68a",
                    },
                  ]}
                >
                  {sigmet.hazard}
                </Text>
              </View>
              <Text style={{ fontSize: 7, color: C.muted, marginBottom: 3 }}>
                {formatUtc(sigmet.validFrom, "ddHHmm")}–
                {formatUtc(sigmet.validTo, "ddHHmm")}Z
                {sigmet.severity !== "UNKNOWN" ? ` · ${sigmet.severity}` : ""}
              </Text>
              <View style={styles.rawBlock}>
                <Text style={styles.rawLabel}>Raw SIGMET</Text>
                <Text style={styles.mono}>{truncateRaw(sigmet.raw, 280)}</Text>
              </View>
            </View>
          ))
        )}

        <SectionHeading title="8. Operational weather summary" />
        {enroute.dispatchBullets.map((bullet) => (
          <View key={bullet} style={styles.bulletRow} wrap={false}>
            <Text style={styles.bulletMark}>•</Text>
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}

        {briefing.threats.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            <Text
              style={{
                fontSize: 7.5,
                fontFamily: "Helvetica-Bold",
                color: C.muted,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Threat board
            </Text>
            {briefing.threats.map((item) => {
              const colors =
                item.severity === "CRITICAL" || item.severity === "WARNING"
                  ? { fg: C.red, bg: C.redBg, border: "#fecaca" }
                  : item.severity === "CAUTION"
                    ? { fg: C.amber, bg: C.amberBg, border: "#fde68a" }
                    : { fg: C.blue, bg: C.blueBg, border: "#bfdbfe" };
              return (
                <View
                  key={item.id}
                  style={[
                    styles.turbCard,
                    { backgroundColor: colors.bg, borderColor: colors.border },
                  ]}
                  wrap={false}
                >
                  <View style={styles.turbTop}>
                    <Text style={styles.turbSeg}>{item.title}</Text>
                    <Text
                      style={[
                        styles.badge,
                        {
                          color: colors.fg,
                          backgroundColor: C.white,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      {item.severity}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 8, color: C.inkSoft }}>
                    {item.detail}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <Footer generatedAt={summary.generatedAt} />
      </Page>
    </Document>
  );
}
