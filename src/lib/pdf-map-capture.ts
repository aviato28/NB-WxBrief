import L from "leaflet";
import { toPng } from "html-to-image";
import type { WeatherBriefing } from "@/domain/models/briefing";
import type { FlightCategory } from "@/domain/models/flight-category";
import { MAP_ROUTE_WEIGHT } from "@/domain/constants/app";
import "leaflet/dist/leaflet.css";

const CAPTURE_WIDTH = 1600;
const CAPTURE_HEIGHT = 900;
const JET_STREAM_KT = 80;

declare global {
  interface Window {
    __NB_WXBRIEF_MAP__?: L.Map | null;
  }
}

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
      <span style="font:600 12px/1.1 Helvetica,Arial,sans-serif;color:#e7ecf4;text-shadow:0 1px 2px rgba(0,0,0,.9)">${name}</span>
    </div>`,
    iconSize: [100, 18],
    iconAnchor: [4, 9],
  });
}

/**
 * Reject near-black / empty captures that previously produced a solid black
 * PDF map block (dark basemap + failed/untainted Leaflet tiles).
 */
async function isUsableMapImage(dataUrl: string): Promise<boolean> {
  if (!dataUrl.startsWith("data:image/")) return false;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.min(96, img.naturalWidth || 96);
        const h = Math.min(54, img.naturalHeight || 54);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(false);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        let lit = 0;
        let samples = 0;
        let distinct = 0;
        const buckets = new Uint8Array(16);
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          const a = data[i + 3] ?? 0;
          if (a < 8) continue;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > 28) lit += 1;
          buckets[Math.min(15, Math.floor(lum / 16))]! += 1;
          samples += 1;
        }
        for (let i = 0; i < buckets.length; i += 1) {
          if ((buckets[i] ?? 0) > 0) distinct += 1;
        }
        // Need some non-near-black pixels and a bit of tonal variety
        resolve(samples > 0 && lit / samples > 0.04 && distinct >= 3);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}

async function fetchRainViewerTiles(): Promise<{
  radar: string | null;
  satellite: string | null;
}> {
  try {
    const res = await fetch(
      "https://api.rainviewer.com/public/weather-maps.json",
    );
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

async function captureElement(node: HTMLElement): Promise<string | null> {
  try {
    return await toPng(node, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#0b0e13",
      filter: (el) => {
        if (!(el instanceof HTMLElement)) return true;
        return !el.classList.contains("leaflet-control-container");
      },
    });
  } catch (error) {
    console.warn("[pdf-map-capture] element capture failed:", error);
    return null;
  }
}

async function captureVisibleMap(): Promise<string | null> {
  const host = document.querySelector<HTMLElement>("[data-nb-route-map]");
  const container =
    host?.querySelector<HTMLElement>(".leaflet-container") ?? null;
  if (!container) return null;

  const map = window.__NB_WXBRIEF_MAP__;
  if (map) {
    map.invalidateSize();
    await new Promise((r) => window.setTimeout(r, 600));
  }

  const png = await captureElement(container);
  if (!png) return null;
  if (!(await isUsableMapImage(png))) {
    console.warn("[pdf-map-capture] visible map rejected (blank/dark)");
    return null;
  }
  return png;
}

async function captureViaApi(
  briefing: WeatherBriefing,
  radarTileUrl: string | null,
): Promise<string | null> {
  try {
    const path = briefing.route.pathPoints.map((p) => ({
      lat: p.latitude,
      lon: p.longitude,
    }));
    const fixes = briefing.route.fixes
      .filter((f) => f.coordinates)
      .map((f) => ({
        name: f.name,
        lat: f.coordinates!.latitude,
        lon: f.coordinates!.longitude,
      }));
    const sigmets = briefing.enroute.sigmets
      .filter((s) => s.polygon && s.polygon.length >= 3)
      .map((s) => ({
        hazard: s.hazard,
        points: s.polygon!.map((p) => ({ lat: p.latitude, lon: p.longitude })),
      }));
    const turbulence = briefing.enroute.turbulence
      .filter((t) => t.altitudeBand === "cruise")
      .map((t) => {
        const from = briefing.route.fixes.find((f) => f.name === t.fromFix);
        const to = briefing.route.fixes.find((f) => f.name === t.toFix);
        if (!from?.coordinates || !to?.coordinates) return null;
        // Place turb sample mid-leg so it does not collide with waypoint markers.
        return {
          lat:
            (from.coordinates.latitude + to.coordinates.latitude) / 2,
          lon:
            (from.coordinates.longitude + to.coordinates.longitude) / 2,
          intensity: t.intensity,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const res = await fetch("/api/briefing-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        fixes,
        sigmets,
        turbulence,
        radarTileUrl,
      }),
    });
    if (!res.ok) {
      console.warn("[pdf-map-capture] API map failed:", res.status);
      return null;
    }
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    if (!(await isUsableMapImage(dataUrl))) {
      console.warn("[pdf-map-capture] API map rejected (blank)");
      return null;
    }
    return dataUrl;
  } catch (error) {
    console.warn("[pdf-map-capture] API map error:", error);
    return null;
  }
}

async function captureOffscreen(
  briefing: WeatherBriefing,
  radar: string | null,
  satellite: string | null,
): Promise<string | null> {
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    "left:-12000px",
    "top:0",
    `width:${CAPTURE_WIDTH}px`,
    `height:${CAPTURE_HEIGHT}px`,
    "z-index:-1",
    "background:#d9e6f2",
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
    // Light basemap for print readability
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { subdomains: "abcd", maxZoom: 18, crossOrigin: true },
    ).addTo(map);

    if (radar) {
      L.tileLayer(radar, { opacity: 0.45, maxZoom: 12, crossOrigin: true }).addTo(
        map,
      );
    }
    if (satellite) {
      L.tileLayer(satellite, {
        opacity: 0.3,
        maxZoom: 12,
        crossOrigin: true,
      }).addTo(map);
    }

    const pathLatLngs = route.pathPoints.map(
      (p) => [p.latitude, p.longitude] as [number, number],
    );
    if (pathLatLngs.length > 1) {
      L.polyline(pathLatLngs, {
        color: "#ffffff",
        weight: MAP_ROUTE_WEIGHT + 4,
        opacity: 0.95,
      }).addTo(map);
      L.polyline(pathLatLngs, {
        color: "#0b4f8a",
        weight: MAP_ROUTE_WEIGHT + 1,
        opacity: 0.95,
      }).addTo(map);
    }

    const jet = enroute.windsAloft
      .filter((s) => s.windSpeedKt >= JET_STREAM_KT)
      .map((s) => [s.point.latitude, s.point.longitude] as [number, number]);
    if (jet.length > 1) {
      L.polyline(jet, {
        color: "#db2777",
        weight: 4,
        opacity: 0.7,
        dashArray: "8 6",
      }).addTo(map);
    }

    for (const sigmet of enroute.sigmets) {
      if (!sigmet.polygon || sigmet.polygon.length < 3) continue;
      L.polygon(
        sigmet.polygon.map((p) => [p.latitude, p.longitude] as [number, number]),
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
      L.circleMarker([fix.coordinates.latitude, fix.coordinates.longitude], {
        radius: turb.intensity === "NONE" ? 5 : 9,
        color: turbColor(turb.intensity),
        fillColor: turbColor(turb.intensity),
        fillOpacity: 0.4,
        weight: 1,
      }).addTo(map);
    }

    for (const station of [
      { airport: departure, weather: briefing.departureWeather },
      { airport: destination, weather: briefing.destinationWeather },
      ...(alternate && briefing.alternateWeather
        ? [{ airport: alternate, weather: briefing.alternateWeather }]
        : []),
    ]) {
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
    }

    await new Promise<void>((resolve) => {
      map.once("moveend", () => window.setTimeout(() => resolve(), 1200));
      window.setTimeout(() => resolve(), 4000);
    });
    await new Promise((r) => window.setTimeout(r, 1000));

    const png = await captureElement(mapNode);
    if (!png) return null;
    if (!(await isUsableMapImage(png))) {
      console.warn("[pdf-map-capture] offscreen rejected (blank/dark)");
      return null;
    }
    return png;
  } catch (error) {
    console.warn("[pdf-map-capture] offscreen failed:", error);
    return null;
  } finally {
    map.remove();
    host.remove();
  }
}

/**
 * Produce a high-resolution map image for PDF embedding.
 * Preference: server tile mosaic (print-safe light basemap) → offscreen → visible.
 * Blank/near-black captures are rejected so the PDF can fall back to vector chart.
 */
export async function captureBriefingMapImage(
  briefing: WeatherBriefing,
): Promise<string | null> {
  if (typeof document === "undefined") return null;

  const tiles = await fetchRainViewerTiles();

  const api = await captureViaApi(briefing, tiles.radar);
  if (api) return api;

  const offscreen = await captureOffscreen(briefing, tiles.radar, tiles.satellite);
  if (offscreen) return offscreen;

  const visible = await captureVisibleMap();
  if (visible) return visible;

  return null;
}
