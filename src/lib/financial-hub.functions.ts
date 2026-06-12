import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { isDailyServiceCode } from "@/lib/service-billing";

const OrgInput = z.object({ organizationId: z.string().uuid() });

/**
 * Billing snapshot for the Finances hub card.
 * Reuses the same tables / logic as the NECTAR Billing Readiness bar and
 * the Billing Overview authorizations table, gated with the same admin
 * membership check the Billing section uses. No new data paths.
 */
export const getBillingSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const periodStartISO = periodStart.toISOString();
    const periodStartDate = periodStart.toISOString().slice(0, 10);
    const periodEndDate = periodEnd.toISOString().slice(0, 10);

    const [clientsRes, tsRes, dlRes, attRes, codesRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id")
        .eq("organization_id", data.organizationId),
      supabase
        .from("evv_timesheets")
        .select("client_id, service_type_code")
        .eq("organization_id", data.organizationId)
        .gte("clock_in_timestamp", periodStartISO)
        .not("clock_out_timestamp", "is", null),
      supabase
        .from("hhs_daily_records_v")
        .select("client_id, record_date, billable")
        .eq("organization_id", data.organizationId)
        .eq("billable", true)
        .gte("record_date", periodStartDate)
        .lte("record_date", periodEndDate),
      supabase
        .from("hhs_monthly_attendance")
        .select("client_id, record_date")
        .eq("organization_id", data.organizationId)
        .gte("record_date", periodStartDate)
        .lte("record_date", periodEndDate),
      supabase
        .from("client_billing_codes")
        .select("client_id, service_code, service_end_date")
        .eq("organization_id", data.organizationId),
    ]);

    const clients = (clientsRes.data ?? []) as Array<{ id: string }>;
    const tsRows = (tsRes.data ?? []) as Array<{
      client_id: string;
      service_type_code: string | null;
    }>;
    const dlRows = (dlRes.data ?? []) as Array<{ client_id: string }>;
    const attRows = (attRes.data ?? []) as Array<{ client_id: string }>;
    const codes = (codesRes.data ?? []) as Array<{
      client_id: string;
      service_code: string;
      service_end_date: string | null;
    }>;

    const tsSet = new Set(
      tsRows.map((r) => `${r.client_id}::${r.service_type_code ?? ""}`),
    );
    const dlClients = new Set(dlRows.map((r) => r.client_id));
    const attClients = new Set(attRows.map((r) => r.client_id));

    let blockers = 0;
    for (const c of clients) {
      const clientCodes = codes.filter((b) => b.client_id === c.id);
      if (clientCodes.length === 0) continue;
      for (const code of clientCodes) {
        const isDaily = isDailyServiceCode(code.service_code);
        if (!isDaily) {
          if (!tsSet.has(`${c.id}::${code.service_code}`)) blockers++;
        } else {
          if (!dlClients.has(c.id)) blockers++;
        }
      }
      if (!attClients.has(c.id)) blockers++;
    }

    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    let expiringSoon = 0;
    for (const c of codes) {
      if (!c.service_end_date) continue;
      const end = new Date(c.service_end_date);
      if (end >= now && end <= soon) expiringSoon++;
    }

    return {
      totalClients: clients.length,
      activeCodes: codes.length,
      blockers,
      expiringSoon,
    };
  });
