"use client";

// Draggable home pin for EVV geofence. Punch pad clock-in measures against
// this pin. Leaflet is browser-only — parent must load this after mount.

import { useEffect } from "react";
import { MapContainer, TileLayer, Circle, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

const houseIcon = L.divIcon({
  className: "evv-house-pin",
  html: `<div style="background:#0f766e;color:#fff;width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff;cursor:grab;"><span style="transform:rotate(45deg);font-size:16px;">🏠</span></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

const FEET_PER_METER = 3.28084;
const UTAH_CENTER: [number, number] = [39.32, -111.09];

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.panTo([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(t);
  }, [map]);
  return null;
}

function MapTap({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function HomePinMap({
  lat,
  lng,
  radiusFeet,
  onPick,
  height = 320,
}: {
  lat: number | null;
  lng: number | null;
  radiusFeet: number;
  onPick: (lat: number, lng: number) => void;
  height?: number;
}) {
  const hasPin = typeof lat === "number" && typeof lng === "number"
    && Number.isFinite(lat) && Number.isFinite(lng);
  const center: [number, number] = hasPin ? [lat, lng] : UTAH_CENTER;
  const zoom = hasPin ? 18 : 7;
  const radiusMeters = radiusFeet / FEET_PER_METER;

  return (
    <div
      data-testid="home-pin-map"
      className="relative overflow-hidden rounded-lg border border-border"
      style={{ height }}
    >
      <div className="pointer-events-none absolute left-2 top-2 z-[1000] max-w-[90%] rounded-md border border-teal-700/20 bg-background/95 px-2.5 py-1.5 text-xs font-semibold text-teal-900 shadow-sm dark:text-teal-100">
        {hasPin
          ? "Move the pin if this is the wrong house"
          : "Tap the map to drop a pin on the house"}
      </div>
      <MapContainer
        key={hasPin ? "pinned" : "empty"}
        center={center}
        zoom={zoom}
        scrollWheelZoom
        style={{ height: "100%", width: "100%", zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapTap onPick={onPick} />
        <InvalidateSize />
        <Recenter lat={center[0]} lng={center[1]} />
        {hasPin && (
          <>
            <Circle
              center={[lat, lng]}
              radius={radiusMeters}
              pathOptions={{
                color: "#0f766e",
                fillColor: "#14b8a6",
                fillOpacity: 0.18,
                weight: 2,
              }}
            />
            <Marker
              position={[lat, lng]}
              icon={houseIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const p = (e.target as L.Marker).getLatLng();
                  onPick(p.lat, p.lng);
                },
              }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
