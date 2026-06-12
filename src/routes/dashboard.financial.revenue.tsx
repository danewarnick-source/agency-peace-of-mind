import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getBilledRevenueByYear,
  listBilledManualEntries,
  upsertBilledManualEntry,
  deleteBilledManualEntry,
} from "@/lib/financial-revenue.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtUSD } from "@/lib/billing-units";
import {
  ChevronDown,
  ChevronRight,
  Info,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserPen,
} from "lucide-react";
import { YourInputsSection } from "@/components/financial/your-inputs-section";
import { useCurrentOrg, useOrgDisplayName } from "@/hooks/use-org";
import { toast } from "sonner";
import { getRevenueClientPills } from "@/lib/financial-detail.functions";
import { BillingDetailDialog } from "@/components/financial/billing-detail-dialog";

export const Route = createFileRoute("/dashboard/financial/revenue")({
  head: () => ({ meta: [{ title: "Revenue — Financial — HIVE" }] }),
  component: RevenuePage,
});

type Granularity = "monthly" | "quarterly" | "ytd";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function RevenuePage() {
  const { data: org } = useCurrentOrg();
  const organizationId = org?.organization_id;
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState<number>(nowYear);
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [inputsMonth, setInputsMonth] = useState<number>(
    year === nowYear ? nowMonth : 1,
  );
  const [inputsTotals, setInputsTotals] = useState<{
    inputsSubtotal: number;
    entriesCount: number;
  }>({ inputsSubtotal: 0, entriesCount: 0 });

  const fetchRevenue = useServerFn(getBilledRevenueByYear);
  const q = useQuery({
    queryKey: ["financial-revenue", year, organizationId],
    enabled: !!organizationId,
    queryFn: () => fetchRevenue({ data: { year, organizationId: organizationId! } }),
  });

  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = nowYear; y >= nowYear - 5; y--) arr.push(y);
    return arr;
  }, [nowYear]);

  const months = q.data?.months ?? [];
  const sourceMode = q.data?.source.mode ?? "auto_520";
  const isManualMode = sourceMode === "manual";
  const receivedAvailable = q.data?.received.available ?? false;

  const rows = useMemo(() => {
    if (!months.length) return [];
    if (granularity === "monthly") {
      return months.map((m) => ({
        label: `${MONTH_LABELS[m.month - 1]} ${year}`,
        billed: m.billed,
      }));
    }
    if (granularity === "quarterly") {
      return [0, 1, 2, 3].map((qi) => {
        const slice = months.slice(qi * 3, qi * 3 + 3);
        return {
          label: `Q${qi + 1} ${year}`,
          billed: slice.reduce((s, x) => s + x.billed, 0),
        };
      });
    }
    return [
      {
        label: `YTD ${year}`,
        billed: months.reduce((s, x) => s + x.billed, 0),
      },
    ];
  }, [months, granularity, year]);

  const hiveVerifiedSubtotal = useMemo(() => {
    if (granularity === "monthly") {
      return months.find((m) => m.month === inputsMonth)?.billed ?? 0;
    }
    return rows.reduce((s, r) => s + r.billed, 0);
  }, [granularity, months, inputsMonth, rows]);

  const combinedTotal = hiveVerifiedSubtotal + inputsTotals.inputsSubtotal;
  const totalBilledTable = rows.reduce((s, r) => s + r.billed, 0);
  const allZero = !q.isLoading && totalBilledTable === 0;

  // Honest labeling for the top band, depending on source mode.
  const topBandTitle = isManualMode
    ? "Billed Revenue (entered manually)"
    : "HIVE-Verified Subtotal";
  const topBandTone: "verified" | "manual" = isManualMode ? "manual" : "verified";

  return (
    <div className="space-y-4">
      {/* ─── LAYER 1: Billed revenue (auto-filled or manual, gated) ────── */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {isManualMode ? (
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <UserPen className="h-3.5 w-3.5" />
                Entered by you
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                HIVE-Verified
              </div>
            )}
            <CardTitle className="mt-0.5">Billed Revenue</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {isManualMode
                ? "You're on the base plan — enter your billed revenue per month below."
                : "Sourced from your 520 submissions — read-only."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(year)} onValueChange={(v) => {
              const y = Number(v);
              setYear(y);
              setInputsMonth(y === nowYear ? nowMonth : 1);
            }}>
              <SelectTrigger className="h-9 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="inline-flex rounded-lg border border-border bg-card p-1">
              {(["monthly", "quarterly", "ytd"] as Granularity[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGranularity(g)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors ${
                    granularity === g
                      ? "bg-[image:var(--gradient-brand)] text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {g === "ytd" ? "YTD" : g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : q.isError ? (
            <p className="text-sm text-destructive">
              {(q.error as Error)?.message || "Failed to load revenue."}
            </p>
          ) : allZero ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
              <p className="text-sm font-medium">
                {isManualMode
                  ? `No billed revenue entered for ${year} yet.`
                  : `No billing recorded for ${year} yet.`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isManualMode
                  ? "Add a monthly billed figure in the table below."
                  : "Billed figures appear here automatically once billing is run."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Period</th>
                    <th className="px-3 py-2 text-right font-medium">Billed</th>
                    <th className="px-3 py-2 text-right font-medium">Received</th>
                    <th className="px-3 py-2 text-right font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium">{r.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtUSD(r.billed)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {receivedAvailable ? (
                          <span className="tabular-nums text-muted-foreground">—</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            Pending — not yet imported
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        —
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Manual editor (base tier only) */}
          {isManualMode && organizationId && (
            <ManualBilledEditor year={year} organizationId={organizationId} onChanged={() => q.refetch()} />
          )}

          {/* Visible-but-locked NECTAR upsell (base tier only) */}
          {isManualMode && <NectarBilledUpsell />}

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Received amounts come from outside HIVE (your bank or accounting
              software).{" "}
              <Button asChild variant="link" className="h-auto p-0 text-xs">
                <Link to="/dashboard/billing/imports">
                  <Upload className="mr-1 inline h-3 w-3" />
                  Import or attest payments
                </Link>
              </Button>{" "}
              to populate this column.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ─── LAYER 2: Your Inputs (editable, provider-entered) ──────────── */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <UserPen className="h-3.5 w-3.5" />
              Your Inputs
            </div>
            <CardTitle className="mt-0.5">Manual entries</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Add expenses, payroll, taxes, and payments received for a given month.
              These are separate from your billed revenue above.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Month</span>
            <Select
              value={String(inputsMonth)}
              onValueChange={(v) => setInputsMonth(Number(v))}
            >
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_LABELS.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {m} {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {organizationId && (
            <YourInputsSection
              year={year}
              month={inputsMonth}
              organizationId={organizationId}
              onTotalsChange={setInputsTotals}
            />
          )}
        </CardContent>
      </Card>

      {/* ─── Subtotal bands ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <SubtotalBand
            tone={topBandTone}
            title={topBandTitle}
            note={
              isManualMode
                ? granularity === "monthly"
                  ? `Manually entered for ${MONTH_LABELS[inputsMonth - 1]} ${year} — provider-entered, not HIVE-verified.`
                  : "Manually entered for the periods above — provider-entered, not HIVE-verified."
                : granularity === "monthly"
                  ? `Billed for ${MONTH_LABELS[inputsMonth - 1]} ${year} — sourced from your billing, read-only.`
                  : "Billed for the periods above — sourced from your billing, read-only."
            }
            amount={hiveVerifiedSubtotal}
          />
          <SubtotalBand
            tone="inputs"
            title="Your Inputs Subtotal"
            note={`Entered by you for ${MONTH_LABELS[inputsMonth - 1]} ${year} — may include estimates. (${inputsTotals.entriesCount} entr${inputsTotals.entriesCount === 1 ? "y" : "ies"})`}
            amount={inputsTotals.inputsSubtotal}
            signed
          />
          <SubtotalBand
            tone="combined"
            title="Combined"
            note="Billed revenue + your inputs (received adds; expenses, taxes, and payroll subtract; custom lines add by default — use negative amounts to subtract)."
            amount={combinedTotal}
            big
          />
          <p className="pt-1 text-[11px] text-muted-foreground">
            Includes figures you entered, some of which may be estimates. This
            overview is for tracking only and is not a substitute for
            professional accounting or tax advice.{" "}
            <span className="opacity-60">(Disclaimer pending legal review.)</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SubtotalBand({
  tone,
  title,
  note,
  amount,
  signed,
  big,
}: {
  tone: "verified" | "inputs" | "combined" | "manual";
  title: string;
  note: string;
  amount: number;
  signed?: boolean;
  big?: boolean;
}) {
  const styles =
    tone === "verified"
      ? "border-emerald-500/30 bg-emerald-500/[0.06]"
      : tone === "manual"
        ? "border-primary/30 bg-primary/[0.05]"
        : tone === "inputs"
          ? "border-primary/30 bg-primary/[0.05]"
          : "border-foreground/20 bg-muted/40";
  const display = signed && amount !== 0
    ? `${amount > 0 ? "+" : "−"} ${fmtUSD(Math.abs(amount))}`
    : fmtUSD(amount);
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 ${styles}`}
    >
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${big ? "text-base" : "text-sm"}`}>{title}</p>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      <p
        className={`tabular-nums ${big ? "text-2xl font-bold" : "text-lg font-semibold"}`}
      >
        {display}
      </p>
    </div>
  );
}

// ─── Visible-but-locked NECTAR upsell card ───────────────────────────────

function NectarBilledUpsell() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[color:var(--amber-400)] bg-gradient-to-br from-[color:var(--amber-50)] to-white p-4">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center text-[color:var(--amber-600)]"
          style={{
            clipPath:
              "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
            background:
              "linear-gradient(135deg, var(--amber-100), var(--amber-200))",
          }}
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-700)]">
            <Lock className="h-3 w-3" /> NECTAR Infusion
          </div>
          <p className="mt-1 text-sm font-semibold text-[color:var(--navy-900)]">
            Let NECTAR fill your billed revenue automatically from your 520 billing.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Skip the manual entry — NECTAR pulls hours, daily units, and rates
            live from the same source that powers your 520 submissions.
          </p>
        </div>
        <Button size="sm" variant="cta" asChild>
          <a href="/pricing">Learn about NECTAR</a>
        </Button>
      </div>
    </div>
  );
}

// ─── Manual billed editor (per-month) ───────────────────────────────────

type ManualEntry = {
  id: string;
  period_month: number;
  amount: number | string;
  note: string | null;
  is_estimate: boolean;
};

function ManualBilledEditor({
  year,
  organizationId,
  onChanged,
}: {
  year: number;
  organizationId: string;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listBilledManualEntries);
  const upsertFn = useServerFn(upsertBilledManualEntry);
  const deleteFn = useServerFn(deleteBilledManualEntry);

  const queryKey = ["billed-manual", year, organizationId] as const;
  const q = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { year, organizationId } }),
  });

  const byMonth = useMemo(() => {
    const m = new Map<number, ManualEntry>();
    for (const e of (q.data?.entries ?? []) as ManualEntry[]) {
      m.set(Number(e.period_month), e);
    }
    return m;
  }, [q.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey });
    onChanged?.();
  };

  const upsertM = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => {
      toast.success("Saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UserPen className="h-4 w-4 text-primary" />
            Enter billed revenue by month
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One total per month — what you billed (e.g. from your Medicaid
            portal). These figures feed the Billed column above.
          </p>
        </div>
      </header>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="divide-y divide-border/40 rounded-lg border border-border/60 bg-background">
          {MONTH_LABELS.map((label, i) => {
            const month = i + 1;
            const entry = byMonth.get(month);
            return (
              <li
                key={month}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="min-w-[160px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {label} {year}
                    </span>
                    {entry?.is_estimate && (
                      <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        Estimate
                      </span>
                    )}
                  </div>
                  {entry?.note && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {entry.note}
                    </p>
                  )}
                </div>
                <span className="tabular-nums">
                  {entry ? fmtUSD(Number(entry.amount ?? 0)) : "—"}
                </span>
                <div className="flex items-center gap-1">
                  <BilledMonthDialog
                    year={year}
                    month={month}
                    entry={entry}
                    onSubmit={(payload) =>
                      upsertM.mutateAsync({ data: { year, month, organizationId, ...payload } })
                    }
                  />
                  {entry && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Clear billed revenue for ${label} ${year}?`)) {
                          deleteM.mutate({ data: { id: entry.id, organizationId } });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type BilledPayload = {
  amount: number;
  is_estimate: boolean;
  note: string | null;
};

function BilledMonthDialog({
  year,
  month,
  entry,
  onSubmit,
}: {
  year: number;
  month: number;
  entry?: ManualEntry;
  onSubmit: (payload: BilledPayload) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(
    entry?.amount != null ? String(entry.amount) : "",
  );
  const [isEstimate, setIsEstimate] = useState<boolean>(entry?.is_estimate ?? false);
  const [note, setNote] = useState<string>(entry?.note ?? "");
  const [busy, setBusy] = useState(false);

  // Reset form when reopening with new entry data.
  useEffect(() => {
    if (open) {
      setAmount(entry?.amount != null ? String(entry.amount) : "");
      setIsEstimate(entry?.is_estimate ?? false);
      setNote(entry?.note ?? "");
    }
  }, [open, entry]);

  const submit = async () => {
    const amt = Number(amount);
    if (!isFinite(amt)) {
      toast.error("Enter a numeric amount.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        amount: amt,
        is_estimate: isEstimate,
        note: note.trim() ? note.trim() : null,
      });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {entry ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Billed revenue — {MONTH_LABELS[month - 1]} {year}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount (USD)</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="billed-estimate-toggle">Mark as estimate</Label>
              <p className="text-xs text-muted-foreground">
                Flags this month as a best-guess figure.
              </p>
            </div>
            <Switch
              id="billed-estimate-toggle"
              checked={isEstimate}
              onCheckedChange={setIsEstimate}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. From Medicaid portal export"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
