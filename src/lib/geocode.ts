// Shared OpenStreetMap (Nominatim) geocoder.
// Used by per-client save, Smart Import autofill, and home-pin refresh so
// EVV geofence coordinates come from the same lookup.
//
// Never invent a pin: city / town / postcode centroids AND road-only hits
// are rejected. A home pin requires house_number + road. If Nominatim
// cannot resolve that, callers keep the existing pin (Dane can drag it).

export type GeocodeQuality = "street" | "road";

export type GeocodeHit = {
  lat: number;
  lng: number;
  quality: GeocodeQuality;
};

export type NominatimHit = {
  lat: string;
  lon: string;
  class?: string;
  type?: string;
  addresstype?: string;
  address?: {
    house_number?: string;
    road?: string;
    residential?: string;
    pedestrian?: string;
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
  };
};

const LOCALITY_TYPES = new Set([
  "city",
  "town",
  "village",
  "municipality",
  "county",
  "state",
  "postcode",
  "postal_code",
  "suburb",
  "neighbourhood",
  "neighborhood",
  "hamlet",
  "isolated_dwelling",
  "administrative",
  "continent",
  "country",
]);

/** Utah-style compass letters only — do not expand St (St. George). */
const COMPASS: Record<string, string> = {
  n: "North",
  s: "South",
  e: "East",
  w: "West",
  ne: "Northeast",
  nw: "Northwest",
  se: "Southeast",
  sw: "Southwest",
};

/**
 * Expand standalone compass abbreviations so Nominatim sees a house query
 * (`7675 S 2450 W` → `7675 South 2450 West`) instead of a road named
 * "7675 South".
 */
export function expandUsAddressForNominatim(address: string): string {
  return address
    .trim()
    .split(/(\s+|,)/)
    .map((tok) => {
      if (!tok || /^\s+$/.test(tok) || tok === ",") return tok;
      const key = tok.replace(/\.$/, "").toLowerCase();
      return COMPASS[key] ?? tok;
    })
    .join("");
}

function classifyNominatimHit(hit: NominatimHit): GeocodeQuality | "locality" | null {
  const addr = hit.address ?? {};
  const type = String(hit.addresstype || hit.type || "").toLowerCase();
  const klass = String(hit.class || "").toLowerCase();

  if (addr.house_number && (addr.road || addr.residential || addr.pedestrian)) {
    return "street";
  }

  if (LOCALITY_TYPES.has(type)) return "locality";
  if (klass === "boundary" || klass === "place") return "locality";
  if (klass === "place" && LOCALITY_TYPES.has(String(hit.type || "").toLowerCase())) {
    return "locality";
  }

  if (addr.road || addr.residential || klass === "highway") return "road";
  return "locality";
}

/**
 * Pick a house-level hit only (house_number + road).
 * City centroids and road-only hits return null — do not invent a pin.
 */
export function pickStreetLevelGeocode(hits: NominatimHit[]): GeocodeHit | null {
  if (!Array.isArray(hits) || hits.length === 0) return null;
  for (const hit of hits) {
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) continue;
    const quality = classifyNominatimHit(hit);
    if (quality === "street") return { lat, lng, quality };
  }
  return null;
}

export async function geocodeAddress(
  address: string,
): Promise<GeocodeHit | null> {
  const q = expandUsAddressForNominatim(address);
  if (!q) return null;
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=us&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CareAcademyEVV/1.0 (compliance@careacademy.app)",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as NominatimHit[];
    return pickStreetLevelGeocode(json);
  } catch {
    return null;
  }
}
