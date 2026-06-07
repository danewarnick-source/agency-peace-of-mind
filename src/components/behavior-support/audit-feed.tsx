import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type EntryRow = {
  id: string;
  occurred_at: string;
  count: number | null;
  intensity: number | null;
  duration_seconds: number | null;
  note: string;
  staff_user_id: string;
  behavior_id: string;
};

export function AuditFeed({ clientId }: { clientId: string }) {
  const { data: entries = [] } = useQuery<EntryRow[]>({
    queryKey: ["bc_audit_feed", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bc_data_entries")
        .select("id, occurred_at, count, intensity, duration_seconds, note, staff_user_id, behavior_id")
        .eq("client_id", clientId)
        .order("occurred_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as EntryRow[];
    },
  });

  const staffIds = Array.from(new Set(entries.map((e) => e.staff_user_id)));
  const behaviorIds = Array.from(new Set(entries.map((e) => e.behavior_id)));

  const { data: staff = {} } = useQuery<Record<string, string>>({
    enabled: staffIds.length > 0,
    queryKey: ["bc_audit_staff", staffIds.sort().join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", staffIds);
      const out: Record<string, string> = {};
      for (const p of data ?? []) out[p.id] = p.full_name ?? p.email ?? p.id.slice(0, 8);
      return out;
    },
  });

  const { data: behaviors = {} } = useQuery<Record<string, string>>({
    enabled: behaviorIds.length > 0,
    queryKey: ["bc_audit_behaviors", behaviorIds.sort().join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("bc_behaviors")
        .select("id, name")
        .in("id", behaviorIds);
      const out: Record<string, string> = {};
      for (const b of data ?? []) out[b.id] = b.name;
      return out;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data entry audit feed</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries logged yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{behaviors[e.behavior_id] ?? "Behavior"}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(e.occurred_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {staff[e.staff_user_id] ?? "Staff"}
                  </Badge>
                  {e.count != null && <span>{e.count}x</span>}
                  {e.intensity != null && <span>int {e.intensity}</span>}
                  {e.duration_seconds != null && <span>{e.duration_seconds}s</span>}
                  {e.note && <span className="truncate">— {e.note}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
