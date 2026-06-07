import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Entry = { behavior_id: string; occurred_at: string; count: number | null };
type Behavior = { id: string; name: string; data_method: string };

const DAYS = 14;

export function DataCharts({ clientId }: { clientId: string }) {
  const { data: behaviors = [] } = useQuery<Behavior[]>({
    queryKey: ["bc_behaviors_for_chart", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bc_behaviors")
        .select("id, name, data_method")
        .eq("client_id", clientId)
        .in("status", ["approved", "published"]);
      if (error) throw error;
      return (data ?? []) as Behavior[];
    },
  });

  const { data: entries = [] } = useQuery<Entry[]>({
    queryKey: ["bc_data_entries_chart", clientId],
    queryFn: async () => {
      const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("bc_data_entries")
        .select("behavior_id, occurred_at, count")
        .eq("client_id", clientId)
        .gte("occurred_at", since)
        .order("occurred_at");
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Frequency — last {DAYS} days</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {behaviors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approved or published behaviors yet.</p>
        ) : (
          behaviors.map((b) => (
            <BehaviorBars
              key={b.id}
              name={b.name}
              entries={entries.filter((e) => e.behavior_id === b.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function BehaviorBars({ name, entries }: { name: string; entries: Entry[] }) {
  const buckets = useMemo(() => {
    const map = new Map<string, number>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    for (const e of entries) {
      const k = e.occurred_at.slice(0, 10);
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + (e.count ?? 1));
    }
    return Array.from(map.entries());
  }, [entries]);

  const max = Math.max(1, ...buckets.map(([, v]) => v));
  const total = buckets.reduce((s, [, v]) => s + v, 0);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-[11px] text-muted-foreground">{total} total</p>
      </div>
      <div className="flex h-20 items-end gap-0.5 rounded-md border border-border bg-muted/20 p-1">
        {buckets.map(([day, v]) => (
          <div
            key={day}
            className="group relative flex-1 rounded-sm bg-[color:var(--teal-700,#137182)]/70 transition hover:bg-[color:var(--teal-700,#137182)]"
            style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? "4px" : "1px" }}
            title={`${day}: ${v}`}
          />
        ))}
      </div>
    </div>
  );
}
