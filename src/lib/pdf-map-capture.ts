import L from "leaflet";
import { toPng } from "html-to-image";
import type { WeatherBriefing } from "@/domain/models/briefing";
import type { FlightCategory } from "@/domain/models/flight-category";
import { MAP_ROUTE_WEIGHT } from "@/domain/constants/app";
import "leaflet/dist/leaflet.css";

const CAPTURE_WIDTH = 1800;
const CAPTURE_HEIGHT = 980;
const JET_STREAM_KT = 80;

function flightCategoryColor(category: FlightCategory | undefined): string {
  switch (category) {
    case "VFR":
      return "#22c55e";
    case "MVFR":
      return "#3b82f6";
    case "IFR":
      return "#ef4444";
    case "LIFR":
      return "#a855f7";
    default:
      return "#94a3b8";
  }
}

function turbColor(intensity: string): string {
  switch (intensity) {
    case "SEVERE":
      return "#ef4444";
    case "MODERATE":
      return "#f59e0b";
    case "LIGHT":
      return "#38bdf8";
    default:
      return "#34d399";
  }
}

function cloudColor(pct: number): string {
  if (pct >= 75) return "#e2e8f0";
  if (pct >= 50) return "#94a3b8";
  if (pct >= 25) return "#64748b";
  return "#475569";
}

function labeledIcon(name: string, accent: string): L.DivIcon {
  return L.divIcon({
    className: "nb-pdf-map-label",
    html: `<div style="display:flex;align-items:center;gap:4px;white-space:nowrap">
      <span style="width:9px;height:9px;background:${accent};border:1px solid #e7ecf4;transform:rotate(45deg);display:inline-block;flex-shrink:0"></span>
      <span style="font:600 11px/1.1 Helvetica,Arial,sans-serif;color:#e7ecf4;text-shadow:0 1px 2px rgba(0,0,0,.85);letter-spacing:.02em">${name}</span>
    </div>`,
    iconSize: [90, 18],
    iconAnchor: [4, 9],
  });
}

async function fetchRainViewerTiles(): Promise<{
  radar: string | null;
  satellite: string | null;
}> {
  try {
    const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
    if (!res.ok) return { radar: null, satellite: null };
    const data = (await res.json()) as {
      host?: string;
      radar?: { past?: Array<{ path: string }> };
      satellite?: { infrared?: Array<{ path: string }> };
    };
    const host = data.host ?? "https://tilecache.rainviewer.com";
    const lastRadar = data.radar?.past?.[data.radar.past.length - 1];
    const lastSat =
      data.satellite?.infrared?.[data.satellite.infrared.length - 1];
    return {
      radar: lastRadar
        ? `${host}${lastRadar.path}/256/{z}/{x}/{y}/2/1_1.png`
        : null,
      satellite: lastSat
        ? `${host}${lastSat.path}/256/{z}/{x}/{y}/0/0_0.png`
        : null,
    };
  } catch {
    return { radar: null, satellite: null };
  }
}

function waitForTiles(map: L.Map, timeoutMs = 4500): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      map.off("moveend", onMoveEnd);
      resolve();
    };
    const onMoveEnd = (): void => {
      window.setTimeout(finish, 900);
    };
    map.once("moveend", onMoveEnd);
    window.setTimeout(finish, timeoutMs);
  });
}

/**
 * Renders the same operational weather map used in the web UI into an
 * offscreen high-resolution PNG for PDF embedding. Does not alter the
 * visible website map.
 */
export async function captureBriefingMapImage(
  briefing: WeatherBriefing,
): Promise<string | null> {
  if (typeof document === "undefined") return null;

  const host = document.createElement("div");
  host.setAttribute("data-nb-pdf-map-capture", "true");
  host.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${CAPTURE_WIDTH}px`,
    `height:${CAPTURE_HEIGHT}px`,
    "z-index:-1",
    "opacity:1",
    "pointer-events:none",
    "background:#0b0e13",
  ].join(";");
  document.body.appendChild(host);

  const mapNode = document.createElement("div");
  mapNode.style.cssText = `width:${CAPTURE_WIDTH}px;height:${CAPTURE_HEIGHT}px`;
  host.appendChild(mapNode);

  const { departure, destination, alternate } = briefing.summary;
  const { route, enroute } = briefing;

  const map = L.map(mapNode, {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,
  });

  try {
    const base = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        subdomains: "abcd",
        maxZoom: 18,
        crossOrigin: true,
      },
    );
    base.addTo(map);

    const tiles = await fetchRainViewerTiles();
    if (tiles.radar) {
      L.tileLayer(tiles.radar, {
        opacity: 0.55,
        maxZoom: 12,
        crossOrigin: true,
      }).addTo(map);
    }
    if (tiles.satellite) {
      L.tileLayer(tiles.satellite, {
        opacity: 0.35,
        maxZoom: 12,
        crossOrigin: true,
      }).addTo(map);
    }

    const pathLatLngs = route.pathPoints.map(
      (p) => [p.latitude, p.longitude] as [number, number],
    );
    if (pathLatLngs.length > 1) {
      L.polyline(pathLatLngs, {
        color: "#4aa3ff",
        weight: MAP_ROUTE_WEIGHT + 1,
        opacity: 0.95,
      }).addTo(map);
    }

    const jetStream = enroute.windsAloft
      .filter((s) => s.windSpeedKt >= JET_STREAM_KT)
      .map((s) => [s.point.latitude, s.point.longitude] as [number, number]);
    if (jetStream.length > 1) {
      L.polyline(jetStream, {
        color: "#f472b6",
        weight: 4,
        opacity: 0.75,
        dashArray: "8 6",
      }).addTo(map);
    }

    for (const sigmet of enroute.sigmets) {
      if (!sigmet.polygon || sigmet.polygon.length < 3) continue;
      L.polygon(
        sigmet.polygon.map(
          (p) => [p.latitude, p.longitude] as [number, number],
        ),
        {
          color: sigmet.hazard === "CONVECTIVE" ? "#f97316" : "#eab308",
          weight: 1,
          fillOpacity: 0.15,
        },
      ).addTo(map);
    }

    for (const sample of enroute.windsAloft) {
      if (sample.cloudCoverPct === null) continue;
      L.circleMarker([sample.point.latitude, sample.point.longitude], {
        radius: 4 + Math.round(sample.cloudCoverPct / 20),
        color: cloudColor(sample.cloudCoverPct),
        fillColor: cloudColor(sample.cloudCoverPct),
        fillOpacity: 0.28,
        weight: 1,
      }).addTo(map);
    }

    for (const turb of enroute.turbulence) {
      const fix = route.fixes.find((f) => f.name === turb.fromFix);
      if (!fix?.coordinates) continue;
      L.circleMarker(
        [fix.coordinates.latitude, fix.coordinates.longitude],
        {
          radius: turb.intensity === "NONE" ? 5 : 9,
          color: turbColor(turb.intensity),
          fillColor: turbColor(turb.intensity),
          fillOpacity: 0.4,
          weight: 1,
        },
      ).addTo(map);
    }

    const stations = [
      { airport: departure, weather: briefing.departureWeather },
      { airport: destination, weather: briefing.destinationWeather },
      ...(alternate && briefing.alternateWeather
        ? [{ airport: alternate, weather: briefing.alternateWeather }]
        : []),
    ];
    for (const station of stations) {
      L.circleMarker(
        [
          station.airport.coordinates.latitude,
          station.airport.coordinates.longitude,
        ],
        {
          radius: 10,
          color: flightCategoryColor(station.weather.metar?.flightCategory),
          fillColor: flightCategoryColor(station.weather.metar?.flightCategory),
          fillOpacity: 0.6,
          weight: 2,
        },
      ).addTo(map);
    }

    for (const fix of route.fixes) {
      if (!fix.coordinates) continue;
      const isAirport =
        fix.name === departure.icao ||
        fix.name === destination.icao ||
        fix.name === alternate?.icao;
      L.marker([fix.coordinates.latitude, fix.coordinates.longitude], {
        icon: labeledIcon(fix.name, isAirport ? "#f0b429" : "#4aa3ff"),
        interactive: false,
      }).addTo(map);
    }

    if (pathLatLngs.length > 0) {
      map.fitBounds(L.latLngBounds(pathLatLngs).pad(0.18));
    } else {
      map.setView(
        [
          (departure.coordinates.latitude + destination.coordinates.latitude) /
            2,
          (departure.coordinates.longitude +
            destination.coordinates.longitude) /
            2,
        ],
        3,
      );
    }

    await waitForTiles(map);
    // Extra settle for overlay tiles / labels.
    await new Promise((r) => window.setTimeout(r, 700));

    const dataUrl = await toPng(mapNode, {
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#0b0e13",
    });

    return dataUrl;
  } catch (error) {
    console.warn("[pdf-map-capture] failed:", error);
    return null;
  } finally {
    map.remove();
    host.remove();
  }
}
