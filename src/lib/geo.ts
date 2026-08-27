// Shared geo helpers. Haversine distance, GPS-accuracy gating, and geofence
// decisions used by the punch pad. Distance math lives here so unit tests
// can cover EVV zone checks without mounting React.

const EARTH_RADIUS_FEET = 20_925_525;
const FEET_PER_MILE = 5_280;

/** Readings worse (larger) than this are too coarse for a geofence pass/fail. */
export const MAX_GPS_ACCURACY_METERS = 100;

/**
 * When a street-level geocode of the saved address is farther than this from
 * the stored home pin, treat the pin as stale (city centroid / old address).
 * Well inside the default 1000 ft EVV radius — does not widen the zone.
 */
export const HOME_PIN_MISMATCH_FEET = 250;

export type LatLng = { lat: number; lng: number };

export type GpsFix = { lat: number; lng: number; acc: number };

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

/** High-accuracy GPS only. Do not treat a hundreds-of-meters fix as a zone decision. */
export function isGpsFixConfident(fix: { acc: number } | null | undefined): boolean {
  if (!fix) return false;
  return Number.isFinite(fix.acc) && fix.acc > 0 && fix.acc <= MAX_GPS_ACCURACY_METERS;
}

/** Keep the more accurate reading (smaller accuracy radius). */
export function pickBetterGpsFix(current: GpsFix | null, next: GpsFix): GpsFix {
  if (!current) return next;
  if (!Number.isFinite(next.acc)) return current;
  if (!Number.isFinite(current.acc) || next.acc < current.acc) return next;
  return current;
}

export type GeofenceDecision =
  | { kind: "no_gps" }
  | { kind: "low_accuracy"; accuracyMeters: number }
  | { kind: "no_home_pin" }
  | { kind: "inside"; distanceFeet: number; limitFeet: number }
  | { kind: "outside"; distanceFeet: number; limitFeet: number };

/**
 * Fail-closed geofence: no live GPS → no_gps. Coarse GPS → low_accuracy
 * (not an out-of-zone verdict). Missing home pin is not a GPS failure.
 */
export function evaluateGeofence(args: {
  home: LatLng | null | undefined;
  live: LatLng | null | undefined;
  accuracyMeters: number | null | undefined;
  radiusFeet: number;
}): GeofenceDecision {
  const live = args.live;
  if (!live || isLikelyBadCoord(live)) return { kind: "no_gps" };

  const acc = args.accuracyMeters;
  if (acc == null || !isGpsFixConfident({ acc })) {
    return { kind: "low_accuracy", accuracyMeters: acc ?? Number.POSITIVE_INFINITY };
  }

  const home = args.home;
  if (!home || isLikelyBadCoord(home)) return { kind: "no_home_pin" };

  const limitFeet = Number.isFinite(args.radiusFeet) && args.radiusFeet > 0
    ? args.radiusFeet
    : 1000;
  const distanceFeet = haversineFeet(home, live);
  if (distanceFeet <= limitFeet) {
    return { kind: "inside", distanceFeet, limitFeet };
  }
  return { kind: "outside", distanceFeet, limitFeet };
}

/** True when a street-level geocode of the address does not match the stored pin. */
export function homePinMismatchesGeocode(
  stored: LatLng | null | undefined,
  geocoded: LatLng,
): boolean {
  if (!stored || isLikelyBadCoord(stored)) return true;
  return haversineFeet(stored, geocoded) > HOME_PIN_MISMATCH_FEET;
}
