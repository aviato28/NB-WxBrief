# NB-WxBrief Architecture

## Purpose

Production-oriented airline weather briefing web app for tablet-first daily pilot use.

## Why this architecture

### Layered modules

| Layer | Responsibility |
| --- | --- |
| `app/` | Routes, BFF API, page composition |
| `components/` | Presentational UI only |
| `hooks/` | TanStack Query wiring |
| `services/` | Use-cases / orchestration |
| `services/providers/` | External data adapters |
| `domain/` | Typed models, Zod schemas, constants |
| `data/` | OurAirports index + mock fixtures |

UI never talks to NOAA/Open-Meteo/OurAirports directly.

### Provider abstraction

```
BriefingService
  ├─ AirportProvider (OurAirports | Mock)
  └─ WeatherProvider (AWC+Open-Meteo | Mock)
```

Swap providers in `services/providers/registry.ts` only.

### Why a BFF (`/api/briefing`)

NOAA AWC does **not** allow browser CORS. Calling AWC from the client would
fail in production and leak rate-limit budget per user IP. The BFF:

- Aggregates METAR/TAF/SIGMET/winds in one round-trip
- Keeps provider credentials/headers server-side
- Enables short-TTL caching later without UI changes

### Why not invent a METAR parser as the source of truth

AWC `format=json` already returns decoded fields (`fltCat`, clouds, wind, etc.).
We map those into domain models in `awc-mappers.ts` and still display `rawOb` /
`rawTAF` for pilot verification.

## Data sources

| Need | Source | Why | Drawbacks |
| --- | --- | --- | --- |
| METAR/TAF/SIGMET | NOAA AWC Data API | Official free worldwide products, JSON, no key | 100 req/min, no CORS, max ~400 rows |
| Airports | OurAirports CSV → `data/airports-icao.json` | Worldwide ICAO coverage, open license | ~1.6MB index; refresh via `npm run build:airports` |
| Winds aloft | Open-Meteo pressure levels | Free, global, no key | Model forecast ≠ official FD winds — labeled advisory |
| Map tiles | CARTO Dark Matter + OSM | Dark EFB-compatible basemap | Attribution required |

## Rejected shortcuts

- Hard-coded airport catalogs as source of truth
- Client-side AWC fetches
- Dumping unrelated global SIGMETs into every briefing when geometry misses
- Business logic inside React components

## Scalability

1. Keep provider interfaces stable
2. Add response caching (60–120s) on the BFF for identical route keys
3. Prefer AWC cache files for broad SIGMET polling if traffic grows
4. Refresh OurAirports index on a scheduled job
5. Move PDF generation server-side if payloads grow
