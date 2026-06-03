import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBilledRevenueByYear } from "@/lib/financial-revenue.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtUSD } from "@/lib/billing-units";
import { Info, ShieldCheck, Upload, UserPen } from "lucide-react";
import { YourInputsSection } from "@/components/financial/your-inputs-section";

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
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1; // 1–12
  const [year, setYear] = useState<number>(nowYear);
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  // The "Your Inputs" layer is month-scoped. When the user is on Quarterly/YTD,
  // we still surface inputs for a focus month (default = current month, but only
  // if the selected year matches; otherwise default to January).
  const [inputsMonth, setInputsMonth] = useState<number>(
    year === nowYear ? nowMonth : 1,
  );
  const [inputsTotals, setInputsTotals] = useState<{
    inputsSubtotal: number;
    entriesCount: number;
  }>({ inputsSubtotal: 0, entriesCount: 0 });

  const fetchRevenue = useServerFn(getBilledRevenueByYear);
  const q = useQuery({
    queryKey: ["financial-revenue", year],
    queryFn: () => fetchRevenue({ data: { year } }),
  });

  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = nowYear; y >= nowYear - 5; y--) arr.push(y);
    return arr;
  }, [nowYear]);

  const months = q.data?.months ?? [];
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

  // HIVE-verified subtotal scope:
  //   - monthly view: just the inputsMonth (so it matches what's on screen below)
  //   - quarterly/ytd: total of the table rows
  const hiveVerifiedSubtotal = useMemo(() => {
    if (granularity === "monthly") {
      return months.find((m) => m.month === inputsMonth)?.billed ?? 0;
    }
    return rows.reduce((s, r) => s + r.billed, 0);
  }, [granularity, months, inputsMonth, rows]);

  const combinedTotal = hiveVerifiedSubtotal + inputsTotals.inputsSubtotal;
  const totalBilledTable = rows.reduce((s, r) => s + r.billed, 0);
  const allZero = !q.isLoading && totalBilledTable === 0;

  return (
    <div className="space-y-4">
      {/* ─── LAYER 1: HIVE-Verified billed revenue (read-only, from 520) ── */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              HIVE-Verified
            </div>
            <CardTitle className="mt-0.5">Billed Revenue</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Sourced from your 520 submissions — read-only.
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
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : q.isError ? (
            <p className="text-sm text-destructive">
              {(q.error as Error)?.message || "Failed to load revenue."}
            </p>
          ) : allZero ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
              <p className="text-sm font-medium">No billing recorded for {year} yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Billed figures appear here automatically once billing is run.
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

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
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
          <YourInputsSection
            year={year}
            month={inputsMonth}
            onTotalsChange={setInputsTotals}
          />
        </CardContent>
      </Card>

      {/* ─── Subtotal bands ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <SubtotalBand
            tone="verified"
            title="HIVE-Verified Subtotal"
            note={
              granularity === "monthly"
                ? `Billed for ${MONTH_LABELS[inputsMonth - 1]} ${year} — sourced from your billing, read-only.`
                : `Billed for the periods above — sourced from your billing, read-only.`
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
            note="HIVE-verified billed revenue + your inputs (received adds; expenses, taxes, and payroll subtract; custom lines add by default — use negative amounts to subtract)."
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
  tone: "verified" | "inputs" | "combined";
  title: string;
  note: string;
  amount: number;
  signed?: boolean;
  big?: boolean;
}) {
  const styles =
    tone === "verified"
      ? "border-emerald-500/30 bg-emerald-500/[0.06]"
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
