// Admin home-pin corrections for EVV geofence.
// Punch pad compares live GPS to clients.home_latitude / home_longitude.
// These writes never delete EVV rows and never invent coordinates.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isGpsFixConfident, isLikelyBadCoord } from "@/lib/geo";
import { syncHomePinFromAddress } from "@/lib/home-pin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function requireAdminForClient(
  sb: Sb,
  userId: string,
  clientId: string,
): Promise<{ organizationId: string }> {
  const { data: client } = await sb
    .from("clients")
    .select("organization_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) throw new Error("Client not found");
  const { data: membership } = await sb
    .from("organization_members")
    .select("role")
    .eq("organization_id", client.organization_id)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!membership) throw new Error("Forbidden");
  const role = String((membership as { role: string }).role ?? "").toLowerCase();
  if (!["admin", "program_manager", "manager", "owner"].includes(role)) {
    throw new Error("Forbidden");
  }
  return { organizationId: client.organization_id as string };
}

const GpsPinInput = z.object({
  clientId: z.string().uuid(),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracyMeters: z.number().positive(),
});

/** Owner standing at the house sets the EVV home pin from high-accuracy GPS. */
export const saveClientHomePinFromGps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GpsPinInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) {
      throw new Error("Not signed in");
    }
    const sb = context.supabase as Sb;
    const { organizationId } = await requireAdminForClient(sb, context.userId, data.clientId);
    if (!isGpsFixConfident({ acc: data.accuracyMeters })) {
      throw new Error("GPS accuracy is too coarse to set the home pin. Wait for a better fix and retry.");
    }
    if (isLikelyBadCoord({ lat: data.latitude, lng: data.longitude })) {
      throw new Error("That GPS reading is not a valid location.");
    }
    const { error } = await sb
      .from("clients")
      .update({
        home_latitude: data.latitude,
        home_longitude: data.longitude,
      })
      .eq("id", data.clientId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    return {
      ok: true as const,
      latitude: data.latitude,
      longitude: data.longitude,
    };
  });

/** Re-geocode the address on file. No-op if Nominatim cannot resolve a street/road. */
export const refreshClientHomePinFromAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      address: z.string().min(1).max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) {
      throw new Error("Not signed in");
    }
    const sb = context.supabase as Sb;
    const { organizationId } = await requireAdminForClient(sb, context.userId, data.clientId);
    const { data: client } = await sb
      .from("clients")
      .select("physical_address, home_latitude, home_longitude")
      .eq("id", data.clientId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!client) throw new Error("Client not found");
    const address = (data.address ?? client.physical_address ?? "").trim();
    if (!address) throw new Error("No physical address on file to geocode.");

    if (data.address && data.address.trim() !== (client.physical_address ?? "").trim()) {
      const { error: addrErr } = await sb
        .from("clients")
        .update({ physical_address: data.address.trim() })
        .eq("id", data.clientId)
        .eq("organization_id", organizationId);
      if (addrErr) throw new Error(addrErr.message);
    }

    const result = await syncHomePinFromAddress(sb, {
      clientId: data.clientId,
      organizationId,
      address,
      mode: data.address ? "on_address_save" : "backfill",
      existingLat: client.home_latitude,
      existingLng: client.home_longitude,
    });
    return { ok: true as const, ...result };
  });

/**
 * Optional org backfill: re-geocode clients that have an address whose pin
 * is missing or does not match. Sequential (Nominatim 1 req/s). Does not
 * delete EVV rows. Does not write when geocode is not street/road quality.
 */
export const backfillOrgHomePinsFromAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      limit: z.number().int().min(1).max(15).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) {
      throw new Error("Not signed in");
    }
    const sb = context.supabase as Sb;
    const { data: membership } = await sb
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    if (!membership) throw new Error("Forbidden");
    const role = String((membership as { role: string }).role ?? "").toLowerCase();
    if (!["admin", "program_manager", "manager", "owner"].includes(role)) {
      throw new Error("Forbidden");
    }

    const limit = data.limit ?? 8;
    const { data: rows, error } = await sb
      .from("clients")
      .select("id, physical_address, home_latitude, home_longitude")
      .eq("organization_id", data.organizationId)
      .not("physical_address", "is", null)
      .order("last_name", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);

    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of rows ?? []) {
      const address = String(row.physical_address ?? "").trim();
      if (!address) continue;
      scanned += 1;
      try {
        const result = await syncHomePinFromAddress(sb, {
          clientId: row.id,
          organizationId: data.organizationId,
          address,
          mode: "backfill",
          existingLat: row.home_latitude,
          existingLng: row.home_longitude,
        });
        if (result.updated) updated += 1;
        else skipped += 1;
      } catch {
        skipped += 1;
      }
      // Nominatim usage policy: max 1 request per second.
      await new Promise((r) => setTimeout(r, 1100));
    }
    return { ok: true as const, scanned, updated, skipped };
  });
