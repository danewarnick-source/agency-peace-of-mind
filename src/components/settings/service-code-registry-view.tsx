import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { fmtUSD } from "@/lib/billing-units";

type RegistryRow = {
  id: string;
  code: string;
  name: string | null;
  category: string;
  unit: string;
  requires_evv: boolean;
  rate_source: string;
  default_rate: number | null;
  summary_cadence: string;
  max_daily_hours: number | null;
  max_weekly_hours: number | null;
  asleep_billable: boolean;
  is_active: boolean;
};

const UNIT_LABEL: Record<string, string> = {
  day: "Daily",
  quarter_hour: "Quarter-hour",
  session: "Session",
  monthly: "Monthly",
  one_time: "One-time",
};

export function ServiceCodeRegistryView() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["service-code-registry", orgId],
    queryFn: async (): Promise<RegistryRow[]> => {
      const { data, error } = await supabase
        .from("service_codes")
        .select(
          "id, code, name, category, unit, requires_evv, rate_source, default_rate, summary_cadence, max_daily_hours, max_weekly_hours, asleep_billable, is_active",
        )
        .eq("organization_id", orgId!)
        .order("category")
        .order("code");
      if (error) throw error;
      return (data ?? []) as RegistryRow[];
    },
  });

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (!needle) return true;
      return (
        r.code.toLowerCase().includes(needle) ||
        (r.name ?? "").toLowerCase().includes(needle) ||
        r.category.toLowerCase().includes(needle) ||
        (r.rate_source ?? "").toLowerCase().includes(needle) ||
        (r.summary_cadence ?? "").toLowerCase().includes(needle)
      );
    });
    const byCategory = new Map<string, RegistryRow[]>();
    for (const r of filtered) {
      if (!byCategory.has(r.category)) byCategory.set(r.category, []);
      byCategory.get(r.category)!.push(r);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows, q]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Read-only reference of every service code configured for your agency — EVV
          mandate, rate source, summary cadence, and scheduling caps. Edits happen in
          the Configuration view.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, name, category…"
            className="h-9 w-64 pl-8"
          />
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading service codes…</p>
      ) : grouped.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "No service codes configured for this organization yet."
            : "No codes match your search."}
        </p>
      ) : (
        grouped.map(([category, codes]) => (
          <section key={category} className="rounded-xl border border-border bg-card shadow-sm">
            <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">
              {category}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {codes.length} code{codes.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm max-md:[&_th:first-child]:sticky max-md:[&_th:first-child]:left-0 max-md:[&_th:first-child]:z-10 max-md:[&_th:first-child]:bg-card max-md:[&_td:first-child]:sticky max-md:[&_td:first-child]:left-0 max-md:[&_td:first-child]:bg-card">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">EVV</th>
                    <th className="px-3 py-2">Rate source</th>
                    <th className="px-3 py-2 text-right">Default rate</th>
                    <th className="px-3 py-2">Summary cadence</th>
                    <th className="px-3 py-2 text-right">Max hrs/day</th>
                    <th className="px-3 py-2 text-right">Max hrs/wk</th>
                    <th className="px-3 py-2">Asleep billable</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((r) => (
                    <tr key={r.id} className={`border-t border-border ${r.is_active ? "" : "opacity-50"}`}>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className="font-mono">{r.code}</Badge>
                        {!r.is_active && (
                          <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">inactive</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{r.name ?? "—"}</td>
                      <td className="px-3 py-2">{UNIT_LABEL[r.unit] ?? r.unit}</td>
                      <td className="px-3 py-2">
                        {r.requires_evv ? (
                          <Badge className="bg-sky-500/15 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300">EVV Yes</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">EVV No</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.rate_source ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {r.default_rate != null ? fmtUSD(Number(r.default_rate)) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs capitalize">{r.summary_cadence ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.max_daily_hours ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.max_weekly_hours ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.asleep_billable ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">Yes</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <p className="text-xs text-muted-foreground">
        EVV Yes = SOW §1.12 mandate (geofence + UEVV transmission). Summary cadence per
        contract DHHS91172 (eff 7/1/26). Asleep billable applies to overnight codes —
        asleep time on SLH/SLN is unbillable unless marked.
      </p>
    </div>
  );
}
