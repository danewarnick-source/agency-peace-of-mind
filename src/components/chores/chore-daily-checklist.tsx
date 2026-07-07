// Staff daily checklist — surfaces today's chores (client rotation +
// every-day items) for the space(s) tied to a client or team. Each chore
// is recorded with a 4-way OUTCOME rather than a boolean toggle:
//   completed              — client did it independently
//   completed_with_support — staff supported the client to do it
//   offered_declined       — staff offered/supported; client refused
//   not_addressed          — chore was not addressed today
// For ID/DD services documentation is about the PROVIDER offering support,
// not client compliance — "offered/declined" is a valid, important outcome
// and gets recorded as proof of support provided.

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
export type ChoreOutcome =
  | "completed"
  | "completed_with_support"
  | "offered_declined"
  | "not_addressed";
type Completion = {
  id: string;
  source: "rotation" | "daily";
  source_id: string;
  completion_date: string;
  outcome: ChoreOutcome;
  client_id: string | null;
};

export const OUTCOME_OPTIONS: { v: ChoreOutcome; label: string }[] = [
  { v: "completed", label: "Completed" },
  { v: "completed_with_support", label: "Completed with support" },
  { v: "offered_declined", label: "Offered — client declined" },
  { v: "not_addressed", label: "Not addressed" },
];

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
        .in("space_id", spaceIds);
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
        .select("client_id, space_id")
        .in("space_id", spaceIds);
      if (error) throw error;
      const ids = Array.from(new Set((links ?? []).map((l) => l.client_id)));
      if (!ids.length) return { clients: [] as ClientLite[], bySpace: {} as Record<string, string[]> };
      const { data: clients, error: e2 } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .in("id", ids);
      if (e2) throw e2;
      const bySpace: Record<string, string[]> = {};
      for (const link of links ?? []) {
        (bySpace[link.space_id] ??= []).push(link.client_id);
      }
      return { clients: (clients ?? []) as ClientLite[], bySpace };
    },
  });

  const completionsQ = useQuery({
    enabled,
    queryKey: ["chore-cl-completions", spaceIds, dateISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_completions")
        .select("id, source, source_id, completion_date, outcome, client_id")
        .in("space_id", spaceIds)
        .eq("completion_date", dateISO);
      if (error) throw error;
      return (data ?? []) as Completion[];
    },
  });

  const setOutcome = useMutation({
    mutationFn: async (v: {
      source: "rotation" | "daily";
      source_id: string;
      space_id: string;
      client_id: string | null;
      outcome: ChoreOutcome;
    }) => {
      const existing = (completionsQ.data ?? []).find(
        (c) =>
          c.source === v.source &&
          c.source_id === v.source_id &&
          (c.client_id ?? null) === (v.client_id ?? null),
      );
      if (existing) {
        const { error } = await supabase
          .from("chore_completions")
          .update({
            outcome: v.outcome,
            completed_by: session?.user?.id,
            completed_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chore_completions").insert({
          space_id: v.space_id,
          source: v.source,
          source_id: v.source_id,
          completion_date: dateISO,
          completed_by: session?.user?.id,
          client_id: v.client_id,
          outcome: v.outcome,
        });
        if (error) throw error;
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["chore-cl-completions", spaceIds, dateISO] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!enabled) return null;

  const spaces = spacesQ.data ?? [];
  const defs = defsQ.data ?? [];
  const rotation = rotationQ.data ?? [];
  const dailyItems = dailyItemsQ.data ?? [];
  const clientsInfo = clientsQ.data ?? { clients: [], bySpace: {} };
  const completions = completionsQ.data ?? [];

  const outcomeFor = (
    source: "rotation" | "daily",
    id: string,
    client_id: string | null,
  ): ChoreOutcome | null => {
    const c = completions.find(
      (x) =>
        x.source === source &&
        x.source_id === id &&
        (x.client_id ?? null) === (client_id ?? null),
    );
    return c?.outcome ?? null;
  };

  const defName = (id: string | null) => defs.find((d) => d.id === id)?.chore_name ?? null;
  const clientName = (id: string) => {
    const c = clientsInfo.clients.find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}`.trim() : "";
  };

  const recorded = completions.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ClipboardList className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        <Badge variant="outline" className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> {recorded} recorded
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Record an outcome for every chore. "Offered — client declined" is a
          valid, important outcome and counts as documented support.
        </p>
        {spaces.map((sp) => {
          const spRot = rotation.filter((r) => r.space_id === sp.id);
          const spDaily = dailyItems.filter((d) => d.space_id === sp.id);
          const spClientIds = clientsInfo.bySpace[sp.id] ?? [];
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
                    {spDaily.map((d) =>
                      spClientIds.length === 0 ? (
                        <OutcomeRow
                          key={d.id}
                          title={d.label}
                          detail={d.detail}
                          value={outcomeFor("daily", d.id, null)}
                          onChange={(o) =>
                            setOutcome.mutate({
                              source: "daily",
                              source_id: d.id,
                              space_id: sp.id,
                              client_id: null,
                              outcome: o,
                            })
                          }
                        />
                      ) : (
                        spClientIds.map((cid) => (
                          <OutcomeRow
                            key={`${d.id}-${cid}`}
                            title={`${d.label} — ${clientName(cid)}`}
                            detail={d.detail}
                            value={outcomeFor("daily", d.id, cid)}
                            onChange={(o) =>
                              setOutcome.mutate({
                                source: "daily",
                                source_id: d.id,
                                space_id: sp.id,
                                client_id: cid,
                                outcome: o,
                              })
                            }
                          />
                        ))
                      ),
                    )}
                  </div>
                </div>
              )}

              {spRot.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Client rotation</div>
                  <div className="divide-y rounded border">
                    {spRot.map((r) => {
                      const label = r.is_free_day
                        ? `Free day — ${clientName(r.client_id)}`
                        : `${clientName(r.client_id)} · ${defName(r.definition_id) ?? "—"}`;
                      const detail = defs.find((d) => d.id === r.definition_id)?.task_list ?? null;
                      if (r.is_free_day) {
                        return (
                          <div key={r.id} className="p-2">
                            <div className="text-sm text-muted-foreground">{label}</div>
                          </div>
                        );
                      }
                      return (
                        <OutcomeRow
                          key={r.id}
                          title={label}
                          detail={detail}
                          value={outcomeFor("rotation", r.id, r.client_id)}
                          onChange={(o) =>
                            setOutcome.mutate({
                              source: "rotation",
                              source_id: r.id,
                              space_id: sp.id,
                              client_id: r.client_id,
                              outcome: o,
                            })
                          }
                        />
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

function OutcomeRow({
  title,
  detail,
  value,
  onChange,
}: {
  title: string;
  detail: string | null;
  value: ChoreOutcome | null;
  onChange: (o: ChoreOutcome) => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-start">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </div>
      <div className="w-full sm:w-56">
        <Select value={value ?? ""} onValueChange={(v) => onChange(v as ChoreOutcome)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Record outcome" />
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_OPTIONS.map((o) => (
              <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
