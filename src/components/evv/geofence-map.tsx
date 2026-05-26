import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Circle, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Custom DivIcons (no external asset files = no broken-icon bug in bundles).
const houseIcon = L.divIcon({
  className: "evv-house-pin",
  html: `<div style="background:#dc2626;color:#fff;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff;"><span style="transform:rotate(45deg);font-size:16px;">🏠</span></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const personIcon = L.divIcon({
  className: "evv-person-pin",
  html: `<div style="background:#2563eb;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.35);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const FEET_PER_METER = 3.28084;

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center); }, [center, map]);
  return null;
}

export interface GeofenceMapProps {
  homeLat: number;
  homeLng: number;
  radiusFeet: number;
  /** Caregiver live position (optional — may be null while geolocation resolves) */
  caregiver?: { lat: number; lng: number } | null;
  /** Whether the caregiver is mathematically inside the radius */
  insideZone?: boolean;
  height?: number;
}

export function GeofenceMap({
  homeLat,
  homeLng,
  radiusFeet,
  caregiver,
  insideZone = true,
  height = 250,
}: GeofenceMapProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground"
        style={{ height }}
      >
        Loading map…
      </div>
    );
  }

  const radiusMeters = radiusFeet / FEET_PER_METER;
  const color = insideZone ? "#22c55e" : "#ef4444";

  return (
    <div className="overflow-hidden rounded-lg border border-border" style={{ height }}>
      <MapContainer
        center={[homeLat, homeLng]}
        zoom={17}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle
          center={[homeLat, homeLng]}
          radius={radiusMeters}
          pathOptions={{
            color,
            fillColor: color,
            fillOpacity: 0.18,
            weight: 2,
          }}
        />
        <Marker position={[homeLat, homeLng]} icon={houseIcon} />
        {caregiver && (
          <>
            <Marker position={[caregiver.lat, caregiver.lng]} icon={personIcon} />
            <Recenter center={[caregiver.lat, caregiver.lng]} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
