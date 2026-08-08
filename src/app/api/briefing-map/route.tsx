import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

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

async function tileToDataUrl(url: string): Promise<string | null> {
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
    if (buf.byteLength < 64) return null;
    const ct = res.headers.get("content-type") ?? "image/png";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Densify the filed path into screen-space dots.
 * Satori mishandles CSS rotate/transformOrigin vs absolute HTML tiles, which
 * previously drew the route south of the waypoint labels — no transforms here.
 */
function densifyRoutePixels(
  path: readonly MapPoint[],
  project: (lat: number, lon: number) => { x: number; y: number },
  spacingPx = 5,
): Array<{ key: string; x: number; y: number }> {
  const dots: Array<{ key: string; x: number; y: number }> = [];
  let n = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b) continue;
    const p0 = project(a.lat, a.lon);
    const p1 = project(b.lat, b.lon);
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const steps = Math.max(1, Math.ceil(dist / spacingPx));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      dots.push({
        key: `rp-${n}`,
        x: p0.x + (p1.x - p0.x) * t,
        y: p0.y + (p1.y - p0.y) * t,
      });
      n += 1;
    }
  }
  return dots;
}

export async function POST(request: NextRequest): Promise<Response> {
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

  const lats = path.map((p) => p.lat);
  const lons = path.map((p) => p.lon);
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

  type TileSpec = {
    key: string;
    url: string;
    left: number;
    top: number;
    opacity: number;
  };

  const specs: TileSpec[] = [];
  for (let ty = tileMinY; ty <= tileMaxY; ty += 1) {
    for (let tx = tileMinX; tx <= tileMaxX; tx += 1) {
      const wrappedX = ((tx % maxIndex) + maxIndex) % maxIndex;
      if (ty < 0 || ty >= maxIndex) continue;
      const left = (tx - centerX) * 256 + WIDTH / 2;
      const top = (ty - centerY) * 256 + HEIGHT / 2;
      if (left > WIDTH || top > HEIGHT || left + 256 < 0 || top + 256 < 0) {
        continue;
      }
      specs.push({
        key: `b-${zoom}-${wrappedX}-${ty}`,
        url: `${BASEMAP}/${zoom}/${wrappedX}/${ty}.png`,
        left,
        top,
        opacity: 1,
      });
      if (body.radarTileUrl) {
        specs.push({
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

  const limited = specs
    .filter((t) => t.key.startsWith("b-"))
    .slice(0, 48)
    .concat(specs.filter((t) => t.key.startsWith("r-")).slice(0, 24));

  const fetched = await Promise.all(
    limited.map(async (tile) => {
      const dataUrl = await tileToDataUrl(tile.url);
      return dataUrl ? { ...tile, dataUrl } : null;
    }),
  );
  const tiles = fetched.filter(
    (t): t is TileSpec & { dataUrl: string } => t !== null,
  );

  const fixes = body.fixes ?? [];
  const turbulence = body.turbulence ?? [];
  const routeDots = densifyRoutePixels(path, project, 7);

  // Endpoint fixes for stronger markers
  const endpoints = new Set(
    [fixes[0]?.name, fixes[fixes.length - 1]?.name].filter(Boolean),
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          position: "relative",
          backgroundColor: "#d9e6f2",
          overflow: "hidden",
        }}
      >
        {tiles.map((tile) => (
          // next/og ImageResponse requires raw <img> for tile bitmaps
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            alt=""
            src={tile.dataUrl}
            width={256}
            height={256}
            style={{
              position: "absolute",
              left: tile.left,
              top: tile.top,
              opacity: tile.opacity,
            }}
          />
        ))}

        {/* Route — densified dots (no CSS rotate; Satori misaligned transforms) */}
        {routeDots.map((dot) => (
          <div
            key={`route-${dot.key}`}
            style={{
              position: "absolute",
              left: dot.x - 4,
              top: dot.y - 4,
              width: 8,
              height: 8,
              borderRadius: 8,
              backgroundColor: "#0b4f8a",
              border: "2px solid #ffffff",
              display: "flex",
            }}
          />
        ))}

        {/* Turbulence intensity dots (legend colors) */}
        {turbulence.map((t, index) => {
          const xy = project(t.lat, t.lon);
          const size = t.intensity === "NONE" ? 10 : t.intensity === "LIGHT" ? 14 : 18;
          return (
            <div
              key={`t-${index}`}
              style={{
                position: "absolute",
                left: xy.x - size / 2,
                top: xy.y - size / 2,
                width: size,
                height: size,
                borderRadius: size,
                backgroundColor: turbColor(t.intensity),
                border: "2px solid #0b1524",
                display: "flex",
              }}
            />
          );
        })}

        {/* Waypoint markers — cyan/amber, not turbulence colors */}
        {fixes.map((fix) => {
          const xy = project(fix.lat, fix.lon);
          const isEnd = endpoints.has(fix.name);
          const size = isEnd ? 14 : 10;
          return (
            <div
              key={`dot-${fix.name}`}
              style={{
                position: "absolute",
                left: xy.x - size / 2,
                top: xy.y - size / 2,
                width: size,
                height: size,
                borderRadius: isEnd ? 2 : size,
                backgroundColor: isEnd ? "#b45309" : "#0ea5e9",
                border: "2px solid #0b1524",
                display: "flex",
              }}
            />
          );
        })}

        {fixes.map((fix) => {
          const xy = project(fix.lat, fix.lon);
          return (
            <div
              key={`label-${fix.name}`}
              style={{
                position: "absolute",
                left: xy.x + 10,
                top: xy.y - 14,
                display: "flex",
                color: "#0b1524",
                fontSize: 18,
                fontFamily: "Helvetica",
                fontWeight: 700,
              }}
            >
              {fix.name}
            </div>
          );
        })}

        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            display: "flex",
            flexDirection: "column",
            backgroundColor: "rgba(255,255,255,0.92)",
            color: "#334155",
            fontSize: 16,
            padding: "10px 14px",
          }}
        >
          <div style={{ display: "flex" }}>
            NB-WxBrief · CARTO basemap · filed route
          </div>
          <div style={{ display: "flex", marginTop: 4, fontSize: 14, color: "#64748b" }}>
            Cyan/amber markers = waypoints · colored dots = turbulence
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
