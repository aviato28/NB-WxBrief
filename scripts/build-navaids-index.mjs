/**
 * Build a compact ident→lat/lon navaid index from OurAirports open data.
 *
 * Usage:
 *   curl -sL https://davidmegginson.github.io/ourairports-data/navaids.csv -o /tmp/navaids.csv
 *   node scripts/build-navaids-index.mjs /tmp/navaids.csv
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function parseCsvLine(line) {
  const cols = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) {
      cols.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  cols.push(cur);
  return cols;
}

function typeScore(type) {
  const t = type.toUpperCase();
  if (t.includes("VORTAC")) return 4;
  if (t.includes("VOR")) return 3;
  if (t.includes("NDB") || t.includes("TACAN")) return 2;
  return 1;
}

const input = process.argv[2] ?? "/tmp/navaids.csv";
const text = readFileSync(input, "utf8");
const lines = text.trim().split(/\r?\n/);
const header = parseCsvLine(lines[0]);
const identIdx = header.indexOf("ident");
const latIdx = header.indexOf("latitude_deg");
const lonIdx = header.indexOf("longitude_deg");
const typeIdx = header.indexOf("type");

if (identIdx < 0 || latIdx < 0 || lonIdx < 0) {
  throw new Error("Unexpected navaids.csv header");
}

const map = new Map();
for (const line of lines.slice(1)) {
  const cols = parseCsvLine(line);
  const ident = (cols[identIdx] ?? "").trim().toUpperCase();
  const lat = Number(cols[latIdx]);
  const lon = Number(cols[lonIdx]);
  if (
    !ident ||
    ident.length < 2 ||
    ident.length > 4 ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    continue;
  }
  const type = (cols[typeIdx] ?? "").toUpperCase();
  const score = typeScore(type);
  const existing = map.get(ident);
  if (!existing || score > existing.score) {
    map.set(ident, {
      lat: Number(lat.toFixed(5)),
      lon: Number(lon.toFixed(5)),
      type,
      score,
    });
  }
}

const out = {};
for (const [ident, value] of map) {
  out[ident] = { lat: value.lat, lon: value.lon, type: value.type };
}

const outPath = path.join(process.cwd(), "data", "navaids-ident.json");
writeFileSync(outPath, JSON.stringify(out));
console.log(
  `Wrote ${Object.keys(out).length} navaids → ${outPath}`,
);
