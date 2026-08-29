import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isBillingExempt } from "@/lib/billing-access";

async function ensureExecutive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("hive_executives")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Executive access required.");
}

export interface CommandMetrics {
  mrr_cents: number;
  active_companies: number;
  trial_companies: number;
  past_due_companies: number;
}

export const getCommandMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommandMetrics> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) {
      return { mrr_cents: 0, active_companies: 0, trial_companies: 0, past_due_companies: 0 };
    }
    await ensureExecutive(supabase, userId);
    const [{ data: orgs }, { data }] = await Promise.all([
      supabase.from("organizations").select("id, name, legal_name, dba_name, billing_exempt"),
      supabase.from("org_subscriptions").select("organization_id, status, mrr_cents"),
    ]);
    const rows = (data ?? []) as Array<{ organization_id: string; status: string; mrr_cents: number | null }>;
    const subByOrg = new Map(rows.map((r) => [r.organization_id, r]));
    const active_companies = ((orgs ?? []) as Array<{
      id: string;
      name: string | null;
      legal_name: string | null;
      dba_name: string | null;
      billing_exempt: boolean | null;
    }>).filter((o) => {
      const exempt = isBillingExempt({
        billingExempt: o.billing_exempt === true,
        orgName: o.name,
        legalName: o.legal_name,
        dbaName: o.dba_name,
        organizationId: o.id,
      });
      return exempt || subByOrg.get(o.id)?.status === "active";
    }).length;
    return {
      mrr_cents: rows
        .filter((r) => r.status === "active" || r.status === "past_due")
        .reduce((s, r) => s + (r.mrr_cents ?? 0), 0),
      active_companies,
      trial_companies: rows.filter((r) => r.status === "trial").length,
      past_due_companies: rows.filter((r) => r.status === "past_due").length,
    };
  });

export interface NeedsYouSummary {
  upgrade_requests: number;
  extraction_approvals: number;
  billing_approvals: number;
  functionality_reports: number;
  agreements_attention: number;
}

export const getNeedsYouSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NeedsYouSummary> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) {
      return {
        upgrade_requests: 0,
        extraction_approvals: 0,
        billing_approvals: 0,
        functionality_reports: 0,
        agreements_attention: 0,
      };
    }
    await ensureExecutive(supabase, userId);

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    const [upgrades, extractions, billing, funcReports, agreementsAttn] = await Promise.all([
      supabase.from("feature_upgrade_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("nectar_requirements").select("id", { count: "exact", head: true }).eq("approval_state", "nectar_drafted"),
      supabase.from("billing_code_approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("functionality_reports").select("id", { count: "exact", head: true }).in("status", ["open", "triaged"]),
      supabase
        .from("organization_agreements")
        .select("id", { count: "exact", head: true })
        .or(`status.eq.expired,and(renewal_due_date.lte.${in30},renewal_due_date.gte.${today}),and(expiration_date.lte.${in30},expiration_date.gte.${today})`),
    ]);

    return {
      upgrade_requests: upgrades.count ?? 0,
      extraction_approvals: extractions.count ?? 0,
      billing_approvals: billing.count ?? 0,
      functionality_reports: funcReports.count ?? 0,
      agreements_attention: agreementsAttn.count ?? 0,
    };
  });
