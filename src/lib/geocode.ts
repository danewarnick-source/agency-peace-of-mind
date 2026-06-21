// Shared OpenStreetMap (Nominatim) geocoder.
// Originally lived inline in dashboard.clients.tsx ("Auto-geocoded on save"
// flow). Extracted so per-client save AND Smart Import autofill use the
// exact same lookup for EVV geofence coordinates.

export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CareAcademyEVV/1.0 (compliance@careacademy.app)",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(json) || !json.length) return null;
    const lat = parseFloat(json[0].lat);
    const lng = parseFloat(json[0].lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
