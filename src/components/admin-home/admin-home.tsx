/**
 * Admin Home — "the quiet command."
 * Matches the approved demo: brand-forward hero, readiness signal,
 * only-human-decisions list, plain-language picture, Nectar as quiet watcher.
 */
import { useMemo, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2 } from "lucide-react";
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

function scoreTone(score: number): "sage" | "honey" | "rose" {
  if (score >= 90) return "sage";
  if (score >= 75) return "honey";
  return "rose";
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

function ReadinessRing({ score, tone }: { score: number; tone: "sage" | "honey" | "rose" }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, score));
  const offset = c - (clamped / 100) * c;
  const stroke =
    tone === "sage" ? "#2f6b4f" : tone === "honey" ? "#d4922a" : "#9b2c2c";
  const text =
    tone === "sage" ? "text-[#2f6b4f]" : tone === "honey" ? "text-[#a86d12]" : "text-[#9b2c2c]";

  return (
    <div className="relative grid h-[200px] w-[200px] place-items-center">
      <svg viewBox="0 0 120 120" className="h-[200px] w-[200px] -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(16,19,31,0.08)" strokeWidth="9" />
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
          <div className={cn("font-display text-5xl font-extrabold tabular-nums tracking-tight", text)}>
            {Math.round(score)}
          </div>
          <div className="mt-1 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-[#5e667c]">
            Ready
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminHome() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const orgName = org?.organization_name ?? "Your agency";
  const needsRef = useRef<HTMLElement | null>(null);

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
  const tone = score == null ? "sage" : scoreTone(score);
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

  const readyKicker = tone === "sage" ? "Audit readiness" : "Attention required";
  const readyLine =
    tone === "sage"
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
    <div
      className="relative -mx-4 -mt-6 min-h-[70vh] overflow-hidden px-4 pb-16 md:-mx-8 md:px-8"
      style={{
        background:
          "radial-gradient(900px 520px at 12% -8%, rgba(212,146,42,0.14), transparent 55%), radial-gradient(700px 480px at 100% 8%, rgba(47,107,79,0.09), transparent 50%), linear-gradient(180deg, #f8f5ef 0%, #f6f4ef 38%, #efebe3 100%)",
      }}
    >
      {/* Honeycomb atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='56' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 0l28 16v32L28 64 0 48V16z' fill='none' stroke='%2310131f' stroke-opacity='0.05' stroke-width='1'/%3E%3C/svg%3E\")",
          backgroundSize: "56px 64px",
          maskImage: "linear-gradient(180deg, #000 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1120px]">
        {/* ── Hero ── */}
        <header className="grid grid-cols-1 items-end gap-9 pb-3 pt-8 md:grid-cols-[1.15fr_0.85fr] md:gap-12 md:pt-10 lg:min-h-[min(72vh,720px)]">
          <div>
            <div className="mb-4 flex flex-wrap items-baseline gap-3.5">
              <div className="font-display text-[clamp(3rem,8vw,4.75rem)] font-extrabold leading-[0.9] tracking-[-0.045em] text-[#10131f]">
                HIVE
              </div>
              <div className="pb-1 text-[0.95rem] font-semibold text-[#5e667c]">{orgName}</div>
            </div>

            <h1 className="font-display mb-3.5 max-w-[18ch] text-[clamp(1.55rem,3.2vw,2.35rem)] font-bold leading-[1.15] tracking-[-0.03em] text-[#2a3148]">
              {displayHeadline}
            </h1>
            <p className="mb-7 max-w-[38ch] text-[1.08rem] text-[#5e667c]">{lede}</p>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={scrollToNeeds}
                className="rounded-[10px] bg-[#10131f] px-[18px] py-3 text-[0.92rem] font-semibold text-[#fffcf7] transition hover:bg-[#1c2438] active:scale-[0.98]"
              >
                Review what needs you
              </button>
              <Link
                to="/dashboard/ask-nectar"
                className="rounded-[10px] border border-[rgba(16,19,31,0.08)] bg-transparent px-[18px] py-3 text-[0.92rem] font-semibold text-[#2a3148] transition hover:bg-[rgba(16,19,31,0.04)]"
              >
                Ask Nectar
              </Link>
            </div>
          </div>

          <div className="justify-self-start md:justify-self-end">
            <div className="flex w-full max-w-[320px] flex-col items-center gap-4 rounded-[20px] border border-[rgba(16,19,31,0.06)] bg-[rgba(255,252,247,0.72)] px-[22px] py-7 text-center backdrop-blur-[8px]">
              {score == null ? (
                <div className="grid h-[200px] w-[200px] place-items-center text-[#5e667c]">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <ReadinessRing score={score} tone={tone} />
              )}
              <div>
                <div
                  className={cn(
                    "mb-1.5 text-[0.72rem] font-bold uppercase tracking-[0.1em]",
                    tone === "sage" ? "text-[#2f6b4f]" : tone === "honey" ? "text-[#a86d12]" : "text-[#9b2c2c]",
                  )}
                >
                  {readyKicker}
                </div>
                <p className="mx-auto max-w-[28ch] text-[0.95rem] text-[#2a3148]">{readyLine}</p>
                <p className="mt-2.5 text-[0.8rem] text-[#5e667c]">{readySub}</p>
                <Link
                  to="/dashboard/company-obligations"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#10131f] underline-offset-2 hover:underline"
                >
                  Open full metrics <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>

          <div className="col-span-full mt-2 inline-flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-[#5e667c]">
            <span className="inline-block h-px w-[18px] bg-[#5e667c]" aria-hidden />
            What needs you
          </div>
        </header>

        {/* ── Needs you ── */}
        <section ref={needsRef} id="needs" className="mt-10 scroll-mt-6">
          <h2 className="font-display text-[clamp(1.35rem,2.4vw,1.75rem)] tracking-[-0.025em] text-[#10131f]">
            What needs you
          </h2>
          <p className="mb-5 mt-1.5 max-w-[48ch] text-[0.98rem] text-[#5e667c]">
            Not a feed. Not forty widgets. Only decisions that cannot wait for automation.
          </p>

          <div className="border-t border-[rgba(16,19,31,0.08)]">
            {deadlinesLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-[#5e667c]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : needsYou.length === 0 ? (
              <div className="py-10 text-[0.98rem] text-[#5e667c]">
                Nothing in the queue. A good moment to get ahead — or ask Nectar.
              </div>
            ) : (
              needsYou.map((item) => {
                const when = whenLabel(item);
                const href = item.href ?? "/dashboard/company-obligations";
                const body = (
                  <>
                    <div
                      className={cn(
                        "pt-1 text-[0.72rem] font-bold uppercase tracking-[0.04em]",
                        when.tone === "overdue" && "text-[#9b2c2c]",
                        when.tone === "today" && "text-[#a86d12]",
                        when.tone === "soon" && "text-[#1f4f6e]",
                      )}
                    >
                      {when.text}
                    </div>
                    <div className="min-w-0">
                      <h3 className="mb-1 text-[1.02rem] font-semibold tracking-[-0.01em] text-[#10131f]">
                        {item.title}
                      </h3>
                      <p className="max-w-[52ch] text-[0.9rem] text-[#5e667c]">
                        {item.cadenceLabel || item.dutyTitle || "Open to review and complete."}
                      </p>
                      <span className="mt-2 inline-block text-[0.8rem] font-semibold text-[#2a3148]">
                        {item.subject}
                        {item.dueAtMissing
                          ? ""
                          : ` · ${item.dueAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                      </span>
                    </div>
                    <span className="col-start-2 self-center whitespace-nowrap text-[0.85rem] font-semibold text-[#10131f] group-hover:underline sm:col-start-auto">
                      Open →
                    </span>
                  </>
                );
                const rowClass =
                  "group grid grid-cols-[56px_1fr] gap-4 border-b border-[rgba(16,19,31,0.08)] py-[18px] text-inherit no-underline transition hover:bg-[rgba(16,19,31,0.02)] sm:grid-cols-[72px_1fr_auto] sm:items-start";
                return (
                  <NeedsLink key={item.key} href={href} className={rowClass}>
                    {body}
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
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#10131f] underline-offset-2 hover:underline"
              >
                See all action required <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </section>

        {/* ── Today's picture ── */}
        <section className="mt-14">
          <h2 className="font-display text-[clamp(1.35rem,2.4vw,1.75rem)] tracking-[-0.025em] text-[#10131f]">
            Today&apos;s picture
          </h2>
          <p className="mb-5 mt-1.5 max-w-[48ch] text-[0.98rem] text-[#5e667c]">
            One honest glance at how the agency is moving — no vanity metrics.
          </p>

          <div className="border-t border-[rgba(16,19,31,0.08)]">
            <PictureLane
              label="Coverage"
              value={
                att && att.unacceptedShifts > 0 ? (
                  <>
                    <span className="font-bold text-[#a86d12]">{att.unacceptedShifts}</span> open
                    shift{att.unacceptedShifts === 1 ? "" : "s"} still unaccepted
                  </>
                ) : (
                  <>
                    <em className="font-bold not-italic text-[#10131f]">Shifts clear</em>
                    {" · "}
                    no unaccepted coverage gaps in the queue
                  </>
                )
              }
            />
            <PictureLane
              label="EVV"
              value={
                evv ? (
                  <>
                    <span className={evv.score >= 90 ? "font-bold text-[#2f6b4f]" : "font-bold text-[#a86d12]"}>
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
            <PictureLane
              label="Documentation"
              value={
                docs ? (
                  <>
                    <span className={docs.score >= 90 ? "font-bold text-[#2f6b4f]" : "font-bold text-[#10131f]"}>
                      {docs.passing} / {docs.total}
                    </span>{" "}
                    daily notes on track
                    {att && (att.unsignedNotes > 0 || att.missingDailyLogs > 0) ? (
                      <>
                        {" · "}
                        <em className="font-bold not-italic text-[#10131f]">
                          {att.unsignedNotes + att.missingDailyLogs}
                        </em>{" "}
                        need admin attention
                      </>
                    ) : null}
                  </>
                ) : (
                  "Loading documentation…"
                )
              }
            />
            <PictureLane
              label="People"
              value={
                peopleQ.data ? (
                  <>
                    {peopleQ.data.clients} active clients · {peopleQ.data.staff} staff on roster
                    {att && att.expiringCredentials > 0 ? (
                      <>
                        {" · "}
                        <span className="font-bold text-[#a86d12]">{att.expiringCredentials}</span> cert
                        {att.expiringCredentials === 1 ? "" : "s"} expiring soon
                      </>
                    ) : null}
                  </>
                ) : (
                  "Loading people…"
                )
              }
            />
            <PictureLane
              label="Billing pulse"
              value={
                billing ? (
                  <>
                    {billing.periodLabel}:{" "}
                    <em className="font-bold not-italic text-[#10131f]">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      }).format(billing.claimsReadyAmount)}
                    </em>{" "}
                    claims-ready
                    {billingMetric && billingMetric.total - billingMetric.passing > 0 ? (
                      <>
                        {" · "}
                        <span className="font-bold text-[#a86d12]">
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
                    <span className="font-bold text-[#10131f]">{billingMetric.score}%</span>
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
        </section>

        {/* ── Nectar strip ── */}
        <div className="mt-12 grid grid-cols-1 items-end gap-5 border-t-2 border-[#10131f] pt-7 md:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.1em] text-[#a86d12]">
              Nectar · always advisory
            </div>
            <h2 className="font-display mb-2 max-w-[18ch] text-[clamp(1.4rem,2.6vw,1.9rem)] tracking-[-0.03em] text-[#10131f]">
              Watching so you don&apos;t have to hover.
            </h2>
            <p className="max-w-[42ch] text-[0.95rem] text-[#5e667c]">
              Nectar drafts, flags, and reminds. It never invents documentation and never publishes
              unreviewed. You stay in control — HIVE just makes the control feel quiet.
            </p>
          </div>
          <div className="flex min-w-[200px] flex-col gap-2">
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
      </div>
    </div>
  );
}

function PictureLane({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-baseline gap-1 border-b border-[rgba(16,19,31,0.08)] py-4 sm:grid-cols-[140px_1fr] sm:gap-4">
      <div className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[#5e667c]">{label}</div>
      <div className="text-[1rem] font-medium text-[#2a3148]">{value}</div>
    </div>
  );
}

function WatchRow({ name, detail, ok }: { name: string; detail: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-[rgba(16,19,31,0.08)] bg-[#fffcf7] px-3 py-2.5 text-[0.85rem] text-[#2a3148]">
      <b className={ok ? "text-[#2f6b4f]" : "text-[#a86d12]"}>{name}</b>
      <span className="text-[#5e667c]"> · {detail}</span>
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
