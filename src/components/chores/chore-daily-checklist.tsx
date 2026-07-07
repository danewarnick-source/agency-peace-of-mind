// Staff daily checklist — surfaces today's chores (client rotation +
// every-day items) for the space(s) tied to a client or team. Driven by
// whichever spaces the caller passes in; there is no separate staff-shift
// chart. Staff supporting a client in a home see that home's chores here.
// Any org member can check items off; managers see completions.

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Space = { id: string; name: string; space_type: string };
type Def = { id: string; chore_name: string; task_list: string };
type ClientLite = { id: string; first_name: string; last_name: string };
type RotationCell = {
  id: string;
  client_id: string;
  day_of_week: number;
  definition_id: string | null;
  is_free_day: boolean;
};
type DailyItem = {
  id: string;
  label: string;
  detail: string | null;
  sort_order: number;
};
type Completion = {
  id: string;
  source: "rotation" | "daily";
  source_id: string;
  completion_date: string;
};

function dowMondayFirst(d: Date): number {
  return (d.getDay() + 6) % 7;
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ChoreDailyChecklist({
  spaceIds,
  title = "Today's chores — inspection readiness",
}: {
  spaceIds: string[];
  title?: string;
}) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const dow = dowMondayFirst(today);
  const dateISO = isoDate(today);
  const enabled = spaceIds.length > 0;

  const spacesQ = useQuery({
    enabled,
    queryKey: ["chore-cl-spaces", spaceIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_spaces")
        .select("id, name, space_type")
        .in("id", spaceIds);
      if (error) throw error;
      return (data ?? []) as Space[];
    },
  });

  const defsQ = useQuery({
    enabled,
    queryKey: ["chore-cl-defs", spaceIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_definitions")
        .select("id, chore_name, task_list, space_id")
        .or(spaceIds.map((s) => `space_id.eq.${s}`).concat(["space_id.is.null"]).join(","));
      if (error) throw error;
      return (data ?? []) as (Def & { space_id: string | null })[];
    },
  });

  const rotationQ = useQuery({
    enabled,
    queryKey: ["chore-cl-rotation", spaceIds, dow],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_client_rotation")
        .select("id, space_id, client_id, day_of_week, definition_id, is_free_day")
        .in("space_id", spaceIds)
        .eq("day_of_week", dow);
      if (error) throw error;
      return (data ?? []) as (RotationCell & { space_id: string })[];
    },
  });

  const dailyItemsQ = useQuery({
    enabled,
    queryKey: ["chore-cl-daily-items", spaceIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_daily_items")
        .select("id, label, detail, sort_order, space_id")
        .in("space_id", spaceIds)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as (DailyItem & { space_id: string })[];
    },
  });

  const clientsQ = useQuery({
    enabled,
    queryKey: ["chore-cl-clients", spaceIds],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("chore_space_clients")
        .select("client_id")
        .in("space_id", spaceIds);
      if (error) throw error;
      const ids = Array.from(new Set((links ?? []).map((l) => l.client_id)));
      if (!ids.length) return [] as ClientLite[];
      const { data: clients, error: e2 } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .in("id", ids);
      if (e2) throw e2;
      return (clients ?? []) as ClientLite[];
    },
  });

  const completionsQ = useQuery({
    enabled,
    queryKey: ["chore-cl-completions", spaceIds, dateISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_completions")
        .select("id, source, source_id, completion_date")
        .in("space_id", spaceIds)
        .eq("completion_date", dateISO);
      if (error) throw error;
      return (data ?? []) as Completion[];
    },
  });

  const toggle = useMutation({
    mutationFn: async (v: { source: "rotation" | "daily"; source_id: string; space_id: string; on: boolean }) => {
      if (v.on) {
        const { error } = await supabase.from("chore_completions").insert({
          space_id: v.space_id,
          source: v.source,
          source_id: v.source_id,
          completion_date: dateISO,
          completed_by: session?.user?.id,
        });
        if (error) throw error;
      } else {
        const existing = (completionsQ.data ?? []).find(
          (c) => c.source === v.source && c.source_id === v.source_id,
        );
        if (existing) {
          const { error } = await supabase.from("chore_completions").delete().eq("id", existing.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chore-cl-completions", spaceIds, dateISO] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!enabled) return null;

  const spaces = spacesQ.data ?? [];
  const defs = defsQ.data ?? [];
  const rotation = rotationQ.data ?? [];
  const dailyItems = dailyItemsQ.data ?? [];
  const clients = clientsQ.data ?? [];
  const completions = completionsQ.data ?? [];

  const isDone = (source: "rotation" | "daily", id: string) =>
    completions.some((c) => c.source === source && c.source_id === id);

  const defName = (id: string | null) => defs.find((d) => d.id === id)?.chore_name ?? null;
  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}`.trim() : "";
  };

  const totalItems =
    rotation.filter((r) => !r.is_free_day && r.definition_id).length + dailyItems.length;
  const doneItems = completions.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ClipboardList className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        <Badge variant={doneItems && doneItems >= totalItems ? "default" : "outline"} className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> {doneItems}/{totalItems || 0}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        {spaces.map((sp) => {
          const spRot = rotation.filter((r) => r.space_id === sp.id);
          const spDaily = dailyItems.filter((d) => d.space_id === sp.id);
          const nothing = spRot.length === 0 && spDaily.length === 0;

          return (
            <div key={sp.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold">{sp.name}</div>
                <Badge variant="outline" className="uppercase text-[10px]">{sp.space_type}</Badge>
              </div>

              {nothing && (
                <p className="text-xs italic text-muted-foreground">No chores scheduled for today.</p>
              )}

              {spDaily.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Every day</div>
                  <div className="divide-y rounded border">
                    {spDaily.map((d) => {
                      const done = isDone("daily", d.id);
                      return (
                        <label key={d.id} className="flex items-start gap-2 p-2 cursor-pointer">
                          <Checkbox
                            checked={done}
                            onCheckedChange={(v) =>
                              toggle.mutate({ source: "daily", source_id: d.id, space_id: sp.id, on: !!v })
                            }
                          />
                          <div className="flex-1">
                            <div className={`text-sm ${done ? "line-through text-muted-foreground" : ""}`}>{d.label}</div>
                            {d.detail && (
                              <div className="text-xs text-muted-foreground">{d.detail}</div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {spRot.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Client rotation</div>
                  <div className="divide-y rounded border">
                    {spRot.map((r) => {
                      const done = isDone("rotation", r.id);
                      const label = r.is_free_day
                        ? `Free day — ${clientName(r.client_id)}`
                        : `${clientName(r.client_id)} · ${defName(r.definition_id) ?? "—"}`;
                      const detail = defs.find((d) => d.id === r.definition_id)?.task_list;
                      return (
                        <label key={r.id} className="flex items-start gap-2 p-2 cursor-pointer">
                          <Checkbox
                            checked={done}
                            disabled={r.is_free_day}
                            onCheckedChange={(v) =>
                              toggle.mutate({ source: "rotation", source_id: r.id, space_id: sp.id, on: !!v })
                            }
                          />
                          <div className="flex-1">
                            <div className={`text-sm ${done ? "line-through text-muted-foreground" : ""}`}>{label}</div>
                            {detail && !r.is_free_day && (
                              <div className="text-xs text-muted-foreground">{detail}</div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
