"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Airport } from "@/domain/models/airport";
import type { FlightCategory } from "@/domain/models/flight-category";
import type { ParsedRoute } from "@/domain/models/route";
import type {
  AirportWeather,
  EnrouteWeather,
  WaypointCondition,
} from "@/domain/models/weather";
import { MAP_DEFAULT_ZOOM, MAP_ROUTE_WEIGHT } from "@/domain/constants/app";
import { TURBULENCE_LABELS } from "@/domain/constants/weather-styles";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

type OverlayKey =
  | "metars"
  | "radar"
  | "satellite"
  | "sigmets"
  | "turbulence"
  | "winds"
  | "jetstream"
  | "clouds"
  | "waypoints";

const OVERLAY_LABELS: Record<OverlayKey, string> = {
  metars: "METAR stations",
  radar: "Weather radar",
  satellite: "Satellite IR",
  sigmets: "SIGMETs",
  turbulence: "Turbulence",
  winds: "Winds aloft",
  jetstream: "Jet stream",
  clouds: "Cloud cover",
  waypoints: "Waypoints",
};

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

function cloudColor(pct: number): string {
  if (pct >= 75) return "#e2e8f0";
  if (pct >= 50) return "#94a3b8";
  if (pct >= 25) return "#64748b";
  return "#475569";
}

function RegisterMap(): null {
  const map = useMap();
  useEffect(() => {
    window.__NB_WXBRIEF_MAP__ = map;
    return () => {
      if (window.__NB_WXBRIEF_MAP__ === map) {
        window.__NB_WXBRIEF_MAP__ = null;
      }
    };
  }, [map]);
  return null;
}

function FitRoute({ points }: { readonly points: readonly [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds([...points]);
    map.fitBounds(bounds.pad(0.2));
  }, [map, points]);
  return null;
}

function waypointIcon(selected: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${selected ? 12 : 9}px;height:${selected ? 12 : 9}px;border-radius:2px;background:${selected ? "#f0b429" : "#4aa3ff"};border:1px solid #e7ecf4;transform:rotate(45deg)"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
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

export function RouteMap({
  departure,
  destination,
  alternate,
  route,
  enroute,
  departureWeather,
  destinationWeather,
  alternateWeather,
}: {
  readonly departure: Airport;
  readonly destination: Airport;
  readonly alternate: Airport | null;
  readonly route: ParsedRoute;
  readonly enroute: EnrouteWeather;
  readonly departureWeather: AirportWeather;
  readonly destinationWeather: AirportWeather;
  readonly alternateWeather: AirportWeather | null;
}) {
  const [overlays, setOverlays] = useState<Record<OverlayKey, boolean>>({
    metars: true,
    radar: true,
    satellite: false,
    sigmets: true,
    turbulence: true,
    winds: false,
    jetstream: true,
    clouds: false,
    waypoints: true,
  });
  const [selectedFix, setSelectedFix] = useState<string | null>(null);
  const [radarPath, setRadarPath] = useState<string | null>(null);
  const [satellitePath, setSatellitePath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((res) => res.json())
      .then((data: {
        host?: string;
        radar?: { past?: Array<{ path: string }> };
        satellite?: { infrared?: Array<{ path: string }> };
      }) => {
        if (cancelled) return;
        const host = data.host ?? "https://tilecache.rainviewer.com";
        const lastRadar = data.radar?.past?.[data.radar.past.length - 1];
        const lastSat =
          data.satellite?.infrared?.[data.satellite.infrared.length - 1];
        if (lastRadar) {
          setRadarPath(`${host}${lastRadar.path}/256/{z}/{x}/{y}/2/1_1.png`);
        }
        if (lastSat) {
          setSatellitePath(`${host}${lastSat.path}/256/{z}/{x}/{y}/0/0_0.png`);
        }
      })
      .catch(() => {
        /* overlay optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pathLatLngs = useMemo(
    () =>
      route.pathPoints.map(
        (point) => [point.latitude, point.longitude] as [number, number],
      ),
    [route.pathPoints],
  );

  const conditionByFix = useMemo(() => {
    const map = new Map<string, WaypointCondition>();
    for (const condition of enroute.waypointConditions) {
      map.set(condition.fixName, condition);
    }
    return map;
  }, [enroute.waypointConditions]);

  const jetStreamLatLngs = useMemo(
    () =>
      enroute.windsAloft
        .filter((sample) => sample.windSpeedKt >= JET_STREAM_KT)
        .map(
          (sample) =>
            [sample.point.latitude, sample.point.longitude] as [number, number],
        ),
    [enroute.windsAloft],
  );

  const metarStations = useMemo(
    () =>
      [
        {
          airport: departure,
          weather: departureWeather,
          role: "DEP" as const,
        },
        {
          airport: destination,
          weather: destinationWeather,
          role: "DEST" as const,
        },
        alternate && alternateWeather
          ? {
              airport: alternate,
              weather: alternateWeather,
              role: "ALTN" as const,
            }
          : null,
      ].filter(
        (
          station,
        ): station is {
          airport: Airport;
          weather: AirportWeather;
          role: "DEP" | "DEST" | "ALTN";
        } => station !== null,
      ),
    [
      departure,
      destination,
      alternate,
      departureWeather,
      destinationWeather,
      alternateWeather,
    ],
  );

  const selected = selectedFix
    ? conditionByFix.get(selectedFix) ?? null
    : null;

  const center: [number, number] = [
    (departure.coordinates.latitude + destination.coordinates.latitude) / 2,
    (departure.coordinates.longitude + destination.coordinates.longitude) / 2,
  ];

  function toggle(key: OverlayKey): void {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(OVERLAY_LABELS) as OverlayKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={cn(
              "rounded border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition",
              overlays[key]
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            {OVERLAY_LABELS[key]}
          </button>
        ))}
      </div>

      <div
        data-nb-route-map
        className="overflow-hidden rounded-md border border-border/80"
      >
        <MapContainer
          center={center}
          zoom={MAP_DEFAULT_ZOOM}
          scrollWheelZoom={false}
          className="h-80 w-full sm:h-[28rem]"
          attributionControl
        >
          <RegisterMap />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            crossOrigin={true}
          />
          {overlays.radar && radarPath ? (
            <TileLayer
              url={radarPath}
              opacity={0.55}
              zIndex={200}
              crossOrigin={true}
            />
          ) : null}
          {overlays.satellite && satellitePath ? (
            <TileLayer
              url={satellitePath}
              opacity={0.45}
              zIndex={190}
              crossOrigin={true}
            />
          ) : null}
          <FitRoute points={pathLatLngs} />

          {pathLatLngs.length > 1 ? (
            <Polyline
              positions={pathLatLngs}
              pathOptions={{
                color: "#4aa3ff",
                weight: MAP_ROUTE_WEIGHT,
                opacity: 0.95,
              }}
            />
          ) : null}

          {overlays.jetstream && jetStreamLatLngs.length > 1 ? (
            <Polyline
              positions={jetStreamLatLngs}
              pathOptions={{
                color: "#f472b6",
                weight: 4,
                opacity: 0.75,
                dashArray: "8 6",
              }}
            />
          ) : null}

          {overlays.metars
            ? metarStations.map((station) => (
                <CircleMarker
                  key={`metar-${station.airport.icao}`}
                  center={[
                    station.airport.coordinates.latitude,
                    station.airport.coordinates.longitude,
                  ]}
                  radius={9}
                  pathOptions={{
                    color: flightCategoryColor(
                      station.weather.metar?.flightCategory,
                    ),
                    fillColor: flightCategoryColor(
                      station.weather.metar?.flightCategory,
                    ),
                    fillOpacity: 0.55,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <strong>
                      {station.role} {station.airport.icao}
                    </strong>
                    <br />
                    {station.weather.metar?.flightCategory ?? "NO METAR"}
                    <br />
                    {station.weather.metar?.raw ?? "METAR unavailable"}
                  </Popup>
                </CircleMarker>
              ))
            : null}

          {overlays.clouds
            ? enroute.windsAloft.map((sample, index) =>
                sample.cloudCoverPct !== null ? (
                  <CircleMarker
                    key={`cloud-${sample.label}-${index}`}
                    center={[sample.point.latitude, sample.point.longitude]}
                    radius={4 + Math.round(sample.cloudCoverPct / 20)}
                    pathOptions={{
                      color: cloudColor(sample.cloudCoverPct),
                      fillColor: cloudColor(sample.cloudCoverPct),
                      fillOpacity: 0.25,
                      weight: 1,
                    }}
                  >
                    <Popup>
                      {sample.label}: cloud {sample.cloudCoverPct}%
                    </Popup>
                  </CircleMarker>
                ) : null,
              )
            : null}

          {overlays.sigmets
            ? enroute.sigmets.map((sigmet) =>
                sigmet.polygon && sigmet.polygon.length >= 3 ? (
                  <Polygon
                    key={sigmet.id}
                    positions={sigmet.polygon.map(
                      (p) => [p.latitude, p.longitude] as [number, number],
                    )}
                    pathOptions={{
                      color:
                        sigmet.hazard === "CONVECTIVE" ? "#f97316" : "#eab308",
                      weight: 1,
                      fillOpacity: 0.15,
                    }}
                  >
                    <Popup>
                      <strong>{sigmet.hazard}</strong>
                      <br />
                      {sigmet.summary}
                    </Popup>
                  </Polygon>
                ) : null,
              )
            : null}

          {overlays.turbulence
            ? enroute.turbulence.map((turb) => {
                const fix = route.fixes.find((f) => f.name === turb.fromFix);
                if (!fix?.coordinates) return null;
                return (
                  <CircleMarker
                    key={`turb-${turb.segmentLabel}`}
                    center={[
                      fix.coordinates.latitude,
                      fix.coordinates.longitude,
                    ]}
                    radius={turb.intensity === "NONE" ? 4 : 8}
                    pathOptions={{
                      color: turbColor(turb.intensity),
                      fillColor: turbColor(turb.intensity),
                      fillOpacity: 0.35,
                    }}
                  >
                    <Popup>
                      {turb.segmentLabel}: {TURBULENCE_LABELS[turb.intensity]}
                    </Popup>
                  </CircleMarker>
                );
              })
            : null}

          {overlays.winds
            ? enroute.windsAloft.map((sample, index) => (
                <CircleMarker
                  key={`wind-${sample.label}-${index}`}
                  center={[sample.point.latitude, sample.point.longitude]}
                  radius={5}
                  pathOptions={{ color: "#93c5fd", fillOpacity: 0.2 }}
                >
                  <Popup>
                    {sample.label}
                    <br />
                    {String(sample.windDirectionDeg).padStart(3, "0")}/
                    {sample.windSpeedKt}kt · {sample.temperatureC}°C
                    {sample.cloudCoverPct !== null
                      ? ` · cloud ${sample.cloudCoverPct}%`
                      : ""}
                  </Popup>
                </CircleMarker>
              ))
            : null}

          {overlays.waypoints
            ? route.fixes.map((fix) =>
                fix.coordinates ? (
                  <Marker
                    key={fix.id}
                    position={[
                      fix.coordinates.latitude,
                      fix.coordinates.longitude,
                    ]}
                    icon={waypointIcon(selectedFix === fix.name)}
                    eventHandlers={{
                      click: () => setSelectedFix(fix.name),
                    }}
                  >
                    <Popup>
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold">{fix.name}</p>
                        <p className="text-[10px] uppercase opacity-70">
                          {fix.kind}
                        </p>
                        {conditionByFix.has(fix.name) ? (
                          <>
                            <p>
                              Wind{" "}
                              {conditionByFix.get(fix.name)?.windDirectionDeg ??
                                "—"}
                              /
                              {conditionByFix.get(fix.name)?.windSpeedKt ?? "—"}
                              kt
                            </p>
                            <p>
                              Temp{" "}
                              {conditionByFix.get(fix.name)?.temperatureC ??
                                "—"}
                              °C
                            </p>
                            <p>
                              Turb{" "}
                              {TURBULENCE_LABELS[
                                conditionByFix.get(fix.name)?.turbulence ??
                                  "NONE"
                              ]}
                            </p>
                          </>
                        ) : null}
                      </div>
                    </Popup>
                  </Marker>
                ) : null,
              )
            : null}

          <Marker
            position={[
              departure.coordinates.latitude,
              departure.coordinates.longitude,
            ]}
            icon={waypointIcon(false)}
          >
            <Popup>Departure {departure.icao}</Popup>
          </Marker>
          <Marker
            position={[
              destination.coordinates.latitude,
              destination.coordinates.longitude,
            ]}
            icon={waypointIcon(false)}
          >
            <Popup>Destination {destination.icao}</Popup>
          </Marker>
          {alternate ? (
            <Marker
              position={[
                alternate.coordinates.latitude,
                alternate.coordinates.longitude,
              ]}
              icon={waypointIcon(false)}
            >
              <Popup>Alternate {alternate.icao}</Popup>
            </Marker>
          ) : null}
        </MapContainer>
      </div>

      {selected ? (
        <div className="efb-panel animate-in fade-in grid gap-2 p-3 text-sm sm:grid-cols-3">
          <div>
            <p className="efb-label">Waypoint</p>
            <p className="font-semibold">{selected.fixName}</p>
            <p className="text-xs text-muted-foreground">{selected.forecastNote}</p>
          </div>
          <div>
            <p className="efb-label">Wind / Temp / Cloud</p>
            <p>
              {selected.windDirectionDeg !== null
                ? `${String(selected.windDirectionDeg).padStart(3, "0")}/${selected.windSpeedKt}kt`
                : "—"}{" "}
              · {selected.temperatureC ?? "—"}°C ·{" "}
              {selected.cloudCoverPct !== null
                ? `${selected.cloudCoverPct}%`
                : "—"}
            </p>
          </div>
          <div>
            <p className="efb-label">Turbulence / SIGMET</p>
            <p>
              {TURBULENCE_LABELS[selected.turbulence]}
              {selected.nearbySigmetIds.length
                ? ` · ${selected.nearbySigmetIds.length} nearby SIGMET ref(s)`
                : " · no nearby SIGMET refs"}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Click a waypoint for wind, temperature, turbulence, cloud, and nearby
          SIGMET context. Route follows the filed ATC waypoint sequence.
        </p>
      )}
    </div>
  );
}
