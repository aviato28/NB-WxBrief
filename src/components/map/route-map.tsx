"use client";

import { useEffect } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { GeoPoint } from "@/domain/models/common";
import type { Airport } from "@/domain/models/airport";
import { MAP_DEFAULT_ZOOM, MAP_ROUTE_WEIGHT } from "@/domain/constants/app";
import "leaflet/dist/leaflet.css";

const markerIcon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:10px;height:10px;border-radius:9999px;background:#4aa3ff;border:2px solid #e7ecf4"></span>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

function FitRoute({ points }: { readonly points: readonly GeoPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) {
      return;
    }
    const bounds = L.latLngBounds(
      points.map((point) => [point.latitude, point.longitude] as [number, number]),
    );
    map.fitBounds(bounds.pad(0.2));
  }, [map, points]);
  return null;
}

export function RouteMap({
  departure,
  destination,
  alternate,
  routePoints,
}: {
  readonly departure: Airport;
  readonly destination: Airport;
  readonly alternate: Airport | null;
  readonly routePoints: readonly GeoPoint[];
}) {
  const center: [number, number] = [
    (departure.coordinates.latitude + destination.coordinates.latitude) / 2,
    (departure.coordinates.longitude + destination.coordinates.longitude) / 2,
  ];

  const polyline = routePoints.map(
    (point) => [point.latitude, point.longitude] as [number, number],
  );

  return (
    <div className="overflow-hidden rounded-md border border-border/80">
      <MapContainer
        center={center}
        zoom={MAP_DEFAULT_ZOOM}
        scrollWheelZoom={false}
        className="h-64 w-full sm:h-80"
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <FitRoute points={routePoints} />
        {polyline.length > 1 ? (
          <Polyline
            positions={polyline}
            pathOptions={{ color: "#4aa3ff", weight: MAP_ROUTE_WEIGHT }}
          />
        ) : null}
        <Marker
          position={[
            departure.coordinates.latitude,
            departure.coordinates.longitude,
          ]}
          icon={markerIcon}
        >
          <Popup>Departure {departure.icao}</Popup>
        </Marker>
        <Marker
          position={[
            destination.coordinates.latitude,
            destination.coordinates.longitude,
          ]}
          icon={markerIcon}
        >
          <Popup>Destination {destination.icao}</Popup>
        </Marker>
        {alternate ? (
          <Marker
            position={[
              alternate.coordinates.latitude,
              alternate.coordinates.longitude,
            ]}
            icon={markerIcon}
          >
            <Popup>Alternate {alternate.icao}</Popup>
          </Marker>
        ) : null}
      </MapContainer>
    </div>
  );
}
