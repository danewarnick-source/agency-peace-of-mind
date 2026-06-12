import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Receipt, TrendingUp, ArrowRight, ArrowUpRight, ArrowDownRight, Lock } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { getBilledRevenueByYear } from "@/lib/financial-revenue.functions";
import { getTotalsLedger } from "@/lib/financial-totals.functions";

/**
 * Finances hub landing. Billing and Financial each own their own nested
 * route trees with internal tab layouts. This hub is a thin chooser that
 * previews live snapshot data so admins can scan the state of both areas
 * without entering either tab. All snapshot reads go through the same
 * permission-gated server fns the tabs use — no ungated path here.
 */
export const Route = createFileRoute("/dashboard/hub/finances")({
  head: () => ({ meta: [{ title: "Finances — HIVE" }] }),
  component: FinancesHub,
});

const fmtCurrency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function FinancesHub() {
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const orgId = org?.organization_id;
  const role = org?.role;

  // Billing card is admin/manager (matches Billing section RequireRole).
  const canSeeBilling = role === "admin" || role === "manager" || role === "super_admin";
  // Financial card snapshot mirrors the Financial tab gates. The Gross tab
  // is the primary entry; use its permission for the numeric preview.
  const canSeeFinancialNumbers = can("view_financial_tns_gross");

  // The billed-revenue server-fn requires admin org membership. Managers
  // pass the Billing gate but can't load $ totals → they see a clean
  // "Open Billing" card without sensitive figures.
  const canReadBilledRevenue = role === "admin" || role === "super_admin";

  const now = new Date();
  const year = now.getFullYear();
  const monthIdx = now.getMonth(); // 0-based
  const periodLabel = `${MONTH_NAMES[monthIdx]} ${year}`;

  const billedFn = useServerFn(getBilledRevenueByYear);
  const ledgerFn = useServerFn(getTotalsLedger);

  const billedQ = useQuery({
    enabled: !!orgId && canReadBilledRevenue,
    queryKey: ["hub-finances-billed", orgId, year],
    queryFn: () => billedFn({ data: { organizationId: orgId!, year } }),
    staleTime: 60_000,
  });

  const ledgerQ = useQuery({
    enabled: !!orgId && canSeeFinancialNumbers,
    queryKey: ["hub-finances-ledger", orgId, year],
    queryFn: () => ledgerFn({ data: { organizationId: orgId!, year } }),
    staleTime: 60_000,
  });

  // Billing snapshot: this period billed + YTD billed.
  const months = billedQ.data?.months ?? [];
  const billedThisMonth = months[monthIdx]?.billed ?? 0;
  const billedYTD = months.slice(0, monthIdx + 1).reduce((s, m) => s + (m.billed ?? 0), 0);

  // Financial snapshot: gross billed (same source) + net received this month + trend.
  const receivedRows = ledgerQ.data ?? [];
  const receivedThisMonth = receivedRows
    .filter((r) => r.category === "received" && r.period_month === monthIdx + 1)
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const billedLastMonth = monthIdx > 0 ? months[monthIdx - 1]?.billed ?? 0 : 0;
  const trendPct =
    billedLastMonth > 0 ? ((billedThisMonth - billedLastMonth) / billedLastMonth) * 100 : null;

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Finances</h2>
        <p className="text-sm text-muted-foreground">Billing and financial overview · {periodLabel}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ─── Billing card ─────────────────────────────────────────────── */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <Receipt className="h-6 w-6 text-[#137182]" />
          </div>
          <div className="mt-3 text-base font-semibold">Billing</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Authorizations, 520 generation, claims, and per-client budgets.
          </p>

          <div className="mt-4 flex-1">
            {!canSeeBilling ? (
              <NoAccess />
            ) : !canReadBilledRevenue ? (
              <p className="text-xs text-muted-foreground">
                Open Billing to view claim readiness and per-client billing.
              </p>
            ) : billedQ.isLoading ? (
              <SnapshotSkeleton rows={2} />
            ) : billedQ.error ? (
              <p className="text-xs text-muted-foreground">Snapshot unavailable.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3">
                <Stat label={`Billed · ${MONTH_NAMES[monthIdx]}`} value={fmtCurrency(billedThisMonth)} />
                <Stat label={`Billed YTD · ${year}`} value={fmtCurrency(billedYTD)} />
              </dl>
            )}
          </div>

          {canSeeBilling && (
            <Link
              to="/dashboard/billing"
              className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-lg bg-[#137182] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0f5d6b]"
            >
              Open Billing <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {/* ─── Financial card ───────────────────────────────────────────── */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <TrendingUp className="h-6 w-6 text-[#137182]" />
          </div>
          <div className="mt-3 text-base font-semibold">Financial</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Revenue tracking and accounting overview.
          </p>

          <div className="mt-4 flex-1">
            {!canSeeFinancialNumbers ? (
              <NoAccess />
            ) : billedQ.isLoading || ledgerQ.isLoading ? (
              <SnapshotSkeleton rows={2} />
            ) : (
              <dl className="grid grid-cols-2 gap-3">
                <Stat
                  label={`Gross billed · ${MONTH_NAMES[monthIdx]}`}
                  value={
                    canReadBilledRevenue
                      ? fmtCurrency(billedThisMonth)
                      : "—"
                  }
                  trend={
                    canReadBilledRevenue && trendPct !== null ? (
                      <TrendBadge pct={trendPct} />
                    ) : null
                  }
                />
                <Stat
                  label="Net received"
                  value={
                    receivedThisMonth > 0
                      ? fmtCurrency(receivedThisMonth)
                      : "Pending"
                  }
                  hint={receivedThisMonth > 0 ? null : "Not yet imported"}
                />
              </dl>
            )}
          </div>

          <Link
            to="/dashboard/financial"
            className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-lg bg-[#137182] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0f5d6b]"
          >
            Open Financial <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  trend,
  hint,
}: {
  label: string;
  value: string;
  trend?: React.ReactNode;
  hint?: string | null;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        {trend}
      </dd>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TrendBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
        up ? "text-emerald-600" : "text-rose-600"
      }`}
      title="vs last month"
    >
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function SnapshotSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-[60px] animate-pulse rounded-lg border border-border/60 bg-muted/40"
        />
      ))}
    </div>
  );
}

function NoAccess() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
      <Lock className="h-3.5 w-3.5" />
      You don't have access to this snapshot.
    </div>
  );
}
