/**
 * Admin Home Dashboard — audit readiness ring, metric tiles, staff / due soon /
 * activity columns, compliance-by-area bars, and clients list.
 *
 * Service-code gating hides non-applicable compliance rows and redistributes
 * audit-score weights so the ring only reflects what this org is responsible for.
 */
import { Suspense, useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlarmClock,
  BarChart3,
  CircleUser,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useDeadlines, type DeadlineItem } from "@/hooks/use-deadlines";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const HIVE_NAVY = "#1C2A5E";
const HIVE_TEAL = "#137182";
const NECTAR_VIOLET = "#6C2BB3";
const RING_TRACK = "#e4e7ef";
const RING_C = 314; // 2π·50
const DOT_GREEN = "#1baf7a";
const DOT_AMBER = "#eda100";
const DOT_RED = "#E24B4A";
const DOT_BLUE = "#137182";

const EVV_CODES = [
  "ACA",
  "CHA",
  "CMP",
  "CMS",
  "COM",
  "HSQ",
  "PAC",
  "RP2",
  "RP3",
  "SLH",
  "SLN",
] as const;
const BEHAVIOR_CODES = ["BC1", "BC2", "BC3"] as const;
const UPI_CODES = ["SEI", "SJD", "CMP", "CMS"] as const;

const WEIGHTS = {
  staff_obligations: 0.25,
  evv: 0.2,
  client_records: 0.15,
  policy: 0.1,
  shift_docs: 0.15,
  incidents: 0.15,
  medication: 0.1,
  behavior: 0.1,
  upi: 0.1,
  hhs: 0.15,
  hrc: 0.1,
} as const;

type WeightKey = keyof typeof WEIGHTS;

function pct(passing: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((100 * passing) / total);
}

function barColor(score: number): string {
  if (score < 60) return DOT_RED;
  if (score < 90) return DOT_AMBER;
  return DOT_GREEN;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function overlaps(active: Set<string>, codes: readonly string[]): boolean {
  return codes.some((c) => active.has(c));
}

function isAuthActive(
  row: {
    authorization_pending: boolean | null;
    service_start_date: string | null;
    service_end_date: string | null;
  },
  today: string,
): boolean {
  if (row.authorization_pending) return false;
  if (row.service_start_date && row.service_start_date > today) return false;
  if (row.service_end_date && row.service_end_date < today) return false;
  return true;
}

function nextBillingWindowLabel(now = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} — ${fmt(end)}`;
}

function weightedScore(
  parts: Array<{ key: WeightKey; score: number; applicable: boolean }>,
): number {
  let wSum = 0;
  let sSum = 0;
  for (const p of parts) {
    if (!p.applicable) continue;
    const w = WEIGHTS[p.key];
    wSum += w;
    sSum += p.score * w;
  }
  if (wSum <= 0) return 100;
  return Math.round(sSum / wSum);
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

function AdminHomeSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-44 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-[280px] rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-[130px] rounded-xl" />
          <Skeleton className="h-[130px] rounded-xl" />
          <Skeleton className="h-[130px] rounded-xl" />
          <Skeleton className="h-[130px] rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "red" | "amber" | "green";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "red" &&
          "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400",
        tone === "amber" &&
          "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
        tone === "green" &&
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
      )}
    >
      {children}
    </span>
  );
}

function ProgressBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, score))}%`, background: color }}
      />
    </div>
  );
}

function AuditRing({ score, areasNeeding }: { score: number; areasNeeding: number }) {
  const clamped = Math.min(100, Math.max(0, score));
  const offset = RING_C * (1 - clamped / 100);
  const status =
    clamped >= 90 ? "Audit ready" : clamped >= 75 ? "Needs attention" : "Action required";
  const sub =
    areasNeeding === 0
      ? "All tracked areas are on track."
      : `${areasNeeding} area${areasNeeding === 1 ? "" : "s"} need attention.`;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-col items-center text-center">
        <div
          className="relative grid h-[140px] w-[140px] place-items-center"
          role="img"
          aria-label={`Audit readiness ${clamped} percent`}
        >
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke={RING_TRACK}
              strokeWidth="10"
            />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke={HIVE_TEAL}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={offset}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div>
              <div
                className="font-display text-3xl font-extrabold tabular-nums leading-none"
                style={{ color: HIVE_TEAL }}
              >
                {clamped}
              </div>
              <div className="mt-0.5 text-xs font-semibold text-muted-foreground">%</div>
            </div>
          </div>
        </div>
        <div className="mt-3 text-sm font-semibold text-foreground">{status}</div>
        <p className="mt-1 max-w-[28ch] text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

type AreaRow =
  | {
      key: WeightKey;
      label: string;
      kind: "bar";
      score: number;
      applicable: boolean;
    }
  | {
      key: WeightKey;
      label: string;
      kind: "message";
      message: string;
      tone: "muted" | "green";
      applicable: boolean;
      score: number;
    };

function AdminHomeDashboardInner() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const orgName = org?.organization_name ?? "Your agency";

  const { overdue, dueSoon, upcoming, isLoading: deadlinesLoading } = useDeadlines();

  const profileQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["admin-home-dash-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("id", user!.id)
        .maybeSingle();
      return data?.first_name?.trim() || null;
    },
  });

  const obligationInstancesQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-obligation-instances", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_obligation_instances")
        .select("id, status, assignee_staff_id, obligation_id, due_at")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        status: string;
        assignee_staff_id: string | null;
        obligation_id: string;
        due_at: string | null;
      }>;
    },
    staleTime: 30_000,
  });

  const obligationAssigneesQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-obligation-assignees", orgId],
    queryFn: async () => {
      const { data: members, error: mErr } = await supabase
        .from("organization_members")
        .select("user_id, role, active")
        .eq("organization_id", orgId!)
        .eq("active", true);
      if (mErr) throw mErr;
      const rows = (members ?? []) as Array<{ user_id: string; role: string; active: boolean }>;
      const ids = rows.map((r) => r.user_id);
      if (!ids.length) {
        return {
          members: [] as Array<{ id: string; name: string; role: string }>,
          assigneeRows: [] as Array<{ instance_id: string; staff_id: string }>,
        };
      }

      const { data: dir, error: dErr } = await supabase
        .from("org_member_directory")
        .select("id, full_name")
        .in("id", ids);
      if (dErr) throw dErr;
      const names = new Map(
        ((dir ?? []) as Array<{ id: string; full_name: string | null }>).map((d) => [
          d.id,
          d.full_name?.trim() || "Unknown",
        ]),
      );

      const { data: assignees } = await supabase
        .from("company_obligation_instance_assignees")
        .select("instance_id, staff_id")
        .eq("organization_id", orgId!);
      const assigneeRows = (assignees ?? []) as Array<{ instance_id: string; staff_id: string }>;

      return {
        members: rows.map((r) => ({
          id: r.user_id,
          name: names.get(r.user_id) ?? "Unknown",
          role: r.role,
        })),
        assigneeRows,
      };
    },
    staleTime: 30_000,
  });

  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-clients", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, intake_status, account_status")
        .eq("organization_id", orgId!)
        .neq("account_status", "archived")
        .order("last_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        first_name: string;
        last_name: string;
        intake_status: string | null;
        account_status: string | null;
      }>;
    },
    staleTime: 30_000,
  });

  const billingCodesQ = useQuery({
    enabled: !!orgId && !!clientsQ.data,
    queryKey: ["admin-home-billing-codes", orgId, clientsQ.data?.map((c) => c.id).join(",")],
    queryFn: async () => {
      const clientIds = (clientsQ.data ?? []).map((c) => c.id);
      if (!clientIds.length) return [] as Array<{
        client_id: string;
        service_code: string;
        authorization_pending: boolean | null;
        service_start_date: string | null;
        service_end_date: string | null;
      }>;
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select(
          "client_id, service_code, authorization_pending, service_start_date, service_end_date",
        )
        .eq("organization_id", orgId!)
        .in("client_id", clientIds);
      if (error) throw error;
      return (data ?? []) as Array<{
        client_id: string;
        service_code: string;
        authorization_pending: boolean | null;
        service_start_date: string | null;
        service_end_date: string | null;
      }>;
    },
    staleTime: 60_000,
  });

  const since30 = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, []);
  const since7 = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, []);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const evvQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-evv-30d", orgId, since30],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(
          "id, shift_note_text, attested_at, ai_compliance_status, clock_out_timestamp, created_at",
        )
        .eq("organization_id", orgId!)
        .not("clock_out_timestamp", "is", null)
        .gte("created_at", since30);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        shift_note_text: string | null;
        attested_at: string | null;
        ai_compliance_status: string | null;
        clock_out_timestamp: string | null;
        created_at: string;
      }>;
    },
    staleTime: 30_000,
  });

  const policyQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-policy-ack", orgId],
    queryFn: async () => {
      const { data: docs, error: dErr } = await supabase
        .from("nectar_documents")
        .select("id, requires_acknowledgment, is_current, status")
        .eq("organization_id", orgId!);
      if (dErr) throw dErr;
      const activeDocs = (
        (docs ?? []) as Array<{
          id: string;
          requires_acknowledgment: boolean | null;
          is_current: boolean | null;
          status: string | null;
        }>
      ).filter(
        (d) =>
          !!d.requires_acknowledgment && (d.is_current || d.status === "current"),
      );
      const docIds = activeDocs.map((d) => d.id);

      const { data: members, error: mErr } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId!)
        .eq("active", true);
      if (mErr) throw mErr;
      const staffIds = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);

      if (!docIds.length || !staffIds.length) {
        return { signed: 0, total: 0 };
      }

      const { data: sigs, error: sErr } = await supabase
        .from("policy_signatures")
        .select("document_id, user_id, is_current")
        .in("document_id", docIds)
        .eq("is_current", true)
        .in("user_id", staffIds);
      if (sErr) throw sErr;
      const signed = ((sigs ?? []) as Array<{ document_id: string; user_id: string }>).length;
      return { signed, total: docIds.length * staffIds.length };
    },
    staleTime: 60_000,
  });

  const dailyLogsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-daily-logs-30d", orgId, since30],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_logs")
        .select("id, status, log_date, submitted_at, created_at")
        .eq("organization_id", orgId!)
        .gte("log_date", since30.slice(0, 10));
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        status: string;
        log_date: string;
        submitted_at: string | null;
        created_at: string;
      }>;
    },
    staleTime: 30_000,
  });

  const incidentsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-incidents-30d", orgId, since30],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_reports")
        .select("id, status, report_number, created_at, updated_at")
        .eq("organization_id", orgId!)
        .gte("created_at", since30);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        status: string;
        report_number: string | null;
        created_at: string;
        updated_at: string | null;
      }>;
    },
    staleTime: 30_000,
  });

  const emarQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-emar-30d", orgId, since30],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emar_logs")
        .select("id, status, signature_attestation, administered_at")
        .eq("organization_id", orgId!)
        .gte("created_at", since30);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        status: string;
        signature_attestation: string | null;
        administered_at: string | null;
      }>;
    },
    staleTime: 60_000,
  });

  const hrcQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-hrc-active", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hrc_restriction_records")
        .select("id, client_id, active, next_review_date")
        .eq("organization_id", orgId!)
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        client_id: string;
        active: boolean;
        next_review_date: string | null;
      }>;
    },
    staleTime: 60_000,
  });

  const activityEvvQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-activity-evv", orgId, since7],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(
          "id, clock_in_timestamp, clock_out_timestamp, ai_compliance_status, shift_note_text, client_id, staff_id, clients:client_id(first_name, last_name)",
        )
        .eq("organization_id", orgId!)
        .gte("clock_in_timestamp", since7)
        .order("clock_in_timestamp", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        clock_in_timestamp: string;
        clock_out_timestamp: string | null;
        ai_compliance_status: string | null;
        shift_note_text: string | null;
        client_id: string;
        staff_id: string;
        clients: { first_name: string; last_name: string } | null;
      }>;
    },
    staleTime: 30_000,
  });

  const behaviorQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-behavior-30d", orgId, since30],
    queryFn: async () => {
      const { data: entries } = await supabase
        .from("bc_data_entries")
        .select("id, note, staff_user_id")
        .eq("organization_id", orgId!)
        .gte("occurred_at", since30);
      const entryRows = (entries ?? []) as Array<{
        note: string | null;
        staff_user_id: string | null;
      }>;
      const entryPass = entryRows.filter(
        (r) => (r.note ?? "").trim().length >= 20 && !!r.staff_user_id,
      ).length;
      const { data: reviews } = await supabase
        .from("bc_review_notes")
        .select("id, body")
        .eq("organization_id", orgId!)
        .gte("created_at", since30);
      const reviewRows = (reviews ?? []) as Array<{ body: string | null }>;
      const reviewPass = reviewRows.filter((r) => (r.body ?? "").trim().length >= 50).length;
      return {
        passing: entryPass + reviewPass,
        total: entryRows.length + reviewRows.length,
      };
    },
    staleTime: 60_000,
  });

  const upiQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-upi", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("upi_attestations")
        .select("client_id, period_label")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Array<{ client_id: string; period_label: string }>;
    },
    staleTime: 60_000,
  });

  const hhsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-hhs-docs", orgId],
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthIso = monthStart.toISOString().slice(0, 10);
      const { data: attendance } = await supabase
        .from("hhs_monthly_attendance")
        .select("staff_initials_signature, attestation_accepted")
        .eq("organization_id", orgId!)
        .gte("record_date", monthIso);
      const attRows = (attendance ?? []) as Array<{
        staff_initials_signature: string | null;
        attestation_accepted: boolean | null;
      }>;
      const attPass = attRows.filter(
        (r) => !!r.staff_initials_signature && !!r.attestation_accepted,
      ).length;
      return { passing: attPass, total: attRows.length };
    },
    staleTime: 60_000,
  });

  const loading =
    !orgId ||
    profileQ.isLoading ||
    obligationInstancesQ.isLoading ||
    obligationAssigneesQ.isLoading ||
    clientsQ.isLoading ||
    billingCodesQ.isLoading ||
    evvQ.isLoading ||
    policyQ.isLoading ||
    dailyLogsQ.isLoading ||
    incidentsQ.isLoading ||
    emarQ.isLoading ||
    hrcQ.isLoading ||
    activityEvvQ.isLoading ||
    behaviorQ.isLoading ||
    upiQ.isLoading ||
    hhsQ.isLoading ||
    deadlinesLoading;

  const instances = obligationInstancesQ.data ?? [];
  const members = obligationAssigneesQ.data?.members ?? [];
  const assigneeRows = obligationAssigneesQ.data?.assigneeRows ?? [];
  const clients = clientsQ.data ?? [];
  const billingCodes = billingCodesQ.data ?? [];

  const activeCodes = useMemo(() => {
    const set = new Set<string>();
    for (const row of billingCodes) {
      if (!isAuthActive(row, today)) continue;
      const code = (row.service_code ?? "").toUpperCase();
      if (code) set.add(code);
    }
    return set;
  }, [billingCodes, today]);

  const hasEvv = overlaps(activeCodes, EVV_CODES);
  const hasBehavior = overlaps(activeCodes, BEHAVIOR_CODES);
  const hasUpi = overlaps(activeCodes, UPI_CODES);
  const hasHhs = activeCodes.has("HHS");

  const staffMetrics = useMemo(() => {
    const overdueByStaff = new Map<string, number>();
    const pendingByStaff = new Map<string, number>();
    const assigneesByInstance = new Map<string, string[]>();
    for (const a of assigneeRows) {
      const arr = assigneesByInstance.get(a.instance_id) ?? [];
      arr.push(a.staff_id);
      assigneesByInstance.set(a.instance_id, arr);
    }

    for (const inst of instances) {
      const staffIds = new Set<string>();
      if (inst.assignee_staff_id) staffIds.add(inst.assignee_staff_id);
      for (const sid of assigneesByInstance.get(inst.id) ?? []) staffIds.add(sid);

      for (const sid of staffIds) {
        if (inst.status === "overdue") {
          overdueByStaff.set(sid, (overdueByStaff.get(sid) ?? 0) + 1);
        } else if (inst.status === "pending") {
          pendingByStaff.set(sid, (pendingByStaff.get(sid) ?? 0) + 1);
        }
      }
    }

    const staffWithOverdue = [...overdueByStaff.values()].filter((n) => n > 0).length;
    const overdueInstances = instances.filter((i) => i.status === "overdue").length;
    const completed = instances.filter(
      (i) => i.status === "completed" || i.status === "waived",
    ).length;

    return {
      staffWithOverdue,
      overdueInstances,
      completed,
      total: instances.length,
      overdueByStaff,
      pendingByStaff,
      obligationScore: pct(completed, instances.length),
    };
  }, [instances, assigneeRows]);

  const evvPassing = useMemo(() => {
    const rows = evvQ.data ?? [];
    const passing = rows.filter((r) => {
      const note = (r.shift_note_text ?? "").trim();
      return note.length > 50 && !!r.attested_at;
    }).length;
    return { passing, total: rows.length, score: pct(passing, rows.length) };
  }, [evvQ.data]);

  const clientComplete = useMemo(() => {
    const total = clients.length;
    const passing = clients.filter((c) => c.intake_status === "complete").length;
    return { passing, total, score: pct(passing, total) };
  }, [clients]);

  const policyRate = useMemo(() => {
    const signed = policyQ.data?.signed ?? 0;
    const total = policyQ.data?.total ?? 0;
    return { signed, total, score: pct(signed, total) };
  }, [policyQ.data]);

  const shiftDocs = useMemo(() => {
    const rows = dailyLogsQ.data ?? [];
    const passing = rows.filter((r) => r.status === "approved").length;
    return { passing, total: rows.length, score: pct(passing, rows.length) };
  }, [dailyLogsQ.data]);

  const incidentStats = useMemo(() => {
    const rows = incidentsQ.data ?? [];
    const passing = rows.filter((r) => {
      const st = (r.status ?? "").toLowerCase();
      return (
        st === "submitted_to_state" ||
        st === "state_confirmed" ||
        st === "submitted" ||
        st === "closed" ||
        st === "upi_filed"
      );
    }).length;
    return { passing, total: rows.length, score: pct(passing, rows.length) };
  }, [incidentsQ.data]);

  const medStats = useMemo(() => {
    const rows = emarQ.data ?? [];
    const passing = rows.filter((r) => {
      const st = (r.status ?? "").toLowerCase();
      const given =
        st === "given" || st === "administered" || st === "self_administered";
      return given && !!r.signature_attestation && !!r.administered_at;
    }).length;
    return { passing, total: rows.length, score: pct(passing, rows.length) };
  }, [emarQ.data]);

  const hrcStats = useMemo(() => {
    const rows = hrcQ.data ?? [];
    if (!rows.length) {
      return { applicable: false as const, score: 100, total: 0, passing: 0 };
    }
    const passing = rows.filter((r) => {
      if (!r.next_review_date) return true;
      return r.next_review_date >= today;
    }).length;
    return {
      applicable: true as const,
      score: pct(passing, rows.length),
      total: rows.length,
      passing,
    };
  }, [hrcQ.data, today]);

  const upiStats = useMemo(() => {
    if (!hasUpi) return { applicable: false, score: 100, passing: 0, total: 0 };
    const upiClients = new Set<string>();
    for (const row of billingCodes) {
      if (!isAuthActive(row, today)) continue;
      const code = (row.service_code ?? "").toUpperCase();
      if (!UPI_CODES.includes(code as (typeof UPI_CODES)[number])) continue;
      upiClients.add(row.client_id);
    }
    const total = upiClients.size;
    if (!total) return { applicable: false, score: 100, passing: 0, total: 0 };
    const currentMonth = today.slice(0, 7);
    const current = new Set<string>();
    for (const a of upiQ.data ?? []) {
      const label = a.period_label ?? "";
      if (label === currentMonth || label.startsWith(currentMonth) || label === "current month") {
        current.add(a.client_id);
      }
    }
    let passing = 0;
    for (const id of upiClients) if (current.has(id)) passing += 1;
    return { applicable: true, score: pct(passing, total), passing, total };
  }, [hasUpi, billingCodes, today, upiQ.data]);

  const behaviorStats = useMemo(() => {
    if (!hasBehavior) return { applicable: false, score: 100, passing: 0, total: 0 };
    const t = behaviorQ.data?.total ?? 0;
    const p = behaviorQ.data?.passing ?? 0;
    return { applicable: true, score: pct(p, t), passing: p, total: t };
  }, [hasBehavior, behaviorQ.data]);

  const hhsStats = useMemo(() => {
    if (!hasHhs) return { applicable: false, score: 100, passing: 0, total: 0 };
    const t = hhsQ.data?.total ?? 0;
    const p = hhsQ.data?.passing ?? 0;
    return { applicable: true, score: pct(p, t), passing: p, total: t };
  }, [hasHhs, hhsQ.data]);

  const areaRows: AreaRow[] = useMemo(() => {
    const rows: AreaRow[] = [];

    rows.push({
      key: "staff_obligations",
      label: "Staff obligations",
      kind: "bar",
      score: staffMetrics.obligationScore,
      applicable: true,
    });

    if (hasEvv) {
      if (evvPassing.total === 0) {
        rows.push({
          key: "evv",
          label: "EVV documentation",
          kind: "message",
          message: "No shifts recorded this month",
          tone: "muted",
          applicable: true,
          score: 100,
        });
      } else {
        rows.push({
          key: "evv",
          label: "EVV documentation",
          kind: "bar",
          score: evvPassing.score,
          applicable: true,
        });
      }
    }

    rows.push({
      key: "client_records",
      label: "Client records",
      kind: "bar",
      score: clientComplete.score,
      applicable: true,
    });

    rows.push({
      key: "policy",
      label: "Policy acknowledgments",
      kind: "bar",
      score: policyRate.score,
      applicable: true,
    });

    rows.push({
      key: "shift_docs",
      label: "Shift documentation",
      kind: "bar",
      score: shiftDocs.score,
      applicable: true,
    });

    if (incidentStats.total === 0) {
      rows.push({
        key: "incidents",
        label: "Incident reports",
        kind: "message",
        message: "No incidents reported this period",
        tone: "green",
        applicable: true,
        score: 100,
      });
    } else {
      rows.push({
        key: "incidents",
        label: "Incident reports",
        kind: "bar",
        score: incidentStats.score,
        applicable: true,
      });
    }

    if (medStats.total > 0) {
      rows.push({
        key: "medication",
        label: "Medication records",
        kind: "bar",
        score: medStats.score,
        applicable: true,
      });
    }

    if (behaviorStats.applicable) {
      rows.push({
        key: "behavior",
        label: "Behavior support",
        kind: "bar",
        score: behaviorStats.score,
        applicable: true,
      });
    }

    if (upiStats.applicable) {
      rows.push({
        key: "upi",
        label: "UPI attestations",
        kind: "bar",
        score: upiStats.score,
        applicable: true,
      });
    }

    if (hhsStats.applicable) {
      rows.push({
        key: "hhs",
        label: "HHS documentation",
        kind: "bar",
        score: hhsStats.score,
        applicable: true,
      });
    }

    if (!hrcStats.applicable || hrcStats.total === 0) {
      rows.push({
        key: "hrc",
        label: "HRC reviews",
        kind: "message",
        message: "No active restrictions — compliant",
        tone: "green",
        applicable: true,
        score: 100,
      });
    } else {
      rows.push({
        key: "hrc",
        label: "HRC reviews",
        kind: "bar",
        score: hrcStats.score,
        applicable: true,
      });
    }

    return rows;
  }, [
    staffMetrics.obligationScore,
    hasEvv,
    evvPassing,
    clientComplete.score,
    policyRate.score,
    shiftDocs.score,
    incidentStats,
    medStats,
    behaviorStats,
    upiStats,
    hhsStats,
    hrcStats,
  ]);

  const auditScore = useMemo(() => {
    const parts: Array<{ key: WeightKey; score: number; applicable: boolean }> = [
      { key: "staff_obligations", score: staffMetrics.obligationScore, applicable: true },
      { key: "evv", score: evvPassing.score, applicable: hasEvv },
      { key: "client_records", score: clientComplete.score, applicable: true },
      { key: "policy", score: policyRate.score, applicable: true },
      { key: "shift_docs", score: shiftDocs.score, applicable: true },
      { key: "incidents", score: incidentStats.score, applicable: true },
      { key: "medication", score: medStats.score, applicable: medStats.total > 0 },
      { key: "behavior", score: behaviorStats.score, applicable: behaviorStats.applicable },
      { key: "upi", score: upiStats.score, applicable: upiStats.applicable },
      { key: "hhs", score: hhsStats.score, applicable: hhsStats.applicable },
      {
        key: "hrc",
        score: hrcStats.score,
        applicable: true, // always contributes (100 when no restrictions)
      },
    ];
    return weightedScore(parts);
  }, [
    staffMetrics.obligationScore,
    evvPassing.score,
    hasEvv,
    clientComplete.score,
    policyRate.score,
    shiftDocs.score,
    incidentStats.score,
    medStats,
    behaviorStats,
    upiStats,
    hhsStats,
    hrcStats,
  ]);

  const areasNeeding = useMemo(
    () =>
      areaRows.filter((r) => {
        if (r.kind === "message" && r.tone === "green") return false;
        if (r.kind === "message" && r.tone === "muted") return false;
        return r.score < 90;
      }).length,
    [areaRows],
  );

  const dueSoonItems = useMemo(() => {
    return [...overdue, ...dueSoon, ...upcoming]
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      .slice(0, 4);
  }, [overdue, dueSoon, upcoming]);

  const activityItems = useMemo(() => {
    type Act = {
      key: string;
      tone: "green" | "amber" | "red" | "blue";
      text: string;
      at: Date;
      to?: "/dashboard/hub/documentation";
      search?: { tab: "incidents"; cc: "urgent" };
    };
    const out: Act[] = [];

    for (const s of activityEvvQ.data ?? []) {
      const client = s.clients
        ? `${s.clients.first_name} ${s.clients.last_name}`
        : "Client";
      const cleared =
        (s.ai_compliance_status ?? "").toLowerCase() === "verified" ||
        (s.ai_compliance_status ?? "").toLowerCase() === "cleared";
      const flagged = (s.ai_compliance_status ?? "").toLowerCase().includes("flag");
      const done = !!s.clock_out_timestamp;
      out.push({
        key: `evv-${s.id}`,
        tone: flagged ? "amber" : cleared || done ? "green" : "blue",
        text: done
          ? `Clock-out · ${client}${cleared ? " · NECTAR cleared" : ""}`
          : `Clock-in · ${client}`,
        at: new Date(s.clock_out_timestamp ?? s.clock_in_timestamp),
      });
    }

    const recentIncidents = [...(incidentsQ.data ?? [])]
      .sort(
        (a, b) =>
          new Date(b.updated_at ?? b.created_at).getTime() -
          new Date(a.updated_at ?? a.created_at).getTime(),
      )
      .slice(0, 3);
    for (const ir of recentIncidents) {
      const st = (ir.status ?? "").toLowerCase();
      const tone: Act["tone"] =
        st.includes("reject") || st.includes("overdue")
          ? "red"
          : st.includes("pending")
            ? "amber"
            : st.includes("confirm") || st.includes("closed") || st.includes("submitted")
              ? "green"
              : "blue";
      out.push({
        key: `ir-${ir.id}`,
        tone,
        text: `Incident ${ir.report_number ?? ""} · ${ir.status.replace(/_/g, " ")}`,
        at: new Date(ir.updated_at ?? ir.created_at),
        to: "/dashboard/hub/documentation",
        search: { tab: "incidents", cc: "urgent" },
      });
    }

    const recentLogs = [...(dailyLogsQ.data ?? [])]
      .sort(
        (a, b) =>
          new Date(b.submitted_at ?? b.created_at).getTime() -
          new Date(a.submitted_at ?? a.created_at).getTime(),
      )
      .slice(0, 3);
    for (const log of recentLogs) {
      const tone: Act["tone"] =
        log.status === "approved"
          ? "green"
          : log.status === "rejected"
            ? "red"
            : "amber";
      out.push({
        key: `dl-${log.id}`,
        tone,
        text: `Daily log · ${log.status.replace(/_/g, " ")} · ${log.log_date}`,
        at: new Date(log.submitted_at ?? log.created_at),
      });
    }

    return out.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 8);
  }, [activityEvvQ.data, incidentsQ.data, dailyLogsQ.data]);

  const clientCodesById = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of billingCodes) {
      if (!isAuthActive(row, today)) continue;
      const code = (row.service_code ?? "").toUpperCase();
      if (!code) continue;
      const arr = map.get(row.client_id) ?? [];
      if (!arr.includes(code)) arr.push(code);
      map.set(row.client_id, arr);
    }
    return map;
  }, [billingCodes, today]);

  if (loading) return <AdminHomeSkeleton />;

  const firstName = profileQ.data || "there";
  const now = new Date();
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const dueDateColor = (item: DeadlineItem) => {
    if (item.status === "overdue") return DOT_RED;
    if (item.status === "due_soon") return DOT_AMBER;
    return undefined;
  };

  const areaGapClass =
    areaRows.length <= 5 ? "space-y-5" : areaRows.length <= 7 ? "space-y-4" : "space-y-3";

  return (
    <div className="space-y-4">
      {/* Section 1 — Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-foreground">
            Good {now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"},{" "}
            {firstName}
          </div>
          <div className="text-sm text-muted-foreground">{dateLine}</div>
        </div>
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium"
          style={{ background: HIVE_NAVY, color: "#fff" }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: HIVE_TEAL }}
            aria-hidden
          />
          {orgName}
        </div>
      </div>

      {/* Section 2 — Hero row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <AuditRing score={auditScore} areasNeeding={areasNeeding} />

        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/dashboard/company-obligations"
            className={cn(
              "cursor-pointer rounded-xl border border-l-4 rounded-l-none bg-card p-4 transition hover:shadow-sm",
              staffMetrics.staffWithOverdue > 0 ? "border-l-rose-500" : "border-l-emerald-500",
            )}
          >
            <div className="text-xs font-medium text-muted-foreground">
              Staff with overdue obligations
            </div>
            <div
              className={cn(
                "mt-1 text-2xl font-bold tabular-nums",
                staffMetrics.staffWithOverdue > 0
                  ? "text-rose-700 dark:text-rose-400"
                  : "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {staffMetrics.staffWithOverdue}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {staffMetrics.overdueInstances} overdue instance
              {staffMetrics.overdueInstances === 1 ? "" : "s"}
            </div>
          </Link>

          {hasEvv ? (
            <Link
              to="/dashboard/compliance-desk"
              className={cn(
                "cursor-pointer rounded-xl border border-l-4 rounded-l-none bg-card p-4 transition hover:shadow-sm",
                evvPassing.score < 90 ? "border-l-amber-500" : "border-l-emerald-500",
              )}
            >
              <div className="text-xs font-medium text-muted-foreground">
                EVV documentation rate
              </div>
              <div
                className={cn(
                  "mt-1 text-2xl font-bold tabular-nums",
                  evvPassing.score < 90
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400",
                )}
              >
                {evvPassing.score}%
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {evvPassing.passing} / {evvPassing.total} shifts · last 30 days
              </div>
            </Link>
          ) : (
            <Link
              to="/dashboard/hub/clients"
              className={cn(
                "cursor-pointer rounded-xl border border-l-4 rounded-l-none bg-card p-4 transition hover:shadow-sm",
                clientComplete.score < 100 ? "border-l-amber-500" : "border-l-emerald-500",
              )}
            >
              <div className="text-xs font-medium text-muted-foreground">
                Clients with complete intake
              </div>
              <div
                className={cn(
                  "mt-1 text-2xl font-bold tabular-nums",
                  clientComplete.score < 100
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400",
                )}
              >
                {clientComplete.passing}/{clientComplete.total}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Active clients</div>
            </Link>
          )}

          {hasEvv && (
            <Link
              to="/dashboard/hub/clients"
              className={cn(
                "cursor-pointer rounded-xl border border-l-4 rounded-l-none bg-card p-4 transition hover:shadow-sm",
                clientComplete.score < 100 ? "border-l-amber-500" : "border-l-emerald-500",
              )}
            >
              <div className="text-xs font-medium text-muted-foreground">
                Clients with complete intake
              </div>
              <div
                className={cn(
                  "mt-1 text-2xl font-bold tabular-nums",
                  clientComplete.score < 100
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400",
                )}
              >
                {clientComplete.passing}/{clientComplete.total}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Active clients</div>
            </Link>
          )}

          <Link
            to="/dashboard/settings"
            className={cn(
              "cursor-pointer rounded-xl border border-l-4 rounded-l-none bg-card p-4 transition hover:shadow-sm",
              policyRate.score < 100 ? "border-l-amber-500" : "border-l-emerald-500",
              !hasEvv && "col-span-1",
            )}
          >
            <div className="text-xs font-medium text-muted-foreground">
              Policy acknowledgment rate
            </div>
            <div
              className={cn(
                "mt-1 text-2xl font-bold tabular-nums",
                policyRate.score < 100
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {policyRate.score}%
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {policyRate.signed} / {policyRate.total} signatures
            </div>
          </Link>
        </div>
      </div>

      {/* Section 3 — Mid row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4" style={{ color: HIVE_TEAL }} />
              Staff status
            </h2>
            <Link
              to="/dashboard/employees"
              className="flex cursor-pointer items-center gap-1 text-xs hover:underline"
              style={{ color: HIVE_TEAL }}
            >
              View all →
            </Link>
          </div>
          <ul>
            {members.slice(0, 8).map((m, idx) => {
              const overdueCount = staffMetrics.overdueByStaff.get(m.id) ?? 0;
              const pendingCount = staffMetrics.pendingByStaff.get(m.id) ?? 0;
              const avatarBg = idx % 2 === 0 ? HIVE_NAVY : NECTAR_VIOLET;
              const roleLabel =
                m.role in ROLE_LABEL ? ROLE_LABEL[m.role as Role] : m.role;
              return (
                <li key={m.id} className="border-b border-border last:border-0">
                  <Link
                    to="/dashboard/employees/$staffId"
                    params={{ staffId: m.id }}
                    className="flex cursor-pointer items-center gap-2.5 py-2.5 transition hover:bg-muted/40"
                  >
                    <span
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                      style={{ background: avatarBg }}
                    >
                      {initials(m.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{m.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{roleLabel}</div>
                    </div>
                    {overdueCount > 0 ? (
                      <StatusBadge tone="red">{overdueCount} overdue</StatusBadge>
                    ) : pendingCount > 0 ? (
                      <StatusBadge tone="amber">{pendingCount} pending</StatusBadge>
                    ) : (
                      <StatusBadge tone="green">Current</StatusBadge>
                    )}
                  </Link>
                </li>
              );
            })}
            {members.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground">No active staff yet.</li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlarmClock className="h-4 w-4" style={{ color: HIVE_TEAL }} />
              Due soon
            </h2>
            <Link
              to="/dashboard/company-obligations"
              search={{ tab: "action-required" }}
              className="flex cursor-pointer items-center gap-1 text-xs hover:underline"
              style={{ color: HIVE_TEAL }}
            >
              Action required →
            </Link>
          </div>
          <ul>
            {dueSoonItems.map((item) => {
              const color = dueDateColor(item);
              const href = item.href ?? "/dashboard/company-obligations";
              const [path, qs] = href.split("?");
              const search = qs
                ? Object.fromEntries(new URLSearchParams(qs).entries())
                : undefined;
              return (
                <li key={item.key} className="border-b border-border last:border-0">
                  <Link
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    to={path as any}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    search={search as any}
                    className="flex cursor-pointer items-start justify-between gap-3 py-2.5 transition hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {item.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.policySection ||
                          item.cadenceLabel ||
                          item.dutyTitle ||
                          item.source.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div
                      className="shrink-0 text-xs font-semibold tabular-nums"
                      style={color ? { color } : undefined}
                    >
                      {item.dueAtMissing
                        ? "—"
                        : item.dueAt.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                    </div>
                  </Link>
                </li>
              );
            })}
            {dueSoonItems.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground">Nothing due soon.</li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Activity className="h-4 w-4" style={{ color: HIVE_TEAL }} />
              Recent activity
            </h2>
          </div>
          <ul>
            {activityItems.map((a) => {
              const dot =
                a.tone === "green"
                  ? DOT_GREEN
                  : a.tone === "amber"
                    ? DOT_AMBER
                    : a.tone === "red"
                      ? DOT_RED
                      : DOT_BLUE;
              const body = (
                <>
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: dot }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground">{a.text}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.at.toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </>
              );
              return (
                <li
                  key={a.key}
                  className="border-b border-border last:border-0"
                >
                  {a.to ? (
                    <Link
                      to={a.to}
                      search={a.search}
                      className="flex cursor-pointer items-start gap-2.5 py-2.5 transition hover:bg-muted/40"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-2.5 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
            {activityItems.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground">No recent activity.</li>
            )}
          </ul>
        </div>
      </div>

      {/* Section 4 — Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BarChart3 className="h-4 w-4" style={{ color: HIVE_TEAL }} />
              Compliance by area
            </h2>
            <Link
              to="/dashboard/company-obligations"
              className="flex cursor-pointer items-center gap-1 text-xs hover:underline"
              style={{ color: HIVE_TEAL }}
            >
              Details →
            </Link>
          </div>
          <div className={areaGapClass}>
            {areaRows.map((row) => {
              const incidentHref =
                row.key === "incidents"
                  ? ({ to: "/dashboard/hub/documentation", search: { tab: "incidents", cc: "urgent" } } as const)
                  : null;
              if (row.kind === "message") {
                const inner = (
                  <>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground">{row.label}</span>
                    </div>
                    <p
                      className={cn(
                        "text-xs",
                        row.tone === "green"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-muted-foreground",
                      )}
                    >
                      {row.message}
                    </p>
                  </>
                );
                return incidentHref ? (
                  <Link key={row.key} to={incidentHref.to} search={incidentHref.search} className="block cursor-pointer hover:opacity-90">
                    {inner}
                  </Link>
                ) : (
                  <div key={row.key}>{inner}</div>
                );
              }
              const color = barColor(row.score);
              const barInner = (
                <>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground">{row.label}</span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color }}>
                      {row.score}%
                    </span>
                  </div>
                  <ProgressBar score={row.score} color={color} />
                </>
              );
              return incidentHref ? (
                <Link key={row.key} to={incidentHref.to} search={incidentHref.search} className="block cursor-pointer hover:opacity-90">
                  {barInner}
                </Link>
              ) : (
                <div key={row.key}>{barInner}</div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CircleUser className="h-4 w-4" style={{ color: HIVE_TEAL }} />
              Clients
            </h2>
          </div>
          <ul>
            {clients.slice(0, 10).map((c, idx) => {
              const name = `${c.first_name} ${c.last_name}`;
              const codes = clientCodesById.get(c.id) ?? [];
              const avatarBg = idx % 2 === 0 ? HIVE_NAVY : HIVE_TEAL;
              return (
                <li key={c.id} className="border-b border-border last:border-0">
                  <Link
                    to="/dashboard/hub/clients"
                    className="flex cursor-pointer items-center gap-2.5 py-2.5 transition hover:bg-muted/40"
                  >
                    <span
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                      style={{ background: avatarBg }}
                    >
                      {initials(name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {codes.length ? codes.join(" · ") : "No active codes"}
                      </div>
                    </div>
                    <StatusBadge tone="green">Active</StatusBadge>
                  </Link>
                </li>
              );
            })}
            {clients.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground">No active clients.</li>
            )}
          </ul>
          <div className="mt-3 border-t border-border pt-3">
            <div className="text-xs font-medium text-muted-foreground">Next billing window</div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              {nextBillingWindowLabel()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminHomeDashboard() {
  return (
    <Suspense fallback={<AdminHomeSkeleton />}>
      <AdminHomeDashboardInner />
    </Suspense>
  );
}
