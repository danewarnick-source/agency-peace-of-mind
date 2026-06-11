import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Service codes a client is currently authorized for (today within start/end window).
 * Drives the Service Code step in the strict shift-create flow.
 */
export const listClientAuthorizedCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; clientId: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      clientId: z.string().uuid(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("client_billing_codes")
      .select("id, service_code, unit_type, rate_per_unit, weekly_cap_units, monthly_max_units, service_start_date, service_end_date")
      .eq("organization_id", data.organizationId)
      .eq("client_id", data.clientId);
    if (error) throw error;
    return (rows ?? []).filter((r: { service_start_date: string | null; service_end_date: string | null }) => {
      if (r.service_start_date && r.service_start_date > today) return false;
      if (r.service_end_date && r.service_end_date < today) return false;
      return true;
    });
  });
