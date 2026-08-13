import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { getIncidentOpenClocks } from "@/lib/incident-deadlines";
import { computeDeadlines } from "@/lib/bc-deadlines";
import { computeRequirementDueState } from "@/lib/requirement-tracking";
import {
  ensureCurrentSummaryPeriods,
  listOpenSummaries,
  type ProgressSummaryRow,
} from "@/lib/progress-summaries.functions";
import { formatPeriodMonthYear, recentMonthlyPeriods } from "@/lib/progress-summaries";
import { computeSowAlerts } from "@/lib/sow-perimeters.functions";
import { computeSupportStrategyCoverage } from "@/lib/support-strategy-coverage";
import type { CSTSection } from "@/lib/client-specific-training.functions";
import { listUpiAttestations } from "@/lib/upi-attestations.functions";

export type DeadlineSource =
  | "summary"
  | "host_home_cert"
  | "staff_cert"
  | "incident"
  | "billing_code"
  | "sow_perimeter"
  | "pcsp_support_strategies"
  | "support_strategy_gap"
  | "hrc_restriction_review"
  | "nectar_requirement"
  | "compliance_instance"
  | "hhs_evacuation_drill"
  | "rhs_evacuation_drill"
  | "pps_evacuation_drill"
  | "sei_upi_employment"
  | "sei_upi_support_strategies"
  | "org_license"
  | "epr_informed_choice";

export type DeadlineItem = {
  key: string;
  source: DeadlineSource;
  title: string;
  subject: string;
  subjectKind: "client" | "staff" | "agency";
  dueAt: Date;
  status: "overdue" | "due_soon" | "upcoming";
  href?: string;
  // Source-specific payload
  summary?: ProgressSummaryRow;
  incidentId?: string;
  clientId?: string;
  staffId?: string;
  instanceId?: string;
  /** 1st/5th/10th-of-month reminder cadence (prompts 20/21/25) — the notification bell only fires these on those days. */
  cadenceReminder?: boolean;
  /** YYYY-MM period label, set on sei_upi_employment items so the row action can attest the right month. */
  periodLabel?: string;
};

const DAY = 86_400_000;

function bucketStatus(due: Date, now: Date): DeadlineItem["status"] {
  const ms = due.getTime() - now.getTime();
  if (ms < 0) return "overdue";
  if (ms <= 7 * DAY) return "due_soon";
  return "upcoming";
}

function bucketStatusWithin(due: Date, now: Date, dueSoonDays: number): DeadlineItem["status"] {
  const ms = due.getTime() - now.getTime();
  if (ms < 0) return "overdue";
  if (ms <= dueSoonDays * DAY) return "due_soon";
  return "upcoming";
}

const QUARTERLY_DRILL_DAYS = 90;
const DRILL_REMINDER_DAYS = 14;

function fmtMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function useDeadlines() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const ensureFn = useServerFn(ensureCurrentSummaryPeriods);
  const listSummariesFn = useServerFn(listOpenSummaries);
  const computeSowFn = useServerFn(computeSowAlerts);
  const listUpiAttestFn = useServerFn(listUpiAttestations);

  // 1. Progress summaries — ensure rows then list.
  const summariesQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "summaries", orgId],
    queryFn: async () => {
      await ensureFn({ data: { organizationId: orgId! } });
      return listSummariesFn({ data: { organizationId: orgId! } });
    },
  });

  // 2. Clients (for names) — single org-wide fetch reused everywhere.
  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "clients", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, pcsp_expiration_date, admission_date")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string; pcsp_expiration_date: string | null; admission_date: string | null }>;
    },
  });


  // 3. Active HHS clients (drives the annual host-home-cert source below).
  const hhsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "hhs", orgId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: codes, error } = await supabase
        .from("client_billing_codes")
        .select("client_id, service_start_date, service_end_date")
        .eq("organization_id", orgId!)
        .eq("service_code", "HHS");
      if (error) throw error;
      const activeIds = (codes ?? [])
        .filter((c) => (!c.service_start_date || c.service_start_date <= today)
                    && (!c.service_end_date || c.service_end_date >= today))
        .map((c) => c.client_id);
      return { activeIds };
    },
  });

  // 4. Staff certifications expiring within 30 days or already expired.
  const certsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "staff_certs", orgId],
    queryFn: async () => {
      const cutoff = new Date(Date.now() + 30 * DAY).toISOString();
      const { data, error } = await supabase
        .from("certifications")
        .select("id, user_id, expires_at, course_title, recipient_name")
        .eq("organization_id", orgId!)
        .not("expires_at", "is", null)
        .lte("expires_at", cutoff)
        .order("expires_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; user_id: string; expires_at: string; course_title: string | null; recipient_name: string | null;
      }>;
    },
  });

  // 5. Open incidents — clocks.
  const incidentsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "incidents", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_reports")
        .select("id, report_number, client_id, discovered_at, upi_submitted_at:state_submitted_at, status")
        .eq("organization_id", orgId!)
        .not("discovered_at", "is", null)
        .neq("status", "State_Confirmed")
        .order("discovered_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; report_number: string; client_id: string;
        discovered_at: string; upi_submitted_at: string | null; status: string;
      }>;
    },
  });


  // 6. Billing-code / SOW deadlines per behavior-support client.
  const bcQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "bc", orgId],
    queryFn: async () => {
      const { data: bsc, error } = await supabase
        .from("behavior_support_clients")
        .select("client_id, created_at")
        .eq("organization_id", orgId!);
      if (error) throw error;
      const clientIds = (bsc ?? []).map((b) => b.client_id);
      if (clientIds.length === 0) return [];
      const [docs, monthly, lastEntry] = await Promise.all([
        supabase.from("bc_documents")
          .select("client_id, doc_type, uploaded_at")
          .eq("organization_id", orgId!)
          .eq("is_current", true)
          .in("client_id", clientIds),
        supabase.from("bc_review_notes")
          .select("client_id, created_at")
          .eq("organization_id", orgId!)
          .eq("note_type", "monthly_review")
          .in("client_id", clientIds)
          .order("created_at", { ascending: false }),
        supabase.from("bc_data_entries")
          .select("client_id, occurred_at")
          .eq("organization_id", orgId!)
          .in("client_id", clientIds)
          .order("occurred_at", { ascending: false }),
      ]);
      return (bsc ?? []).map((b) => {
        const cd = (docs.data ?? []).filter((d) => d.client_id === b.client_id);
        const fba = cd.find((d) => d.doc_type === "FBA")?.uploaded_at ?? null;
        const bsp = cd.find((d) => d.doc_type === "BSP")?.uploaded_at ?? null;
        const lastMonthly = (monthly.data ?? []).find((m) => m.client_id === b.client_id)?.created_at ?? null;
        const lastDe = (lastEntry.data ?? []).find((e) => e.client_id === b.client_id)?.occurred_at ?? null;
        return {
          client_id: b.client_id,
          rows: computeDeadlines({
            fbaUploadedAt: fba,
            bspUploadedAt: bsp,
            lastMonthlyReviewAt: lastMonthly,
            lastDataEntryAt: lastDe,
            bcConfigEnabledAt: b.created_at,
          }),
        };
      });
    },
  });

  // 7. Profiles for staff cert subject names.
  const profilesQ = useQuery({
    enabled: !!orgId && !!certsQ.data?.length,
    queryKey: ["deadlines", "profiles", orgId, (certsQ.data ?? []).map((c) => c.user_id).join(",")],
    queryFn: async () => {
      const ids = Array.from(new Set((certsQ.data ?? []).map((c) => c.user_id)));
      if (ids.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
        if (r.full_name) map[r.id] = r.full_name;
      }
      return map;
    },
  });

  // 8. Host home certifications — latest next_due_date per active HHS client.
  const hhCertsQ = useQuery({
    enabled: !!orgId && !!hhsQ.data,
    queryKey: ["deadlines", "host_home_certs", orgId, (hhsQ.data?.activeIds ?? []).join(",")],
    queryFn: async () => {
      const activeIds = hhsQ.data?.activeIds ?? [];
      if (activeIds.length === 0) return { latest: new Map<string, string>() };
      const { data, error } = await supabase
        .from("host_home_certifications" as never)
        .select("client_id, next_due_date, inspection_date")
        .eq("organization_id", orgId!)
        .in("client_id", activeIds)
        .order("inspection_date", { ascending: false });
      if (error) throw error;
      const latest = new Map<string, string>();
      for (const row of (data ?? []) as unknown as Array<{ client_id: string; next_due_date: string }>) {
        if (!latest.has(row.client_id)) latest.set(row.client_id, row.next_due_date);
      }
      return { latest };
    },
  });



  // 8b. Active RHS clients (drives the RHS quarterly evacuation drill source).
  const rhsActiveQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "rhs", orgId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: codes, error } = await supabase
        .from("client_billing_codes")
        .select("client_id, service_start_date, service_end_date")
        .eq("organization_id", orgId!)
        .eq("service_code", "RHS");
      if (error) throw error;
      const activeIds = (codes ?? [])
        .filter((c) => (!c.service_start_date || c.service_start_date <= today)
                    && (!c.service_end_date || c.service_end_date >= today))
        .map((c) => c.client_id);
      return { activeIds };
    },
  });

  // 8c. Quarterly evacuation drills — latest drill date per active HHS client.
  const hhsDrillsQ = useQuery({
    enabled: !!orgId && !!hhsQ.data,
    queryKey: ["deadlines", "hhs_drills", orgId, (hhsQ.data?.activeIds ?? []).join(",")],
    queryFn: async () => {
      const activeIds = hhsQ.data?.activeIds ?? [];
      if (activeIds.length === 0) return { latest: new Map<string, string>() };
      const { data, error } = await supabase
        .from("hhs_evacuation_drills" as never)
        .select("client_id, drill_executed_at")
        .eq("organization_id", orgId!)
        .in("client_id", activeIds)
        .order("drill_executed_at", { ascending: false });
      if (error) throw error;
      const latest = new Map<string, string>();
      for (const row of (data ?? []) as unknown as Array<{ client_id: string; drill_executed_at: string }>) {
        if (!latest.has(row.client_id)) latest.set(row.client_id, row.drill_executed_at);
      }
      return { latest };
    },
  });

  // 8d. Quarterly evacuation drills — latest drill date per active RHS client.
  const rhsDrillsQ = useQuery({
    enabled: !!orgId && !!rhsActiveQ.data,
    queryKey: ["deadlines", "rhs_drills", orgId, (rhsActiveQ.data?.activeIds ?? []).join(",")],
    queryFn: async () => {
      const activeIds = rhsActiveQ.data?.activeIds ?? [];
      if (activeIds.length === 0) return { latest: new Map<string, string>() };
      const { data, error } = await supabase
        .from("rhs_evacuation_drills" as never)
        .select("client_id, drill_date")
        .eq("organization_id", orgId!)
        .in("client_id", activeIds)
        .order("drill_date", { ascending: false });
      if (error) throw error;
      const latest = new Map<string, string>();
      for (const row of (data ?? []) as unknown as Array<{ client_id: string; drill_date: string }>) {
        if (!latest.has(row.client_id)) latest.set(row.client_id, row.drill_date);
      }
      return { latest };
    },
  });

  // 8e. Active PPS clients (drives the PPS quarterly evacuation drill source).
  const ppsActiveQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "pps", orgId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: codes, error } = await supabase
        .from("client_billing_codes")
        .select("client_id, service_start_date, service_end_date")
        .eq("organization_id", orgId!)
        .eq("service_code", "PPS");
      if (error) throw error;
      const activeIds = (codes ?? [])
        .filter((c) => (!c.service_start_date || c.service_start_date <= today)
                    && (!c.service_end_date || c.service_end_date >= today))
        .map((c) => c.client_id);
      return { activeIds };
    },
  });

  // 8f. Quarterly evacuation drills — latest drill date per active PPS client.
  const ppsDrillsQ = useQuery({
    enabled: !!orgId && !!ppsActiveQ.data,
    queryKey: ["deadlines", "pps_drills", orgId, (ppsActiveQ.data?.activeIds ?? []).join(",")],
    queryFn: async () => {
      const activeIds = ppsActiveQ.data?.activeIds ?? [];
      if (activeIds.length === 0) return { latest: new Map<string, string>() };
      const { data, error } = await supabase
        .from("rhs_evacuation_drills" as never)
        .select("client_id, drill_date")
        .eq("organization_id", orgId!)
        .in("client_id", activeIds)
        .order("drill_date", { ascending: false });
      if (error) throw error;
      const latest = new Map<string, string>();
      for (const row of (data ?? []) as unknown as Array<{ client_id: string; drill_date: string }>) {
        if (!latest.has(row.client_id)) latest.set(row.client_id, row.drill_date);
      }
      return { latest };
    },
  });

  // 8g. Active EPR clients + earliest EPR service start date (drives the
  // EPR Informed Choice conversation 60-day deadline).
  const eprActiveQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "epr", orgId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: codes, error } = await supabase
        .from("client_billing_codes")
        .select("client_id, service_start_date, service_end_date")
        .eq("organization_id", orgId!)
        .eq("service_code", "EPR");
      if (error) throw error;
      const starts = new Map<string, string>();
      for (const c of (codes ?? []) as Array<{ client_id: string; service_start_date: string | null; service_end_date: string | null }>) {
        if (!(!c.service_start_date || c.service_start_date <= today) || !(!c.service_end_date || c.service_end_date >= today)) continue;
        if (!c.service_start_date) continue;
        const prev = starts.get(c.client_id);
        if (!prev || c.service_start_date < prev) starts.set(c.client_id, c.service_start_date);
      }
      return { starts };
    },
  });

  // 8h. EPR Informed Choice documents already on file.
  const eprDocsQ = useQuery({
    enabled: !!orgId && !!eprActiveQ.data,
    queryKey: ["deadlines", "epr_docs", orgId, [...(eprActiveQ.data?.starts.keys() ?? [])].join(",")],
    queryFn: async () => {
      const clientIds = [...(eprActiveQ.data?.starts.keys() ?? [])];
      if (clientIds.length === 0) return { hasDoc: new Set<string>() };
      const { data, error } = await supabase
        .from("client_documents")
        .select("client_id")
        .eq("organization_id", orgId!)
        .eq("document_type", "epr_informed_choice")
        .in("client_id", clientIds);
      if (error) throw error;
      return { hasDoc: new Set((data ?? []).map((r) => (r as { client_id: string }).client_id)) };
    },
  });

  // 9. SOW perimeter alerts — R1 through R5 (training gaps, incident timelines, requirements).
  const sowQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "sow", orgId],
    queryFn: () => computeSowFn({ data: { organizationId: orgId! } }),
  });

  // 10. Support Strategies published approval dates per client (for PCSP renewal reminder).
  const ssApprovalsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "ss_approvals", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_specific_trainings")
        .select("client_id, approved_at")
        .eq("organization_id", orgId!)
        .eq("training_type", "support_strategies")
        .eq("status", "published")
        .not("approved_at", "is", null)
        .order("approved_at", { ascending: false });
      if (error) throw error;
      const latest = new Map<string, string>();
      for (const row of (data ?? []) as Array<{ client_id: string; approved_at: string }>) {
        if (!latest.has(row.client_id)) latest.set(row.client_id, row.approved_at);
      }
      return latest;
    },
  });

  // 11b. Support Strategy coverage gaps (SOW §1.24(5)) — every active,
  // non-exempt billing code must be covered by ≥1 published Support
  // Strategy's job_codes. Only computed for clients with a published row.
  const ssCoverageQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "ss_coverage", orgId],
    queryFn: async () => {
      const [ssRes, codesRes] = await Promise.all([
        supabase
          .from("client_specific_trainings")
          .select("client_id, content")
          .eq("organization_id", orgId!)
          .eq("training_type", "support_strategies")
          .eq("status", "published"),
        supabase
          .from("client_billing_codes")
          .select("client_id, service_code, service_start_date, service_end_date")
          .eq("organization_id", orgId!),
      ]);
      if (ssRes.error) throw ssRes.error;
      if (codesRes.error) throw codesRes.error;
      const today = new Date().toISOString().slice(0, 10);
      const activeCodesByClient = new Map<string, string[]>();
      for (const row of (codesRes.data ?? []) as Array<{
        client_id: string; service_code: string; service_start_date: string | null; service_end_date: string | null;
      }>) {
        const active = (!row.service_start_date || row.service_start_date <= today)
          && (!row.service_end_date || row.service_end_date > today);
        if (!active) continue;
        const list = activeCodesByClient.get(row.client_id) ?? [];
        list.push(row.service_code);
        activeCodesByClient.set(row.client_id, list);
      }
      const gapsByClient = new Map<string, string[]>();
      for (const row of (ssRes.data ?? []) as Array<{ client_id: string; content: { sections?: CSTSection[] } | null }>) {
        const activeCodes = activeCodesByClient.get(row.client_id) ?? [];
        if (activeCodes.length === 0) continue;
        const coverage = computeSupportStrategyCoverage(activeCodes, row.content?.sections ?? []);
        if (coverage.gaps.length > 0) gapsByClient.set(row.client_id, coverage.gaps);
      }
      return gapsByClient;
    },
  });

  // 11. Active HRC rights-restriction records — the re-review date from
  // element (g) becomes a real deadline.
  const hrcRestrictionsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "hrc_restrictions", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hrc_restriction_records" as never)
        .select("id, client_id, restriction_title, next_review_date, active")
        .eq("organization_id", orgId!)
        .eq("active", true)
        .not("next_review_date", "is", null);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; client_id: string; restriction_title: string; next_review_date: string; active: boolean;
      }>;
    },
  });

  // 11c. Active SEI clients (drives the SEI employment-data / support-strategies UPI attestation sources).
  const seiActiveQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "sei", orgId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: codes, error } = await supabase
        .from("client_billing_codes")
        .select("client_id, service_start_date, service_end_date")
        .eq("organization_id", orgId!)
        .eq("service_code", "SEI");
      if (error) throw error;
      const activeIds = (codes ?? [])
        .filter((c) => (!c.service_start_date || c.service_start_date <= today)
                    && (!c.service_end_date || c.service_end_date >= today))
        .map((c) => c.client_id);
      return { activeIds };
    },
  });

  // 11d. SEI employment-data UPI attestations already recorded (prompt 21).
  const seiEmploymentAttestQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "sei_employment_attest", orgId],
    queryFn: () => listUpiAttestFn({ data: { organizationId: orgId!, kind: "sei_employment_monthly" } }),
  });

  // 11e. SEI support-strategies UPI attestations already recorded (prompt 22).
  const seiSupportStrategiesAttestQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "sei_ss_attest", orgId],
    queryFn: () => listUpiAttestFn({ data: { organizationId: orgId!, kind: "sei_support_strategies" } }),
  });

  // 12. Renewal-cadence requirements approaching expiry or overdue.
  const renewalReqsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "renewal_requirements", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nectar_requirements")
        .select("id, title, metadata")
        .eq("organization_id", orgId!)
        .eq("compliance_pattern", "renewal")
        .eq("activation_state", "active")
        .eq("review_status", "confirmed");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; title: string; metadata: Record<string, unknown> | null }>;
    },
  });

  // 13. Open/overdue event-driven compliance instances.
  const complianceInstancesQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "compliance_instances", orgId],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      await supabase
        .from("nectar_compliance_instances")
        .update({ status: "overdue" })
        .eq("organization_id", orgId!)
        .eq("status", "open")
        .lt("deadline_at", nowIso);

      const { data, error } = await supabase
        .from("nectar_compliance_instances")
        .select("id, requirement_id, triggered_by_kind, triggered_at, deadline_at, status")
        .eq("organization_id", orgId!)
        .in("status", ["open", "overdue"]);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string; requirement_id: string; triggered_by_kind: string | null;
        triggered_at: string; deadline_at: string; status: string;
      }>;
      const reqIds = Array.from(new Set(rows.map((r) => r.requirement_id)));
      let titles: Record<string, string> = {};
      if (reqIds.length) {
        const { data: reqs } = await supabase
          .from("nectar_requirements")
          .select("id, title")
          .in("id", reqIds);
        for (const r of (reqs ?? []) as Array<{ id: string; title: string }>) titles[r.id] = r.title;
      }
      return { rows, titles };
    },
  });

  // 14. Org-level licenses & certifications (Provider Licensing Hub) —
  // required set is gated by active service codes; expiration/attestation
  // deadlines mirror the flag logic on the Settings > Licensing cards.
  const orgLicenseCodesQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "org_license_codes", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_codes" as never)
        .select("code, is_active")
        .eq("organization_id", orgId!)
        .eq("is_active", true);
      if (error) throw error;
      return new Set(((data ?? []) as unknown as Array<{ code: string }>).map((r) => r.code.toUpperCase()));
    },
  });

  const orgLicenseDocsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "org_license_docs", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nectar_documents" as never)
        .select("document_type, effective_end")
        .eq("organization_id", orgId!)
        .eq("owner_kind", "company")
        .eq("is_current", true)
        .in("document_type", [
          "ol_residential_license", "ol_residential_certification",
          "ol_day_treatment_license", "ol_day_support_certification",
          "usor_approved_vendor", "usor_approved_vendor_job_development",
        ]);
      if (error) throw error;
      const byType = new Map<string, string | null>();
      for (const row of (data ?? []) as unknown as Array<{ document_type: string; effective_end: string | null }>) {
        if (!byType.has(row.document_type)) byType.set(row.document_type, row.effective_end);
      }
      return byType;
    },
  });

  const orgLicenseAttestQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "org_license_attest", orgId],
    queryFn: async () => {
      const [sei, sjd] = await Promise.all([
        listUpiAttestFn({ data: { organizationId: orgId!, kind: "usor_vendor" } }),
        listUpiAttestFn({ data: { organizationId: orgId!, kind: "usor_vendor_job_development" } }),
      ]);
      return {
        usor_approved_vendor: sei[0]?.attested_at ?? null,
        usor_approved_vendor_job_development: sjd[0]?.attested_at ?? null,
      } as Record<string, string | null>;
    },
  });

  const orgLicenseStartsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "org_license_starts", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("service_code, service_start_date")
        .eq("organization_id", orgId!)
        .in("service_code", ["SEI", "SJD"])
        .not("service_start_date", "is", null)
        .order("service_start_date", { ascending: true });
      if (error) throw error;
      const earliest = new Map<string, string>();
      for (const row of (data ?? []) as Array<{ service_code: string; service_start_date: string }>) {
        if (!earliest.has(row.service_code)) earliest.set(row.service_code, row.service_start_date);
      }
      return earliest;
    },
  });

  const items = useMemo<DeadlineItem[]>(() => {
    if (!orgId) return [];
    const now = new Date();
    const out: DeadlineItem[] = [];
    const nameOf = (id: string) => {
      const c = (clientsQ.data ?? []).find((x) => x.id === id);
      return c ? `${c.first_name} ${c.last_name}` : "Unknown client";
    };

    // Progress summaries
    for (const s of summariesQ.data ?? []) {
      const due = new Date(`${s.due_date}T23:59:59`);
      const clientName = nameOf(s.client_id);
      const isSei = s.period_kind === "monthly" && s.service_codes?.includes("SEI");
      const isCmpCms = s.period_kind === "monthly" && s.service_codes?.some((c) => c === "CMP" || c === "CMS");
      const finalizedUnattested = isSei && !!s.finalized_at && !s.upi_entered_at;
      let title: string;
      if (finalizedUnattested) {
        title = `SEI monthly summary for ${fmtMonth(s.period_label)} — mark as entered in UPI.`;
      } else if (isCmpCms) {
        title = `CMP/CMS monthly summary for ${fmtMonth(s.period_label)} — ${clientName} is due.`;
      } else if (s.period_kind === "quarterly") {
        title = `${s.period_label} quarterly summary`;
      } else {
        title = `${fmtMonth(s.period_label)} monthly summary`;
      }
      out.push({
        key: `sum:${s.id}`,
        source: "summary",
        title,
        subject: clientName,
        subjectKind: "client",
        dueAt: due,
        status: bucketStatus(due, now),
        href: `/dashboard/summaries?open=${s.id}`,
        summary: s,
        clientId: s.client_id,
        cadenceReminder: finalizedUnattested || (isCmpCms && !s.completed_at),
      });
    }

    // (HHS monthly certifications removed — host-home certification is annual,
    // surfaced once via the host_home_cert source below.)



    // Staff certifications
    for (const c of certsQ.data ?? []) {
      const due = new Date(c.expires_at);
      out.push({
        key: `cert:${c.id}`,
        source: "staff_cert",
        title: `${c.course_title ?? "Certification"} expires`,
        subject: (profilesQ.data ?? {})[c.user_id] ?? c.recipient_name ?? "Staff member",
        subjectKind: "staff",
        dueAt: due,
        status: bucketStatus(due, now),
        href: `/dashboard/employees/${c.user_id}`,
        staffId: c.user_id,
      });
    }

    // Incident clocks
    for (const inc of incidentsQ.data ?? []) {
      const clocks = getIncidentOpenClocks(inc);
      for (const clock of clocks) {
        out.push({
          key: `inc:${inc.id}:${clock.kind}`,
          source: "incident",
          title: `${clock.label} — Incident ${inc.report_number}`,
          subject: nameOf(inc.client_id),
          subjectKind: "client",
          dueAt: clock.deadline,
          status: bucketStatus(clock.deadline, now),
          href: `/dashboard/hub/documentation?tab=incidents`,
          incidentId: inc.id,
          clientId: inc.client_id,
        });
      }
    }


    // Billing-code / SOW deadlines
    for (const c of bcQ.data ?? []) {
      for (const r of c.rows) {
        if (!r.dueAt) continue;
        if (r.status === "ok") continue; // only surface non-ok rows
        out.push({
          key: `bc:${c.client_id}:${r.key}`,
          source: "billing_code",
          title: r.label,
          subject: nameOf(c.client_id),
          subjectKind: "client",
          dueAt: r.dueAt,
          status: bucketStatus(r.dueAt, now),
          href: `/dashboard/behavior-support/${c.client_id}`,
          clientId: c.client_id,
        });
      }
    }

    // Host home certifications — HHS-only. Overdue/missing surfaces here.
    if (hhsQ.data && hhCertsQ.data) {
      for (const clientId of hhsQ.data.activeIds) {
        const dueStr = hhCertsQ.data.latest.get(clientId);
        const due = dueStr ? new Date(`${dueStr}T23:59:59`) : new Date(now.getTime() - DAY);
        out.push({
          key: `hhc:${clientId}`,
          source: "host_home_cert",
          title: dueStr ? "Host home annual certification" : "Host home certification (never completed)",
          subject: nameOf(clientId),
          subjectKind: "client",
          dueAt: due,
          status: bucketStatus(due, now),
          href: `/dashboard/hub/employees?tab=hosts`,
          clientId,
        });
      }
    }

    // Quarterly evacuation drills — HHS. Due every 90 days from the last
    // recorded drill; overdue from admission date if never recorded.
    if (hhsQ.data && hhsDrillsQ.data) {
      for (const clientId of hhsQ.data.activeIds) {
        const lastDrill = hhsDrillsQ.data.latest.get(clientId);
        const admission = (clientsQ.data ?? []).find((c) => c.id === clientId)?.admission_date;
        const baseline = lastDrill ?? admission;
        const due = baseline
          ? new Date(new Date(baseline).getTime() + QUARTERLY_DRILL_DAYS * DAY)
          : new Date(now.getTime() - DAY);
        out.push({
          key: `hhsdrill:${clientId}`,
          source: "hhs_evacuation_drill",
          title: lastDrill ? "Quarterly evacuation drill due" : "Evacuation drill never recorded",
          subject: nameOf(clientId),
          subjectKind: "client",
          dueAt: due,
          status: bucketStatusWithin(due, now, DRILL_REMINDER_DAYS),
          href: `/dashboard/hhs-hub/${clientId}?tab=prn&form=drill`,
          clientId,
        });
      }
    }

    // Quarterly evacuation drills — RHS. Same cadence, mirrors HHS.
    if (rhsActiveQ.data && rhsDrillsQ.data) {
      for (const clientId of rhsActiveQ.data.activeIds) {
        const lastDrill = rhsDrillsQ.data.latest.get(clientId);
        const admission = (clientsQ.data ?? []).find((c) => c.id === clientId)?.admission_date;
        const baseline = lastDrill ?? admission;
        const due = baseline
          ? new Date(new Date(baseline).getTime() + QUARTERLY_DRILL_DAYS * DAY)
          : new Date(now.getTime() - DAY);
        out.push({
          key: `rhsdrill:${clientId}`,
          source: "rhs_evacuation_drill",
          title: lastDrill ? "Quarterly evacuation drill due" : "Evacuation drill never recorded",
          subject: nameOf(clientId),
          subjectKind: "client",
          dueAt: due,
          status: bucketStatusWithin(due, now, DRILL_REMINDER_DAYS),
          href: `/dashboard/clients/${clientId}?tab=profile`,
          clientId,
        });
      }
    }

    // Quarterly evacuation drills — PPS. Same cadence, mirrors HHS/RHS.
    if (ppsActiveQ.data && ppsDrillsQ.data) {
      for (const clientId of ppsActiveQ.data.activeIds) {
        const lastDrill = ppsDrillsQ.data.latest.get(clientId);
        const admission = (clientsQ.data ?? []).find((c) => c.id === clientId)?.admission_date;
        const baseline = lastDrill ?? admission;
        const due = baseline
          ? new Date(new Date(baseline).getTime() + QUARTERLY_DRILL_DAYS * DAY)
          : new Date(now.getTime() - DAY);
        out.push({
          key: `ppsdrill:${clientId}`,
          source: "pps_evacuation_drill",
          title: lastDrill ? "Quarterly evacuation drill due" : "Evacuation drill never recorded",
          subject: nameOf(clientId),
          subjectKind: "client",
          dueAt: due,
          status: bucketStatusWithin(due, now, DRILL_REMINDER_DAYS),
          href: `/dashboard/clients/${clientId}?tab=profile`,
          clientId,
        });
      }
    }

    // EPR Informed Choice conversation — due 60 calendar days from EPR
    // service start. Once uploaded it's satisfied and drops off the panel.
    if (eprActiveQ.data && eprDocsQ.data) {
      for (const [clientId, startDate] of eprActiveQ.data.starts) {
        if (eprDocsQ.data.hasDoc.has(clientId)) continue;
        const due = new Date(new Date(`${startDate}T00:00:00`).getTime() + 60 * DAY);
        out.push({
          key: `eprchoice:${clientId}`,
          source: "epr_informed_choice",
          title: "EPR Informed Choice conversation — documentation due",
          subject: nameOf(clientId),
          subjectKind: "client",
          dueAt: due,
          status: bucketStatus(due, now),
          href: `/dashboard/clients/${clientId}?tab=profile`,
          clientId,
        });
      }
    }

    // SOW perimeter alerts (R1–R5)
    for (const a of sowQ.data?.alerts ?? []) {
      out.push({
        key: a.key,
        source: "sow_perimeter",
        title: a.title,
        subject: a.subject,
        subjectKind: a.subjectKind,
        dueAt: new Date(a.dueAt),
        status: bucketStatus(new Date(a.dueAt), now),
        href: a.href,
        staffId: a.staffId,
        clientId: a.clientId,
        incidentId: a.incidentId,
      });
    }

    // PCSP-driven Support Strategies annual renewal reminder.
    // Surfaces ON the PCSP expiration date; auto-clears when SS is re-published on/after that date.
    const ssLatest = ssApprovalsQ.data ?? new Map<string, string>();
    for (const c of clientsQ.data ?? []) {
      if (!c.pcsp_expiration_date) continue;
      const pcspExp = new Date(`${c.pcsp_expiration_date}T23:59:59`);
      if (now < pcspExp) continue; // not yet expired
      const ssApprovedAt = ssLatest.get(c.id);
      if (ssApprovedAt && new Date(ssApprovedAt) >= pcspExp) continue; // already renewed
      out.push({
        key: `pcsp-ss:${c.id}`,
        source: "pcsp_support_strategies",
        title: "Support Strategies renewal due — PCSP expired",
        subject: nameOf(c.id),
        subjectKind: "client",
        dueAt: pcspExp,
        status: bucketStatus(pcspExp, now),
        href: `/dashboard/clients/${c.id}?tab=care`,
        clientId: c.id,
      });
    }

    // SEI employment-data UPI attestation — separate monthly checkbox from the
    // narrative summary (prompt 21). Same 1st/5th/10th cadence, clears on attest.
    const employmentAttested = new Set(
      (seiEmploymentAttestQ.data ?? []).map((a) => `${a.client_id}:${a.period_label}`),
    );
    for (const clientId of seiActiveQ.data?.activeIds ?? []) {
      for (const p of recentMonthlyPeriods(now, 6)) {
        if (employmentAttested.has(`${clientId}:${p.period_label}`)) continue;
        const due = new Date(`${p.due_date}T23:59:59`);
        out.push({
          key: `sei-emp-upi:${clientId}:${p.period_label}`,
          source: "sei_upi_employment",
          title: `SEI employment data for ${formatPeriodMonthYear(p.period_label)} — confirm entered into UPI (${nameOf(clientId)}).`,
          subject: nameOf(clientId),
          subjectKind: "client",
          dueAt: due,
          status: bucketStatus(due, now),
          href: `/dashboard/clients/${clientId}?tab=care`,
          clientId,
          cadenceReminder: true,
          periodLabel: p.period_label,
        });
      }
    }

    // SEI support-strategies UPI attestation — one-time per PCSP cycle,
    // deadline = 2 weeks after the PCSP update/expiration date (prompt 22).
    const ssUpiAttested = new Map<string, string>();
    for (const a of seiSupportStrategiesAttestQ.data ?? []) {
      if (a.client_id) ssUpiAttested.set(a.client_id, a.attested_at);
    }
    const seiActiveSet = new Set(seiActiveQ.data?.activeIds ?? []);
    for (const c of clientsQ.data ?? []) {
      if (!seiActiveSet.has(c.id) || !c.pcsp_expiration_date) continue;
      const pcspAnchor = new Date(`${c.pcsp_expiration_date}T23:59:59`);
      if (now < pcspAnchor) continue; // new plan year hasn't begun yet
      const attestedAt = ssUpiAttested.get(c.id);
      if (attestedAt && new Date(attestedAt) >= pcspAnchor) continue; // already attested this cycle
      const due = new Date(pcspAnchor.getTime() + 14 * DAY);
      out.push({
        key: `sei-ss-upi:${c.id}`,
        source: "sei_upi_support_strategies",
        title: `Confirm employment support strategies entered into UPI for ${nameOf(c.id)}.`,
        subject: nameOf(c.id),
        subjectKind: "client",
        dueAt: due,
        status: bucketStatus(due, now),
        href: `/dashboard/clients/${c.id}?tab=care`,
        clientId: c.id,
      });
    }

    // Support Strategy coverage gaps (SOW §1.24(5)).
    const dueImmediately = new Date(now.getTime() - DAY);
    for (const [clientId, gaps] of ssCoverageQ.data ?? new Map<string, string[]>()) {
      for (const code of gaps) {
        out.push({
          key: `ss-gap:${clientId}:${code}`,
          source: "support_strategy_gap",
          title: `Support Strategy gap — ${code} not covered for ${nameOf(clientId)}`,
          subject: nameOf(clientId),
          subjectKind: "client",
          dueAt: dueImmediately,
          status: bucketStatus(dueImmediately, now),
          href: `/dashboard/clients/${clientId}?tab=care`,
          clientId,
        });
      }
    }

    // HRC rights-restriction re-review dates.
    for (const r of hrcRestrictionsQ.data ?? []) {
      const due = new Date(`${r.next_review_date}T23:59:59`);
      out.push({
        key: `hrc:${r.id}`,
        source: "hrc_restriction_review",
        title: `Rights restriction re-review due — ${r.restriction_title}`,
        subject: nameOf(r.client_id),
        subjectKind: "client",
        dueAt: due,
        status: bucketStatus(due, now),
        href: `/dashboard/hrc`,
        clientId: r.client_id,
      });
    }

    // Renewal-cadence requirements — surfaced when due_soon or overdue.
    for (const r of renewalReqsQ.data ?? []) {
      const due = computeRequirementDueState(r.metadata, now);
      if (due.state !== "due_soon" && due.state !== "overdue") continue;
      if (!due.dueOn) continue;
      const dueAt = new Date(`${due.dueOn}T23:59:59`);
      out.push({
        key: `req:${r.id}`,
        source: "nectar_requirement",
        title: r.title,
        subject: "Agency",
        subjectKind: "agency",
        dueAt,
        status: due.state === "overdue" ? "overdue" : "due_soon",
        href: "/dashboard/authoritative-sources?tab=requirements",
      });
    }

    // Open event-driven compliance instances.
    for (const inst of complianceInstancesQ.data?.rows ?? []) {
      const title = complianceInstancesQ.data?.titles[inst.requirement_id] ?? "Compliance requirement";
      const due = new Date(inst.deadline_at);
      out.push({
        key: `nci:${inst.id}`,
        source: "compliance_instance",
        title,
        subject: "Agency",
        subjectKind: "agency",
        dueAt: due,
        status: inst.status === "overdue" ? "overdue" : bucketStatus(due, now),
        href: "/dashboard/authoritative-sources?tab=requirements",
        instanceId: inst.id,
      });
    }

    // Org-level licenses & certifications (Provider Licensing Hub).
    if (orgLicenseCodesQ.data && orgLicenseDocsQ.data) {
      const activeCodes = orgLicenseCodesQ.data;
      const docs = orgLicenseDocsQ.data;
      const attest = orgLicenseAttestQ.data ?? {};
      const starts = orgLicenseStartsQ.data;

      const sixMonthsFrom = (dateStr: string) => {
        const d = new Date(`${dateStr}T00:00:00`);
        d.setMonth(d.getMonth() + 6);
        return d;
      };

      const LICENSE_DEFS: Array<{
        docType: string;
        title: string;
        requiredIf: boolean;
        attestKind?: "usor_approved_vendor" | "usor_approved_vendor_job_development";
      }> = [
        { docType: "ol_residential_license", title: "OL Residential Support License", requiredIf: activeCodes.has("RHS") },
        { docType: "ol_residential_certification", title: "OL Residential Support Certification", requiredIf: activeCodes.has("RHS") },
        { docType: "ol_day_treatment_license", title: "OL Day Treatment License", requiredIf: activeCodes.has("DSG") || activeCodes.has("DSP") || activeCodes.has("EPR") },
        { docType: "ol_day_support_certification", title: "OL Day Support Certification", requiredIf: activeCodes.has("DSG") || activeCodes.has("DSP") || activeCodes.has("EPR") },
        { docType: "usor_approved_vendor", title: "USOR Approved Vendor — Job Coaching", requiredIf: activeCodes.has("SEI"), attestKind: "usor_approved_vendor" },
        { docType: "usor_approved_vendor_job_development", title: "USOR Approved Vendor — Job Development", requiredIf: activeCodes.has("SJD"), attestKind: "usor_approved_vendor_job_development" },
      ];

      for (const def of LICENSE_DEFS) {
        if (!def.requiredIf) continue;
        const hasDoc = docs.has(def.docType);
        const effectiveEnd = docs.get(def.docType) ?? null;
        const notAttested = !!def.attestKind && !attest[def.attestKind];

        let due: Date;
        let title: string;
        if (!hasDoc) {
          due = new Date(now.getTime() - DAY);
          title = `${def.title} — document missing`;
        } else if (notAttested) {
          const earliest = def.attestKind === "usor_approved_vendor" ? starts?.get("SEI") : starts?.get("SJD");
          if (def.attestKind === "usor_approved_vendor") {
            due = earliest && earliest < "2026-07-01" ? new Date("2027-01-31T23:59:59")
              : earliest ? sixMonthsFrom(earliest) : new Date("2027-01-31T23:59:59");
          } else {
            due = earliest ? sixMonthsFrom(earliest) : new Date(now.getTime() - DAY);
          }
          title = `${def.title} — attestation required`;
        } else if (effectiveEnd) {
          due = new Date(`${effectiveEnd}T23:59:59`);
          title = `${def.title} expires`;
        } else {
          continue; // on file, no expiration set, nothing to track
        }

        out.push({
          key: `orglic:${def.docType}`,
          source: "org_license",
          title,
          subject: "Agency",
          subjectKind: "agency",
          dueAt: due,
          status: bucketStatusWithin(due, now, 60),
          href: "/dashboard/settings/licensing",
        });
      }
    }

    out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    return out;
  }, [
    orgId,
    summariesQ.data,
    clientsQ.data,
    hhsQ.data,
    hhCertsQ.data,
    hhsDrillsQ.data,
    rhsActiveQ.data,
    rhsDrillsQ.data,
    ppsActiveQ.data,
    ppsDrillsQ.data,
    eprActiveQ.data,
    eprDocsQ.data,
    certsQ.data,
    profilesQ.data,
    incidentsQ.data,
    bcQ.data,
    sowQ.data,
    ssApprovalsQ.data,
    ssCoverageQ.data,
    hrcRestrictionsQ.data,
    renewalReqsQ.data,
    complianceInstancesQ.data,
    seiActiveQ.data,
    seiEmploymentAttestQ.data,
    seiSupportStrategiesAttestQ.data,
    orgLicenseCodesQ.data,
    orgLicenseDocsQ.data,
    orgLicenseAttestQ.data,
    orgLicenseStartsQ.data,
  ]);

  return {
    items,
    overdue: items.filter((i) => i.status === "overdue"),
    dueSoon: items.filter((i) => i.status === "due_soon"),
    upcoming: items.filter((i) => i.status === "upcoming"),
    isLoading:
      summariesQ.isLoading || clientsQ.isLoading || hhsQ.isLoading ||
      certsQ.isLoading || incidentsQ.isLoading || bcQ.isLoading || hhCertsQ.isLoading ||
      rhsActiveQ.isLoading || rhsDrillsQ.isLoading || ppsActiveQ.isLoading || ppsDrillsQ.isLoading ||
      eprActiveQ.isLoading || eprDocsQ.isLoading ||
      sowQ.isLoading || ssCoverageQ.isLoading || hrcRestrictionsQ.isLoading ||
      renewalReqsQ.isLoading || complianceInstancesQ.isLoading ||
      orgLicenseCodesQ.isLoading || orgLicenseDocsQ.isLoading,
  };
}
