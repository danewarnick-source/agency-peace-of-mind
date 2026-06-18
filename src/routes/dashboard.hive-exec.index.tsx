import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Building2, Search, AlertTriangle, Lock, Users, Contact2, DollarSign } from "lucide-react";
import { getExecKpis, listCompanies, type CompanyRow } from "@/lib/hive-exec.functions";

export const Route = createFileRoute("/dashboard/hive-exec/")({
  component: CompaniesPage,
});

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function CompaniesPage() {
  const kpisFn = useServerFn(getExecKpis);
  const listFn = useServerFn(listCompanies);
  const kpisQ = useQuery({ queryKey: ["hive-exec-kpis"], queryFn: () => kpisFn(), refetchInterval: 30_000 });
  const listQ = useQuery({ queryKey: ["hive-exec-companies"], queryFn: () => listFn(), refetchInterval: 30_000 });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const rows = useMemo<CompanyRow[]>(() => {
    const data = listQ.data ?? [];
    return data.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [listQ.data, search, statusFilter]);

  const k = kpisQ.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Building2} label="Active companies" value={k?.active_companies ?? "—"} />
        <Kpi icon={DollarSign} label="MRR" value={k ? fmtMoney(k.mrr_cents) : "—"} />
        <Kpi icon={AlertTriangle} label="Past due" value={k?.past_due_companies ?? "—"} tone="warn" />
        <Kpi icon={Lock} label="Locked" value={k?.locked_companies ?? "—"} tone="warn" />
      </div>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="font-display text-lg font-semibold">Customer companies</h2>
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company…"
                className="min-h-[44px] w-full rounded-md border border-border bg-background pl-7 pr-3 text-sm md:w-64"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="locked">Locked</option>
              <option value="cancelled">Cancelled</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">MRR</th>
                <th className="px-3 py-2">Renewal</th>
                <th className="px-3 py-2 text-right"><Users className="ml-auto inline h-3 w-3" /> Staff</th>
                <th className="px-3 py-2 text-right"><Contact2 className="ml-auto inline h-3 w-3" /> Clients</th>
                <th className="px-3 py-2 text-right">Tickets</th>
                <th className="px-3 py-2">Health</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading companies…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No companies match.</td></tr>
              ) : rows.map((r) => (
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
                  <td className="px-3 py-2"><PlanBadge plan={r.plan} /></td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.mrr_cents)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.renewal_date ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.staff_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.client_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.open_tickets}</td>
                  <td className="px-3 py-2"><HealthDot health={r.health} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, tone,
}: { icon: typeof Building2; label: string; value: string | number; tone?: "warn" }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tone === "warn" ? "border-[#fecaca] bg-[#fef2f2]" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums text-[#0f1b3d]">{value}</div>
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    hive_standard: "bg-[#fff7ed] text-[#9a3412]",
    enterprise: "bg-[#0f1b3d] text-white",
  };
  const label = plan === "hive_standard" ? "Standard" : plan === "enterprise" ? "Enterprise" : plan;
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[plan] ?? "bg-muted"}`}>{label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    past_due: "bg-amber-100 text-amber-700",
    locked: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-600",
    canceled: "bg-gray-100 text-gray-600",
    inactive: "bg-slate-100 text-slate-600",
  };
  return <span className={`rounded px-2 py-0.5 text-xs ${map[status] ?? "bg-muted"}`}>{status.replace("_", " ")}</span>;
}

function HealthDot({ health }: { health: "good" | "warn" | "risk" }) {
  const map = {
    good: { dot: "bg-emerald-500", label: "Good" },
    warn: { dot: "bg-amber-500", label: "Watch" },
    risk: { dot: "bg-red-500", label: "Risk" },
  }[health];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${map.dot}`} /> {map.label}
    </span>
  );
}
