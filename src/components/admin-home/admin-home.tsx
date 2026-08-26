/**
 * Admin Home — "the quiet command."
 * Brand-forward hero + readiness, human-only decisions, plain-language picture,
 * Nectar as quiet watcher — styled with platform HIVE tokens (navy / gold / card).
 */
import { useMemo, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Hexagon, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useDeadlines, type DeadlineItem } from "@/hooks/use-deadlines";
import { supabase } from "@/integrations/supabase/client";
import { getAgencyHealthSnapshot } from "@/lib/agency-health.functions";
import { getCompanyOverview } from "@/lib/company-overview.functions";
import { cn } from "@/lib/utils";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function scoreTone(score: number): "ok" | "warn" | "bad" {
  if (score >= 90) return "ok";
  if (score >= 75) return "warn";
  return "bad";
}

function whenLabel(item: DeadlineItem): { text: string; tone: "overdue" | "today" | "soon" } {
  if (item.status === "overdue") return { text: "Overdue", tone: "overdue" };
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (item.dueAt >= start && item.dueAt < end) return { text: "Today", tone: "today" };
  return { text: "This week", tone: "soon" };
}

function ReadinessRing({ score, tone }: { score: number; tone: "ok" | "warn" | "bad" }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, score));
  const offset = c - (clamped / 100) * c;
  const stroke =
    tone === "ok" ? "var(--success)" : tone === "warn" ? "var(--nectar-gold-500)" : "var(--destructive)";
  const text =
    tone === "ok"
      ? "text-success"
      : tone === "warn"
        ? "text-nectar-gold-700"
        : "text-destructive";

  return (
    <div className="relative grid h-[168px] w-[168px] place-items-center sm:h-[184px] sm:w-[184px]">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" className="stroke-border" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className={cn("font-display text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl", text)}>
            {Math.round(score)}
          </div>
          <div className="mt-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Ready
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionBlock({
  id,
  eyebrow,
  title,
  lede,
  children,
  className,
  delayClass,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
  className?: string;
  delayClass?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-6 animate-fade-in rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6",
        delayClass,
        className,
      )}
    >
      <div className="mb-5 border-b border-border pb-4">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          <Hexagon className="h-3.5 w-3.5" strokeWidth={2.5} />
          {eyebrow}
        </div>
        <h2 className="font-display mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">{lede}</p>
      </div>
      {children}
    </section>
  );
}

export function AdminHome() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const orgName = org?.organization_name ?? "Your agency";
  const needsRef = useRef<HTMLDivElement | null>(null);

  const fetchHealth = useServerFn(getAgencyHealthSnapshot);
  const fetchOverview = useServerFn(getCompanyOverview);

  const healthQ = useQuery({
    enabled: !!orgId,
    queryKey: ["agency-health", orgId],
    queryFn: () => fetchHealth({ data: { organizationId: orgId! } }),
  });

  const overviewQ = useQuery({
    enabled: !!orgId,
    queryKey: ["company-overview", orgId],
    queryFn: () => fetchOverview({ data: { organizationId: orgId! } }),
  });

  const profileQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["admin-home-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("id", user!.id)
        .maybeSingle();
      return data?.first_name?.trim() || null;
    },
  });

  const peopleQ = useQuery({
    enabled: !!orgId,
    queryKey: ["admin-home-people", orgId],
    queryFn: async () => {
      const [clients, members] = await Promise.all([
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!),
        supabase
          .from("organization_members")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!)
          .eq("active", true),
      ]);
      return {
        clients: clients.count ?? 0,
        staff: members.count ?? 0,
      };
    },
  });

  const { overdue, dueSoon, upcoming, isLoading: deadlinesLoading } = useDeadlines();

  const needsYou = useMemo(() => {
    return [...overdue, ...dueSoon]
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      .slice(0, 8);
  }, [overdue, dueSoon]);

  const firstName = profileQ.data || "there";
  const score = healthQ.data?.overall ?? null;
  const tone = score == null ? "ok" : scoreTone(score);
  const needsCount = needsYou.length;
  const overdueStaff = healthQ.data?.staffWithOverdueObligations ?? 0;

  const displayHeadline = useMemo(() => {
    if (score != null && score < 90) {
      const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });
      return `${weekday} needs you, ${firstName}.`;
    }
    return `${timeGreeting()}, ${firstName}.`;
  }, [score, firstName]);

  const lede = useMemo(() => {
    if (score == null) return "Loading your agency picture…";
    if (needsCount === 0 && score >= 90) {
      return "Your agency is covered. Nothing needs a human decision right now — everything is already in motion.";
    }
    if (score >= 90) {
      return `Your agency is covered. ${needsCount} thing${needsCount === 1 ? "" : "s"} need${needsCount === 1 ? "s" : ""} a human decision — everything else is already in motion.`;
    }
    return `Readiness dipped. ${needsCount || "A few"} decision${needsCount === 1 ? "" : "s"} ${needsCount === 1 ? "is" : "are"} waiting — none of them are mysteries.`;
  }, [score, needsCount]);

  const readyKicker = tone === "ok" ? "Audit readiness" : "Attention required";
  const readyLine =
    tone === "ok"
      ? `Weighted across the DSPD areas that apply to ${orgName} — documentation, EVV, credentials, obligations.`
      : "Still defensible — but open items are pulling the score down until humans finish them.";
  const readySub =
    overdueStaff > 0
      ? `Last refreshed just now · ${overdueStaff} staff with overdue obligations`
      : "Last refreshed just now · No staff with overdue training";

  const att = overviewQ.data?.attention;
  const billing = overviewQ.data?.billing;
  const evv = healthQ.data?.metrics?.find((m) => m.key === "evv_documentation" && m.applicable);
  const docs = healthQ.data?.metrics?.find((m) => m.key === "daily_progress_notes" && m.applicable);
  const billingMetric = healthQ.data?.metrics?.find((m) => m.key === "billing_accuracy" && m.applicable);

  const nextDeadline = upcoming[0] ?? dueSoon[0] ?? overdue[0] ?? null;
  const nextDeadlineLabel = nextDeadline
    ? (() => {
        const ms = nextDeadline.dueAt.getTime() - Date.now();
        if (ms < 0) return "overdue now";
        const d = Math.round(ms / 86_400_000);
        if (d <= 0) return "due today";
        if (d === 1) return "next deadline tomorrow";
        return `next deadline in ${d} days`;
      })()
    : "no open deadlines";

  const scrollToNeeds = () => {
    needsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-[1120px] space-y-5 sm:space-y-6">
      {/* ── Hero block ── */}
      <section
        className="animate-fade-in overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]"
        style={{ animationDuration: "0.45s" }}
      >
        <div
          className="border-b border-border px-5 py-4 sm:px-6"
          style={{ background: "var(--gradient-soft)" }}
        >
          <div className="flex flex-wrap items-baseline gap-3">
            <div className="font-display text-3xl font-extrabold tracking-tight text-hive-navy-900 sm:text-4xl">
              HIVE
            </div>
            <div className="text-sm font-semibold text-muted-foreground">{orgName}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 p-5 sm:p-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-10">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
              <Hexagon className="h-3.5 w-3.5" strokeWidth={2.5} />
              Home · Admin
            </div>
            <h1 className="font-display mt-2 max-w-[18ch] text-[clamp(1.5rem,3vw,2.15rem)] font-bold leading-tight tracking-tight text-foreground">
              {displayHeadline}
            </h1>
            <p className="mt-3 max-w-[40ch] text-sm leading-relaxed text-muted-foreground sm:text-[0.95rem]">
              {lede}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={scrollToNeeds}
                className="inline-flex items-center gap-2 rounded-lg bg-hive-navy-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-hive-navy-600 active:scale-[0.98]"
              >
                Review what needs you
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                to="/dashboard/ask-nectar"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-accent/5"
              >
                <Sparkles className="h-4 w-4 text-accent" />
                Ask Nectar
              </Link>
            </div>
          </div>

          <div
            className={cn(
              "flex flex-col items-center gap-3 rounded-xl border p-5 text-center transition-colors",
              tone === "ok" && "border-success/25 bg-success/5",
              tone === "warn" && "border-nectar-gold-300/60 bg-nectar-gold-50/80",
              tone === "bad" && "border-destructive/25 bg-destructive/5",
            )}
          >
            {score == null ? (
              <div className="grid h-[168px] w-[168px] place-items-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <ReadinessRing score={score} tone={tone} />
            )}
            <div>
              <div
                className={cn(
                  "text-[0.7rem] font-bold uppercase tracking-[0.12em]",
                  tone === "ok" && "text-success",
                  tone === "warn" && "text-nectar-gold-700",
                  tone === "bad" && "text-destructive",
                )}
              >
                {readyKicker}
              </div>
              <p className="mx-auto mt-1.5 max-w-[28ch] text-sm text-foreground/80">{readyLine}</p>
              <p className="mt-2 text-xs text-muted-foreground">{readySub}</p>
              <Link
                to="/dashboard/company-obligations"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-hive-navy-500 underline-offset-2 transition hover:text-hive-navy-700 hover:underline"
              >
                Open full metrics <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── What needs you ── */}
      <div ref={needsRef}>
        <SectionBlock
          id="needs"
          eyebrow="Decisions"
          title="What needs you"
          lede="Not a feed. Not forty widgets. Only decisions that cannot wait for automation."
          delayClass="[animation-delay:80ms] [animation-fill-mode:both]"
        >
          <div className="divide-y divide-border rounded-xl border border-border bg-background/60">
            {deadlinesLoading ? (
              <div className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : needsYou.length === 0 ? (
              <div className="px-4 py-10 text-sm text-muted-foreground">
                Nothing in the queue. A good moment to get ahead — or ask Nectar.
              </div>
            ) : (
              needsYou.map((item) => {
                const when = whenLabel(item);
                const href = item.href ?? "/dashboard/company-obligations";
                return (
                  <NeedsLink
                    key={item.key}
                    href={href}
                    className="group grid grid-cols-[4.5rem_1fr] gap-3 px-4 py-3.5 text-inherit no-underline transition hover:bg-muted/40 sm:grid-cols-[5rem_1fr_auto] sm:items-center sm:gap-4"
                  >
                    <div
                      className={cn(
                        "pt-0.5 text-[0.7rem] font-bold uppercase tracking-[0.06em]",
                        when.tone === "overdue" && "text-destructive",
                        when.tone === "today" && "text-nectar-gold-700",
                        when.tone === "soon" && "text-hive-teal-700",
                      )}
                    >
                      {when.text}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold tracking-tight text-foreground sm:text-[0.95rem]">
                        {item.title}
                      </h3>
                      <p className="mt-0.5 max-w-[52ch] text-xs text-muted-foreground sm:text-sm">
                        {item.cadenceLabel || item.dutyTitle || "Open to review and complete."}
                      </p>
                      <span className="mt-1.5 inline-block text-xs font-medium text-foreground/80">
                        {item.subject}
                        {item.dueAtMissing
                          ? ""
                          : ` · ${item.dueAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                      </span>
                    </div>
                    <span className="col-start-2 inline-flex items-center gap-1 self-center text-xs font-semibold text-hive-navy-500 opacity-80 transition group-hover:opacity-100 sm:col-start-auto">
                      Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </NeedsLink>
                );
              })
            )}
          </div>

          {(overdue.length > 0 || dueSoon.length > 0) && (
            <div className="mt-4">
              <Link
                to="/dashboard/company-obligations"
                search={{ tab: "action-required" }}
                className="inline-flex items-center gap-1 text-sm font-semibold text-hive-navy-500 underline-offset-2 transition hover:text-hive-navy-700 hover:underline"
              >
                See all action required <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </SectionBlock>
      </div>

      {/* ── Today's picture ── */}
      <SectionBlock
        eyebrow="Transparency"
        title="Today's picture"
        lede="One honest glance at how the agency is moving — no vanity metrics."
        delayClass="[animation-delay:140ms] [animation-fill-mode:both]"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <PictureTile
            label="Coverage"
            value={
              att && att.unacceptedShifts > 0 ? (
                <>
                  <span className="font-semibold text-nectar-gold-700">{att.unacceptedShifts}</span> open
                  shift{att.unacceptedShifts === 1 ? "" : "s"} still unaccepted
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">Shifts clear</span>
                  {" · "}no unaccepted coverage gaps
                </>
              )
            }
          />
          <PictureTile
            label="EVV"
            value={
              evv ? (
                <>
                  <span className={evv.score >= 90 ? "font-semibold text-success" : "font-semibold text-nectar-gold-700"}>
                    {evv.passing} / {evv.total}
                  </span>{" "}
                  documentation passing
                  {evv.total - evv.passing > 0
                    ? ` · ${evv.total - evv.passing} need review`
                    : " · no open exceptions"}
                </>
              ) : (
                "Loading EVV…"
              )
            }
          />
          <PictureTile
            label="Documentation"
            value={
              docs ? (
                <>
                  <span className={docs.score >= 90 ? "font-semibold text-success" : "font-semibold text-foreground"}>
                    {docs.passing} / {docs.total}
                  </span>{" "}
                  daily notes on track
                  {att && (att.unsignedNotes > 0 || att.missingDailyLogs > 0) ? (
                    <>
                      {" · "}
                      <span className="font-semibold text-foreground">
                        {att.unsignedNotes + att.missingDailyLogs}
                      </span>{" "}
                      need admin attention
                    </>
                  ) : null}
                </>
              ) : (
                "Loading documentation…"
              )
            }
          />
          <PictureTile
            label="People"
            value={
              peopleQ.data ? (
                <>
                  {peopleQ.data.clients} clients · {peopleQ.data.staff} staff
                  {att && att.expiringCredentials > 0 ? (
                    <>
                      {" · "}
                      <span className="font-semibold text-nectar-gold-700">{att.expiringCredentials}</span> cert
                      {att.expiringCredentials === 1 ? "" : "s"} expiring
                    </>
                  ) : null}
                </>
              ) : (
                "Loading people…"
              )
            }
          />
          <PictureTile
            className="sm:col-span-2"
            label="Billing pulse"
            value={
              billing ? (
                <>
                  {billing.periodLabel}:{" "}
                  <span className="font-semibold text-foreground">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(billing.claimsReadyAmount)}
                  </span>{" "}
                  claims-ready
                  {billingMetric && billingMetric.total - billingMetric.passing > 0 ? (
                    <>
                      {" · "}
                      <span className="font-semibold text-nectar-gold-700">
                        {billingMetric.total - billingMetric.passing}
                      </span>{" "}
                      accuracy flags
                    </>
                  ) : (
                    " · scrubber quiet"
                  )}
                </>
              ) : billingMetric ? (
                <>
                  Billing accuracy{" "}
                  <span className="font-semibold text-foreground">{billingMetric.score}%</span>
                  {billingMetric.total - billingMetric.passing > 0
                    ? ` · ${billingMetric.total - billingMetric.passing} flags`
                    : " · on track"}
                </>
              ) : (
                "Billing snapshot unavailable for this role"
              )
            }
          />
        </div>
      </SectionBlock>

      {/* ── Nectar ── */}
      <section
        className="animate-fade-in overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] [animation-delay:200ms] [animation-fill-mode:both]"
      >
        <div className="grid grid-cols-1 gap-6 border-l-4 border-l-accent p-5 sm:p-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
              Nectar · always advisory
            </div>
            <h2 className="font-display mt-2 max-w-[18ch] text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Watching so you don&apos;t have to hover.
            </h2>
            <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
              Nectar drafts, flags, and reminds. It never invents documentation and never publishes
              unreviewed. You stay in control — HIVE just makes the control feel quiet.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <WatchRow
              name="Scrubber"
              detail={
                att && att.pendingBillingWarnings > 0
                  ? `${att.pendingBillingWarnings} billing risk${att.pendingBillingWarnings === 1 ? "" : "s"} open`
                  : "0 billing risks this week"
              }
              ok={!att || att.pendingBillingWarnings === 0}
            />
            <WatchRow name="Sentinel" detail={nextDeadlineLabel} ok={!overdue.length} />
            <WatchRow
              name="Gatekeeper"
              detail={
                att && att.unsignedNotes + att.missingDailyLogs > 0
                  ? `${att.unsignedNotes + att.missingDailyLogs} note${att.unsignedNotes + att.missingDailyLogs === 1 ? "" : "s"} need attention`
                  : "notes queue clear"
              }
              ok={!att || att.unsignedNotes + att.missingDailyLogs === 0}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function PictureTile({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/30 px-4 py-3.5 transition hover:bg-muted/50",
        className,
      )}
    >
      <div className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 text-sm leading-snug text-foreground/90">{value}</div>
    </div>
  );
}

function WatchRow({ name, detail, ok }: { name: string; detail: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground/90 transition hover:border-accent/30">
      <b className={ok ? "text-success" : "text-nectar-gold-700"}>{name}</b>
      <span className="text-muted-foreground"> · {detail}</span>
    </div>
  );
}

function NeedsLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  if (!href.startsWith("/")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  const [path, qs] = href.split("?");
  const search = qs
    ? Object.fromEntries(new URLSearchParams(qs).entries())
    : undefined;
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={path as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search={search as any}
      className={className}
    >
      {children}
    </Link>
  );
}
