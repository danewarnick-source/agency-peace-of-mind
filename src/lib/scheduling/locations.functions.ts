import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LocationTypeZ = z.enum(["residential", "host_home", "day_site", "community"]);

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
