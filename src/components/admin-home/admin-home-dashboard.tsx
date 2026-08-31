/**
 * Admin Home — rebuilt around two queries only:
 *   1. company_obligation_instances + nested obligations / assignees / completions
 *   2. active clients (authorized_dspd_codes lives on clients)
 *
 * Greeting, org name, and date render from session + useCurrentOrg. Query
 * loading is local to the cards that need that data — never a full-page gate.
 *
 * company_obligations has no `category` column (live + generated types).
 * Area grouping uses the SOW catalog overlay keyed by obligation title.
 */
import { Suspense, useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  BarChart3,
  CircleUser,
  Lightbulb,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import {
  CATEGORY_LABEL,
  sowCatalogEntry,
  type ObligationCategory,
} from "@/lib/sow-obligation-catalog";
import {
  adminHomeClientsQueryKey,
  adminHomeInstancesQueryKey,
} from "@/lib/yield-to-admin-home";
import { cn } from "@/lib/utils";
import { NectarRail } from "@/components/nectar/nectar-rail";

const HIVE_NAVY = "var(--hive-surface)";
const HIVE_TEAL = "var(--hive-gold)";
const NECTAR_VIOLET = "var(--hive-gold)";
const DOT_GREEN = "var(--hive-ok)";
const DOT_AMBER = "var(--hive-gold)";
const DOT_RED = "var(--hive-danger)";
const DENVER = "America/Denver";

const INSTANCES_SELECT = [
  "id",
  "due_at",
  "obligation_id",
  "client_id",
  "company_obligations!company_obligation_instances_obligation_id_fkey(title,source_policy_section,scope)",
  "company_obligation_instance_assignees!company_obligation_instance_assignees_instance_id_fkey(staff_id,staff_name,client_id)",
  "company_obligation_completions!company_obligation_completions_instance_id_fkey(id,nectar_extracted_expires_date,nectar_extracted_cert_type)",
].join(",");

type ObligationEmbed = {
  title: string | null;
  source_policy_section: string | null;
  scope: string | null;
};

type AssigneeEmbed = {
  staff_id: string;
  staff_name: string;
  client_id: string | null;
};

type CompletionEmbed = {
  id: string;
  nectar_extracted_expires_date: string | null;
  nectar_extracted_cert_type: string | null;
};

type InstanceRow = {
  id: string;
  due_at: string;
  obligation_id: string;
  client_id: string | null;
  company_obligations: ObligationEmbed | ObligationEmbed[] | null;
  company_obligation_instance_assignees: AssigneeEmbed[] | AssigneeEmbed | null;
  company_obligation_completions: CompletionEmbed[] | CompletionEmbed | null;
};

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  authorized_dspd_codes: string[] | null;
};

type StaffRow = {
  id: string;
  name: string;
  overdue: number;
  pending: number;
};

type Recommendation = { key: string; text: string };

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function asMany<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function denverYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DENVER,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function denverHour(date: Date): number {
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone: DENVER,
    hour: "numeric",
    hour12: false,
  }).format(date);
  const hour = Number.parseInt(raw, 10);
  if (!Number.isFinite(hour) || hour === 24) return 0;
  return hour;
}

function greetingWord(date: Date): "morning" | "afternoon" | "evening" {
  const hour = denverHour(date);
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function sessionFirstName(user: { user_metadata?: Record<string, unknown>; email?: string | null } | null): string {
  const meta = user?.user_metadata ?? {};
  const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  if (first) return first;
  const full =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    "";
  if (full) return full.split(/\s+/)[0] ?? "there";
  const fromEmail = user?.email?.split("@")[0]?.trim();
  return fromEmail || "there";
}

function ymdParts(ymd: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!match) return null;
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
  };
}

function addDaysYmd(ymd: string, days: number): string {
  const parts = ymdParts(ymd);
  if (!parts) return ymd;
  const utc = Date.UTC(parts.y, parts.m - 1, parts.d + days);
  const next = new Date(utc);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = ymdParts(fromYmd);
  const to = ymdParts(toYmd);
  if (!from || !to) return 0;
  const a = Date.UTC(from.y, from.m - 1, from.d);
  const b = Date.UTC(to.y, to.m - 1, to.d);
  return Math.round((b - a) / 86_400_000);
}

function formatDenverLongDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: DENVER,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatDueDate(dueAt: string): string {
  return new Date(dueAt).toLocaleDateString("en-US", {
    timeZone: DENVER,
    month: "short",
    day: "numeric",
  });
}

function nextBillingWindowLabel(now = new Date()): string {
  const today = denverYmd(now);
  const parts = ymdParts(today);
  if (!parts) return "";
  const nextMonth = parts.m === 12 ? 1 : parts.m + 1;
  const nextYear = parts.m === 12 ? parts.y + 1 : parts.y;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const monthName = new Date(Date.UTC(nextYear, nextMonth - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${monthName} 1 — ${monthName} ${lastDay}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function barColor(completed: number, total: number): string {
  if (total <= 0) return DOT_GREEN;
  const ratio = completed / total;
  if (ratio < 0.6) return DOT_RED;
  if (ratio < 0.9) return DOT_AMBER;
  return DOT_GREEN;
}

function obligationTitle(row: InstanceRow): string {
  return asOne(row.company_obligations)?.title?.trim() || "Obligation";
}

function sowSection(row: InstanceRow): string {
  return asOne(row.company_obligations)?.source_policy_section?.trim() || "";
}

function obligationScope(row: InstanceRow): string {
  return (asOne(row.company_obligations)?.scope ?? "").toLowerCase();
}

function categoryFor(row: InstanceRow): { key: string; label: string } {
  const title = obligationTitle(row);
  const catalog = sowCatalogEntry(title);
  if (catalog) {
    return { key: catalog.category, label: CATEGORY_LABEL[catalog.category] };
  }
  return { key: "other", label: "Other" };
}

function catalogCategory(row: InstanceRow): ObligationCategory | null {
  return sowCatalogEntry(obligationTitle(row))?.category ?? null;
}

function isComplete(row: InstanceRow): boolean {
  return asMany(row.company_obligation_completions).length > 0;
}

function isCredentialTitle(title: string): boolean {
  return /cert|cpr|first aid|license|credential|screening|background/i.test(title);
}

function looksLikeTraining(row: InstanceRow): boolean {
  const title = obligationTitle(row);
  return catalogCategory(row) === "training" || /training/i.test(title);
}

function looksLikeCredential(row: InstanceRow): boolean {
  const cat = catalogCategory(row);
  return cat === "screening" || cat === "licensing" || isCredentialTitle(obligationTitle(row));
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

function TileSkeleton() {
  return <Skeleton className="h-[130px] rounded-xl" />;
}

function CardBodySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function LoadError({ children }: { children: ReactNode }) {
  return <p className="py-6 text-sm text-muted-foreground">{children}</p>;
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

function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  const width = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${width}%`, background: color }}
      />
    </div>
  );
}

function buildRecommendations(
  instances: InstanceRow[],
  todayYmd: string,
): Recommendation[] {
  const horizon = addDaysYmd(todayYmd, 14);
  const recs: Recommendation[] = [];

  const overdueByObligation = new Map<string, { title: string; staff: Set<string> }>();
  const overdueByStaff = new Map<string, { name: string; obligations: Set<string> }>();
  const clientTrainingPairs = new Set<string>();

  for (const row of instances) {
    const complete = isComplete(row);
    const dueYmd = denverYmd(new Date(row.due_at));
    const overdue = !complete && dueYmd < todayYmd;
    const assignees = asMany(row.company_obligation_instance_assignees);
    const title = obligationTitle(row);

    if (overdue) {
      const bucket = overdueByObligation.get(row.obligation_id) ?? {
        title,
        staff: new Set<string>(),
      };
      for (const a of assignees) bucket.staff.add(a.staff_id);
      overdueByObligation.set(row.obligation_id, bucket);

      for (const a of assignees) {
        const staff = overdueByStaff.get(a.staff_id) ?? {
          name: a.staff_name,
          obligations: new Set<string>(),
        };
        staff.obligations.add(row.obligation_id);
        overdueByStaff.set(a.staff_id, staff);
      }

      if (looksLikeTraining(row)) {
        const instanceClient = row.client_id;
        for (const a of assignees) {
          const clientId = a.client_id ?? instanceClient;
          if (!clientId) continue;
          if (obligationScope(row) === "staff_per_client" || a.client_id || instanceClient) {
            clientTrainingPairs.add(`${a.staff_id}:${clientId}`);
          }
        }
      }
    }
  }

  for (const [obligationId, group] of overdueByObligation) {
    if (group.staff.size >= 3) {
      recs.push({
        key: `group-${obligationId}`,
        text: `Schedule a group session for ${group.title} — ${group.staff.size} staff share this overdue item.`,
      });
    }
  }

  for (const [staffId, staff] of overdueByStaff) {
    if (staff.obligations.size >= 3) {
      recs.push({
        key: `checkin-${staffId}`,
        text: `Check in with ${staff.name} — ${staff.obligations.size} overdue obligations.`,
      });
    }
  }

  const expiring = new Set<string>();
  for (const row of instances) {
    const title = obligationTitle(row);
    for (const c of asMany(row.company_obligation_completions)) {
      const expires = c.nectar_extracted_expires_date;
      if (!expires) continue;
      const expYmd = expires.slice(0, 10);
      if (expYmd >= todayYmd && expYmd <= horizon) {
        expiring.add(c.nectar_extracted_cert_type?.trim() || title);
      }
    }
    if (!isComplete(row) && looksLikeCredential(row)) {
      const dueYmd = denverYmd(new Date(row.due_at));
      if (dueYmd >= todayYmd && dueYmd <= horizon) {
        expiring.add(title);
      }
    }
  }
  if (expiring.size > 0) {
    const label = [...expiring][0];
    recs.push({
      key: "credential-window",
      text:
        expiring.size === 1
          ? `${label} expires within 14 days. Start processing now — credential turnaround often needs the full window.`
          : `${expiring.size} credentials expire within 14 days. Start processing now — turnaround often needs the full window.`,
    });
  }

  if (clientTrainingPairs.size >= 3) {
    recs.push({
      key: "client-training",
      text: `Schedule a group session for client-specific training — ${clientTrainingPairs.size} staff-and-client pairs are overdue.`,
    });
  }

  return recs;
}

function AdminHomeDashboardInner() {
  const { user } = useAuth();
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const orgName = org?.organization_name ?? "Your agency";

  const instancesQ = useQuery({
    enabled: !!orgId,
    queryKey: adminHomeInstancesQueryKey(orgId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_obligation_instances")
        .select(INSTANCES_SELECT)
        .eq("organization_id", orgId);
      if (error) throw error;
      return (data ?? []) as InstanceRow[];
    },
    staleTime: 30_000,
  });

  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: adminHomeClientsQueryKey(orgId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, first_name, last_name, authorized_dspd_codes")
        .eq("organization_id", orgId)
        .eq("account_status", "active")
        .order("last_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
    staleTime: 30_000,
  });

  const now = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => denverYmd(now), [now]);
  const plus30Ymd = useMemo(() => addDaysYmd(todayYmd, 30), [todayYmd]);

  const instances = instancesQ.data ?? [];
  const clients = clientsQ.data ?? [];

  const derived = useMemo(() => {
    const overdue: Array<{
      id: string;
      title: string;
      assignee: string;
      days: number;
    }> = [];
    const pending: Array<{
      id: string;
      title: string;
      sow: string;
      dueAt: string;
      dueYmd: string;
    }> = [];
    const staffMap = new Map<string, StaffRow>();
    const staffWithOverdue = new Set<string>();
    let pendingWithin30 = 0;
    const area = new Map<string, { label: string; completed: number; total: number }>();

    for (const row of instances) {
      const complete = isComplete(row);
      const dueYmd = denverYmd(new Date(row.due_at));
      const assignees = asMany(row.company_obligation_instance_assignees);
      const title = obligationTitle(row);
      const cat = categoryFor(row);
      const bucket = area.get(cat.key) ?? { label: cat.label, completed: 0, total: 0 };
      bucket.total += 1;
      if (complete) bucket.completed += 1;
      area.set(cat.key, bucket);

      const isOverdue = !complete && dueYmd < todayYmd;
      const isPending = !complete && dueYmd >= todayYmd;

      for (const a of assignees) {
        const staff = staffMap.get(a.staff_id) ?? {
          id: a.staff_id,
          name: a.staff_name || "Staff",
          overdue: 0,
          pending: 0,
        };
        if (isOverdue) staff.overdue += 1;
        else if (isPending) staff.pending += 1;
        staffMap.set(a.staff_id, staff);
        if (isOverdue) staffWithOverdue.add(a.staff_id);
      }

      if (isOverdue) {
        overdue.push({
          id: row.id,
          title,
          assignee: assignees[0]?.staff_name?.trim() || "Unassigned",
          days: daysBetweenYmd(dueYmd, todayYmd),
        });
      } else if (isPending) {
        pending.push({
          id: row.id,
          title,
          sow: sowSection(row),
          dueAt: row.due_at,
          dueYmd,
        });
        if (dueYmd <= plus30Ymd) pendingWithin30 += 1;
      }
    }

    overdue.sort((a, b) => b.days - a.days);
    pending.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

    const staff = [...staffMap.values()].sort((a, b) => {
      if (b.overdue !== a.overdue) return b.overdue - a.overdue;
      if (b.pending !== a.pending) return b.pending - a.pending;
      return a.name.localeCompare(b.name);
    });

    const areas = [...area.values()].sort((a, b) => a.label.localeCompare(b.label));
    const recommendations = buildRecommendations(instances, todayYmd);

    return {
      overdue,
      pending,
      staff,
      staffWithOverdue: staffWithOverdue.size,
      pendingWithin30,
      areas,
      recommendations,
    };
  }, [instances, plus30Ymd, todayYmd]);

  if (!orgId && !orgLoading) return null;

  const instancesReady = instancesQ.isSuccess;
  const instancesFailed = instancesQ.isError;
  const instancesLoading = !instancesReady && !instancesFailed;
  const clientsReady = clientsQ.isSuccess;
  const clientsFailed = clientsQ.isError;
  const clientsLoading = !clientsReady && !clientsFailed;

  const firstName = sessionFirstName(user);
  const dateLine = formatDenverLongDate(now);
  const plus14Ymd = addDaysYmd(todayYmd, 14);
  const topOverdue = derived.overdue.slice(0, 4);
  const dueSoon = derived.pending.slice(0, 4);

  return (
    <div className="flex items-start gap-4">
    <div className="min-w-0 flex-1 space-y-4">
      <div>
        <div className="text-lg font-semibold text-foreground">
          Good {greetingWord(now)}, {firstName}. Here's what needs your attention.
        </div>
        <div className="text-sm text-muted-foreground">
          {org ? `${orgName} · ${dateLine}` : dateLine}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {instancesLoading ? (
          <Skeleton className="h-[280px] rounded-2xl" />
        ) : instancesFailed ? (
          <div className="rounded-2xl border border-border bg-card p-5">
            <LoadError>Could not load overdue items.</LoadError>
          </div>
        ) : derived.overdue.length === 0 ? (
          <div className="rounded-2xl border border-[var(--hive-ok)]/40 bg-[color-mix(in_srgb,var(--hive-ok)_12%,var(--hive-surface))] p-5">
            <div className="text-4xl font-extrabold tabular-nums text-[var(--hive-ok)]">
              0
            </div>
            <div className="mt-2 text-sm font-semibold text-[var(--hive-ok)]">
              All current
            </div>
            <p className="mt-1 text-sm text-[var(--hive-text-muted)]">
              No overdue obligation instances.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-5 text-[var(--hive-text)]">
            <div className="text-4xl font-extrabold tabular-nums leading-none">
              {derived.overdue.length}
            </div>
            <div className="mt-2 text-sm font-medium text-[var(--hive-text-muted)]">
              Overdue obligation instance{derived.overdue.length === 1 ? "" : "s"}
            </div>
            <ul className="mt-4 space-y-2.5">
              {topOverdue.map((item) => (
                <li key={item.id} className="border-b border-[var(--hive-border)] pb-2.5 last:border-0 last:pb-0">
                  <div className="truncate text-sm font-medium">{item.title}</div>
                  <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-[var(--hive-text-muted)]">
                    <span className="truncate">{item.assignee}</span>
                    <span className="shrink-0 tabular-nums text-[var(--hive-danger)]">
                      {item.days} day{item.days === 1 ? "" : "s"} overdue
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              to="/dashboard/company-obligations"
              className="mt-4 inline-flex cursor-pointer text-sm font-medium text-[var(--hive-gold)] hover:underline"
            >
              View all →
            </Link>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {instancesLoading ? (
            <TileSkeleton />
          ) : (
            <div
              className={cn(
                "rounded-xl border border-l-4 bg-card p-4",
                !instancesFailed && derived.staffWithOverdue > 0
                  ? "border-l-rose-500"
                  : "border-l-border",
              )}
            >
              <div
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  !instancesFailed && derived.staffWithOverdue > 0
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-foreground",
                )}
              >
                {instancesFailed ? "—" : derived.staffWithOverdue}
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">Staff with overdue</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {instancesFailed ? "Could not load" : "People with at least one overdue item"}
              </div>
            </div>
          )}

          {instancesLoading ? (
            <TileSkeleton />
          ) : (
            <div className="rounded-xl border border-l-4 border-l-amber-500 bg-card p-4">
              <div className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {instancesFailed ? "—" : derived.pendingWithin30}
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">Due within 30 days</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {instancesFailed ? "Could not load" : "Pending instances"}
              </div>
            </div>
          )}

          {clientsLoading ? (
            <TileSkeleton />
          ) : (
            <div className="rounded-xl border border-l-4 border-l-emerald-500 bg-card p-4">
              <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {clientsFailed ? "—" : clients.length}
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">Active clients</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {clientsFailed ? "Could not load" : "Account status active"}
              </div>
            </div>
          )}

          {instancesLoading ? (
            <TileSkeleton />
          ) : (
            <div
              className={cn(
                "rounded-xl border border-l-4 bg-card p-4",
                !instancesFailed && derived.recommendations.length > 0
                  ? "border-l-amber-500"
                  : "border-l-border",
              )}
            >
              <div
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  !instancesFailed && derived.recommendations.length > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-foreground",
                )}
              >
                {instancesFailed ? "—" : derived.recommendations.length}
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">Recommendations</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {instancesFailed ? "Could not load" : "From obligation data"}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4" style={{ color: HIVE_TEAL }} />
            Staff status
          </h2>
          {instancesLoading ? (
            <CardBodySkeleton />
          ) : instancesFailed ? (
            <LoadError>Could not load staff status.</LoadError>
          ) : (
          <ul>
            {derived.staff.map((m, idx) => {
              const avatarBg = idx % 2 === 0 ? HIVE_NAVY : NECTAR_VIOLET;
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
                    <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {m.name}
                    </div>
                    {m.overdue > 0 ? (
                      <StatusBadge tone="red">{m.overdue} overdue</StatusBadge>
                    ) : m.pending > 0 ? (
                      <StatusBadge tone="amber">{m.pending} pending</StatusBadge>
                    ) : (
                      <StatusBadge tone="green">Current</StatusBadge>
                    )}
                  </Link>
                </li>
              );
            })}
            {derived.staff.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground">No assigned staff yet.</li>
            )}
          </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlarmClock className="h-4 w-4" style={{ color: HIVE_TEAL }} />
            Due soon
          </h2>
          {instancesLoading ? (
            <CardBodySkeleton />
          ) : instancesFailed ? (
            <LoadError>Could not load upcoming due dates.</LoadError>
          ) : (
          <ul>
            {dueSoon.map((item) => {
              const color =
                item.dueYmd < todayYmd
                  ? DOT_RED
                  : item.dueYmd <= plus14Ymd
                    ? DOT_AMBER
                    : undefined;
              return (
                <li key={item.id} className="border-b border-border last:border-0">
                  <Link
                    to="/dashboard/company-obligations"
                    className="flex cursor-pointer items-start justify-between gap-3 py-2.5 transition hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                      {item.sow ? (
                        <div className="truncate text-xs text-muted-foreground">{item.sow}</div>
                      ) : null}
                    </div>
                    <div
                      className="shrink-0 text-xs font-semibold tabular-nums"
                      style={color ? { color } : undefined}
                    >
                      {formatDueDate(item.dueAt)}
                    </div>
                  </Link>
                </li>
              );
            })}
            {dueSoon.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground">Nothing due soon.</li>
            )}
          </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lightbulb className="h-4 w-4" style={{ color: HIVE_TEAL }} />
            Recommendations
          </h2>
          {instancesLoading ? (
            <CardBodySkeleton />
          ) : instancesFailed ? (
            <LoadError>Could not load recommendations.</LoadError>
          ) : derived.recommendations.length > 0 ? (
            <ul className="space-y-3">
              {derived.recommendations.map((rec) => (
                <li key={rec.key} className="text-sm text-foreground">
                  {rec.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <BarChart3 className="h-4 w-4" style={{ color: HIVE_TEAL }} />
            Compliance by area
          </h2>
          {instancesLoading ? (
            <CardBodySkeleton rows={5} />
          ) : instancesFailed ? (
            <LoadError>Could not load compliance by area.</LoadError>
          ) : (
          <div className="space-y-4">
            {derived.areas.map((area) => {
              const color = barColor(area.completed, area.total);
              const ratio = area.total > 0 ? area.completed / area.total : 0;
              return (
                <div key={area.label}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground">{area.label}</span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color }}>
                      {area.completed} of {area.total}
                    </span>
                  </div>
                  <ProgressBar ratio={ratio} color={color} />
                </div>
              );
            })}
            {derived.areas.length === 0 && (
              <p className="py-6 text-sm text-muted-foreground">No obligation instances yet.</p>
            )}
          </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CircleUser className="h-4 w-4" style={{ color: HIVE_TEAL }} />
            Active clients
          </h2>
          {clientsLoading ? (
            <CardBodySkeleton />
          ) : clientsFailed ? (
            <LoadError>Could not load clients.</LoadError>
          ) : (
          <ul>
            {clients.map((c, idx) => {
              const name = `${c.first_name} ${c.last_name}`.trim();
              const codes = (c.authorized_dspd_codes ?? []).filter(Boolean);
              const avatarBg = idx % 2 === 0 ? HIVE_NAVY : HIVE_TEAL;
              return (
                <li key={c.id} className="border-b border-border last:border-0">
                  <div className="flex items-center gap-2.5 py-2.5">
                    <span
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                      style={{ background: avatarBg }}
                    >
                      {initials(name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {codes.length ? codes.join(" · ") : "No authorized codes"}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            {clients.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground">No active clients.</li>
            )}
          </ul>
          )}
          <div className="mt-3 border-t border-border pt-3">
            <div className="text-xs font-medium text-muted-foreground">Next billing window</div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              {nextBillingWindowLabel(now)}
            </div>
          </div>
        </div>
      </div>
    </div>
      <NectarRail
        firstName={firstName}
        className="hidden h-[min(720px,calc(100dvh-8rem))] w-[320px] shrink-0 self-stretch rounded-xl border border-[var(--hive-border)] xl:flex"
      />
    </div>
  );
}

export function AdminHomeDashboard() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div>
            <div className="text-lg font-semibold text-foreground">Good day</div>
            <div className="text-sm text-muted-foreground">Loading workspace…</div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-[280px] rounded-2xl" />
            <div className="grid grid-cols-2 gap-3">
              <TileSkeleton />
              <TileSkeleton />
              <TileSkeleton />
              <TileSkeleton />
            </div>
          </div>
        </div>
      }
    >
      <AdminHomeDashboardInner />
    </Suspense>
  );
}
