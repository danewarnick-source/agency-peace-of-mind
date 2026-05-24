import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type LiveMapProps = {
  home: { lat: number; lng: number } | null;
  staff: { lat: number; lng: number } | null;
  height?: number;
};

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const homeIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const staffIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#ef4444;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }, [map, points]);

  return null;
}

const QUARTER_MILE_METERS = 402.336;

export function LiveMapClient({ home, staff, height = 320 }: LiveMapProps) {
  const points: [number, number][] = [];
  if (home) points.push([home.lat, home.lng]);
  if (staff) points.push([staff.lat, staff.lng]);
  const center: [number, number] = points[0] ?? [39.5, -111.5];

  return (
    <div className="overflow-hidden rounded-xl border border-border" style={{ height }}>
      <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {home && (
          <>
            <Marker position={[home.lat, home.lng]} icon={homeIcon} />
            <Circle
              center={[home.lat, home.lng]}
              radius={QUARTER_MILE_METERS}
              pathOptions={{ color: "#3b82f6", weight: 1.5, fillColor: "#3b82f6", fillOpacity: 0.12 }}
            />
          </>
        )}
        {staff && <Marker position={[staff.lat, staff.lng]} icon={staffIcon} />}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}