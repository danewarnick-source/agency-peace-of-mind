import { Link } from "@tanstack/react-router";
import { Building2, Users, BadgeCheck, ArrowRight } from "lucide-react";
import { NectarHeader } from "@/components/nectar/nectar-brand";

export type HiveExecRollup = {
  totalCompanies: number;
  totalActiveStaff: number;
  totalPendingInvites: number;
  totalExpiringSoon: number;
  topCompanies: Array<{ id: string; name: string; staff: number; expiringSoon: number }>;
};

export function HiveExecRollupView({ data }: { data: HiveExecRollup }) {
  return (
    <div className="space-y-6">
      <NectarHeader
        surface="navy"
        markSize="lg"
        eyebrow="HIVE Executive"
        title="Cross-company rollup"
        description="Account metadata only — no client PHI. Drill in for company-specific tools."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Building2} label="Companies" value={data.totalCompanies} />
        <Stat icon={Users} label="Active staff" value={data.totalActiveStaff} />
        <Stat icon={Users} label="Pending invites" value={data.totalPendingInvites} />
        <Stat icon={BadgeCheck} label="Expiring soon" value={data.totalExpiringSoon} />
      </div>

      <section className="rounded-2xl border border-border bg-card/80 p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold tracking-tight">Top companies</h2>
          <Link to="/dashboard/hive-exec" className="inline-flex items-center gap-1 text-xs font-medium text-[#7a4a0a] hover:underline">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {data.topCompanies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No companies provisioned yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.topCompanies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <Link to="/dashboard/hive-exec/$orgId" params={{ orgId: c.id }} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {c.name}
                </Link>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {c.staff} staff · {c.expiringSoon} expiring
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0d112b] text-[#f4a93a]">
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums text-[#0d112b]">{value}</p>
    </div>
  );
}
