import "./map-fontconfig";

import { join } from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { MAP_FONT_DIR, MAP_FONT_FAMILY } from "./map-fontconfig";

export const runtime = "nodejs";

interface MapPoint {
  readonly lat: number;
  readonly lon: number;
}

interface MapFix {
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

interface SigmetPoly {
  readonly hazard: string;
  readonly points: readonly MapPoint[];
}

interface TurbDot {
  readonly lat: number;
  readonly lon: number;
  readonly intensity: string;
}

interface MapRequestBody {
  readonly path: readonly MapPoint[];
  readonly fixes: readonly MapFix[];
  readonly sigmets?: readonly SigmetPoly[];
  readonly turbulence?: readonly TurbDot[];
  readonly radarTileUrl?: string | null;
}

const WIDTH = 1600;
const HEIGHT = 900;
/** Light CARTO tiles — readable in print PDFs. */
const BASEMAP = "https://a.basemaps.cartocdn.com/light_all";

function lon2x(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}

function lat2y(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    2 ** zoom
  );
}

function turbColor(intensity: string): string {
  switch (intensity) {
    case "SEVERE":
      return "#ef4444";
    case "MODERATE":
      return "#f59e0b";
    case "LIGHT":
      return "#2563eb";
    default:
      return "#059669";
  }
}

/** Keep SVG text ASCII-safe for librsvg; escape XML specials. */
function esc(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchTileBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "NB-WxBrief/1.0 (aviation weather briefing)",
        Accept: "image/png,image/*",
      },
      signal: AbortSignal.timeout(5000),
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength < 64 ? null : buf;
  } catch {
    return null;
  }
}

/**
 * Build the PDF route chart with sharp — tiles + a single SVG overlay.
 * Waypoint names use bundled DejaVu via fontconfig (no Helvetica tofu on Vercel).
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (
    !existsSync(join(MAP_FONT_DIR, "DejaVuSans.ttf")) ||
    !existsSync(join(MAP_FONT_DIR, "DejaVuSans-Bold.ttf"))
  ) {
    return new Response("Map fonts missing", { status: 500 });
  }

  let body: MapRequestBody;
  try {
    body = (await request.json()) as MapRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const path = body.path ?? [];
  if (path.length < 2) {
    return new Response("path requires >= 2 points", { status: 400 });
  }

  const fixes = body.fixes ?? [];
  const turbulence = body.turbulence ?? [];
  const sigmets = body.sigmets ?? [];

  const allPoints: MapPoint[] = [
    ...path,
    ...fixes.map((f) => ({ lat: f.lat, lon: f.lon })),
  ];
  const lats = allPoints.map((p) => p.lat);
  const lons = allPoints.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  let zoom = 3;
  for (let z = 7; z >= 2; z -= 1) {
    const w = Math.abs(lon2x(maxLon, z) - lon2x(minLon, z)) * 256;
    const h = Math.abs(lat2y(minLat, z) - lat2y(maxLat, z)) * 256;
    if (w < WIDTH - 120 && h < HEIGHT - 120) {
      zoom = z;
      break;
    }
  }

  const midLon = (minLon + maxLon) / 2;
  const midLat = (minLat + maxLat) / 2;
  const centerX = lon2x(midLon, zoom);
  const centerY = lat2y(midLat, zoom);

  const project = (lat: number, lon: number): { x: number; y: number } => ({
    x: (lon2x(lon, zoom) - centerX) * 256 + WIDTH / 2,
    y: (lat2y(lat, zoom) - centerY) * 256 + HEIGHT / 2,
  });

  const maxIndex = 2 ** zoom;
  const tileMinX = Math.floor(centerX - WIDTH / 2 / 256) - 1;
  const tileMaxX = Math.ceil(centerX + WIDTH / 2 / 256) + 1;
  const tileMinY = Math.floor(centerY - HEIGHT / 2 / 256) - 1;
  const tileMaxY = Math.ceil(centerY + HEIGHT / 2 / 256) + 1;

  type TileJob = {
    key: string;
    url: string;
    left: number;
    top: number;
    opacity: number;
  };

  const jobs: TileJob[] = [];
  for (let ty = tileMinY; ty <= tileMaxY; ty += 1) {
    for (let tx = tileMinX; tx <= tileMaxX; tx += 1) {
      const wrappedX = ((tx % maxIndex) + maxIndex) % maxIndex;
      if (ty < 0 || ty >= maxIndex) continue;
      const left = (tx - centerX) * 256 + WIDTH / 2;
      const top = (ty - centerY) * 256 + HEIGHT / 2;
      if (left > WIDTH || top > HEIGHT || left + 256 < 0 || top + 256 < 0) {
        continue;
      }
      jobs.push({
        key: `b-${zoom}-${wrappedX}-${ty}`,
        url: `${BASEMAP}/${zoom}/${wrappedX}/${ty}.png`,
        left,
        top,
        opacity: 1,
      });
      if (body.radarTileUrl) {
        jobs.push({
          key: `r-${zoom}-${wrappedX}-${ty}`,
          url: body.radarTileUrl
            .replace("{z}", String(zoom))
            .replace("{x}", String(wrappedX))
            .replace("{y}", String(ty)),
          left,
          top,
          opacity: 0.45,
        });
      }
    }
  }

  const limited = jobs
    .filter((t) => t.key.startsWith("b-"))
    .slice(0, 48)
    .concat(jobs.filter((t) => t.key.startsWith("r-")).slice(0, 24));

  const fetched = await Promise.all(
    limited.map(async (tile) => {
      const buf = await fetchTileBuffer(tile.url);
      return buf ? { ...tile, buf } : null;
    }),
  );
  const tiles = fetched.filter(
    (t): t is TileJob & { buf: Buffer } => t !== null,
  );

  const base = sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      background: { r: 217, g: 230, b: 242 },
    },
  });

  const composites: sharp.OverlayOptions[] = [];
  for (const tile of tiles) {
    const left = Math.round(tile.left);
    const top = Math.round(tile.top);
    if (tile.opacity < 1) {
      const faded = await sharp(tile.buf)
        .ensureAlpha(tile.opacity)
        .png()
        .toBuffer();
      composites.push({ input: faded, left, top });
    } else {
      composites.push({ input: tile.buf, left, top });
    }
  }

  const projectedPath = path.map((p) => project(p.lat, p.lon));
  const routeD = projectedPath
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const endpoints = new Set(
    [fixes[0]?.name, fixes[fixes.length - 1]?.name].filter(Boolean),
  );

  const sigmetPaths = sigmets
    .filter((s) => s.points.length >= 3)
    .map((s) => {
      const d =
        s.points
          .map((p, i) => {
            const xy = project(p.lat, p.lon);
            return `${i === 0 ? "M" : "L"}${xy.x.toFixed(1)} ${xy.y.toFixed(1)}`;
          })
          .join(" ") + " Z";
      const color = s.hazard === "CONVECTIVE" ? "#ea580c" : "#ca8a04";
      return `<path d="${d}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1.5"/>`;
    })
    .join("");

  const turbCircles = turbulence
    .map((t) => {
      const xy = project(t.lat, t.lon);
      const r = t.intensity === "NONE" ? 5 : t.intensity === "LIGHT" ? 7 : 9;
      return `<circle cx="${xy.x.toFixed(1)}" cy="${xy.y.toFixed(1)}" r="${r}" fill="${turbColor(t.intensity)}" stroke="#0b1524" stroke-width="1.5"/>`;
    })
    .join("");

  // Place labels with light collision avoidance so names stay readable.
  const placedLabels: Array<{ x: number; y: number }> = [];
  const fixMarks = fixes
    .map((fix, index) => {
      const xy = project(fix.lat, fix.lon);
      const isEnd = endpoints.has(fix.name);
      const r = isEnd ? 7 : 5;
      const fill = isEnd ? "#b45309" : "#0ea5e9";
      const shape = isEnd
        ? `<rect x="${(xy.x - r).toFixed(1)}" y="${(xy.y - r).toFixed(1)}" width="${r * 2}" height="${r * 2}" fill="${fill}" stroke="#0b1524" stroke-width="1.5"/>`
        : `<circle cx="${xy.x.toFixed(1)}" cy="${xy.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="#0b1524" stroke-width="1.5"/>`;

      // Alternate label side; nudge if overlapping a prior label.
      let labelX = xy.x + 10;
      let labelY = index % 2 === 0 ? xy.y - 10 : xy.y + 18;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const clash = placedLabels.some(
          (p) => Math.hypot(p.x - labelX, p.y - labelY) < 28,
        );
        if (!clash) break;
        labelY += index % 2 === 0 ? -14 : 14;
        labelX += 6;
      }
      placedLabels.push({ x: labelX, y: labelY });

      // Haloed text so names read on busy basemap tiles.
      const label = `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" fill="#0b1524" stroke="#ffffff" stroke-width="4" paint-order="stroke" stroke-linejoin="round" font-size="17" font-family="${MAP_FONT_FAMILY}" font-weight="700">${esc(fix.name)}</text>`;
      return `${shape}${label}`;
    })
    .join("");

  const overlaySvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${sigmetPaths}
  <path d="${routeD}" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${routeD}" fill="none" stroke="#0b4f8a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  ${turbCircles}
  ${fixMarks}
  <rect x="16" y="${HEIGHT - 70}" width="560" height="54" rx="4" fill="white" fill-opacity="0.94"/>
  <text x="28" y="${HEIGHT - 42}" fill="#334155" font-size="15" font-family="${MAP_FONT_FAMILY}">NB-WxBrief - CARTO basemap - filed route</text>
  <text x="28" y="${HEIGHT - 22}" fill="#64748b" font-size="13" font-family="${MAP_FONT_FAMILY}">Cyan/amber markers = waypoints with names - colored dots = turbulence</text>
</svg>`);

  composites.push({ input: overlaySvg, left: 0, top: 0 });

  const png = await base.composite(composites).png().toBuffer();

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
