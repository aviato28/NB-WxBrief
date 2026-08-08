import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

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
      return "#38bdf8";
    default:
      return "#34d399";
  }
}

function polyToPath(
  points: readonly MapPoint[],
  project: (lat: number, lon: number) => { x: number; y: number },
): string {
  return points
    .map((p, i) => {
      const xy = project(p.lat, p.lon);
      return `${i === 0 ? "M" : "L"}${xy.x.toFixed(1)} ${xy.y.toFixed(1)}`;
    })
    .concat(["Z"])
    .join(" ");
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
  for (let z = 8; z >= 2; z -= 1) {
    const w = Math.abs(lon2x(maxLon, z) - lon2x(minLon, z)) * 256;
    const h = Math.abs(lat2y(minLat, z) - lat2y(maxLat, z)) * 256;
    if (w < WIDTH - 96 && h < HEIGHT - 96) {
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

  const tiles: Array<{
    key: string;
    url: string;
    left: number;
    top: number;
    opacity: number;
  }> = [];

  for (let ty = tileMinY; ty <= tileMaxY; ty += 1) {
    for (let tx = tileMinX; tx <= tileMaxX; tx += 1) {
      const wrappedX = ((tx % maxIndex) + maxIndex) % maxIndex;
      if (ty < 0 || ty >= maxIndex) continue;
      const left = (tx - centerX) * 256 + WIDTH / 2;
      const top = (ty - centerY) * 256 + HEIGHT / 2;
      if (left > WIDTH || top > HEIGHT || left + 256 < 0 || top + 256 < 0) {
        continue;
      }
      tiles.push({
        key: `b-${zoom}-${wrappedX}-${ty}`,
        url: `https://a.basemaps.cartocdn.com/dark_all/${zoom}/${wrappedX}/${ty}.png`,
        left,
        top,
        opacity: 1,
      });
      if (body.radarTileUrl) {
        tiles.push({
          key: `r-${zoom}-${wrappedX}-${ty}`,
          url: body.radarTileUrl
            .replace("{z}", String(zoom))
            .replace("{x}", String(wrappedX))
            .replace("{y}", String(ty)),
          left,
          top,
          opacity: 0.55,
        });
      }
    }
  }

  const limitedTiles = tiles.slice(0, 100);
  const routeD = path
    .map((p, i) => {
      const xy = project(p.lat, p.lon);
      return `${i === 0 ? "M" : "L"}${xy.x.toFixed(1)} ${xy.y.toFixed(1)}`;
    })
    .join(" ");

  const fixes = body.fixes ?? [];
  const sigmets = body.sigmets ?? [];
  const turbulence = body.turbulence ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          position: "relative",
          backgroundColor: "#0b0e13",
          overflow: "hidden",
        }}
      >
        {limitedTiles.map((tile) => (
          // next/og ImageResponse requires raw <img> for remote tiles
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            alt=""
            src={tile.url}
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

        <svg
          width={String(WIDTH)}
          height={String(HEIGHT)}
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          {sigmets.map((sig, index) => (
            <path
              key={`sig-${index}`}
              d={polyToPath(sig.points, project)}
              fill={sig.hazard === "CONVECTIVE" ? "#f97316" : "#eab308"}
              fillOpacity="0.2"
              stroke={sig.hazard === "CONVECTIVE" ? "#f97316" : "#eab308"}
              strokeWidth="2"
            />
          ))}

          <path
            d={routeD}
            fill="none"
            stroke="#4aa3ff"
            strokeWidth="5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {turbulence.map((t, index) => {
            const xy = project(t.lat, t.lon);
            return (
              <circle
                key={`t-${index}`}
                cx={xy.x}
                cy={xy.y}
                r={t.intensity === "NONE" ? 5 : 9}
                fill={turbColor(t.intensity)}
                stroke="#e7ecf4"
                strokeWidth="1"
              />
            );
          })}

          {fixes.map((fix) => {
            const xy = project(fix.lat, fix.lon);
            return (
              <circle
                key={`dot-${fix.name}`}
                cx={xy.x}
                cy={xy.y}
                r={6}
                fill="#f0b429"
                stroke="#e7ecf4"
                strokeWidth="1"
              />
            );
          })}
        </svg>

        {fixes.map((fix) => {
          const xy = project(fix.lat, fix.lon);
          return (
            <div
              key={`label-${fix.name}`}
              style={{
                position: "absolute",
                left: xy.x + 10,
                top: xy.y - 12,
                display: "flex",
                color: "#f8fafc",
                fontSize: 18,
                fontFamily: "Helvetica",
                fontWeight: 700,
                textShadow: "0 1px 2px rgba(0,0,0,0.9)",
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
            backgroundColor: "rgba(11,14,19,0.8)",
            color: "#cbd5e1",
            fontSize: 20,
            padding: "10px 14px",
          }}
        >
          NB-WxBrief · CARTO basemap · filed route · weather overlays
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
