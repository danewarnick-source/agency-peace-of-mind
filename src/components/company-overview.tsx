import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { getCompanyOverview } from "@/lib/company-overview.functions";
import { getAgencyHealthSnapshot } from "@/lib/agency-health.functions";
import {
  Sparkles, ShieldCheck, MapPin, FileCheck2, BadgeCheck, Activity,
  AlertTriangle, ArrowRight, PartyPopper, Wallet, ClipboardX,
  FileSignature, Stethoscope, Send, Users, Trophy, CalendarHeart,
} from "lucide-react";

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
  { key: "greeting", label: "NECTAR greeting", description: "Warm welcome + sweet-nectar line for today" },
  { key: "kpis", label: "Health KPIs", description: "Audit readiness, EVV, documentation, credentials, compliance" },
  { key: "attention", label: "Needs your attention", description: "Prioritized action list with deep links" },
  { key: "celebrations", label: "Worth celebrating", description: "Anniversaries, certifications, streaks" },
  { key: "billing", label: "Billing & payroll snapshot", description: "Admin/billing roles only — dollar figures" },
];

function fmtPct(n: number) {
  return `${Math.round(n)}%`;
}
function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function tone(score: number) {
  if (score >= 90) return { dot: "bg-success", text: "text-success", chip: "bg-success/10 text-success border-success/30" };
  if (score >= 75) return { dot: "bg-warning", text: "text-warning-foreground", chip: "bg-warning/10 text-warning-foreground border-warning/30" };
  return { dot: "bg-destructive", text: "text-destructive", chip: "bg-destructive/10 text-destructive border-destructive/30" };
}

function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const salute = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <section className="rounded-xl border border-accent/30 bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6 shadow-card">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">
            {salute}, {name}.
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's your sweet nectar for today — a quick read on company health, what needs you, and what's worth celebrating.
          </p>
        </div>
      </div>
    </section>
  );
}

function Kpi({
  icon: Icon, label, value, hint, to,
}: {
  icon: typeof ShieldCheck; label: string; value: number; hint: string; to: string;
}) {
  const t = tone(value);
  return (
    <Link to={to} className="group rounded-xl border border-border bg-card p-4 shadow-card transition hover:border-primary/40">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted">
          <Icon className="h-4 w-4 text-foreground" />
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${t.chip}`}>
          {value >= 90 ? "On track" : value >= 75 ? "Attention" : "Action"}
        </span>
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-3xl font-semibold tabular-nums ${t.text}`}>{fmtPct(value)}</span>
        <span className={`h-2 w-2 rounded-full ${t.dot}`} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Link>
  );
}

function Kpis({ orgId }: { orgId: string }) {
  const fetchFn = useServerFn(getAgencyHealthSnapshot);
  const { data, isLoading } = useQuery({
    queryKey: ["agency-health", orgId],
    queryFn: () => fetchFn({ data: { organizationId: orgId } }),
  });

  const metrics = useMemo(() => {
    if (!data) return null;
    const audit = Math.round(
      (data.client.daily.score + data.client.medication.score + data.client.attendance.score) / 3,
    );
    const evv = data.employee.geofence.score;
    const docs = Math.round((data.client.daily.score + data.employee.emarAccuracy.score) / 2);
    const creds = data.employee.credentials.score;
    const overall = Math.round((data.client.overall + data.employee.overall) / 2);
    return { audit, evv, docs, creds, overall };
  }, [data]);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Health KPIs</h2>
        <span className="text-xs text-muted-foreground">Last 30 days · color-coded</span>
      </div>
      {isLoading || !metrics ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi icon={ShieldCheck} label="Audit readiness" value={metrics.audit} hint="Logs, eMAR & attendance combined" to="/dashboard/records-desk" />
          <Kpi icon={MapPin} label="EVV match" value={metrics.evv} hint="Clock-ins inside the geofence" to="/dashboard/timeclock" />
          <Kpi icon={FileCheck2} label="Documentation" value={metrics.docs} hint="Notes & medication completeness" to="/dashboard/daily-logs" />
          <Kpi icon={BadgeCheck} label="Credentials current" value={metrics.creds} hint="Approved certs across active staff" to="/dashboard/certifications" />
          <Kpi icon={Activity} label="Overall compliance" value={metrics.overall} hint="Weighted across the agency" to="/dashboard/records-desk" />
        </div>
      )}
    </section>
  );
}

type AttentionItem = { icon: typeof AlertTriangle; label: string; count: number; to: string; urgent?: boolean };

function Attention({ items }: { items: AttentionItem[] }) {
  const visible = items.filter((i) => i.count > 0).sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-warning/15 text-warning-foreground">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">Needs your attention</h2>
        </div>
        <span className="text-xs text-muted-foreground">{visible.length} item{visible.length === 1 ? "" : "s"}</span>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
          All clear — nothing urgent waiting on you right now. 🍯
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((it) => (
            <li key={it.label}>
              <Link
                to={it.to}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 transition hover:border-primary/40 hover:bg-accent/5"
              >
                <span className="flex min-w-0 items-start gap-2">
                  <it.icon className={`mt-0.5 h-4 w-4 shrink-0 ${it.urgent ? "text-destructive" : "text-warning-foreground"}`} />
                  <span className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.label}</p>
                  </span>
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

function Celebrations({ items }: { items: { kind: string; title: string; detail: string }[] }) {
  return (
    <section className="rounded-xl border border-accent/30 bg-accent/5 p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent/20 text-accent">
          <PartyPopper className="h-4 w-4" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Worth celebrating</h2>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Quiet week — but every steady day is a win. NECTAR will surface the next milestone here.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((c, i) => {
            const Icon =
              c.kind === "anniversary" ? CalendarHeart :
              c.kind === "training" ? Trophy :
              c.kind === "evv_streak" ? BadgeCheck : Users;
            return (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BillingSnapshotCard({
  claimsReadyAmount, payrollGross,
}: { claimsReadyAmount: number; payrollGross: number }) {
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
        <Link to="/dashboard/billing" className="rounded-lg border border-border bg-background p-4 transition hover:border-primary/40">
          <p className="text-xs font-medium text-muted-foreground">Claims ready to submit</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtUSD(claimsReadyAmount)}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
            Open Billing <ArrowRight className="h-3 w-3" />
          </p>
        </Link>
        <Link to="/dashboard/timeclock" className="rounded-lg border border-border bg-background p-4 transition hover:border-primary/40">
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

  const prefs = useMemo(() => getOverviewPrefs(), []);
  const canSeeBilling = can("view_billing") || can("manage_billing");

  if (!orgId) return null;

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "there";

  const attentionItems: AttentionItem[] = data
    ? [
        { icon: BadgeCheck, label: "Staff credentials expiring within 30 days", count: data.attention.expiringCredentials, to: "/dashboard/certifications", urgent: true },
        { icon: ClipboardX, label: "Daily logs returned for revision", count: data.attention.missingDailyLogs, to: "/dashboard/daily-logs" },
        { icon: FileSignature, label: "Notes awaiting signature (last 7 days)", count: data.attention.unsignedNotes, to: "/dashboard/records-desk" },
        { icon: Stethoscope, label: "Incident reports pending admin review", count: data.attention.pendingIncidents, to: "/dashboard/records-desk", urgent: true },
        { icon: Users, label: "Clients off budget pace", count: data.attention.clientsOffPace, to: "/dashboard/billing" },
        { icon: ShieldCheck, label: "Timesheets awaiting payroll approval", count: data.attention.pendingPayroll, to: "/dashboard/timeclock" },
        { icon: Send, label: "Claims ready to submit", count: data.attention.claimsReady, to: "/dashboard/billing" },
      ]
    : [];

  const sections: Record<CardKey, React.ReactNode> = {
    greeting: <Greeting name={firstName} />,
    kpis: <Kpis orgId={orgId} />,
    attention: isLoading || !data ? (
      <div className="h-48 animate-pulse rounded-xl border border-border bg-muted/40" />
    ) : (
      <Attention items={attentionItems} />
    ),
    celebrations: isLoading || !data ? (
      <div className="h-40 animate-pulse rounded-xl border border-border bg-muted/40" />
    ) : (
      <Celebrations items={data.celebrations} />
    ),
    billing: canSeeBilling && data?.billing
      ? <BillingSnapshotCard claimsReadyAmount={data.billing.claimsReadyAmount} payrollGross={data.billing.payrollGross} />
      : null,
  };

  return (
    <div className="space-y-6">
      {prefs.order.map((key) =>
        prefs.visible[key] && sections[key]
          ? <div key={key}>{sections[key]}</div>
          : null,
      )}
    </div>
  );
}
