import { Circle, Path, Rect, Svg, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { WeatherBriefing } from "@/domain/models/briefing";
import type { TurbulenceIntensity } from "@/domain/models/weather";

const WIDTH = 540;
const HEIGHT = 300;
const PAD = 28;

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    borderColor: "#64748b",
    marginBottom: 4,
    backgroundColor: "#e8eef5",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f1f5f9",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingVertical: 4,
    paddingHorizontal: 7,
  },
  footerText: {
    fontSize: 6,
    color: "#64748b",
  },
});

function turbFill(intensity: TurbulenceIntensity): string {
  switch (intensity) {
    case "SEVERE":
      return "#b91c1c";
    case "MODERATE":
      return "#b45309";
    case "LIGHT":
      return "#1d4ed8";
    default:
      return "#047857";
  }
}

function projectFactory(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
) {
  const latSpan = Math.max(maxLat - minLat, 0.5);
  const lonSpan = Math.max(maxLon - minLon, 0.5);
  const usableW = WIDTH - PAD * 2;
  const usableH = HEIGHT - PAD * 2;
  // Keep aspect roughly geographic (lon shrinks with cos(midLat))
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);
  const dataAspect = (lonSpan * lonScale) / latSpan;
  const boxAspect = usableW / usableH;
  let drawW = usableW;
  let drawH = usableH;
  if (dataAspect > boxAspect) {
    drawH = usableW / dataAspect;
  } else {
    drawW = usableH * dataAspect;
  }
  const ox = (WIDTH - drawW) / 2;
  const oy = (HEIGHT - drawH) / 2;

  return (lat: number, lon: number): { x: number; y: number } => ({
    x: ox + ((lon - minLon) / lonSpan) * drawW,
    y: oy + ((maxLat - lat) / latSpan) * drawH,
  });
}

/**
 * Print-safe vector route map for PDF — never depends on tile capture.
 * Shows filed route, fixes, SIGMETs, and turbulence cues on a light chart.
 */
export function PdfVectorMap({
  briefing,
}: {
  readonly briefing: WeatherBriefing;
}) {
  const path = briefing.route.pathPoints;
  const lats = path.map((p) => p.latitude);
  const lons = path.map((p) => p.longitude);
  const minLat = Math.min(...lats) - 2;
  const maxLat = Math.max(...lats) + 2;
  const minLon = Math.min(...lons) - 3;
  const maxLon = Math.max(...lons) + 3;
  const project = projectFactory(minLat, maxLat, minLon, maxLon);

  const routeD = path
    .map((p, i) => {
      const { x, y } = project(p.latitude, p.longitude);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const fixes = briefing.route.fixes.filter((f) => f.coordinates);
  const sigmets = briefing.enroute.sigmets.filter(
    (s) => s.polygon && s.polygon.length >= 3,
  );

  // Subtle lat/lon grid
  const gridLines: string[] = [];
  const latStep = Math.max(5, Math.round((maxLat - minLat) / 4 / 5) * 5);
  const lonStep = Math.max(5, Math.round((maxLon - minLon) / 5 / 5) * 5);
  for (let lat = Math.ceil(minLat / latStep) * latStep; lat <= maxLat; lat += latStep) {
    const a = project(lat, minLon);
    const b = project(lat, maxLon);
    gridLines.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
  }
  for (let lon = Math.ceil(minLon / lonStep) * lonStep; lon <= maxLon; lon += lonStep) {
    const a = project(minLat, lon);
    const b = project(maxLat, lon);
    gridLines.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
  }

  const dep = briefing.summary.departure;
  const dest = briefing.summary.destination;

  return (
    <View style={styles.shell} wrap={false}>
      <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <Rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="#d9e6f2" />
        <Rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="#c5d7ea" opacity={0.35} />

        {gridLines.map((d, i) => (
          <Path
            key={`g-${i}`}
            d={d}
            stroke="#94a3b8"
            strokeWidth={0.5}
            fill="none"
            opacity={0.45}
          />
        ))}

        {sigmets.map((sig, index) => {
          const d =
            sig
              .polygon!.map((p, i) => {
                const xy = project(p.latitude, p.longitude);
                return `${i === 0 ? "M" : "L"}${xy.x.toFixed(1)} ${xy.y.toFixed(1)}`;
              })
              .join(" ") + " Z";
          const color = sig.hazard === "CONVECTIVE" ? "#ea580c" : "#ca8a04";
          return (
            <Path
              key={`sig-${index}`}
              d={d}
              fill={color}
              fillOpacity={0.18}
              stroke={color}
              strokeWidth={1.2}
            />
          );
        })}

        {/* Route halo then core */}
        <Path
          d={routeD}
          fill="none"
          stroke="#ffffff"
          strokeWidth={5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Path
          d={routeD}
          fill="none"
          stroke="#0b4f8a"
          strokeWidth={2.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {briefing.enroute.turbulence.map((turb, index) => {
          const fix = briefing.route.fixes.find((f) => f.name === turb.fromFix);
          if (!fix?.coordinates) return null;
          const xy = project(
            fix.coordinates.latitude,
            fix.coordinates.longitude,
          );
          return (
            <Circle
              key={`t-${index}`}
              cx={xy.x}
              cy={xy.y}
              r={turb.intensity === "NONE" ? 3.5 : 5.5}
              fill={turbFill(turb.intensity)}
              fillOpacity={0.85}
              stroke="#ffffff"
              strokeWidth={0.8}
            />
          );
        })}

        {fixes.map((fix) => {
          const xy = project(
            fix.coordinates!.latitude,
            fix.coordinates!.longitude,
          );
          const isEndpoint =
            fix.name === dep.icao || fix.name === dest.icao;
          return (
            <Circle
              key={`dot-${fix.name}`}
              cx={xy.x}
              cy={xy.y}
              r={isEndpoint ? 4.5 : 2.8}
              fill={isEndpoint ? "#b45309" : "#0ea5e9"}
              stroke="#0b1524"
              strokeWidth={0.6}
            />
          );
        })}

        {/* Endpoint labels only — keeps chart clean */}
        {[dep, dest].map((airport) => {
          const xy = project(
            airport.coordinates.latitude,
            airport.coordinates.longitude,
          );
          return (
            <Text
              key={`lbl-${airport.icao}`}
              x={xy.x + 7}
              y={xy.y - 6}
              style={{
                fontSize: 8,
                fontFamily: "Helvetica-Bold",
                color: "#0b1524",
              }}
            >
              {airport.icao}
            </Text>
          );
        })}

        {/* Intermediate fix labels (sparse) */}
        {fixes
          .filter(
            (f) => f.name !== dep.icao && f.name !== dest.icao,
          )
          .filter((_, i, arr) => i % Math.max(1, Math.ceil(arr.length / 6)) === 0)
          .map((fix) => {
            const xy = project(
              fix.coordinates!.latitude,
              fix.coordinates!.longitude,
            );
            return (
              <Text
                key={`fl-${fix.name}`}
                x={xy.x + 5}
                y={xy.y - 4}
                style={{ fontSize: 6, color: "#334155" }}
              >
                {fix.name}
              </Text>
            );
          })}
      </Svg>
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Filed waypoint route · SIGMET · turbulence · print-safe chart
        </Text>
        <Text style={styles.footerText}>
          {Math.round(briefing.summary.routeDistanceNm).toLocaleString()} NM ·{" "}
          {briefing.route.fixes.length} waypoints
        </Text>
      </View>
    </View>
  );
}
