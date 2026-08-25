import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { getIncidentOpenClocks } from "@/lib/incident-deadlines";
import {
  ensureCurrentSummaryPeriods,
  listOpenSummaries,
  type ProgressSummaryRow,
} from "@/lib/progress-summaries.functions";
import {
  cadenceDescription,
  listDeadlineObligationInstances,
  type DeadlineObligationItem,
} from "@/lib/company-obligations.functions";

/**
 * Deadlines is the calendar of open clocks. The compliance register
 * (`company_obligations`) is the source of truth for SOW + internal policy.
 * A small operational overlay covers live artifacts the register does not
 * instantiate as calendar periods: progress summaries, incident 24h clocks,
 * and HRC restriction re-reviews.
 */
export type DeadlineSource = "company_obligation" | "summary" | "incident" | "hrc_restriction_review";

export type DeadlineLane = "sow" | "provider" | "operational";

export type DeadlineItem = {
  key: string;
  source: DeadlineSource;
  lane: DeadlineLane;
  title: string;
  subject: string;
  subjectKind: "client" | "staff" | "agency";
  dueAt: Date;
  status: "overdue" | "due_soon" | "upcoming";
  href?: string;
  summary?: ProgressSummaryRow;
  incidentId?: string;
  clientId?: string;
  staffId?: string;
  instanceId?: string;
  /** 1st/5th/10th-of-month reminder cadence — notification bell only. */
  cadenceReminder?: boolean;
  /** company_obligation: SOW vs provider/internal policy. */
  obligationSource?: "sow" | "provider";
  /** company_obligation: cadence sentence from the catalog / due-date engine. */
  cadenceLabel?: string;
  /** company_obligation: P&P citation the admin typed (provider) or SOW section. */
  policySection?: string | null;
  dueAtMissing?: boolean;
  /** Catalog title without period suffix — used when grouping person-level rows. */
  obligationTitle?: string;
  /** Set on grouped staff / staff+client register rows. */
  groupedCount?: number;
  obligationId?: string;
  clientIds?: string[];
  staffIds?: string[];
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

function obligationHref(row: DeadlineObligationItem, isAdminRole: boolean): string {
  if (row.evidence_type === "form" && row.linked_form_id) {
    return `/dashboard/forms/${row.linked_form_id}/fill?obligation_instance=${row.instance_id}`;
  }
  return isAdminRole ? "/dashboard/company-obligations" : "/dashboard/my-obligations";
}

function obligationSubject(row: DeadlineObligationItem): {
  subject: string;
  subjectKind: DeadlineItem["subjectKind"];
} {
  if (row.client_id) {
    return { subject: row.client_name || "Client", subjectKind: "client" };
  }
  if (row.assignee_staff_id) {
    return { subject: row.assignee_staff_name || "Staff member", subjectKind: "staff" };
  }
  return { subject: "Agency", subjectKind: "agency" };
}

function peopleLabel(n: number, kind: "staff" | "client"): string {
  if (kind === "client") return n === 1 ? "1 person" : `${n} people`;
  return n === 1 ? "1 staff" : `${n} staff`;
}

/**
 * Staff-scoped register duties stay as one calendar row (the duty), not
 * one row per person. Johnny's CPR still lives on the CPR obligation card;
 * Deadlines only shows that CPR is due / overdue and how many people.
 * Org-scoped duties and live clocks (summaries, incidents, HRC) stay as
 * individual rows.
 */
export function groupRegisterDutyRows(items: DeadlineItem[]): DeadlineItem[] {
  const standalone: DeadlineItem[] = [];
  const groups = new Map<string, DeadlineItem[]>();

  for (const item of items) {
    if (item.source !== "company_obligation" || !item.obligationId) {
      standalone.push(item);
      continue;
    }
    if (item.subjectKind === "agency") {
      standalone.push(item);
      continue;
    }
    const key = `${item.obligationId}:${item.status}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const grouped: DeadlineItem[] = [];
  for (const [key, rows] of groups) {
    const first = rows[0];
    if (!first) continue;
    const earliest = [...rows].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0] ?? first;
    const staffIds = Array.from(new Set(rows.map((r) => r.staffId).filter((id): id is string => !!id)));
    const clientIds = Array.from(new Set(rows.map((r) => r.clientId).filter((id): id is string => !!id)));
    const kind: "staff" | "client" = first.subjectKind === "client" ? "client" : "staff";
    const count =
      kind === "client" ? Math.max(clientIds.length, rows.length) : Math.max(staffIds.length, rows.length);
    grouped.push({
      ...earliest,
      key: `company_obligation_group_${key}`,
      title: first.obligationTitle ?? earliest.title,
      subject: peopleLabel(count, kind),
      subjectKind: kind === "client" ? "client" : "staff",
      href: "/dashboard/company-obligations",
      instanceId: undefined,
      clientId: undefined,
      staffId: undefined,
      groupedCount: count,
      clientIds,
      staffIds,
    });
  }

  return [...standalone, ...grouped].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export function useDeadlines() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const isAdminRole =
    org?.role === "admin" ||
    org?.role === "program_manager" ||
    org?.role === "manager" ||
    org?.role === "super_admin";
  const ensureFn = useServerFn(ensureCurrentSummaryPeriods);
  const listSummariesFn = useServerFn(listOpenSummaries);
  const listObligationDeadlinesFn = useServerFn(listDeadlineObligationInstances);

  const obligationsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["deadlines", "company_obligations", orgId, isAdminRole],
    queryFn: () => listObligationDeadlinesFn({ data: { organizationId: orgId! } }),
  });

  const summariesQ = useQuery({
    enabled: !!orgId && isAdminRole,
    queryKey: ["deadlines", "summaries", orgId],
    queryFn: async () => {
      await ensureFn({ data: { organizationId: orgId! } });
      return listSummariesFn({ data: { organizationId: orgId! } });
    },
  });

  const clientsQ = useQuery({
    enabled: !!orgId && isAdminRole,
    queryKey: ["deadlines", "clients", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>;
    },
  });

  const incidentsQ = useQuery({
    enabled: !!orgId && isAdminRole,
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
        id: string;
        report_number: string;
        client_id: string;
        discovered_at: string;
        upi_submitted_at: string | null;
        status: string;
      }>;
    },
  });

  const hrcRestrictionsQ = useQuery({
    enabled: !!orgId && isAdminRole,
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
        id: string;
        client_id: string;
        restriction_title: string;
        next_review_date: string;
        active: boolean;
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

    for (const row of obligationsQ.data ?? []) {
      const dueAtMissing = !row.due_at;
      const due = dueAtMissing ? new Date(now.getTime() + 100 * 365 * DAY) : new Date(row.due_at);
      const { subject, subjectKind } = obligationSubject(row);
      const cadenceLabel = cadenceDescription({
        title: row.catalog_title,
        cadence: row.cadence,
        due_day_config: row.due_day_config,
      });
      out.push({
        key: `company_obligation_${row.instance_id}`,
        source: "company_obligation",
        lane: row.source === "sow" ? "sow" : "provider",
        title: row.period_key ? `${row.title} — ${row.period_key}` : row.title,
        subject,
        subjectKind,
        dueAt: due,
        status: dueAtMissing
          ? "upcoming"
          : row.status === "overdue"
            ? "overdue"
            : bucketStatus(due, now),
        href: obligationHref(row, isAdminRole),
        instanceId: row.instance_id,
        clientId: row.client_id ?? undefined,
        staffId: row.assignee_staff_id ?? undefined,
        obligationSource: row.source,
        cadenceLabel,
        policySection: row.source_policy_section,
        dueAtMissing,
        obligationId: row.obligation_id,
        obligationTitle: row.catalog_title,
      });
    }

    if (isAdminRole) {
      for (const s of summariesQ.data ?? []) {
        const due = new Date(`${s.due_date}T23:59:59`);
        const clientName = nameOf(s.client_id);
        const isSei = s.period_kind === "monthly" && s.service_codes?.includes("SEI");
        const isCmpCms =
          s.period_kind === "monthly" && s.service_codes?.some((c) => c === "CMP" || c === "CMS");
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
          lane: "operational",
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

      for (const inc of incidentsQ.data ?? []) {
        const clocks = getIncidentOpenClocks(inc);
        for (const clock of clocks) {
          out.push({
            key: `inc:${inc.id}:${clock.kind}`,
            source: "incident",
            lane: "operational",
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

      for (const r of hrcRestrictionsQ.data ?? []) {
        const due = new Date(`${r.next_review_date}T23:59:59`);
        out.push({
          key: `hrc:${r.id}`,
          source: "hrc_restriction_review",
          lane: "operational",
          title: `Rights restriction re-review due — ${r.restriction_title}`,
          subject: nameOf(r.client_id),
          subjectKind: "client",
          dueAt: due,
          status: bucketStatus(due, now),
          href: `/dashboard/hrc`,
          clientId: r.client_id,
        });
      }
    }

    out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    return out;
  }, [
    orgId,
    isAdminRole,
    obligationsQ.data,
    summariesQ.data,
    clientsQ.data,
    incidentsQ.data,
    hrcRestrictionsQ.data,
  ]);

  const calendar = useMemo(() => groupRegisterDutyRows(items), [items]);

  return {
    items,
    overdue: calendar.filter((i) => i.status === "overdue"),
    dueSoon: calendar.filter((i) => i.status === "due_soon"),
    upcoming: calendar.filter((i) => i.status === "upcoming"),
    isLoading:
      obligationsQ.isLoading ||
      (isAdminRole &&
        (summariesQ.isLoading || clientsQ.isLoading || incidentsQ.isLoading || hrcRestrictionsQ.isLoading)),
  };
}
