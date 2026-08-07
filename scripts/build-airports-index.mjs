#!/usr/bin/env node
/**
 * Rebuilds data/airports-icao.json from the OurAirports open CSV dump.
 * Run: node scripts/build-airports-index.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSV_URL =
  "https://davidmegginson.github.io/ourairports-data/airports.csv";

function parseLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        q = !q;
      }
    } else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

const response = await fetch(CSV_URL);
if (!response.ok) {
  throw new Error(`Failed to download OurAirports CSV: ${response.status}`);
}
const raw = await response.text();
const lines = raw.split(/\r?\n/);
const cols = parseLine(lines[0] ?? "");
const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
const types = new Set(["large_airport", "medium_airport", "small_airport"]);
const byIcao = new Map();

for (let i = 1; i < lines.length; i += 1) {
  const line = lines[i];
  if (!line) continue;
  const r = parseLine(line);
  const icao = (r[idx.icao_code] || "").trim().toUpperCase();
  const type = r[idx.type];
  if (!icao || icao.length !== 4 || !types.has(type)) continue;
  const existing = byIcao.get(icao);
  if (existing && type !== "large_airport") continue;
  byIcao.set(icao, {
    icao,
    iata: r[idx.iata_code] || null,
    name: r[idx.name],
    city: r[idx.municipality] || null,
    country: r[idx.iso_country],
    lat: Number(r[idx.latitude_deg]),
    lon: Number(r[idx.longitude_deg]),
    elevFt: r[idx.elevation_ft] ? Number(r[idx.elevation_ft]) : null,
    type,
  });
}

const list = [...byIcao.values()];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "data", "airports-icao.json");
writeFileSync(outPath, JSON.stringify(list));
console.log(`Wrote ${list.length} airports to ${outPath}`);
