import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { locationTypeForTeam } from "@/lib/scheduling/location-type";

const LocationTypeZ = z.enum(["residential", "host_home", "day_site", "community"]);

/**
 * `teams` is the source of truth for homes. Whenever a home is created or
 * edited in Homes & Teams, mirror it into `locations` (name = team_name,
 * type mapped from setting/team_type, address carried over) so the
 * scheduler's Locations panel and coverage requirements always list real
 * homes — never staff-role labels or hand-typed strays.
 */
export const syncTeamToLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; teamId: string; previousName?: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      teamId: z.string().uuid(),
      previousName: z.string().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: team, error: tErr } = await context.supabase
      .from("teams")
      .select("id, organization_id, team_name, setting, team_type, address, active")
      .eq("id", data.teamId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!team) throw new Error("Team not found in this organization");

    const desired = {
      organization_id: data.organizationId,
      name: team.team_name as string,
      type: locationTypeForTeam(team.setting as string | null, (team as { team_type?: string | null }).team_type),
      address: (team as { address?: string | null }).address ?? null,
      active: (team as { active?: boolean | null }).active ?? true,
    };

    // Match the existing locations row by current name, falling back to the
    // pre-rename name. locations has no (org, name) unique constraint, so we
    // resolve by lookup rather than upsert.
    const namesToTry = [desired.name, ...(data.previousName ? [data.previousName] : [])];
    for (const name of namesToTry) {
      const { data: existing } = await context.supabase
        .from("locations")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("name", name)
        .maybeSingle();
      if (existing) {
        const { data: row, error } = await context.supabase
          .from("locations").update(desired).eq("id", existing.id).select("*").single();
        if (error) throw error;
        return row;
      }
    }
    const { data: row, error } = await context.supabase
      .from("locations").insert(desired).select("*").single();
    if (error) throw error;
    return row;
  });

export const listLocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("locations")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("sort", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const createLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organizationId: string; name: string; type: string; address?: string; sort?: number;
  }) => z.object({
    organizationId: z.string().uuid(),
    name: z.string().min(1).max(80),
    type: LocationTypeZ,
    address: z.string().optional(),
    sort: z.number().int().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("locations")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        type: data.type,
        address: data.address ?? null,
        sort: data.sort ?? 100,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const updateLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string; name?: string; type?: string; address?: string | null; active?: boolean; sort?: number;
  }) => z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80).optional(),
    type: LocationTypeZ.optional(),
    address: z.string().nullable().optional(),
    active: z.boolean().optional(),
    sort: z.number().int().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("locations").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return row;
  });

export const listCoverageRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; locationId?: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      locationId: z.string().uuid().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("location_coverage_requirements")
      .select("*")
      .eq("organization_id", data.organizationId);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const upsertCoverageRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    organizationId: string;
    locationId: string;
    dayOfWeek: number | null;
    startTime: string;       // "HH:MM"
    endTime: string;
    requiredStaffCount: number;
    awakeRequired: boolean;
    notes?: string;
  }) => z.object({
    id: z.string().uuid().optional(),
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    dayOfWeek: z.number().int().min(0).max(6).nullable(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    requiredStaffCount: z.number().int().min(0).max(20),
    awakeRequired: z.boolean(),
    notes: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      organization_id: data.organizationId,
      location_id: data.locationId,
      day_of_week: data.dayOfWeek,
      start_time: data.startTime,
      end_time: data.endTime,
      required_staff_count: data.requiredStaffCount,
      awake_required: data.awakeRequired,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { data: r, error } = await context.supabase
        .from("location_coverage_requirements")
        .update(row).eq("id", data.id).select("*").single();
      if (error) throw error;
      return r;
    }
    const { data: r, error } = await context.supabase
      .from("location_coverage_requirements")
      .insert(row).select("*").single();
    if (error) throw error;
    return r;
  });

export const deleteCoverageRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("location_coverage_requirements").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
