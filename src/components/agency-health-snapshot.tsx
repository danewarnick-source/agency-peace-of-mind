import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAgencyHealthSnapshot } from "@/lib/agency-health.functions";
import { CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";

type Tier = { label: string; ring: string; text: string; bg: string; border: string; badge: string };

function tierFor(score: number): Tier {
  if (score >= 90)
    return {
      label: "🟢 OPTIMAL",
      ring: "stroke-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    };
  if (score >= 80)
    return {
      label: "🟡 WARNING",
      ring: "stroke-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    };
  return {
    label: "🚨 CRITICAL RISK",
    ring: "stroke-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  };
}

function RadialRing({ score, tier }: { score: number; tier: Tier }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c;
  return (
    <div className="relative grid h-36 w-36 place-items-center">
      <svg viewBox="0 0 140 140" className="h-36 w-36 -rotate-90">
        <circle cx="70" cy="70" r={r} className="fill-none stroke-muted" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          className={`fill-none ${tier.ring} transition-all duration-700`}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className={`text-3xl font-bold tabular-nums ${tier.text}`}>{score}%</div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, score, detail }: { label: string; score: number; detail: string }) {
  const t = tierFor(score);
  const Icon = score >= 90 ? CheckCircle2 : score >= 80 ? AlertTriangle : ShieldAlert;
  return (
    <li className="flex items-start gap-3 rounded-md border border-border bg-card/50 p-3">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.text}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium leading-tight">{label}</p>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${t.badge}`}>
            {score}%
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

function Column({
  title,
  overall,
  items,
}: {
  title: string;
  overall: number;
  items: { label: string; score: number; detail: string }[];
}) {
  const t = tierFor(overall);
  return (
    <div className={`flex flex-col gap-4 rounded-xl border ${t.border} ${t.bg} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${t.badge}`}>
          {t.label}
        </span>
      </div>
      <div className="flex items-center justify-center py-2">
        <RadialRing score={overall} tier={t} />
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <MetricRow key={it.label} {...it} />
        ))}
      </ul>
    </div>
  );
}

export function AgencyHealthSnapshot({ organizationId }: { organizationId: string }) {
  const fetchFn = useServerFn(getAgencyHealthSnapshot);
  const { data, isLoading } = useQuery({
    queryKey: ["agency-health", organizationId],
    queryFn: () => fetchFn({ data: { organizationId } }),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">🛡️ Your Agency Health Snapshot</h2>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Global · last 30 days</span>
      </div>

      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-[420px] animate-pulse rounded-xl border border-border bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Column
            title="👤 Client Records Health"
            overall={data.client.overall}
            items={[
              {
                label: "Daily Progress Note Fulfillment",
                score: data.client.daily.score,
                detail: `${data.client.daily.passing}/${data.client.daily.total} logs pass the 50-character threshold`,
              },
              {
                label: "Medication Protocol Compliance",
                score: data.client.medication.score,
                detail: `${data.client.medication.passing}/${data.client.medication.total} doses signed with timestamp & no variance`,
              },
              {
                label: "Monthly Attendance Matrix Verification",
                score: data.client.attendance.score,
                detail: `${data.client.attendance.passing}/${data.client.attendance.total} billable tiles signed & legally attested`,
              },
            ]}
          />
          <Column
            title="👥 Employee Documentation Health"
            overall={data.employee.overall}
            items={[
              {
                label: "EVV Geofence Validation",
                score: data.employee.geofence.score,
                detail: `${data.employee.geofence.passing}/${data.employee.geofence.total} clock-ins within GPS boundary`,
              },
              {
                label: "Medication Administration Accuracy",
                score: data.employee.emarAccuracy.score,
                detail: `${data.employee.emarAccuracy.passing}/${data.employee.emarAccuracy.total} eMAR passes with signed attestation`,
              },
              {
                label: "SOW Credentials Compliance",
                score: data.employee.credentials.score,
                detail: `${data.employee.credentials.passing}/${data.employee.credentials.total} active staff with approved credentials (Utah Code §26B-2-120)`,
              },
            ]}
          />
        </div>
      )}
    </section>
  );
}
