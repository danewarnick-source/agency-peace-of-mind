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
import { Info, Upload } from "lucide-react";

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
  const [year, setYear] = useState<number>(nowYear);
  const [granularity, setGranularity] = useState<Granularity>("monthly");

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

  const totalBilled = rows.reduce((s, r) => s + r.billed, 0);
  const allZero = !q.isLoading && totalBilled === 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Billed vs Received</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Billed is read live from your 520 submissions. Received is
              populated once payments are imported or attested.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
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
                  <tr className="bg-muted/30 font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtUSD(totalBilled)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                  </tr>
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

      <p className="px-1 text-xs text-muted-foreground">
        Billed figures are read directly from your 520 billing submissions.
        This overview is for tracking only and is not a substitute for
        professional accounting or tax advice.{" "}
        <span className="opacity-60">(Disclaimer pending legal review.)</span>
      </p>
    </div>
  );
}
