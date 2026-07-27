import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { incidentTrends } from "@/lib/incidents.functions";
import { useCurrentOrg } from "@/hooks/use-org";


type MonthlyCategoryRow = {
  month_key: string;
  category: string;
  incident_count: number;
};

type ClientCountRow = {
  client_id: string;
  first_name: string | null;
  last_name: string | null;
  incident_count: number;
};

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, { month: "short" });
}

export type TrendFilter =
  | { kind: "month"; monthKey: string }
  | { kind: "category"; category: string; monthKey: string }
  | { kind: "client"; clientId: string };

/**
 * Compact trends strip for the admin Incident Log. The server pre-aggregates
 * both feeds via GROUP BY RPCs (see incidentTrends) — no raw incident rows
 * are fetched here:
 *   • monthly category counts, trailing 6 months → bar chart + category
 *     breakdown (current vs prior month)
 *   • per-client counts, filtered to the caller-supplied [from..to] range
 * Every segment / bar / row click hands a TrendFilter to onPick so the log
 * below it can pre-filter without a round-trip.
 */
export function IncidentTrendsStrip({
  rangeFrom,
  rangeTo,
  onPick,
}: {
  rangeFrom: string; // YYYY-MM-DD or ""
  rangeTo: string;
  onPick: (f: TrendFilter) => void;
}) {
  const fn = useServerFn(incidentTrends);
  const { data: org } = useCurrentOrg();
  const activeOrgId = org?.organization_id ?? null;
  const { data, isLoading } = useQuery({
    enabled: !!activeOrgId,
    queryKey: ["incident-trends", activeOrgId, rangeFrom, rangeTo],
    queryFn: () => fn({ data: { organization_id: activeOrgId!, from: rangeFrom || null, to: rangeTo || null } }),
    staleTime: 60_000,
  });
  const monthlyRows = (data?.monthly ?? []) as MonthlyCategoryRow[];
  const perClientRows = (data?.perClient ?? []) as ClientCountRow[];

  const now = new Date();
  const months = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      out.push({ key: k, label: monthLabel(k) });
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.getUTCFullYear(), now.getUTCMonth()]);

  const monthly = useMemo(() => {
    const counts = new Map(months.map((m) => [m.key, 0]));
    for (const r of monthlyRows) {
      if (counts.has(r.month_key)) counts.set(r.month_key, (counts.get(r.month_key) ?? 0) + r.incident_count);
    }
    return months.map((m) => ({ month: m.label, key: m.key, count: counts.get(m.key) ?? 0 }));
  }, [months, monthlyRows]);

  const currentMonthKey = months[months.length - 1].key;
  const priorMonthKey = months[months.length - 2]?.key ?? currentMonthKey;

  const categoryBreakdown = useMemo(() => {
    const cur = new Map<string, number>();
    const prev = new Map<string, number>();
    for (const r of monthlyRows) {
      if (r.month_key === currentMonthKey) cur.set(r.category, (cur.get(r.category) ?? 0) + r.incident_count);
      else if (r.month_key === priorMonthKey) prev.set(r.category, (prev.get(r.category) ?? 0) + r.incident_count);
    }
    const keys = new Set([...cur.keys(), ...prev.keys()]);
    return [...keys]
      .map((category) => ({
        category,
        current: cur.get(category) ?? 0,
        prior: prev.get(category) ?? 0,
      }))
      .sort((a, b) => b.current - a.current || b.prior - a.prior);
  }, [monthlyRows, currentMonthKey, priorMonthKey]);

  const perClient = useMemo(() => {
    return perClientRows
      .map((r) => ({
        id: r.client_id,
        name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.client_id.slice(0, 8),
        count: r.incident_count,
      }))
      .slice(0, 12);
  }, [perClientRows]);

  if (isLoading) {
    return <Card><CardContent className="py-6 text-xs text-muted-foreground">Loading incident trends…</CardContent></Card>;
  }
  if (!monthlyRows.length && !perClientRows.length) {
    return (
      <Card>
        <CardContent className="py-6 text-xs text-muted-foreground">
          No incidents in the trailing 6 months — nothing to chart yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="grid gap-4 py-4 md:grid-cols-3">
        {/* Monthly bar chart */}
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold tracking-tight">Incidents — last 6 months</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  onClick={(d: { key?: string }) => d.key && onPick({ kind: "month", monthKey: d.key })}
                  style={{ cursor: "pointer" }}
                >
                  {monthly.map((m) => (
                    <Cell key={m.key} fill={m.key === currentMonthKey ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-muted-foreground">Click a bar to filter the log to that month.</p>
        </div>

        {/* Category breakdown */}
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold tracking-tight">
            Category — {monthLabel(currentMonthKey)} vs {monthLabel(priorMonthKey)}
          </p>
          {categoryBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground">No incidents this month or last.</p>
          ) : (
            <div className="space-y-1">
              {categoryBreakdown.slice(0, 6).map((c) => {
                const delta = c.current - c.prior;
                return (
                  <button
                    key={c.category}
                    type="button"
                    onClick={() => onPick({ kind: "category", category: c.category, monthKey: currentMonthKey })}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted/50"
                    title="Click to filter the log to this category this month"
                  >
                    <span className="truncate">{c.category}</span>
                    <span className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="font-semibold">{c.current}</span>
                      <span className="text-[10px] text-muted-foreground">prior {c.prior}</span>
                      <span
                        className={`text-[10px] ${
                          delta > 0
                            ? "text-rose-600"
                            : delta < 0
                              ? "text-emerald-600"
                              : "text-muted-foreground"
                        }`}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Per-client table */}
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold tracking-tight">
            Per-client {rangeFrom || rangeTo ? "(selected range)" : "(6 months)"}
          </p>
          {perClient.length === 0 ? (
            <p className="text-xs text-muted-foreground">No incidents in this range.</p>
          ) : (
            <div className="max-h-32 overflow-y-auto">
              <table className="w-full text-xs">
                <tbody>
                  {perClient.map((c) => (
                    <tr key={c.id} className="border-b border-border/40 last:border-0">
                      <td className="py-1">
                        <button
                          type="button"
                          onClick={() => onPick({ kind: "client", clientId: c.id })}
                          className="text-left hover:underline"
                        >
                          {c.name}
                        </button>
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
