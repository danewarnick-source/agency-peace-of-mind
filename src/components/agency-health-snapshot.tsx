import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getAgencyHealthSnapshot, type HealthMetric } from "@/lib/agency-health.functions";
import { CheckCircle2, AlertTriangle, ShieldAlert, ArrowRight } from "lucide-react";

type Tier = {
  label: string;
  ring: string;
  text: string;
  bg: string;
  border: string;
  badge: string;
};

function tierFor(score: number): Tier {
  if (score >= 90)
    return {
      label: "Optimal",
      ring: "stroke-success",
      text: "text-success",
      bg: "bg-success/8",
      border: "border-success/25",
      badge: "bg-success/12 text-success border-success/25",
    };
  if (score >= 75)
    return {
      label: "Watch",
      ring: "stroke-warning",
      text: "text-warning-foreground",
      bg: "bg-warning/8",
      border: "border-warning/25",
      badge: "bg-warning/15 text-warning-foreground border-warning/25",
    };
  return {
    label: "Critical Risk",
    ring: "stroke-destructive",
    text: "text-destructive",
    bg: "bg-destructive/8",
    border: "border-destructive/25",
    badge: "bg-destructive/12 text-destructive border-destructive/25",
  };
}

function RadialRing({ score, tier }: { score: number; tier: Tier }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c;
  return (
    <div className="relative grid h-36 w-36 place-items-center">
      <svg viewBox="0 0 140 140" className="h-36 w-36 -rotate-90">
        <circle cx="70" cy="70" r={r} className="fill-none stroke-border" strokeWidth="6" />
        <circle
          cx="70"
          cy="70"
          r={r}
          className={`fill-none ${tier.ring} transition-all duration-700`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className={`text-3xl font-semibold tabular-nums ${tier.text}`}>{score}%</div>
        </div>
      </div>
    </div>
  );
}

function parseLink(link: string): { to: string; search?: Record<string, string> } {
  const [path, qs] = link.split("?");
  if (!qs) return { to: path };
  const search: Record<string, string> = {};
  for (const part of qs.split("&")) {
    const [k, v] = part.split("=");
    if (k) search[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return { to: path, search };
}

function MetricRow({ m }: { m: HealthMetric }) {
  const t = tierFor(m.score);
  const Icon = m.score >= 90 ? CheckCircle2 : m.score >= 75 ? AlertTriangle : ShieldAlert;
  const { to, search } = parseLink(m.link);
  return (
    <li>
      <Link
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        to={to as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        search={search as any}
        className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition hover:border-primary/40"
      >
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.text}`} strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium leading-tight text-foreground">{m.label}</p>
            <span className={`text-sm font-semibold tabular-nums ${t.text}`}>{m.score}%</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {m.total === 0 && m.score === 100
              ? "No active items — compliant"
              : `${m.passing} of ${m.total} passing`}
          </p>
        </div>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

export function AgencyHealthSnapshot({ organizationId }: { organizationId: string }) {
  const fetchFn = useServerFn(getAgencyHealthSnapshot);
  const { data, isLoading } = useQuery({
    queryKey: ["agency-health", organizationId],
    queryFn: () => fetchFn({ data: { organizationId } }),
  });

  const tier = data ? tierFor(data.overall) : null;
  const visible = data?.metrics.filter((m) => m.applicable) ?? [];

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent">
            <ShieldAlert className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Audit Readiness Score
          </h2>
        </div>
        <span className="text-[11px] text-muted-foreground">DSPD SOW · weighted</span>
      </div>

      {isLoading || !data || !tier ? (
        <div className="h-[420px] animate-pulse rounded-lg border border-border bg-muted/40" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          <div className={`flex flex-col items-center rounded-xl border ${tier.border} ${tier.bg} p-4`}>
            <RadialRing score={data.overall} tier={tier} />
            <span className={`mt-2 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tier.badge}`}>
              {tier.label}
            </span>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {visible.length} applicable metric{visible.length === 1 ? "" : "s"}
            </p>
          </div>
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {visible.map((m) => (
              <MetricRow key={m.key} m={m} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
