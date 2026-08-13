import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

export type RhsEvacuationDrill = {
  id: string;
  client_id: string;
  drill_date: string;
  simulation_type: string;
  duration_minutes: number | null;
  participants: string | null;
  notes: string | null;
  created_at: string;
};

export const listRhsEvacuationDrills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organization_id: z.string().uuid(), client_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<RhsEvacuationDrill[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: rows, error } = await sb
      .from("rhs_evacuation_drills")
      .select("id, client_id, drill_date, simulation_type, duration_minutes, participants, notes, created_at")
      .eq("organization_id", data.organization_id)
      .eq("client_id", data.client_id)
      .order("drill_date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const recordRhsEvacuationDrill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      client_id: z.string().uuid(),
      drill_date: z.string().date(),
      simulation_type: z.enum(["Fire", "Earthquake", "Severe Weather", "Other"]),
      duration_minutes: z.number().min(0).nullable().optional(),
      participants: z.string().max(2000).nullable().optional(),
      notes: z.string().max(4000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organization_id, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error } = await sb.from("rhs_evacuation_drills").insert({
      organization_id: data.organization_id,
      client_id: data.client_id,
      drill_date: data.drill_date,
      simulation_type: data.simulation_type,
      duration_minutes: data.duration_minutes ?? null,
      participants: data.participants?.trim() || null,
      notes: data.notes?.trim() || null,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
