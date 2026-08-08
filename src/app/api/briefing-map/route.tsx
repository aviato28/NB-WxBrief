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
/** Light CARTO tiles — readable in print PDFs (dark_all reads as a black block). */
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

  // Cap tile count; prefer basemap over radar when trimming.
  const limited = specs
    .filter((t) => t.key.startsWith("b-"))
    .slice(0, 48)
    .concat(specs.filter((t) => t.key.startsWith("r-")).slice(0, 24));

  const fetched = await Promise.all(
    limited.map(async (tile) => {
      const dataUrl = await tileToDataUrl(tile.url);
      return dataUrl
        ? { ...tile, dataUrl }
        : null;
    }),
  );
  const tiles = fetched.filter(
    (t): t is TileSpec & { dataUrl: string } => t !== null,
  );

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
          // Light chart background — visible even if every tile fails
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
              fillOpacity="0.22"
              stroke={sig.hazard === "CONVECTIVE" ? "#ea580c" : "#ca8a04"}
              strokeWidth="2"
            />
          ))}

          <path
            d={routeD}
            fill="none"
            stroke="#ffffff"
            strokeWidth="9"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={routeD}
            fill="none"
            stroke="#0b4f8a"
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
                stroke="#0b1524"
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
                fill="#b45309"
                stroke="#0b1524"
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
            backgroundColor: "rgba(255,255,255,0.88)",
            color: "#334155",
            fontSize: 18,
            padding: "10px 14px",
          }}
        >
          NB-WxBrief · route chart · weather overlays
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
