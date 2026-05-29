import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAgencyHealthSnapshot } from "@/lib/agency-health.functions";
import { CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";

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
  if (score >= 80)
    return {
      label: "Warning",
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

function MetricRow({ label, score, detail }: { label: string; score: number; detail: string }) {
  const t = tierFor(score);
  const Icon = score >= 90 ? CheckCircle2 : score >= 80 ? AlertTriangle : ShieldAlert;
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.text}`} strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium leading-tight text-foreground">{label}</p>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${t.badge}`}
          >
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
  icon,
  overall,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  overall: number;
  items: { label: string; score: number; detail: string }[];
}) {
  const t = tierFor(overall);
  return (
    <div className={`flex flex-col gap-4 rounded-lg border ${t.border} ${t.bg} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent">
            {icon}
          </span>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${t.badge}`}
        >
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
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent">
            <ShieldAlert className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Agency Health Snapshot
          </h2>
        </div>
        <span className="text-[11px] text-muted-foreground">Global · last 30 days</span>
      </div>

      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-[420px] animate-pulse rounded-lg border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Column
            title="Client Records Health"
            icon={<CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />}
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
            title="Employee Documentation Health"
            icon={<CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />}
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
