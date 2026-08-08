# NB-WxBrief

Tablet-first airline weather briefing web app.

Brand mark: radar-arc **NB** monogram (`src/components/brand/`) — used in the app
header, home, favicon, and PDF masthead.

## Stack

- Next.js 15 (App Router) + TypeScript (strict)
- Tailwind CSS + shadcn/ui
- TanStack Query, React Hook Form, Zod
- Leaflet route map, React PDF export

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Business logic lives in `src/services`. UI never calls weather providers directly.
Live NOAA AWC calls run through the `/api/briefing` BFF (AWC blocks browser CORS).

## Data sources

| Product | Source |
| --- | --- |
| METAR / TAF / SIGMET | [NOAA Aviation Weather Center](https://aviationweather.gov/data/api/) |
| Airports | [OurAirports](https://ourairports.com/data/) open CSV (`data/airports-icao.json`) |
| Winds aloft (advisory) | [Open-Meteo](https://open-meteo.com/) pressure-level forecast |

Set `DATA_MODE=mock` to use fixture providers offline.

## Develop

```bash
npm install
npm run dev
```

```bash
npm run lint
npm run typecheck
npm run build
```

Rebuild the airport index from OurAirports:

```bash
npm run build:airports
```

## User flow

1. Enter departure / destination / FL / ATC route / optional alternate
2. Generate Flight Brief
3. Review terminal weather, threats, enroute products, map
4. Export PDF
