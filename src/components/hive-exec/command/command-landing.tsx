import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, ShieldCheck, FileSignature, Wrench, DollarSign, Building2, AlertTriangle, ShieldAlert } from "lucide-react";
import { getCommandMetrics, getNeedsYouSummary } from "@/lib/exec-command.functions";
import { SteveDockPanel } from "@/components/hive-exec/command/steve-panel";


function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function CommandCenterLanding() {
  const metricsFn = useServerFn(getCommandMetrics);
  const needsFn = useServerFn(getNeedsYouSummary);
  const metricsQ = useQuery({ queryKey: ["exec-cmd-metrics"], queryFn: () => metricsFn(), refetchInterval: 60_000 });
  const needsQ = useQuery({ queryKey: ["exec-cmd-needs"], queryFn: () => needsFn(), refetchInterval: 60_000 });
  

  const m = metricsQ.data;
  const n = needsQ.data;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <section className="rounded-xl border border-[#fed7aa] bg-gradient-to-r from-[#0f1b3d] to-[#1a2a5a] p-5 text-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-[#fed7aa]">HIVE Platform</div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Executive Command Center</h1>
              <p className="mt-1 text-sm text-white/80">Platform operations</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#fed7aa] bg-[#0f1b3d] px-3 py-1.5 text-xs font-medium text-[#fed7aa]">
              <ShieldAlert className="h-3.5 w-3.5" />
              Account and billing only — no client records or PHI
            </span>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <MetricCard icon={<DollarSign className="h-4 w-4" />} label="MRR" value={m ? fmtMoney(m.mrr_cents) : "—"} sub="Active + past due" />
          <MetricCard icon={<Building2 className="h-4 w-4" />} label="Active companies" value={m?.active_companies ?? "—"} sub={m ? `${m.trial_companies} trial` : ""} />
          <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Past due" value={m?.past_due_companies ?? "—"} sub="Payment failure" warn={(m?.past_due_companies ?? 0) > 0} />
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Needs you</h2>
          <div className="space-y-2">
            <NeedsRow
              to="/dashboard/hive-exec/upgrade-requests"
              icon={<Sparkles className="h-4 w-4" />}
              label="Upgrade requests"
              count={n?.upgrade_requests ?? 0}
              emphasis
            />
            <NeedsRow to="/dashboard/hive-exec/approvals" icon={<ShieldCheck className="h-4 w-4" />} label="Extraction approvals" count={n?.extraction_approvals ?? 0} />
            <NeedsRow to="/dashboard/hive-exec/billing-approvals" icon={<ShieldCheck className="h-4 w-4" />} label="Billing approvals" count={n?.billing_approvals ?? 0} />
            <NeedsRow to="/dashboard/hive-exec/functionality" icon={<Wrench className="h-4 w-4" />} label="Open functionality reports" count={n?.functionality_reports ?? 0} />
            <NeedsRow to="/dashboard/hive-exec/agreements" icon={<FileSignature className="h-4 w-4" />} label="Agreements overdue / expiring ≤30d" count={n?.agreements_attention ?? 0} />
          </div>
        </section>

      </div>

      <SteveDockPanel />
    </div>
  );
}

function MetricCard({ icon, label, value, sub, warn }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${warn ? "border-[#fecaca] bg-[#fef2f2]" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <div className={`mt-1 font-display text-2xl font-bold ${warn ? "text-[#b91c1c]" : "text-[#0f1b3d]"}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function NeedsRow({ to, icon, label, count, emphasis }: { to: string; icon: React.ReactNode; label: string; count: number; emphasis?: boolean }) {
  const showEmphasis = emphasis && count > 0;
  return (
    <Link
      to={to}
      className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
        showEmphasis
          ? "border-[#d97a1c] bg-gradient-to-r from-[#fff7ed] to-[#ffedd5] hover:border-[#c2610e]"
          : "border-border bg-background hover:bg-muted"
      }`}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className={showEmphasis ? "text-[#d97a1c]" : "text-muted-foreground"}>{icon}</span>
        <span className={showEmphasis ? "font-semibold text-[#7c2d12]" : "text-foreground"}>{label}</span>
      </div>
      <span
        className={`inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
          count === 0 ? "bg-muted text-muted-foreground" : showEmphasis ? "bg-[#d97a1c] text-white" : "bg-[#0f1b3d] text-white"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
