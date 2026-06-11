import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  listPatterns, upsertPattern, deletePattern, togglePattern, materializeWeek,
  listRotationGroups,
} from "@/lib/scheduling/recurring.functions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface ClientOpt { id: string; name: string }
interface StaffOpt { id: string; name: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  weekStart: Date;
  clients: ClientOpt[];
  staff: StaffOpt[];
  onChanged?: () => void;
}

type PatternRow = {
  id: string;
  client_id: string | null;
  service_code_id: string | null;
  staff_id: string | null;
  rotation_group_id: string | null;
  weekday_mask: number;
  start_time_local: string;
  end_time_local: string;
  effective_from: string;
  effective_until: string | null;
  name: string | null;
  notes: string | null;
  active: boolean;
};

function emptyDraft(orgId: string): Partial<PatternRow> & { organization_id: string } {
  return {
    organization_id: orgId,
    client_id: null,
    service_code_id: null,
    staff_id: null,
    rotation_group_id: null,
    weekday_mask: 0,
    start_time_local: "09:00",
    end_time_local: "17:00",
    effective_from: new Date().toISOString().slice(0, 10),
    effective_until: null,
    name: "",
    notes: "",
    active: true,
  };
}

function maskLabel(mask: number) {
  return DAYS.filter((_, i) => mask & (1 << i)).join(" ") || "—";
}

export function RecurringPatternsDialog({
  open, onOpenChange, organizationId, weekStart, clients, staff, onChanged,
}: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPatterns);
  const upsertFn = useServerFn(upsertPattern);
  const delFn = useServerFn(deletePattern);
  const toggleFn = useServerFn(togglePattern);
  const matFn = useServerFn(materializeWeek);
  const listRotFn = useServerFn(listRotationGroups);

  const patternsQ = useQuery({
    enabled: open,
    queryKey: ["recurring-patterns", organizationId],
    queryFn: () => listFn({ data: { organizationId } }) as Promise<PatternRow[]>,
  });
  const rotsQ = useQuery({
    enabled: open,
    queryKey: ["rotation-groups", organizationId],
    queryFn: () => listRotFn({ data: { organizationId } }) as Promise<Array<{ id: string; name: string }>>,
  });

  const [draft, setDraft] = useState<any | null>(null);
  useEffect(() => { if (!open) setDraft(null); }, [open]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["recurring-patterns", organizationId] });
    onChanged?.();
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.client_id) { toast.error("Pick a client"); return; }
    if (!draft.weekday_mask) { toast.error("Pick at least one weekday"); return; }
    try {
      await upsertFn({ data: { ...draft } });
      toast.success(draft.id ? "Pattern updated" : "Pattern created");
      setDraft(null);
      refresh();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
  };

  const removePattern = async (id: string) => {
    if (!confirm("Delete this pattern?")) return;
    await delFn({ data: { id } });
    refresh();
  };

  const materialize = async () => {
    try {
      const res = await matFn({ data: { organizationId, weekStartIso: weekStart.toISOString() } }) as { created: number; skipped: number };
      toast.success(`Created ${res.created} shift${res.created === 1 ? "" : "s"} (skipped ${res.skipped})`);
      onChanged?.();
    } catch (e: any) { toast.error(e?.message ?? "Materialize failed"); }
  };

  const clientName = useMemo(() => {
    const m = new Map(clients.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown client" : "—");
  }, [clients]);
  const staffName = useMemo(() => {
    const m = new Map(staff.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown" : null);
  }, [staff]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recurring shift patterns</DialogTitle>
          <DialogDescription>
            Define weekly templates. Use "Materialize this week" to generate the visible week's shifts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button onClick={() => setDraft(emptyDraft(organizationId))}>+ New pattern</Button>
          <Button variant="secondary" onClick={materialize}>Materialize this week</Button>
        </div>

        {patternsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (patternsQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No patterns yet.</p>
        ) : (
          <div className="space-y-2">
            {(patternsQ.data ?? []).map((p) => (
              <div key={p.id} className="border rounded-md p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {p.name || clientName(p.client_id)}{" "}
                    {!p.active && <Badge variant="outline" className="ml-2">Paused</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {maskLabel(p.weekday_mask)} · {p.start_time_local}–{p.end_time_local}
                    {staffName(p.staff_id) && ` · ${staffName(p.staff_id)}`}
                    {!p.staff_id && p.rotation_group_id && " · rotation"}
                    {!p.staff_id && !p.rotation_group_id && " · open shift"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p.active}
                    onCheckedChange={async (v) => { await toggleFn({ data: { id: p.id, active: v } }); refresh(); }}
                  />
                  <Button size="sm" variant="outline" onClick={() => setDraft({ ...p, organization_id: organizationId })}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => removePattern(p.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {draft && (
          <div className="mt-4 border rounded-md p-3 space-y-3 bg-muted/30">
            <div className="font-medium">{draft.id ? "Edit pattern" : "New pattern"}</div>
            <div>
              <Label>Name (optional)</Label>
              <Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <Label>Client</Label>
              <select
                className="w-full border rounded-md h-9 px-2 bg-background"
                value={draft.client_id ?? ""}
                onChange={(e) => setDraft({ ...draft, client_id: e.target.value || null })}
              >
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Weekdays</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DAYS.map((d, i) => {
                  const checked = !!(draft.weekday_mask & (1 << i));
                  return (
                    <label key={d} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const mask = v
                            ? draft.weekday_mask | (1 << i)
                            : draft.weekday_mask & ~(1 << i);
                          setDraft({ ...draft, weekday_mask: mask });
                        }}
                      />
                      {d}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start time</Label>
                <Input type="time" value={draft.start_time_local.slice(0, 5)}
                  onChange={(e) => setDraft({ ...draft, start_time_local: e.target.value })} />
              </div>
              <div>
                <Label>End time</Label>
                <Input type="time" value={draft.end_time_local.slice(0, 5)}
                  onChange={(e) => setDraft({ ...draft, end_time_local: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Effective from</Label>
                <Input type="date" value={draft.effective_from}
                  onChange={(e) => setDraft({ ...draft, effective_from: e.target.value })} />
              </div>
              <div>
                <Label>Effective until (optional)</Label>
                <Input type="date" value={draft.effective_until ?? ""}
                  onChange={(e) => setDraft({ ...draft, effective_until: e.target.value || null })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Assigned staff (optional)</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 bg-background"
                  value={draft.staff_id ?? ""}
                  onChange={(e) => setDraft({ ...draft, staff_id: e.target.value || null, rotation_group_id: e.target.value ? null : draft.rotation_group_id })}
                >
                  <option value="">— open / rotation —</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Rotation group (optional)</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 bg-background"
                  value={draft.rotation_group_id ?? ""}
                  disabled={!!draft.staff_id}
                  onChange={(e) => setDraft({ ...draft, rotation_group_id: e.target.value || null })}
                >
                  <option value="">—</option>
                  {(rotsQ.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="mt-4">
          {draft ? (
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              <Button onClick={save}>Save pattern</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
