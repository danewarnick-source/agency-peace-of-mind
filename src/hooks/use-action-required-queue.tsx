/**
 * Slim urgent queue for Compliance → Action Required.
 * Does NOT use nectar_requirements / nectar_compliance_instances / nectar_compliance_rules.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { getIncidentOpenClocks } from "@/lib/incident-deadlines";
import { stableActionRequiredCount } from "@/lib/action-required-count";
import {
  listCompanyObligations,
  type ObligationListItem,
} from "@/lib/company-obligations.functions";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type ActionRequiredCategory =
  | "overdue_obligations"
  | "due_soon_obligations"
  | "incidents"
  | "shift_docs"
  | "staff_hr";

export type ActionRequiredTone = "red" | "amber" | "blue";

export type ActionRequiredItem = {
  key: string;
  category: ActionRequiredCategory;
  tone: ActionRequiredTone;
  title: string;
  subject: string;
  dueLabel: string;
  /** Sort key — earlier first within a category */
  sortAt: number;
  /** Obligation row when category is obligation-related */
  obligation?: ObligationListItem;
  /** Primary action kind for the row button */
  action:
    | { kind: "obligation"; obligationId: string }
    | { kind: "incident"; incidentId: string; clientId: string | null }
    | { kind: "review_timesheet"; timesheetId: string }
    | { kind: "notify_attest"; timesheetId: string; staffId: string; staffName: string }
    | { kind: "hrc"; restrictionId: string }
    | { kind: "hire_dates" };
};

export type ActionRequiredSection = {
  id: ActionRequiredCategory;
  label: string;
  items: ActionRequiredItem[];
};

function isDueWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false;
  const due = new Date(iso).getTime();
  const now = Date.now();
  return due >= now && due <= now + days * DAY;
}

function fmtCountdown(deadline: Date, now: Date): string {
  const ms = deadline.getTime() - now.getTime();
  if (ms < 0) {
    const abs = Math.abs(ms);
    if (abs < DAY) {
      const h = Math.max(1, Math.round(abs / HOUR));
      return `${h}h overdue`;
    }
    const d = Math.max(1, Math.round(abs / DAY));
    return `${d}d overdue`;
  }
  if (ms < DAY) {
    const h = Math.max(1, Math.round(ms / HOUR));
    return `due in ${h}h`;
  }
  const d = Math.round(ms / DAY);
  if (d === 0) return "due today";
  if (d === 1) return "due tomorrow";
  return `due in ${d}d`;
}

function clientName(
  clients: Array<{ id: string; first_name: string; last_name: string }>,
  id: string,
): string {
  const c = clients.find((x) => x.id === id);
  return c ? `${c.first_name} ${c.last_name}` : "Unknown client";
}

/** Shared query key so the sidebar badge and Action Required tab stay in sync. */
export function actionRequiredQueryKey(orgId: string) {
  return ["action-required-queue", orgId] as const;
}

export function useActionRequiredQueue(
  orgIdOverride?: string | null,
  opts?: { enabled?: boolean },
) {
  const { data: org } = useCurrentOrg();
  const orgId = orgIdOverride ?? org?.organization_id ?? null;
  const enabled = (opts?.enabled ?? true) && !!orgId;
  const listFn = useServerFn(listCompanyObligations);

  const obligationsQ = useQuery({
    enabled,
    queryKey: ["company-obligations", orgId],
    queryFn: async () => {
      try {
        return await listFn({ data: { organizationId: orgId! } });
      } catch (e) {
        console.error("[action-required] obligations list failed", e);
        return [];
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const clientsQ = useQuery({
    enabled,
    queryKey: [...actionRequiredQueryKey(orgId!), "clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>;
    },
    staleTime: 60_000,
  });

  const incidentsQ = useQuery({
    enabled,
    queryKey: [...actionRequiredQueryKey(orgId!), "incidents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_reports")
        .select(
          "id, report_number, client_id, discovered_at, state_submitted_at, status, created_at, submitted_at",
        )
        .eq("organization_id", orgId!)
        .not("discovered_at", "is", null)
        .neq("status", "State_Confirmed")
        .order("discovered_at", { ascending: false })
        .limit(100);
      if (error) {
        console.error("[action-required] incidents query failed", error);
        return [];
      }
      return (data ?? []) as Array<{
        id: string;
        report_number: string;
        client_id: string;
        discovered_at: string;
        state_submitted_at: string | null;
        status: string;
        created_at: string;
        submitted_at: string | null;
      }>;
    },
    staleTime: 30_000,
  });

  const flaggedQ = useQuery({
    enabled,
    queryKey: [...actionRequiredQueryKey(orgId!), "flagged"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * DAY).toISOString();
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("id, staff_id, client_id, clock_in_timestamp, created_at, ai_compliance_status")
        .eq("organization_id", orgId!)
        .ilike("ai_compliance_status", "flagged")
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("[action-required] flagged query failed", error);
        return [];
      }
      return (data ?? []) as Array<{
        id: string;
        staff_id: string;
        client_id: string | null;
        clock_in_timestamp: string | null;
        created_at: string;
        ai_compliance_status: string | null;
      }>;
    },
    staleTime: 30_000,
  });

  const missingAttestQ = useQuery({
    enabled,
    queryKey: [...actionRequiredQueryKey(orgId!), "missing-attest"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * DAY).toISOString();
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("id, staff_id, client_id, clock_out_timestamp, created_at")
        .eq("organization_id", orgId!)
        .is("attested_at", null)
        .not("clock_out_timestamp", "is", null)
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        staff_id: string;
        client_id: string | null;
        clock_out_timestamp: string;
        created_at: string;
      }>;
    },
    staleTime: 30_000,
  });

  const hrcQ = useQuery({
    enabled,
    queryKey: [...actionRequiredQueryKey(orgId!), "hrc"],
    queryFn: async () => {
      const cutoff = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("hrc_restriction_records")
        .select("id, client_id, restriction_title, next_review_date, active")
        .eq("organization_id", orgId!)
        .eq("active", true)
        .not("next_review_date", "is", null)
        .lte("next_review_date", cutoff);
      if (error) {
        console.error("[action-required] hrc query failed", error);
        return [];
      }
      return (data ?? []) as Array<{
        id: string;
        client_id: string;
        restriction_title: string;
        next_review_date: string;
        active: boolean;
      }>;
    },
    staleTime: 60_000,
  });

  const hireDatesQ = useQuery({
    enabled,
    queryKey: [...actionRequiredQueryKey(orgId!), "hire-dates"],
    queryFn: async () => {
      const { data: members, error: mErr } = await supabase
        .from("organization_members")
        .select("user_id, active")
        .eq("organization_id", orgId!);
      if (mErr) throw mErr;
      const userIds = (members ?? [])
        .filter((m: { active: boolean | null }) => m.active !== false)
        .map((m: { user_id: string }) => m.user_id);
      if (!userIds.length) return { missing: 0 };
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, hire_date, start_date")
        .in("id", userIds);
      if (pErr) throw pErr;
      const missing = (profiles ?? []).filter(
        (p: { hire_date: string | null; start_date: string | null }) =>
          !p.hire_date && !p.start_date,
      ).length;
      return { missing };
    },
    staleTime: 60_000,
  });

  const staffIdsNeedingNames = useMemo(() => {
    const ids = new Set<string>();
    for (const r of flaggedQ.data ?? []) ids.add(r.staff_id);
    for (const r of missingAttestQ.data ?? []) ids.add(r.staff_id);
    return Array.from(ids);
  }, [flaggedQ.data, missingAttestQ.data]);

  const staffNamesQ = useQuery({
    enabled: enabled && staffIdsNeedingNames.length > 0,
    queryKey: [...actionRequiredQueryKey(orgId!), "staff-names", staffIdsNeedingNames.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_directory")
        .select("id, full_name")
        .in("id", staffIdsNeedingNames);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
        map.set(r.id, r.full_name ?? "Staff member");
      }
      return map;
    },
    staleTime: 60_000,
  });

  const { items, sections, totalCount, checkedAt } = useMemo(() => {
    const now = new Date();
    const clients = clientsQ.data ?? [];
    const staffNames = staffNamesQ.data ?? new Map<string, string>();
    const out: ActionRequiredItem[] = [];

    for (const o of obligationsQ.data ?? []) {
      if (!o.active) continue;
      if (o.rollup.overdue_count > 0) {
        const n = o.rollup.overdue_count;
        out.push({
          key: `ob-overdue:${o.id}`,
          category: "overdue_obligations",
          tone: "red",
          title: o.title,
          subject: `${n} overdue assignee${n === 1 ? "" : "s"}`,
          dueLabel: o.rollup.next_due_at
            ? fmtCountdown(new Date(o.rollup.next_due_at), now)
            : "overdue",
          sortAt: o.rollup.next_due_at
            ? new Date(o.rollup.next_due_at).getTime()
            : now.getTime() - 365 * DAY,
          obligation: o,
          action: { kind: "obligation", obligationId: o.id },
        });
      } else if (
        o.rollup.pending_count > 0 &&
        isDueWithinDays(o.rollup.next_due_at, 14)
      ) {
        const n = o.rollup.pending_count;
        out.push({
          key: `ob-soon:${o.id}`,
          category: "due_soon_obligations",
          tone: "amber",
          title: o.title,
          subject: `${n} open assignee${n === 1 ? "" : "s"}`,
          dueLabel: o.rollup.next_due_at
            ? fmtCountdown(new Date(o.rollup.next_due_at), now)
            : "due soon",
          sortAt: o.rollup.next_due_at
            ? new Date(o.rollup.next_due_at).getTime()
            : now.getTime() + 14 * DAY,
          obligation: o,
          action: { kind: "obligation", obligationId: o.id },
        });
      }
    }

    for (const inc of incidentsQ.data ?? []) {
      const clocks = getIncidentOpenClocks({
        discovered_at: inc.discovered_at,
        upi_submitted_at: inc.state_submitted_at,
      });
      for (const clock of clocks) {
        out.push({
          key: `inc:${inc.id}:${clock.kind}`,
          category: "incidents",
          tone: clock.deadline.getTime() < now.getTime() ? "red" : "amber",
          title:
            clock.kind === "upi_submission"
              ? `UPI submission — Incident ${inc.report_number}`
              : clock.label,
          subject: clientName(clients, inc.client_id),
          dueLabel:
            clock.deadline.getTime() < now.getTime()
              ? `UPI ${fmtCountdown(clock.deadline, now)}`
              : `UPI ${fmtCountdown(clock.deadline, now)}`,
          sortAt: clock.deadline.getTime(),
          action: {
            kind: "incident",
            incidentId: inc.id,
            clientId: inc.client_id,
          },
        });
      }

      // Written report window: 5 days from discovery when not yet submitted
      // and UPI path may already be done or still open. Spec SOW: written
      // report within 5 days. Use submitted_at as the written-report signal.
      if (!inc.submitted_at && inc.discovered_at) {
        const writtenDeadline = new Date(
          new Date(inc.discovered_at).getTime() + 5 * DAY,
        );
        // Avoid duplicate noise if UPI clock already covers an open incident
        // that is still within the same window and UPI isn't done — still show
        // written report as a distinct duty when past UPI or UPI already filed.
        const upiDone = !!inc.state_submitted_at;
        const showWritten =
          upiDone || writtenDeadline.getTime() - now.getTime() < 5 * DAY;
        if (showWritten) {
          out.push({
            key: `inc-written:${inc.id}`,
            category: "incidents",
            tone: writtenDeadline.getTime() < now.getTime() ? "red" : "amber",
            title: `Written incident report — ${inc.report_number}`,
            subject: clientName(clients, inc.client_id),
            dueLabel: `Written report ${fmtCountdown(writtenDeadline, now)}`,
            sortAt: writtenDeadline.getTime(),
            action: {
              kind: "incident",
              incidentId: inc.id,
              clientId: inc.client_id,
            },
          });
        }
      }
    }

    for (const row of flaggedQ.data ?? []) {
      const name = staffNames.get(row.staff_id) ?? "Staff member";
      const shiftDate = row.clock_in_timestamp
        ? new Date(row.clock_in_timestamp).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })
        : "Unknown date";
      out.push({
        key: `flagged:${row.id}`,
        category: "shift_docs",
        tone: "amber",
        title: "Flagged shift note needs review",
        subject: `${name} · ${shiftDate}`,
        dueLabel: "Review before billing",
        sortAt: new Date(row.created_at).getTime(),
        action: { kind: "review_timesheet", timesheetId: row.id },
      });
    }

    for (const row of missingAttestQ.data ?? []) {
      const name = staffNames.get(row.staff_id) ?? "Staff member";
      out.push({
        key: `attest:${row.id}`,
        category: "shift_docs",
        tone: "amber",
        title: "Shift missing staff attestation",
        subject: name,
        dueLabel: "Attest within 7 days of punch",
        sortAt: new Date(row.clock_out_timestamp).getTime(),
        action: {
          kind: "notify_attest",
          timesheetId: row.id,
          staffId: row.staff_id,
          staffName: name,
        },
      });
    }

    for (const r of hrcQ.data ?? []) {
      const due = new Date(`${r.next_review_date}T23:59:59`);
      const days = Math.ceil((due.getTime() - now.getTime()) / DAY);
      out.push({
        key: `hrc:${r.id}`,
        category: "staff_hr",
        tone: due.getTime() < now.getTime() ? "red" : days <= 7 ? "amber" : "blue",
        title: `HRC review due — ${r.restriction_title}`,
        subject: clientName(clients, r.client_id),
        dueLabel:
          days < 0
            ? `${Math.abs(days)}d overdue`
            : days === 0
              ? "due today"
              : `${days} day${days === 1 ? "" : "s"} until review`,
        sortAt: due.getTime(),
        action: { kind: "hrc", restrictionId: r.id },
      });
    }

    const missingHire = hireDatesQ.data?.missing ?? 0;
    if (missingHire > 0) {
      out.push({
        key: "hire-dates",
        category: "staff_hr",
        tone: "amber",
        title: "Missing hire dates block obligation generation",
        subject: `${missingHire} active staff member${missingHire === 1 ? "" : "s"}`,
        dueLabel: "Set hire dates",
        sortAt: now.getTime(),
        action: { kind: "hire_dates" },
      });
    }

    const sectionDefs: Array<{ id: ActionRequiredCategory; label: string }> = [
      { id: "overdue_obligations", label: "Overdue obligations" },
      { id: "due_soon_obligations", label: "Due this week" },
      { id: "incidents", label: "Incident reports" },
      { id: "shift_docs", label: "Shift documentation" },
      { id: "staff_hr", label: "Staff & HR" },
    ];

    const sections: ActionRequiredSection[] = sectionDefs
      .map((def) => ({
        ...def,
        items: out
          .filter((i) => i.category === def.id)
          .sort((a, b) => a.sortAt - b.sortAt),
      }))
      .filter((s) => s.items.length > 0);

    return {
      items: out,
      sections,
      totalCount: out.length,
      checkedAt: now,
    };
  }, [
    obligationsQ.data,
    clientsQ.data,
    incidentsQ.data,
    flaggedQ.data,
    missingAttestQ.data,
    hrcQ.data,
    hireDatesQ.data,
    staffNamesQ.data,
  ]);

  const isLoading =
    !!orgId &&
    (obligationsQ.isLoading ||
      clientsQ.isLoading ||
      incidentsQ.isLoading ||
      flaggedQ.isLoading ||
      missingAttestQ.isLoading ||
      hrcQ.isLoading ||
      hireDatesQ.isLoading);

  // Badge / tab counts stay 0 until every source has settled. Partial
  // totals (1, then 15) were the Compliance nav flap.
  const settledCount = stableActionRequiredCount(isLoading, totalCount);

  return {
    orgId,
    items,
    sections,
    totalCount: settledCount,
    checkedAt,
    isLoading,
    obligations: (obligationsQ.data ?? []) as ObligationListItem[],
  };
}

/** Lightweight count helper for callers that only need N. */
export function useActionRequiredCount() {
  const { totalCount, isLoading } = useActionRequiredQueue();
  return { count: totalCount, isLoading };
}
