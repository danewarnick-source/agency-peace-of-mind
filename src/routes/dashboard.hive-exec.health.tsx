import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, TrendingUp, Users, Clock } from "lucide-react";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { listCompanies, type CompanyRow } from "@/lib/hive-exec.functions";

export const Route = createFileRoute("/dashboard/hive-exec/health")({
  head: () => ({ meta: [{ title: "Account Health — HIVE Executive" }] }),
  component: () => (
    <RequireHiveExecutive>
      <AccountHealth />
    </RequireHiveExecutive>
  ),
});

function AccountHealth() {
  const listFn = useServerFn(listCompanies);
  const q = useQuery({ queryKey: ["hive-exec-companies"], queryFn: () => listFn() });
  const rows = q.data ?? [];

  const buckets = useMemo(() => {
    const good: CompanyRow[] = [];
    const warn: CompanyRow[] = [];
    const risk: CompanyRow[] = [];
    for (const r of rows) {
      if (r.health === "risk") risk.push(r);
      else if (r.health === "warn") warn.push(r);
      else good.push(r);
    }
    return { good, warn, risk };
  }, [rows]);

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f1b3d] text-white">
            <Activity className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">Account Health</h2>
            <p className="text-sm text-muted-foreground">
              Engagement, churn risk, and support load across customer companies — metadata only.
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HealthKpi label="Total companies" value={rows.length} icon={TrendingUp} />
        <HealthKpi label="Healthy" value={buckets.good.length} icon={Activity} tone="good" />
        <HealthKpi label="Watch" value={buckets.warn.length} icon={Clock} tone="warn" />
        <HealthKpi label="At risk" value={buckets.risk.length} icon={AlertTriangle} tone="risk" />
      </div>

      <HealthBucket title="At risk" rows={buckets.risk} tone="risk" />
      <HealthBucket title="Watch" rows={buckets.warn} tone="warn" />
      <HealthBucket title="Healthy" rows={buckets.good} tone="good" />
    </div>
  );
}

function HealthKpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone?: "good" | "warn" | "risk";
}) {
  const toneClass =
    tone === "risk"
      ? "border-[#fecaca] bg-[#fef2f2]"
      : tone === "warn"
        ? "border-[#fed7aa] bg-[#fffdf7]"
        : tone === "good"
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums text-[#0f1b3d]">
        {value}
      </div>
    </div>
  );
}

function HealthBucket({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: CompanyRow[];
  tone: "good" | "warn" | "risk";
}) {
  if (rows.length === 0) return null;
  const dot =
    tone === "risk" ? "bg-red-500" : tone === "warn" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
        <span className={`h-2 w-2 rounded-full ${dot}`} /> {title}
        <span className="text-xs text-muted-foreground">({rows.length})</span>
      </h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">
                <Users className="ml-auto inline h-3 w-3" /> Staff
              </th>
              <th className="px-3 py-2 text-right">Clients</th>
              <th className="px-3 py-2 text-right">Open tickets</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.organization_id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link
                    to="/dashboard/hive-exec/$orgId"
                    params={{ orgId: r.organization_id }}
                    className="font-medium text-[#0f1b3d] hover:underline"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs uppercase tracking-wide">{r.plan}</td>
                <td className="px-3 py-2 text-xs">{r.status.replace("_", " ")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.staff_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.client_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.open_tickets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
