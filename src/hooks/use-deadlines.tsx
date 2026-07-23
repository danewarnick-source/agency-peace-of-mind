import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { getIncidentOpenClocks } from "@/lib/incident-deadlines";
import { computeDeadlines } from "@/lib/bc-deadlines";
import {
  ensureCurrentSummaryPeriods,
  listOpenSummaries,
  type ProgressSummaryRow,
} from "@/lib/progress-summaries.functions";
import { computeSowAlerts } from "@/lib/sow-perimeters.functions";
import { computeSupportStrategyCoverage } from "@/lib/support-strategy-coverage";
import type { CSTSection } from "@/lib/client-specific-training.functions";

export type DeadlineSource =
  | "summary"
  | "host_home_cert"
  | "staff_cert"
  | "incident"
  | "billing_code"
  | "sow_perimeter"
  | "pcsp_support_strategies"
  | "support_strategy_gap"
  | "hrc_restriction_review";

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
};

const DAY = 86_400_000;

function bucketStatus(due: Date, now: Date): DeadlineItem["status"] {
  const ms = due.getTime() - now.getTime();
  if (ms < 0) return "overdue";
  if (ms <= 7 * DAY) return "due_soon";
  return "upcoming";
}

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
        .select("id, first_name, last_name, pcsp_expiration_date")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string; pcsp_expiration_date: string | null }>;
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
      const title = s.period_kind === "quarterly"
        ? `${s.period_label} quarterly summary`
        : `${fmtMonth(s.period_label)} monthly summary`;
      out.push({
        key: `sum:${s.id}`,
        source: "summary",
        title,
        subject: nameOf(s.client_id),
        subjectKind: "client",
        dueAt: due,
        status: bucketStatus(due, now),
        href: `/dashboard/summaries?open=${s.id}`,
        summary: s,
        clientId: s.client_id,
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

    out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    return out;
  }, [
    orgId,
    summariesQ.data,
    clientsQ.data,
    hhsQ.data,
    hhCertsQ.data,
    certsQ.data,
    profilesQ.data,
    incidentsQ.data,
    bcQ.data,
    sowQ.data,
    ssApprovalsQ.data,
    ssCoverageQ.data,
    hrcRestrictionsQ.data,
  ]);

  return {
    items,
    overdue: items.filter((i) => i.status === "overdue"),
    dueSoon: items.filter((i) => i.status === "due_soon"),
    upcoming: items.filter((i) => i.status === "upcoming"),
    isLoading:
      summariesQ.isLoading || clientsQ.isLoading || hhsQ.isLoading ||
      certsQ.isLoading || incidentsQ.isLoading || bcQ.isLoading || hhCertsQ.isLoading ||
      sowQ.isLoading || ssCoverageQ.isLoading || hrcRestrictionsQ.isLoading,
  };
}
