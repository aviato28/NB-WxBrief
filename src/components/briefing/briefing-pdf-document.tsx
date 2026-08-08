import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  Svg,
  Polyline as SvgPolyline,
  Circle,
} from "@react-pdf/renderer";
import type { WeatherBriefing } from "@/domain/models/briefing";
import type { AirportWeather } from "@/domain/models/weather";
import type { Airport } from "@/domain/models/airport";
import {
  APP_NAME,
  DATA_SOURCE_FOOTER,
  PDF_PAGE_MARGIN_PT,
} from "@/domain/constants/app";
import {
  formatCeiling,
  formatFlightLevel,
  formatUtc,
  formatVisibilitySm,
  formatWind,
} from "@/lib/format";

const NAVY = "#0b1f33";
const STEEL = "#1e3a5f";
const ACCENT = "#0e7490";
const AMBER = "#b45309";
const RED = "#b91c1c";
const GREEN = "#047857";
const MUTED = "#64748b";
const LINE = "#cbd5e1";

const styles = StyleSheet.create({
  page: {
    paddingTop: PDF_PAGE_MARGIN_PT + 8,
    paddingBottom: PDF_PAGE_MARGIN_PT + 18,
    paddingHorizontal: PDF_PAGE_MARGIN_PT,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  headerBar: {
    backgroundColor: NAVY,
    color: "#f8fafc",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  brand: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    marginBottom: 6,
    color: "#e2e8f0",
  },
  headerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  headerCell: {
    width: "25%",
    marginBottom: 4,
  },
  headerLabel: {
    fontSize: 7,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#f8fafc",
  },
  sectionTitle: {
    backgroundColor: STEEL,
    color: "#f8fafc",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 10,
    marginBottom: 6,
  },
  card: {
    borderWidth: 1,
    borderColor: LINE,
    marginBottom: 8,
  },
  cardHead: {
    backgroundColor: "#f1f5f9",
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardBody: {
    padding: 8,
  },
  mono: {
    fontFamily: "Courier",
    fontSize: 7.5,
    lineHeight: 1.35,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    marginBottom: 3,
  },
  label: {
    width: 70,
    color: MUTED,
    fontSize: 8,
  },
  value: {
    flex: 1,
    fontSize: 8,
  },
  badge: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bullet: {
    marginBottom: 3,
    fontSize: 8.5,
    lineHeight: 1.35,
  },
  footer: {
    position: "absolute",
    left: PDF_PAGE_MARGIN_PT,
    right: PDF_PAGE_MARGIN_PT,
    bottom: 12,
    fontSize: 7,
    color: MUTED,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  turbRow: {
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 5,
  },
});

function categoryColor(category: string | undefined): string {
  switch (category) {
    case "VFR":
      return GREEN;
    case "MVFR":
      return "#1d4ed8";
    case "IFR":
      return RED;
    case "LIFR":
      return "#a21caf";
    default:
      return MUTED;
  }
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
  return (
    <View style={styles.card} wrap={false}>
      <View style={styles.cardHead}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>
          {role} · {airport.icao} · {airport.name}
        </Text>
        <Text style={[styles.badge, { color: categoryColor(cat) }]}>{cat}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={{ fontSize: 7, color: MUTED, marginBottom: 3 }}>METAR</Text>
        <Text style={styles.mono}>{weather.metar?.raw ?? "METAR unavailable"}</Text>
        <Text style={{ fontSize: 7, color: MUTED, marginTop: 4, marginBottom: 3 }}>
          DECODED METAR
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>Wind</Text>
          <Text style={styles.value}>
            {weather.metar ? formatWind(weather.metar.wind) : "—"}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Visibility</Text>
          <Text style={styles.value}>
            {formatVisibilitySm(weather.metar?.visibilitySm ?? null)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Clouds / CIG</Text>
          <Text style={styles.value}>
            {weather.metar?.clouds.length
              ? weather.metar.clouds
                  .map((c) =>
                    c.baseFtAgl === null
                      ? c.cover
                      : `${c.cover}${String(Math.round(c.baseFtAgl / 100)).padStart(3, "0")}`,
                  )
                  .join(" ")
              : "—"}{" "}
            · {formatCeiling(weather.metar?.ceilingFtAgl ?? null)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Temp / QNH</Text>
          <Text style={styles.value}>
            {weather.metar?.temperatureC ?? "—"}°C /{" "}
            {weather.metar?.qnhHpa ?? "—"} hPa
          </Text>
        </View>
        <Text style={{ fontSize: 7, color: MUTED, marginTop: 4, marginBottom: 3 }}>
          TAF
        </Text>
        <Text style={styles.mono}>{weather.taf?.raw ?? "TAF unavailable"}</Text>
        <Text style={{ fontSize: 7, color: MUTED, marginTop: 4, marginBottom: 3 }}>
          DECODED TAF
        </Text>
        {weather.taf?.periods.slice(0, 4).map((period) => (
          <Text key={`${period.type}-${period.from}`} style={{ fontSize: 7.5, marginBottom: 2 }}>
            {period.type} {period.flightCategory}: {period.rawFragment}
          </Text>
        ))}
        <Text style={{ marginTop: 4, fontSize: 8, color: ACCENT }}>
          {weather.operationalSummary}
        </Text>
      </View>
    </View>
  );
}

function RouteChart({ briefing }: { readonly briefing: WeatherBriefing }) {
  const points = briefing.route.pathPoints;
  if (points.length < 2) {
    return <Text style={styles.bullet}>Route geometry unavailable.</Text>;
  }
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const width = 520;
  const height = 180;
  const pad = 12;
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

  return (
    <View style={{ borderWidth: 1, borderColor: LINE, marginBottom: 6 }}>
      <Svg width={width} height={height}>
        <SvgPolyline points={poly} stroke={ACCENT} strokeWidth={2} fill="none" />
        {briefing.route.fixes.map((fix) => {
          if (!fix.coordinates) return null;
          const [x, y] = project(
            fix.coordinates.latitude,
            fix.coordinates.longitude,
          );
          return <Circle key={fix.id} cx={x} cy={y} r={2.5} fill={NAVY} />;
        })}
      </Svg>
      <Text style={{ fontSize: 7, color: MUTED, padding: 4 }}>
        Filed route plot ({Math.round(briefing.route.totalDistanceNm)} NM) —
        waypoint sequence, not great-circle shortcut.
      </Text>
    </View>
  );
}

function Footer({
  generatedAt,
  page,
}: {
  readonly generatedAt: string;
  readonly page?: number;
}) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        Generated {formatUtc(generatedAt, "yyyy-MM-dd HH:mm")}Z UTC · {DATA_SOURCE_FOOTER}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Page ${page ?? pageNumber} / ${totalPages}`
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
  const { summary, request } = briefing;

  return (
    <Document
      title={`${APP_NAME} ${summary.departure.icao}-${summary.destination.icao}`}
      author={APP_NAME}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar}>
          <Text style={styles.brand}>{APP_NAME} · OPERATIONAL WEATHER BRIEF</Text>
          <View style={styles.headerGrid}>
            <View style={styles.headerCell}>
              <Text style={styles.headerLabel}>Flight</Text>
              <Text style={styles.headerValue}>
                {request.flightNumber ?? "—"}
              </Text>
            </View>
            <View style={styles.headerCell}>
              <Text style={styles.headerLabel}>Aircraft</Text>
              <Text style={styles.headerValue}>
                {request.aircraftRegistration ?? "—"}
              </Text>
            </View>
            <View style={styles.headerCell}>
              <Text style={styles.headerLabel}>Flight level</Text>
              <Text style={styles.headerValue}>
                {formatFlightLevel(summary.flightLevel)}
              </Text>
            </View>
            <View style={styles.headerCell}>
              <Text style={styles.headerLabel}>Generated UTC</Text>
              <Text style={styles.headerValue}>
                {formatUtc(summary.generatedAt, "yyyy-MM-dd HH:mm")}Z
              </Text>
            </View>
            <View style={styles.headerCell}>
              <Text style={styles.headerLabel}>Departure</Text>
              <Text style={styles.headerValue}>{summary.departure.icao}</Text>
            </View>
            <View style={styles.headerCell}>
              <Text style={styles.headerLabel}>Destination</Text>
              <Text style={styles.headerValue}>{summary.destination.icao}</Text>
            </View>
            <View style={styles.headerCell}>
              <Text style={styles.headerLabel}>Alternate</Text>
              <Text style={styles.headerValue}>
                {summary.alternate?.icao ?? "—"}
              </Text>
            </View>
            <View style={styles.headerCell}>
              <Text style={styles.headerLabel}>Distance</Text>
              <Text style={styles.headerValue}>
                {summary.routeDistanceNm.toLocaleString()} NM
              </Text>
            </View>
          </View>
          <Text style={{ marginTop: 6, fontSize: 7.5, color: "#cbd5e1" }}>
            ROUTE {briefing.route.raw}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>1. FLIGHT SUMMARY</Text>
        <Text style={styles.bullet}>
          {summary.departure.icao} ({summary.departure.name}) →{" "}
          {summary.destination.icao} ({summary.destination.name})
          {summary.alternate
            ? ` · ALTN ${summary.alternate.icao}`
            : ""}{" "}
          · {formatFlightLevel(summary.flightLevel)} ·{" "}
          {summary.routeDistanceNm.toLocaleString()} NM filed-route distance
        </Text>
        <Text style={styles.bullet}>
          Data mode: {briefing.dataMode.toUpperCase()} · Threats:{" "}
          {briefing.threats.length}
        </Text>

        <Text style={styles.sectionTitle}>2. DEPARTURE WEATHER</Text>
        <AirportCard
          role="DEP"
          airport={summary.departure}
          weather={briefing.departureWeather}
        />

        <Footer generatedAt={summary.generatedAt} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>3. DESTINATION WEATHER</Text>
        <AirportCard
          role="DEST"
          airport={summary.destination}
          weather={briefing.destinationWeather}
        />

        {summary.alternate && briefing.alternateWeather ? (
          <>
            <Text style={styles.sectionTitle}>4. ALTERNATE WEATHER</Text>
            <AirportCard
              role="ALTN"
              airport={summary.alternate}
              weather={briefing.alternateWeather}
            />
          </>
        ) : null}

        <Text style={styles.sectionTitle}>5. ROUTE MAP</Text>
        <RouteChart briefing={briefing} />
        <Text style={{ fontSize: 7.5, color: MUTED, marginBottom: 6 }}>
          Fixes:{" "}
          {briefing.route.fixes.map((fix) => fix.name).join(" → ")}
        </Text>

        <Footer generatedAt={summary.generatedAt} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>6. ENROUTE WEATHER</Text>
        {briefing.enroute.alongRouteNotes.map((note) => (
          <Text key={note} style={styles.bullet}>
            • {note}
          </Text>
        ))}
        {briefing.enroute.windsAloft.slice(0, 10).map((sample) => (
          <Text
            key={`${sample.label}-${sample.point.latitude}`}
            style={styles.bullet}
          >
            {sample.label}: {String(sample.windDirectionDeg).padStart(3, "0")}/
            {sample.windSpeedKt}kt · {sample.temperatureC}°C
            {sample.cloudCoverPct !== null
              ? ` · cloud ${sample.cloudCoverPct}%`
              : ""}
          </Text>
        ))}

        <Text style={styles.sectionTitle}>7. TURBULENCE BRIEFING</Text>
        {briefing.enroute.turbulence.map((turb) => (
          <View key={turb.segmentLabel} style={styles.turbRow} wrap={false}>
            <Text
              style={{
                fontFamily: "Helvetica-Bold",
                fontSize: 9,
                color:
                  turb.intensity === "SEVERE"
                    ? RED
                    : turb.intensity === "MODERATE"
                      ? AMBER
                      : NAVY,
              }}
            >
              {turb.segmentLabel} · {turb.intensity}
            </Text>
            <Text style={{ fontSize: 8.5, marginTop: 2 }}>{turb.pilotText}</Text>
            <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 2 }}>
              {turb.flightLevelBand} · {turb.expectedDuration} · Cause{" "}
              {turb.likelyCause.split("_").join(" ")} · Confidence{" "}
              {turb.confidence}
            </Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>SIGMETs</Text>
        {briefing.enroute.sigmets.length === 0 ? (
          <Text style={styles.bullet}>No route-corridor SIGMETs.</Text>
        ) : (
          briefing.enroute.sigmets.map((sigmet) => (
            <View key={sigmet.id} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8 }}>
                {sigmet.summary}
              </Text>
              <Text style={styles.mono}>{sigmet.raw}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>8. OPERATIONAL WEATHER SUMMARY</Text>
        {briefing.enroute.dispatchBullets.map((bullet) => (
          <Text key={bullet} style={styles.bullet}>
            • {bullet}
          </Text>
        ))}

        <Footer generatedAt={summary.generatedAt} />
      </Page>
    </Document>
  );
}
