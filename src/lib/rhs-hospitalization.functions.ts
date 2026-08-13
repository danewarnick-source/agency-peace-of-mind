import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

export type RhsHospitalizationDay = {
  id: string;
  client_id: string;
  record_date: string;
  notes: string;
  created_by: string | null;
  created_at: string;
};

export const listRhsHospitalizationDays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organization_id: z.string().uuid(), client_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<RhsHospitalizationDay[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: rows, error } = await sb
      .from("rhs_hospitalization_days")
      .select("id, client_id, record_date, notes, created_by, created_at")
      .eq("organization_id", data.organization_id)
      .eq("client_id", data.client_id)
      .order("record_date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setRhsHospitalizationDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      client_id: z.string().uuid(),
      record_date: z.string().date(),
      notes: z.string().min(1, "Elaborate on the hospitalization before saving."),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organization_id, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error } = await sb.from("rhs_hospitalization_days").upsert(
      {
        organization_id: data.organization_id,
        client_id: data.client_id,
        record_date: data.record_date,
        notes: data.notes.trim(),
        created_by: userId,
      },
      { onConflict: "client_id,record_date" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRhsHospitalizationDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organization_id, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error } = await sb.from("rhs_hospitalization_days").delete().eq("id", data.id).eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
