import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { getCompanyOverview } from "@/lib/company-overview.functions";
import { getAgencyHealthSnapshot } from "@/lib/agency-health.functions";
import type { AgencyHealthSnapshot } from "@/lib/agency-health.functions";
import {
  ShieldCheck, MapPin, FileCheck2, BadgeCheck, Activity,
  AlertTriangle, ArrowRight, PartyPopper, Wallet,
  BookOpen, Network, CalendarClock, ClipboardX, FileSignature,
  Stethoscope, UserPlus, CalendarPlus, ClipboardCheck, BarChart3,
  Upload,
} from "lucide-react";
import { NectarHeader } from "@/components/nectar/nectar-brand";

// Card prefs preserved for settings compatibility (legacy keys still accepted).
const CARD_KEYS = ["greeting", "kpis", "attention", "celebrations", "billing"] as const;
type CardKey = (typeof CARD_KEYS)[number];
const STORAGE_KEY = "hive.company-overview.cards.v1";

export function getOverviewPrefs(): { visible: Record<CardKey, boolean>; order: CardKey[] } {
  if (typeof window === "undefined") {
    return {
      visible: Object.fromEntries(CARD_KEYS.map((k) => [k, true])) as Record<CardKey, boolean>,
      order: [...CARD_KEYS],
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("none");
    const parsed = JSON.parse(raw) as { visible?: Record<string, boolean>; order?: string[] };
    const visible = Object.fromEntries(
      CARD_KEYS.map((k) => [k, parsed.visible?.[k] !== false]),
    ) as Record<CardKey, boolean>;
    const order = (parsed.order ?? []).filter((k): k is CardKey =>
      (CARD_KEYS as readonly string[]).includes(k),
    );
    for (const k of CARD_KEYS) if (!order.includes(k)) order.push(k);
    return { visible, order };
  } catch {
    return {
      visible: Object.fromEntries(CARD_KEYS.map((k) => [k, true])) as Record<CardKey, boolean>,
      order: [...CARD_KEYS],
    };
  }
}

export function saveOverviewPrefs(prefs: { visible: Record<CardKey, boolean>; order: CardKey[] }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export const OVERVIEW_CARDS: { key: CardKey; label: string; description: string }[] = [
  { key: "greeting", label: "NECTAR daily brief", description: "Templated brief built from today's live counts" },
  { key: "kpis", label: "Health KPIs", description: "Audit readiness, EVV, documentation, credentials, compliance" },
  { key: "attention", label: "Needs you today", description: "Operational to-dos with deep links" },
  { key: "celebrations", label: "Worth celebrating", description: "Anniversaries, certifications, streaks" },
  { key: "billing", label: "Billing & payroll snapshot", description: "Admin/billing roles only" },
];

function fmtPct(n: number) { return `${Math.round(n)}%`; }
function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function tone(score: number) {
  if (score >= 90) return { dot: "bg-success", text: "text-success", chip: "bg-success/10 text-success border-success/30" };
  if (score >= 75) return { dot: "bg-warning", text: "text-warning-foreground", chip: "bg-warning/10 text-warning-foreground border-warning/30" };
  return { dot: "bg-destructive", text: "text-destructive", chip: "bg-destructive/10 text-destructive border-destructive/30" };
}

type HealthMetrics = { audit: number; evv: number; docs: number; creds: number; overall: number };
type CountsForBrief = {
  unacceptedShifts: number;
  expiringCredentials: number;
  pendingIncidents: number;
  missingDailyLogs: number;
  unsignedNotes: number;
  requirementsNeedingReview: number;
  engineMappingGaps: number;
};

// Isolated brief generator — replace this body with a model call later without
// touching the page. Never fabricates: only renders the live counts provided.
function buildDailyBrief(name: string, c: CountsForBrief, m: HealthMetrics | null): string {
  const salute = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();
  const parts: string[] = [];
  if (c.unacceptedShifts) parts.push(`${c.unacceptedShifts} shift${c.unacceptedShifts === 1 ? "" : "s"} still unaccepted`);
  if (c.expiringCredentials) parts.push(`${c.expiringCredentials} cert${c.expiringCredentials === 1 ? "" : "s"} expiring soon`);
  if (c.pendingIncidents) parts.push(`${c.pendingIncidents} incident${c.pendingIncidents === 1 ? "" : "s"} to review`);
  if (c.missingDailyLogs || c.unsignedNotes) {
    const docs = c.missingDailyLogs + c.unsignedNotes;
    parts.push(`${docs} doc${docs === 1 ? "" : "s"} due`);
  }
  if (c.requirementsNeedingReview || c.engineMappingGaps) {
    const reqs = c.requirementsNeedingReview + c.engineMappingGaps;
    parts.push(`${reqs} requirement${reqs === 1 ? "" : "s"} to review`);
  }
  const headline = `${salute}, ${name}.`;
  let body: string;
  if (parts.length === 0) {
    body = m && m.overall >= 90
      ? `Everything is on track — overall compliance is at ${fmtPct(m.overall)}.`
      : "Nothing in the queue right now — a good moment to get ahead.";
  } else {
    const joined = parts.length === 1 ? parts[0]
      : parts.length === 2 ? `${parts[0]} and ${parts[1]}`
      : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
    body = `${joined} — everything else is on track.`;
  }
  const tail = m ? ` Overall compliance ${fmtPct(m.overall)}.` : "";
  return `${headline} ${body}${tail}`;
}

function DailyBrief({ name, counts, metrics }: { name: string; counts: CountsForBrief; metrics: HealthMetrics | null }) {
  const text = buildDailyBrief(name, counts, metrics);
  const [headline, ...rest] = text.split(". ");
  const body = rest.join(". ");
  return (
    <NectarHeader
      surface="navy"
      markSize="lg"
      eyebrow="Daily brief · NECTAR"
      title={headline.endsWith(".") ? headline : `${headline}.`}
      description={body}
    />
  );
}

// ─── Quick actions ───────────────────────────────────────────────────────────
function QuickActions() {
  const actions: { icon: typeof Upload; label: string; to: string; search?: Record<string, string> }[] = [
    { icon: Upload, label: "Smart Import", to: "/dashboard/smart-import" },
    { icon: UserPlus, label: "Add client", to: "/dashboard/clients" },
    { icon: CalendarPlus, label: "Create shift", to: "/dashboard/scheduler" },
    { icon: ClipboardCheck, label: "Review timesheets", to: "/dashboard/timeclock" },
    { icon: BarChart3, label: "Run report", to: "/dashboard/reports" },
  ];
  return (
    <section>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Link
            key={a.label}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            to={a.to as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            search={a.search as any}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium shadow-sm transition hover:border-primary/40 hover:bg-accent/5"
          >
            <a.icon className="h-4 w-4 text-primary" />
            <span>{a.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── KPI strip ───────────────────────────────────────────────────────────────
function useHealthMetrics(orgId: string): { metrics: HealthMetrics | null; isLoading: boolean; raw: AgencyHealthSnapshot | undefined } {
  const fetchFn = useServerFn(getAgencyHealthSnapshot);
  const { data, isLoading } = useQuery({
    queryKey: ["agency-health", orgId],
    queryFn: () => fetchFn({ data: { organizationId: orgId } }),
    enabled: !!orgId,
  });
  const metrics = useMemo<HealthMetrics | null>(() => {
    if (!data) return null;
    const d = data as AgencyHealthSnapshot;
    const audit = Math.round((d.client.daily.score + d.client.medication.score + d.client.attendance.score) / 3);
    return {
      audit,
      evv: d.employee.geofence.score,
      docs: Math.round((d.client.daily.score + d.employee.emarAccuracy.score) / 2),
      creds: d.employee.credentials.score,
      overall: Math.round((d.client.overall + d.employee.overall) / 2),
    };
  }, [data]);
  return { metrics, isLoading, raw: data as AgencyHealthSnapshot | undefined };
}

type KpiSpec = {
  icon: typeof ShieldCheck;
  label: string;
  value: number;
  nextAction: string;
  to: string;
  search?: Record<string, string>;
};

function KpiCard({ spec }: { spec: KpiSpec }) {
  const t = tone(spec.value);
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={spec.to as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search={spec.search as any}
      className="group cursor-pointer rounded-xl border border-border bg-card p-3 shadow-card transition hover:border-primary/40"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted">
          <spec.icon className="h-3.5 w-3.5 text-foreground" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{spec.label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-2xl font-semibold tabular-nums ${t.text}`}>{fmtPct(spec.value)}</span>
        <span className={`h-2 w-2 rounded-full ${t.dot}`} />
      </div>
      <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
        {spec.nextAction} <ArrowRight className="h-3 w-3" />
      </p>
    </Link>
  );
}

function KpiStrip({ metrics, raw, isLoading }: { metrics: HealthMetrics | null; raw: AgencyHealthSnapshot | undefined; isLoading: boolean }) {
  if (isLoading || !metrics || !raw) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Health KPIs</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-muted/40" />
          ))}
        </div>
      </section>
    );
  }
  const staffMissingCreds = Math.max(0, raw.employee.credentials.total - raw.employee.credentials.passing);
  const evvOut = Math.max(0, raw.employee.geofence.total - raw.employee.geofence.passing);
  const docGaps = Math.max(0, raw.client.daily.total - raw.client.daily.passing)
    + Math.max(0, raw.employee.emarAccuracy.total - raw.employee.emarAccuracy.passing);
  const auditGaps = Math.max(0, raw.client.medication.total - raw.client.medication.passing)
    + Math.max(0, raw.client.attendance.total - raw.client.attendance.passing);

  const specs: KpiSpec[] = [
    {
      icon: ShieldCheck, label: "Audit readiness", value: metrics.audit,
      nextAction: auditGaps ? `Review ${auditGaps} record${auditGaps === 1 ? "" : "s"}` : "Open Records Desk",
      to: "/dashboard/hub/documentation", search: { tab: "audit", focus: "audit-readiness" },
    },
    {
      icon: MapPin, label: "EVV match", value: metrics.evv,
      nextAction: evvOut ? `Investigate ${evvOut} clock-in${evvOut === 1 ? "" : "s"}` : "Open EVV & timesheets",
      to: "/dashboard/compliance-desk", search: { focus: "evv-out-of-bounds" },
    },
    {
      icon: FileCheck2, label: "Documentation", value: metrics.docs,
      nextAction: docGaps ? `Review ${docGaps} doc${docGaps === 1 ? "" : "s"}` : "Open Documentation",
      to: "/dashboard/hub/documentation", search: { tab: "records", focus: "doc-gaps" },
    },
    {
      icon: BadgeCheck, label: "Credentials current", value: metrics.creds,
      nextAction: staffMissingCreds
        ? `Review ${staffMissingCreds} staff`
        : "Open Compliance",
      to: "/dashboard/certifications", search: { focus: "creds-expiring" },
    },
    {
      icon: Activity, label: "Overall compliance", value: metrics.overall,
      nextAction: "Open compliance overview",
      to: "/dashboard/compliance-desk", search: { focus: "compliance-overview" },
    },
  ];
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Health KPIs</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {specs.map((s) => <KpiCard key={s.label} spec={s} />)}
      </div>
    </section>
  );
}

// ─── Generic queue (Needs you today / Backlog) ───────────────────────────────
type QueueItem = {
  icon: typeof AlertTriangle;
  label: string;
  count: number;
  to: string;
  search?: Record<string, string>;
  urgent?: boolean;
};

function QueueSection({
  title, items, emptyText, intent = "warn",
}: { title: string; items: QueueItem[]; emptyText: string; intent?: "warn" | "neutral" }) {
  const visible = items.filter((i) => i.count > 0).sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
  const accent = intent === "warn" ? "bg-warning/15 text-warning-foreground" : "bg-muted text-foreground";
  const Icon = intent === "warn" ? AlertTriangle : BookOpen;
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${accent}`}>
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        <span className="text-xs text-muted-foreground">{visible.length} item{visible.length === 1 ? "" : "s"}</span>
      </div>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((it) => (
            <li key={it.label}>
              <Link
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                to={it.to as any}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                search={it.search as any}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 transition hover:border-primary/40 hover:bg-accent/5"
              >
                <span className="flex min-w-0 items-start gap-2">
                  <it.icon className={`mt-0.5 h-4 w-4 shrink-0 ${it.urgent ? "text-destructive" : "text-warning-foreground"}`} />
                  <p className="truncate text-sm font-medium">{it.label}</p>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                    {it.count}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Billing snapshot ────────────────────────────────────────────────────────
function BillingSnapshotCard({ claimsReadyAmount, payrollGross }: { claimsReadyAmount: number; payrollGross: number }) {
  return (
    <section className="rounded-xl border border-primary/30 bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Wallet className="h-4 w-4" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">Billing & payroll snapshot</h2>
        </div>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Admin only
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/dashboard/billing" search={{ focus: "claims-ready" }} className="cursor-pointer rounded-lg border border-border bg-background p-4 transition hover:border-primary/40">
          <p className="text-xs font-medium text-muted-foreground">Claims ready to submit</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtUSD(claimsReadyAmount)}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
            Open Billing <ArrowRight className="h-3 w-3" />
          </p>
        </Link>
        <Link to="/dashboard/compliance-desk" search={{ focus: "payroll-review" }} className="cursor-pointer rounded-lg border border-border bg-background p-4 transition hover:border-primary/40">
          <p className="text-xs font-medium text-muted-foreground">Payroll this period (gross)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtUSD(payrollGross)}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
            Review timesheets <ArrowRight className="h-3 w-3" />
          </p>
        </Link>
      </div>
    </section>
  );
}

// ─── Celebrate (compact) ─────────────────────────────────────────────────────
function CelebrateInline({ items }: { items: { kind: string; title: string; detail: string }[] }) {
  if (items.length === 0) {
    return (
      <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <PartyPopper className="h-3.5 w-3.5 text-accent" />
        Quiet week — NECTAR will surface the next milestone here.
      </p>
    );
  }
  const first = items[0];
  const extra = items.length - 1;
  return (
    <p className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-foreground">
      <PartyPopper className="h-3.5 w-3.5 text-accent" />
      <span className="font-medium">{first.title}</span>
      <span className="text-muted-foreground">— {first.detail}</span>
      {extra > 0 && <span className="text-muted-foreground">· +{extra} more</span>}
    </p>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export function CompanyOverview() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const orgId = org?.organization_id;

  const fetchOverview = useServerFn(getCompanyOverview);
  const { data, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["company-overview", orgId],
    queryFn: () => fetchOverview({ data: { organizationId: orgId! } }),
  });

  const { metrics, raw, isLoading: healthLoading } = useHealthMetrics(orgId ?? "");

  const prefs = useMemo(() => getOverviewPrefs(), []);
  const canSeeBilling = can("view_billing") || can("manage_billing");

  if (!orgId) return null;

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "there";

  const att = data?.attention;
  const counts: CountsForBrief = {
    unacceptedShifts: att?.unacceptedShifts ?? 0,
    expiringCredentials: att?.expiringCredentials ?? 0,
    pendingIncidents: att?.pendingIncidents ?? 0,
    missingDailyLogs: att?.missingDailyLogs ?? 0,
    unsignedNotes: att?.unsignedNotes ?? 0,
    requirementsNeedingReview: att?.requirementsNeedingReview ?? 0,
    engineMappingGaps: att?.engineMappingGaps ?? 0,
  };

  // Needs you today — distinct operational to-dos only. KPI cards above are
  // the gauges for compliance/credentials/etc., so we never re-list those here.
  const needsToday: QueueItem[] = att
    ? [
        { icon: CalendarClock, label: "Published shifts not yet accepted", count: att.unacceptedShifts, to: "/dashboard/scheduler", search: { focus: "unaccepted-shifts" }, urgent: true },
        { icon: BadgeCheck, label: "Certifications expiring within 30 days", count: att.expiringCredentials, to: "/dashboard/certifications", search: { focus: "expiring-30" }, urgent: true },
        { icon: Stethoscope, label: "Incident reports pending review", count: att.pendingIncidents, to: "/dashboard/hub/documentation", search: { tab: "incidents", focus: "incidents-pending-review" }, urgent: true },
        { icon: ClipboardX, label: "Daily logs returned for revision", count: att.missingDailyLogs, to: "/dashboard/daily-logs", search: { focus: "daily-logs-returned" } },
        { icon: FileSignature, label: "Notes awaiting signature (last 7 days)", count: att.unsignedNotes, to: "/dashboard/hub/documentation", search: { tab: "records", focus: "unsigned-notes" } },
      ]
    : [];

  // Setup & backlog — configuration reviews that don't belong in the daily queue.
  const backlog: QueueItem[] = att
    ? [
        { icon: BookOpen, label: "Authoritative requirements needing review", count: att.requirementsNeedingReview, to: "/dashboard/authoritative-sources", search: { focus: "req-review" } },
        { icon: Network, label: "Requirement mappings flagged for review", count: att.engineMappingGaps, to: "/dashboard/authoritative-sources", search: { focus: "mapping-gaps" } },
      ]
    : [];

  // Render order: brief → quick actions → needs today → KPI strip → backlog → billing → celebrate
  return (
    <div className="space-y-6">
      {prefs.visible.greeting && (
        <DailyBrief name={firstName} counts={counts} metrics={metrics} />
      )}

      <QuickActions />

      {isLoading || !data ? (
        <div className="h-48 animate-pulse rounded-xl border border-border bg-muted/40" />
      ) : (
        prefs.visible.attention && (
          <QueueSection
            title="Needs you today"
            items={needsToday}
            emptyText="All clear — nothing operational waiting on you right now. 🍯"
            intent="warn"
          />
        )
      )}

      {prefs.visible.kpis && (
        <KpiStrip metrics={metrics} raw={raw} isLoading={healthLoading} />
      )}

      {!isLoading && data && (
        <QueueSection
          title="Setup & backlog"
          items={backlog}
          emptyText="No configuration reviews pending."
          intent="neutral"
        />
      )}

      {prefs.visible.billing && canSeeBilling && data?.billing && (
        <BillingSnapshotCard
          claimsReadyAmount={data.billing.claimsReadyAmount}
          payrollGross={data.billing.payrollGross}
        />
      )}

      {prefs.visible.celebrations && !isLoading && data && (
        <CelebrateInline items={data.celebrations} />
      )}
    </div>
  );
}
