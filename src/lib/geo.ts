// Shared geo helpers. Haversine distance and sanity checks for captured GPS.

const EARTH_RADIUS_FEET = 20_925_525;
const FEET_PER_MILE = 5_280;

export type LatLng = { lat: number; lng: number };

export function haversineFeet(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dPhi = toRad(b.lat - a.lat);
  const dLam = toRad(b.lng - a.lng);
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const x =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLam / 2) ** 2;
  return 2 * EARTH_RADIUS_FEET * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** True if either coordinate is missing, NaN, exactly (0,0), or out of valid range. */
export function isLikelyBadCoord(c: { lat: number | null | undefined; lng: number | null | undefined } | null | undefined): boolean {
  if (!c) return true;
  const { lat, lng } = c;
  if (lat == null || lng == null) return true;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return true; // null island
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return true;
  return false;
}

/** Format a distance in feet for human display; switches to miles past 1 mi. */
export function formatDistanceFeet(ft: number): string {
  if (!Number.isFinite(ft)) return "—";
  if (ft >= FEET_PER_MILE) {
    const mi = ft / FEET_PER_MILE;
    return `${Math.round(ft).toLocaleString()} ft (${mi.toFixed(mi >= 100 ? 0 : 1)} mi)`;
  }
  return `${Math.round(ft).toLocaleString()} ft`;
}

/** Heuristic — anything past 1,000 mi from the service address is almost certainly a bad GPS reading. */
export function isDistanceSuspicious(ft: number): boolean {
  return Number.isFinite(ft) && ft > 1_000 * FEET_PER_MILE;
}
