import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FbaBspStrip } from "./fba-bsp-strip";
import { toast } from "sonner";

type Behavior = { id: string; name: string; data_method: string; operational_definition: string };
type Entry = {
  id: string;
  behavior_id: string;
  count: number | null;
  duration_seconds: number | null;
  intensity: number | null;
  note: string;
  occurred_at: string;
};

export function StaffBehaviorDataTab({
  clientId,
  organizationId,
}: {
  clientId: string;
  organizationId: string;
}) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [count, setCount] = useState("1");
  const [intensity, setIntensity] = useState("");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");

  const { data: behaviors = [] } = useQuery<Behavior[]>({
    queryKey: ["bc_behaviors_published", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bc_behaviors")
        .select("id, name, data_method, operational_definition")
        .eq("client_id", clientId)
        .eq("status", "published")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Behavior[];
    },
  });

  const { data: myEntries = [] } = useQuery<Entry[]>({
    queryKey: ["bc_data_entries_mine", clientId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) return [];
      const { data, error } = await supabase
        .from("bc_data_entries")
        .select("id, behavior_id, count, duration_seconds, intensity, note, occurred_at")
        .eq("client_id", clientId)
        .eq("staff_user_id", u.user.id)
        .order("occurred_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const log = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Pick a behavior.");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) throw new Error("Not signed in.");
      const { error } = await supabase.from("bc_data_entries").insert({
        organization_id: organizationId,
        client_id: clientId,
        behavior_id: selectedId,
        staff_user_id: u.user.id,
        count: count ? Number(count) : null,
        intensity: intensity ? Number(intensity) : null,
        duration_seconds: duration ? Number(duration) : null,
        note: note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bc_data_entries_mine", clientId] });
      setCount("1");
      setIntensity("");
      setDuration("");
      setNote("");
      toast.success("Logged.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Log failed."),
  });

  const selected = behaviors.find((b) => b.id === selectedId);
  const nameById = new Map(behaviors.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-4">
      <FbaBspStrip clientId={clientId} organizationId={organizationId} canEdit={false} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log behavior data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {behaviors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No published behaviors to log against.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {behaviors.map((b) => (
                  <Button
                    key={b.id}
                    size="sm"
                    variant={selectedId === b.id ? "default" : "outline"}
                    onClick={() => setSelectedId(b.id)}
                    className="min-h-[44px]"
                  >
                    {b.name}
                  </Button>
                ))}
              </div>

              {selected && (
                <>
                  {selected.operational_definition && (
                    <p className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                      {selected.operational_definition}
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Count</Label>
                      <Input
                        type="number"
                        min={1}
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                        className="min-h-[44px]"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Intensity (1–5)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={intensity}
                        onChange={(e) => setIntensity(e.target.value)}
                        className="min-h-[44px]"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Duration (sec)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Note (objective, observable)</Label>
                    <Textarea
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What happened. Stick to observable facts."
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => log.mutate()} disabled={log.isPending} className="min-h-[44px]">
                      {log.isPending ? "Saving…" : "Log entry"}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My entries</CardTitle>
        </CardHeader>
        <CardContent>
          {myEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {myEntries.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{nameById.get(e.behavior_id) ?? "Behavior"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(e.occurred_at).toLocaleString()}
                      {e.count != null ? ` · ${e.count}x` : ""}
                      {e.intensity != null ? ` · int ${e.intensity}` : ""}
                      {e.duration_seconds != null ? ` · ${e.duration_seconds}s` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">logged</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
