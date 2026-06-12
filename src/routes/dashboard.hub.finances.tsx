import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Receipt,
  TrendingUp,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  CalendarClock,
} from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { getBilledRevenueByYear } from "@/lib/financial-revenue.functions";
import { getTotalsLedger } from "@/lib/financial-totals.functions";
import { getBillingSnapshot } from "@/lib/financial-hub.functions";

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
  // Financial card snapshot mirrors the Financial tab gates.
  const canSeeFinancialNumbers = can("view_financial_tns_gross");

  // The billed-revenue server-fn requires admin org membership.
  const canReadBilledRevenue = role === "admin" || role === "super_admin";

  const now = new Date();
  const year = now.getFullYear();
  const monthIdx = now.getMonth(); // 0-based
  const periodLabel = `${MONTH_NAMES[monthIdx]} ${year}`;

  const billedFn = useServerFn(getBilledRevenueByYear);
  const ledgerFn = useServerFn(getTotalsLedger);
  const billingSnapshotFn = useServerFn(getBillingSnapshot);

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

  const billingSnapshotQ = useQuery({
    enabled: !!orgId && canReadBilledRevenue,
    queryKey: ["hub-finances-billing-snapshot", orgId],
    queryFn: () => billingSnapshotFn({ data: { organizationId: orgId! } }),
    staleTime: 60_000,
  });

  // ─── Financial snapshot values ──────────────────────────────────────
  const months = billedQ.data?.months ?? [];
  const billedThisMonth = months[monthIdx]?.billed ?? 0;
  const billedLastMonth = monthIdx > 0 ? months[monthIdx - 1]?.billed ?? 0 : 0;
  const trendPct =
    billedLastMonth > 0
      ? ((billedThisMonth - billedLastMonth) / billedLastMonth) * 100
      : null;

  const receivedRows = ledgerQ.data ?? [];
  const receivedThisMonth = receivedRows
    .filter((r) => r.category === "received" && r.period_month === monthIdx + 1)
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const outstanding = billedThisMonth - receivedThisMonth;

  // ─── Billing snapshot values ───────────────────────────────────────
  const snap = billingSnapshotQ.data;

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Finances</h2>
        <p className="text-sm text-muted-foreground">
          Billing and financial overview · {periodLabel}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ─── Billing card ─────────────────────────────────────────── */}
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
            ) : billingSnapshotQ.isLoading || billedQ.isLoading ? (
              <SnapshotSkeleton rows={2} />
            ) : billingSnapshotQ.error || billedQ.error ? (
              <p className="text-xs text-muted-foreground">Snapshot unavailable.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3">
                <Stat
                  label="Active authorizations"
                  value={String(snap?.activeCodes ?? 0)}
                  icon={<FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                />
                <Stat
                  label="Billing blockers"
                  value={String(snap?.blockers ?? 0)}
                  icon={
                    (snap?.blockers ?? 0) > 0 ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    )
                  }
                  variant={(snap?.blockers ?? 0) > 0 ? "warning" : "success"}
                />
                {(snap?.expiringSoon ?? 0) > 0 && (
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700">
                      <CalendarClock className="h-3 w-3" />
                      {snap!.expiringSoon} authorization{snap!.expiringSoon === 1 ? "" : "s"} expiring within 30 days
                    </span>
                  </div>
                )}
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

        {/* ─── Financial card ────────────────────────────────────────── */}
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
                  value={canReadBilledRevenue ? fmtCurrency(billedThisMonth) : "—"}
                  trend={
                    canReadBilledRevenue && trendPct !== null ? (
                      <TrendBadge pct={trendPct} />
                    ) : null
                  }
                />
                <Stat
                  label="Outstanding"
                  value={
                    canReadBilledRevenue
                      ? outstanding > 0
                        ? fmtCurrency(outstanding)
                        : receivedThisMonth > 0
                          ? fmtCurrency(0)
                          : "Pending"
                      : "—"
                  }
                  hint={
                    canReadBilledRevenue
                      ? receivedThisMonth > 0
                        ? `Net received: ${fmtCurrency(receivedThisMonth)}`
                        : "Not yet imported"
                      : null
                  }
                  variant={
                    canReadBilledRevenue && outstanding > 0 ? "warning" : undefined
                  }
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
  icon,
  variant,
}: {
  label: string;
  value: string;
  trend?: React.ReactNode;
  hint?: string | null;
  icon?: React.ReactNode;
  variant?: "warning" | "success";
}) {
  const borderClass =
    variant === "warning"
      ? "border-amber-300/40 bg-amber-500/[0.04]"
      : variant === "success"
        ? "border-emerald-300/40 bg-emerald-500/[0.04]"
        : "border-border/60 bg-background/40";

  return (
    <div className={`rounded-lg border p-3 ${borderClass}`}>
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
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
