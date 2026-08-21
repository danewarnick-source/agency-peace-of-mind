// Shared roster helpers for admin "file evidence on behalf of staff" flows.
//
// Per-person staff obligations (hire-date / anniversary driven: CPR,
// Background Screening, Medicaid Disclosure, Annual CE, …) generate ONE
// instance per staff member, each holding a single assignee row. Any UI that
// only looks at the obligation's newest instance can therefore only ever
// offer one staff member. These helpers gather EVERY open instance for the
// obligation so the admin sees the full outstanding roster.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";

export type RosterEntry = {
  instance_id: string;
  staff_id: string;
  staff_name: string;
  client_name: string | null;
  due_at: string | null;
  status: string;
};

type InstanceRow = {
  id: string;
  status: string;
  due_at: string | null;
  client_name: string | null;
};

/** All not-yet-completed staff (across every open instance) for one obligation. */
export function useOutstandingRoster(obligationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["obligation-outstanding-roster", obligationId],
    enabled: !!obligationId && enabled,
    queryFn: async (): Promise<RosterEntry[]> => {
      const { data: instances, error: iErr } = await supabase
        .from("company_obligation_instances")
        .select("id, status, due_at, client_name")
        .eq("obligation_id", obligationId as string)
        .in("status", ["pending", "overdue"]);
      if (iErr) throw new Error(iErr.message);

      const rows = (instances ?? []) as InstanceRow[];
      const ids = rows.map((i) => i.id);
      if (!ids.length) return [];

      const [{ data: assignees, error: aErr }, { data: completions, error: cErr }] = await Promise.all([
        supabase
          .from("company_obligation_instance_assignees")
          .select("instance_id, staff_id, staff_name")
          .in("instance_id", ids),
        supabase
          .from("company_obligation_completions")
          .select("instance_id, staff_id")
          .in("instance_id", ids),
      ]);
      if (aErr) throw new Error(aErr.message);
      if (cErr) throw new Error(cErr.message);

      const done = new Set(
        ((completions ?? []) as Array<{ instance_id: string; staff_id: string | null }>).map(
          (c) => `${c.instance_id}:${c.staff_id ?? ""}`,
        ),
      );
      const instById = new Map(rows.map((i) => [i.id, i]));

      return ((assignees ?? []) as Array<{ instance_id: string; staff_id: string; staff_name: string | null }>)
        .filter((a) => !done.has(`${a.instance_id}:${a.staff_id}`))
        .map((a) => {
          const inst = instById.get(a.instance_id);
          return {
            instance_id: a.instance_id,
            staff_id: a.staff_id,
            staff_name: a.staff_name ?? "Unknown staff",
            client_name: inst?.client_name ?? null,
            due_at: inst?.due_at ?? null,
            status: inst?.status ?? "pending",
          };
        })
        .sort((x, y) => x.staff_name.localeCompare(y.staff_name));
    },
  });
}

/** Checkbox roster with search + Select all / Clear. */
export function RosterMultiSelect({
  roster,
  selected,
  onChange,
  emptyLabel = "No outstanding staff.",
}: {
  roster: RosterEntry[];
  selected: Set<string>; // keys: `${instance_id}:${staff_id}`
  onChange: (next: Set<string>) => void;
  emptyLabel?: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter(
      (r) =>
        r.staff_name.toLowerCase().includes(needle) ||
        (r.client_name ?? "").toLowerCase().includes(needle),
    );
  }, [roster, q]);

  const keyOf = (r: RosterEntry) => `${r.instance_id}:${r.staff_id}`;
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(keyOf(r)));

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search staff…"
          className="h-8 text-sm"
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => {
              const next = new Set(selected);
              if (allSelected) filtered.forEach((r) => next.delete(keyOf(r)));
              else filtered.forEach((r) => next.add(keyOf(r)));
              onChange(next);
            }}
            disabled={!filtered.length}
          >
            {allSelected ? "Clear" : "Select all"}
          </Button>
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {selected.size} selected
          </span>
        </div>
      </div>

      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-1.5">
        {filtered.length === 0 ? (
          <p className="px-1.5 py-2 text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          filtered.map((r) => {
            const k = keyOf(r);
            const checked = selected.has(k);
            return (
              <label
                key={k}
                className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    const next = new Set(selected);
                    if (v === true) next.add(k);
                    else next.delete(k);
                    onChange(next);
                  }}
                />
                <span className="flex-1">
                  {r.staff_name}
                  {r.client_name ? (
                    <span className="text-muted-foreground"> — {r.client_name}</span>
                  ) : null}
                </span>
                {r.status === "overdue" && (
                  <span className="text-xs text-destructive">Overdue</span>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
