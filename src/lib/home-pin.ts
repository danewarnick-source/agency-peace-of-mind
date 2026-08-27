// Write clients.home_latitude / home_longitude from a geocoded address.
// Never invents coordinates: a failed or city-level geocode leaves the pin.

import { geocodeAddress } from "@/lib/geocode";
import { homePinMismatchesGeocode, isLikelyBadCoord } from "@/lib/geo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export type SyncHomePinResult = {
  geocoded: boolean;
  updated: boolean;
  quality: "street" | "road" | null;
};

/**
 * Geocode `address` and, when the hit is street/road quality, write the pin.
 * `mode: "on_address_save"` always replaces a previous pin (the address changed).
 * `mode: "backfill"` only writes when there is no pin or the pin mismatches.
 */
export async function syncHomePinFromAddress(
  sb: Sb,
  args: {
    clientId: string;
    organizationId: string;
    address: string;
    mode: "on_address_save" | "backfill";
    existingLat?: number | null;
    existingLng?: number | null;
  },
): Promise<SyncHomePinResult> {
  const none: SyncHomePinResult = { geocoded: false, updated: false, quality: null };
  const address = args.address.trim();
  if (!address) return none;

  const hit = await geocodeAddress(address);
  if (!hit) return none;

  const existing = {
    lat: args.existingLat ?? null,
    lng: args.existingLng ?? null,
  };
  const shouldWrite =
    args.mode === "on_address_save" ||
    homePinMismatchesGeocode(
      isLikelyBadCoord(existing) ? null : { lat: existing.lat as number, lng: existing.lng as number },
      { lat: hit.lat, lng: hit.lng },
    );
  if (!shouldWrite) {
    return { geocoded: true, updated: false, quality: hit.quality };
  }

  const { error } = await sb
    .from("clients")
    .update({ home_latitude: hit.lat, home_longitude: hit.lng })
    .eq("id", args.clientId)
    .eq("organization_id", args.organizationId);
  if (error) throw new Error(error.message);
  return { geocoded: true, updated: true, quality: hit.quality };
}
