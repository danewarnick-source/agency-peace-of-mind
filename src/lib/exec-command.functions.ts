import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    await ensureExecutive(supabase, userId);
    const { data } = await supabase
      .from("org_subscriptions")
      .select("status, mrr_cents");
    const rows = (data ?? []) as Array<{ status: string; mrr_cents: number | null }>;
    return {
      mrr_cents: rows
        .filter((r) => r.status === "active" || r.status === "past_due")
        .reduce((s, r) => s + (r.mrr_cents ?? 0), 0),
      active_companies: rows.filter((r) => r.status === "active").length,
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
