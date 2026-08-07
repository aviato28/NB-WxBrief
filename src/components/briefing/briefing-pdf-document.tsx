import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { WeatherBriefing } from "@/domain/models/briefing";
import { APP_NAME } from "@/domain/constants/app";
import { PDF_PAGE_MARGIN_PT } from "@/domain/constants/app";
import { formatFlightLevel, formatUtc } from "@/lib/format";

const styles = StyleSheet.create({
  page: {
    padding: PDF_PAGE_MARGIN_PT,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  title: { fontSize: 16, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10, marginBottom: 12, color: "#4b5563" },
  section: { marginTop: 10, marginBottom: 4, fontSize: 11, fontFamily: "Helvetica-Bold" },
  mono: { fontFamily: "Courier", fontSize: 8, marginBottom: 4, lineHeight: 1.4 },
  text: { marginBottom: 3, lineHeight: 1.35 },
  muted: { color: "#6b7280", marginBottom: 8 },
});

export function BriefingPdfDocument({
  briefing,
}: {
  readonly briefing: WeatherBriefing;
}) {
  const { summary, departureWeather, destinationWeather, alternateWeather } =
    briefing;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{APP_NAME} Flight Weather Brief</Text>
        <Text style={styles.subtitle}>
          {summary.departure.icao} → {summary.destination.icao}
          {summary.alternate ? ` · ALTN ${summary.alternate.icao}` : ""} ·{" "}
          {formatFlightLevel(summary.flightLevel)} ·{" "}
          {formatUtc(summary.generatedAt, "yyyy-MM-dd HH:mm")}Z · {briefing.dataMode}
        </Text>

        <Text style={styles.section}>ATC Route</Text>
        <Text style={styles.mono}>{briefing.route.raw}</Text>

        <Text style={styles.section}>Threat Summary</Text>
        {briefing.threats.length === 0 ? (
          <Text style={styles.text}>No significant threats identified.</Text>
        ) : (
          briefing.threats.map((threat) => (
            <Text key={threat.id} style={styles.text}>
              [{threat.severity}] {threat.title}: {threat.detail}
            </Text>
          ))
        )}

        <Text style={styles.section}>Departure — {summary.departure.icao}</Text>
        <Text style={styles.mono}>{departureWeather.metar?.raw ?? "METAR N/A"}</Text>
        <Text style={styles.mono}>{departureWeather.taf?.raw ?? "TAF N/A"}</Text>
        <Text style={styles.text}>{departureWeather.operationalSummary}</Text>

        <Text style={styles.section}>
          Destination — {summary.destination.icao}
        </Text>
        <Text style={styles.mono}>
          {destinationWeather.metar?.raw ?? "METAR N/A"}
        </Text>
        <Text style={styles.mono}>{destinationWeather.taf?.raw ?? "TAF N/A"}</Text>
        <Text style={styles.text}>{destinationWeather.operationalSummary}</Text>

        {alternateWeather && summary.alternate ? (
          <View>
            <Text style={styles.section}>
              Alternate — {summary.alternate.icao}
            </Text>
            <Text style={styles.mono}>
              {alternateWeather.metar?.raw ?? "METAR N/A"}
            </Text>
            <Text style={styles.mono}>
              {alternateWeather.taf?.raw ?? "TAF N/A"}
            </Text>
            <Text style={styles.text}>{alternateWeather.operationalSummary}</Text>
          </View>
        ) : null}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.section}>Enroute Notes</Text>
        {briefing.enroute.alongRouteNotes.map((note) => (
          <Text key={note} style={styles.text}>
            • {note}
          </Text>
        ))}

        <Text style={styles.section}>Winds Aloft</Text>
        {briefing.enroute.windsAloft.map((sample) => (
          <Text key={sample.label} style={styles.text}>
            {sample.label}: {sample.windDirectionDeg}/{sample.windSpeedKt}kt @
            FL{sample.flightLevel}, {sample.temperatureC}°C
          </Text>
        ))}

        <Text style={styles.section}>Turbulence</Text>
        {briefing.enroute.turbulence.map((item) => (
          <Text key={item.segmentLabel} style={styles.text}>
            {item.segmentLabel}: {item.intensity} — {item.notes}
          </Text>
        ))}

        <Text style={styles.section}>SIGMETs</Text>
        {briefing.enroute.sigmets.length === 0 ? (
          <Text style={styles.text}>None matched.</Text>
        ) : (
          briefing.enroute.sigmets.map((sigmet) => (
            <View key={sigmet.id} style={{ marginBottom: 8 }}>
              <Text style={styles.text}>{sigmet.summary}</Text>
              <Text style={styles.mono}>{sigmet.raw}</Text>
            </View>
          ))
        )}

        <Text style={styles.muted}>
          Advisory briefing only. Verify with official dispatch and ATC products.
          Sources: NOAA AWC, OurAirports, Open-Meteo.
        </Text>
      </Page>
    </Document>
  );
}
