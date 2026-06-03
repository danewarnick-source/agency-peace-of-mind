import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { z } from "zod";

const Input = z.object({ organizationId: z.string().uuid() });

type Attention = {
  expiringCredentials: number;
  missingDailyLogs: number;
  unsignedNotes: number;
  pendingIncidents: number;
  claimsReady: number;
  pendingPayroll: number;
  clientsOffPace: number;
  // Platform-wide additions sourced from the Task Center surface:
  requirementsNeedingReview: number;
  engineMappingGaps: number;
  pendingBillingWarnings: number;
  pendingReimbursements: number;
  unacceptedShifts: number;
  auditorSharesExpiring: number;
};

type Celebration = {
  kind: "anniversary" | "training" | "evv_streak" | "growth";
  title: string;
  detail: string;
};

type BillingSnapshot = {
  claimsReadyAmount: number;
  payrollGross: number;
  periodLabel: string;
};

export type CompanyOverview = {
  attention: Attention;
  celebrations: Celebration[];
  billing: BillingSnapshot | null;
};

// Helper: silently swallow query errors so a single broken table can't blank the dashboard.
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export const getCompanyOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    await requireOrgMembership(context.supabase, context.userId, data.organizationId, "employee");
    const orgId = data.organizationId;
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86_400_000).toISOString();
    const last30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const today = now.toISOString().slice(0, 10);
    const last7 = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);

    // --- Attention items ---
    const expiringCredentials = await safe(async () => {
      const { count } = await sb
        .from("external_certifications")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "approved")
        .not("expires_at", "is", null)
        .lte("expires_at", in30);
      return count ?? 0;
    }, 0);

    const missingDailyLogs = await safe(async () => {
      const { count } = await sb
        .from("daily_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "rejected");
      return count ?? 0;
    }, 0);

    const unsignedNotes = await safe(async () => {
      const { count } = await sb
        .from("daily_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("signature_data_url", null)
        .gte("log_date", last7);
      return count ?? 0;
    }, 0);

    const pendingIncidents = await safe(async () => {
      const { count } = await sb
        .from("incident_reports")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "Pending_Admin_Review");
      return count ?? 0;
    }, 0);

    const pendingPayroll = await safe(async () => {
      const { count } = await sb
        .from("evv_timesheets")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "Pending_Approval");
      return count ?? 0;
    }, 0);

    const claimsReady = await safe(async () => {
      const { count } = await sb
        .from("evv_timesheets")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "Approved")
        .is("claim_submitted_at", null);
      return count ?? 0;
    }, 0);

    // Off-pace clients: lightweight proxy via active budget snapshots if present.
    const clientsOffPace = await safe(async () => {
      const { data: rows } = await sb
        .from("client_billing_codes")
        .select("id, monthly_max_units, units_used_period")
        .eq("organization_id", orgId)
        .eq("active", true);
      if (!rows) return 0;
      let n = 0;
      for (const r of rows as Array<{ monthly_max_units: number | null; units_used_period: number | null }>) {
        if (!r.monthly_max_units) continue;
        const used = r.units_used_period ?? 0;
        const ratio = used / r.monthly_max_units;
        if (ratio > 1.1 || ratio < 0.5) n += 1;
      }
      return n;
    }, 0);

    // --- Platform-wide Task Center sources ---
    const in7 = new Date(now.getTime() + 7 * 86_400_000).toISOString();

    const requirementsNeedingReview = await safe(async () => {
      const { count } = await sb
        .from("nectar_requirements")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("review_status", "needs_attention");
      return count ?? 0;
    }, 0);

    const engineMappingGaps = await safe(async () => {
      const [{ data: reqs }, { data: maps }] = await Promise.all([
        sb.from("nectar_requirements").select("id").eq("organization_id", orgId).eq("review_status", "confirmed"),
        sb.from("nectar_requirement_mappings").select("requirement_id, scope_kind, confirmed").eq("organization_id", orgId),
      ]);
      const confirmed = new Set<string>();
      const unknown = new Set<string>();
      for (const m of (maps ?? []) as Array<{ requirement_id: string; scope_kind: string; confirmed: boolean }>) {
        if (m.confirmed) confirmed.add(m.requirement_id);
        if (m.scope_kind === "unknown" && !m.confirmed) unknown.add(m.requirement_id);
      }
      let gaps = 0;
      for (const r of (reqs ?? []) as Array<{ id: string }>) {
        if (!confirmed.has(r.id) || unknown.has(r.id)) gaps += 1;
      }
      return gaps;
    }, 0);

    const pendingBillingWarnings = await safe(async () => {
      const { count } = await sb
        .from("billing_submission_warnings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "pending");
      return count ?? 0;
    }, 0);

    const pendingReimbursements = await safe(async () => {
      const { count } = await sb
        .from("activity_reimbursement_requests")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "pending");
      return count ?? 0;
    }, 0);

    const unacceptedShifts = await safe(async () => {
      const { count } = await sb
        .from("scheduled_shifts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("published", true)
        .eq("status", "pending")
        .gte("starts_at", now.toISOString());
      return count ?? 0;
    }, 0);

    const auditorSharesExpiring = await safe(async () => {
      const { count } = await sb
        .from("auditor_shares")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("revoked_at", null)
        .lte("ends_at", in7)
        .gte("ends_at", now.toISOString());
      return count ?? 0;
    }, 0);

    const attention: Attention = {
      expiringCredentials,
      missingDailyLogs,
      unsignedNotes,
      pendingIncidents,
      claimsReady,
      pendingPayroll,
      clientsOffPace,
      requirementsNeedingReview,
      engineMappingGaps,
      pendingBillingWarnings,
      pendingReimbursements,
      unacceptedShifts,
      auditorSharesExpiring,
    };

    // --- Celebrations ---
    const celebrations: Celebration[] = [];

    // Work anniversaries this month (employees with hire_date whose month matches now)
    await safe(async () => {
      const { data: members } = await sb
        .from("organization_members")
        .select("user_id, hire_date, profiles:user_id(full_name)")
        .eq("organization_id", orgId)
        .eq("active", true)
        .not("hire_date", "is", null);
      const month = now.getUTCMonth();
      const year = now.getUTCFullYear();
      for (const m of (members ?? []) as Array<{
        hire_date: string | null;
        profiles: { full_name: string | null } | null;
      }>) {
        if (!m.hire_date) continue;
        const d = new Date(m.hire_date);
        if (d.getUTCMonth() !== month) continue;
        const years = year - d.getUTCFullYear();
        if (years < 1) continue;
        celebrations.push({
          kind: "anniversary",
          title: `${m.profiles?.full_name ?? "Team member"} — ${years} yr${years === 1 ? "" : "s"} this month`,
          detail: "Work anniversary",
        });
      }
    }, undefined);

    // Recent training/certification approvals (last 30 days)
    await safe(async () => {
      const { data: certs } = await sb
        .from("external_certifications")
        .select("cert_name, cert_type, reviewed_at, profiles:user_id(full_name)")
        .eq("organization_id", orgId)
        .eq("status", "approved")
        .gte("reviewed_at", last30)
        .order("reviewed_at", { ascending: false })
        .limit(5);
      for (const c of (certs ?? []) as Array<{
        cert_name: string | null;
        cert_type: string;
        profiles: { full_name: string | null } | null;
      }>) {
        celebrations.push({
          kind: "training",
          title: `${c.profiles?.full_name ?? "A staff member"} completed ${c.cert_name ?? c.cert_type}`,
          detail: "Certification approved",
        });
      }
    }, undefined);

    // EVV streak: staff with 7 consecutive in-bounds clock-ins
    await safe(async () => {
      const { data: punches } = await sb
        .from("evv_timesheets")
        .select("staff_id, is_out_of_bounds, profiles:staff_id(full_name)")
        .eq("organization_id", orgId)
        .gte("clock_in_timestamp", last30);
      const byStaff = new Map<string, { name: string; clean: number; total: number }>();
      for (const p of (punches ?? []) as Array<{
        staff_id: string;
        is_out_of_bounds: boolean | null;
        profiles: { full_name: string | null } | null;
      }>) {
        const cur = byStaff.get(p.staff_id) ?? {
          name: p.profiles?.full_name ?? "A staff member",
          clean: 0,
          total: 0,
        };
        cur.total += 1;
        if (!p.is_out_of_bounds) cur.clean += 1;
        byStaff.set(p.staff_id, cur);
      }
      let perfect = 0;
      for (const v of byStaff.values()) {
        if (v.total >= 7 && v.clean === v.total) perfect += 1;
      }
      if (perfect > 0) {
        celebrations.push({
          kind: "evv_streak",
          title: `${perfect} staff with perfect EVV streaks`,
          detail: "30 days, every clock-in inside the geofence",
        });
      }
    }, undefined);

    // Growth milestone: active client count
    await safe(async () => {
      const { count } = await sb
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("active", true);
      if (count && count > 0 && count % 5 === 0) {
        celebrations.push({
          kind: "growth",
          title: `${count} active clients served`,
          detail: "Census milestone",
        });
      }
    }, undefined);

    // --- Billing snapshot (returned as numbers — caller decides whether to render) ---
    const billing: BillingSnapshot = {
      claimsReadyAmount: 0,
      payrollGross: 0,
      periodLabel: today,
    };

    await safe(async () => {
      const { data: rows } = await sb
        .from("evv_timesheets")
        .select("units, rate, gross_pay, status, claim_submitted_at, clock_in_timestamp")
        .eq("organization_id", orgId)
        .gte("clock_in_timestamp", last30);
      for (const r of (rows ?? []) as Array<{
        units: number | null;
        rate: number | null;
        gross_pay: number | null;
        status: string;
        claim_submitted_at: string | null;
      }>) {
        if (r.status === "Approved" && !r.claim_submitted_at) {
          billing.claimsReadyAmount += (r.units ?? 0) * (r.rate ?? 0);
        }
        if (r.gross_pay) billing.payrollGross += r.gross_pay;
      }
    }, undefined);

    return { attention, celebrations: celebrations.slice(0, 8), billing } satisfies CompanyOverview;
  });
