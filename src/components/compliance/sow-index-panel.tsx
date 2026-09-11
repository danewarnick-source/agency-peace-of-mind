import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useCurrentOrg } from "@/hooks/use-org";
import { searchSowIndex, sowIndexRowCount } from "@/lib/sow-index";

export function SowIndexPanel() {
  const { data: org } = useCurrentOrg();
  const [q, setQ] = useState("");

  const indexQ = useQuery({
    queryKey: ["sow-index", q],
    enabled: !!org?.organization_id,
    queryFn: async () => searchSowIndex(q),
    staleTime: 60_000,
  });

  const rows = indexQ.data ?? [];
  const total = useMemo(() => sowIndexRowCount(), []);

  if (!org?.organization_id) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Select a workspace to open the Agency Contract index.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Agency Contract index</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          DHHS91172 duties already encoded in the catalog, SOW perimeters,
          standing records, and EVV / daily-rate / cadence rules. {total} rows.
          Overlay promote stays on Agency Sources (Step 7 confirm).
        </p>
      </div>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search citation, code, or duty"
      />
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {rows.slice(0, 80).map((row) => (
          <li key={row.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{row.title}</p>
              <Badge variant="outline">{row.source}</Badge>
              {row.service_codes[0] ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {row.service_codes.join(", ")}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{row.citation}</p>
            <p className="mt-1 text-sm text-muted-foreground">{row.summary}</p>
          </li>
        ))}
      </ul>
      {rows.length > 80 ? (
        <p className="text-xs text-muted-foreground">
          Showing 80 of {rows.length}. Narrow the search to see the rest.
        </p>
      ) : null}
    </div>
  );
}
