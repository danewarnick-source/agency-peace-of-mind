import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Trash2, Sparkles, FileDown, Printer, ClipboardList, Users, Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  renderChoreChartPdf,
  type ChoreChartPdfPayload,
} from "@/lib/chore-chart-pdf";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const FREE_DAY_VALUE = "__free__";
const NONE_VALUE = "__none__";

type Space = {
  id: string;
  organization_id: string;
  team_id: string | null;
  name: string;
  space_type: string;
  notes: string | null;
};
type Def = {
  id: string;
  chore_name: string;
  task_list: string;
  sort_order: number;
  space_id: string | null;
};
type ClientLite = { id: string; first_name: string; last_name: string };
type RotationCell = {
  id: string;
  client_id: string;
  day_of_week: number;
  definition_id: string | null;
  is_free_day: boolean;
  note: string | null;
};
type ShiftRow = {
  id: string;
  label: string;
  start_time: string | null;
  end_time: string | null;
  sort_order: number;
};
type ShiftCell = {
  id: string;
  shift_row_id: string;
  day_of_week: number;
  task_text: string;
  helps_client_id: string | null;
  definition_id: string | null;
};

function clientName(c: ClientLite) {
  return `${c.first_name} ${c.last_name}`.trim();
}
function fmtTimeRange(r: ShiftRow): string | null {
  if (!r.start_time && !r.end_time) return null;
  const f = (t: string | null) => (t ? t.slice(0, 5) : "?");
  return `${f(r.start_time)} – ${f(r.end_time)}`;
}

export function ChoreChartPanel({
  spaceId,
  readOnly: forcedReadOnly = false,
}: {
  spaceId: string;
  readOnly?: boolean;
}) {
  const { session } = useAuth();
  const { data: org } = useCurrentOrg();
  const canEdit =
    !forcedReadOnly &&
    (org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin");
  const qc = useQueryClient();

  const spaceQ = useQuery({
    enabled: !!spaceId,
    queryKey: ["chore-space", spaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_spaces")
        .select("id, organization_id, team_id, name, space_type, notes")
        .eq("id", spaceId)
        .maybeSingle();
      if (error) throw error;
      return data as Space | null;
    },
  });
  const space = spaceQ.data;

  const clientsQ = useQuery({
    enabled: !!spaceId,
    queryKey: ["chore-space-clients", spaceId],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("chore_space_clients")
        .select("client_id")
        .eq("space_id", spaceId);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.client_id);
      if (!ids.length) return [] as ClientLite[];
      const { data: clients, error: e2 } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .in("id", ids);
      if (e2) throw e2;
      return (clients ?? []) as ClientLite[];
    },
  });
  const clients = clientsQ.data ?? [];

  const orgClientsQ = useQuery({
    enabled: canEdit && !!space?.organization_id,
    queryKey: ["chore-org-clients", space?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", space!.organization_id)
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as ClientLite[];
    },
  });
  const availableClients = (orgClientsQ.data ?? []).filter(
    (c) => !clients.find((x) => x.id === c.id),
  );

  const defsQ = useQuery({
    enabled: !!space?.organization_id,
    queryKey: ["chore-defs", spaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_definitions")
        .select("id, chore_name, task_list, sort_order, space_id")
        .eq("organization_id", space!.organization_id)
        .or(`space_id.is.null,space_id.eq.${spaceId}`)
        .order("sort_order")
        .order("chore_name");
      if (error) throw error;
      return (data ?? []) as Def[];
    },
  });
  const defs = defsQ.data ?? [];

  const rotationQ = useQuery({
    enabled: !!spaceId,
    queryKey: ["chore-rotation", spaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_client_rotation")
        .select("id, client_id, day_of_week, definition_id, is_free_day, note")
        .eq("space_id", spaceId);
      if (error) throw error;
      return (data ?? []) as RotationCell[];
    },
  });
  const rotation = rotationQ.data ?? [];

  const shiftRowsQ = useQuery({
    enabled: !!spaceId,
    queryKey: ["chore-shift-rows", spaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_shift_rows")
        .select("id, label, start_time, end_time, sort_order")
        .eq("space_id", spaceId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ShiftRow[];
    },
  });
  const shiftRows = shiftRowsQ.data ?? [];

  const shiftCellsQ = useQuery({
    enabled: !!spaceId,
    queryKey: ["chore-shift-cells", spaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chore_shift_assignments")
        .select("id, shift_row_id, day_of_week, task_text, helps_client_id, definition_id")
        .eq("space_id", spaceId);
      if (error) throw error;
      return (data ?? []) as ShiftCell[];
    },
  });
  const shiftCells = shiftCellsQ.data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["chore-defs", spaceId] });
    qc.invalidateQueries({ queryKey: ["chore-rotation", spaceId] });
    qc.invalidateQueries({ queryKey: ["chore-shift-rows", spaceId] });
    qc.invalidateQueries({ queryKey: ["chore-shift-cells", spaceId] });
    qc.invalidateQueries({ queryKey: ["chore-space-clients", spaceId] });
  };

  // ── Mutations
  const addClient = useMutation({
    mutationFn: async (client_id: string) => {
      const { error } = await supabase
        .from("chore_space_clients")
        .insert({ space_id: spaceId, client_id });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const removeClient = useMutation({
    mutationFn: async (client_id: string) => {
      const { error } = await supabase
        .from("chore_space_clients")
        .delete()
        .eq("space_id", spaceId)
        .eq("client_id", client_id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertDef = useMutation({
    mutationFn: async (d: { id?: string; chore_name: string; task_list: string }) => {
      if (d.id) {
        const { error } = await supabase
          .from("chore_definitions")
          .update({ chore_name: d.chore_name, task_list: d.task_list })
          .eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chore_definitions").insert({
          organization_id: space!.organization_id,
          space_id: spaceId,
          chore_name: d.chore_name,
          task_list: d.task_list,
          sort_order: defs.length,
        });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteDef = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chore_definitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertRotation = useMutation({
    mutationFn: async (v: {
      client_id: string;
      day_of_week: number;
      definition_id: string | null;
      is_free_day: boolean;
    }) => {
      const { error } = await supabase
        .from("chore_client_rotation")
        .upsert(
          {
            space_id: spaceId,
            client_id: v.client_id,
            day_of_week: v.day_of_week,
            definition_id: v.is_free_day ? null : v.definition_id,
            is_free_day: v.is_free_day,
          },
          { onConflict: "space_id,client_id,day_of_week" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chore-rotation", spaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addShiftRow = useMutation({
    mutationFn: async (label: string) => {
      const { error } = await supabase.from("chore_shift_rows").insert({
        space_id: spaceId,
        label,
        sort_order: shiftRows.length,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const updateShiftRow = useMutation({
    mutationFn: async (v: Partial<ShiftRow> & { id: string }) => {
      const { error } = await supabase
        .from("chore_shift_rows")
        .update(v)
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chore-shift-rows", spaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteShiftRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chore_shift_rows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertShiftCell = useMutation({
    mutationFn: async (v: {
      shift_row_id: string;
      day_of_week: number;
      task_text: string;
      helps_client_id: string | null;
      definition_id: string | null;
    }) => {
      const { error } = await supabase
        .from("chore_shift_assignments")
        .upsert(
          { space_id: spaceId, ...v },
          { onConflict: "space_id,shift_row_id,day_of_week" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chore-shift-cells", spaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [defEditorOpen, setDefEditorOpen] = useState(false);
  const [editDef, setEditDef] = useState<Def | null>(null);
  const [newShiftLabel, setNewShiftLabel] = useState("");
  const [pickClient, setPickClient] = useState("");

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  const buildPdf = async (): Promise<Uint8Array> => {
    const payload: ChoreChartPdfPayload = {
      orgName: (org as { organization_name?: string } | undefined)?.organization_name ?? "",
      spaceName: space?.name ?? "",
      spaceType: space?.space_type ?? "",
      clients: clients.map((c) => ({ id: c.id, name: clientName(c) })),
      definitions: defs.map((d) => ({
        id: d.id, chore_name: d.chore_name, task_list: d.task_list,
      })),
      clientCells: rotation.map((r) => ({
        clientId: r.client_id,
        day: r.day_of_week,
        definitionName:
          defs.find((d) => d.id === r.definition_id)?.chore_name ?? null,
        isFreeDay: r.is_free_day,
        note: r.note,
      })),
      shiftRows: shiftRows.map((r) => ({
        id: r.id, label: r.label, timeRange: fmtTimeRange(r),
      })),
      shiftCells: shiftCells.map((c) => ({
        shiftRowId: c.shift_row_id,
        day: c.day_of_week,
        taskText: c.task_text,
        helpsClientName: (() => {
          const h = clients.find((x) => x.id === c.helps_client_id);
          return h ? clientName(h) : null;
        })(),
        definitionName:
          defs.find((d) => d.id === c.definition_id)?.chore_name ?? null,
      })),
    };
    return renderChoreChartPdf(payload);
  };

  const preview = async () => {
    try {
      const bytes = await buildPdf();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setPdfOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const download = async () => {
    try {
      const bytes = await buildPdf();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Chore Chart — ${space?.name ?? "Space"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (spaceQ.isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading chore chart…</p>;
  }
  if (!space) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Chore chart not found.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> {space.name} — Chore Chart
              <Badge variant="outline" className="ml-1 uppercase">{space.space_type}</Badge>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Post this chart so anyone in the home knows what to clean and when. Staff check off completed items each shift for inspection readiness.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={preview} className="gap-1">
              <Printer className="h-4 w-4" /> Preview
            </Button>
            <Button variant="outline" size="sm" onClick={download} className="gap-1">
              <FileDown className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Clients in this space */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" /> Clients in this space · {clients.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {clients.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No clients linked yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {clients.map((c) => (
                <Badge key={c.id} variant="secondary" className="gap-1">
                  {clientName(c)}
                  {canEdit && (
                    <button
                      className="ml-1 text-muted-foreground hover:text-destructive"
                      onClick={() => removeClient.mutate(c.id)}
                      title="Remove from space"
                    >
                      ×
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
          {canEdit && availableClients.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[200px]">
                <Label>Add client to this space</Label>
                <Select value={pickClient} onValueChange={setPickClient}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Pick a client…" /></SelectTrigger>
                  <SelectContent>
                    {availableClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{clientName(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                disabled={!pickClient}
                onClick={() => addClient.mutate(pickClient, { onSuccess: () => setPickClient("") })}
                className="gap-1"
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task definition key */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4" /> Task key — what each chore includes
          </CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => { setEditDef(null); setDefEditorOpen(true); }} className="gap-1">
              <Plus className="h-4 w-4" /> Add chore
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {defs.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No chore definitions yet. Add "Kitchen/Dining Room", "Deep Clean Room", etc.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {defs.map((d) => (
                <div key={d.id} className="flex items-start gap-3 p-3">
                  <div className="w-40 shrink-0 font-semibold text-sm">{d.chore_name}</div>
                  <div className="flex-1 text-sm text-muted-foreground whitespace-pre-wrap">{d.task_list || "—"}</div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditDef(d); setDefEditorOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${d.chore_name}"?`)) deleteDef.mutate(d.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client rotation grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" /> Client rotation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Add at least one client to build the rotation.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left font-semibold w-40">Client</th>
                    {DAYS.map((d) => (
                      <th key={d} className="p-2 text-left font-semibold text-muted-foreground">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id} className="border-b align-top">
                      <td className="p-2 font-medium">{clientName(c)}</td>
                      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                        const cell = rotation.find((r) => r.client_id === c.id && r.day_of_week === day);
                        const val = cell?.is_free_day
                          ? FREE_DAY_VALUE
                          : cell?.definition_id ?? NONE_VALUE;
                        return (
                          <td key={day} className="p-1 min-w-[110px]">
                            {canEdit ? (
                              <Select
                                value={val}
                                onValueChange={(v) => {
                                  upsertRotation.mutate({
                                    client_id: c.id,
                                    day_of_week: day,
                                    definition_id: v === NONE_VALUE || v === FREE_DAY_VALUE ? null : v,
                                    is_free_day: v === FREE_DAY_VALUE,
                                  });
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE_VALUE}>—</SelectItem>
                                  <SelectItem value={FREE_DAY_VALUE}>Free day</SelectItem>
                                  {defs.map((d) => (
                                    <SelectItem key={d.id} value={d.id}>{d.chore_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className={`rounded px-2 py-1 text-xs ${cell?.is_free_day ? "bg-emerald-50 text-emerald-800" : "bg-muted"}`}>
                                {cell?.is_free_day
                                  ? "Free day"
                                  : defs.find((d) => d.id === cell?.definition_id)?.chore_name ?? "—"}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Staff-shift grid */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" /> Staff-shift chart
          </CardTitle>
          {canEdit && (
            <div className="flex gap-2">
              <Input
                placeholder="Shift label (e.g. Grave)"
                value={newShiftLabel}
                onChange={(e) => setNewShiftLabel(e.target.value)}
                className="h-8 w-40"
              />
              <Button
                size="sm"
                disabled={!newShiftLabel.trim()}
                onClick={() => addShiftRow.mutate(newShiftLabel.trim(), { onSuccess: () => setNewShiftLabel("") })}
                className="gap-1"
              >
                <Plus className="h-4 w-4" /> Shift
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {shiftRows.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Add shifts (Grave, Morning, Afternoon, Evening) with time ranges.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left font-semibold w-44">Shift</th>
                    {DAYS.map((d) => (
                      <th key={d} className="p-2 text-left font-semibold text-muted-foreground">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shiftRows.map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="p-2 space-y-1">
                        {canEdit ? (
                          <>
                            <Input
                              value={row.label}
                              onChange={(e) => updateShiftRow.mutate({ id: row.id, label: e.target.value })}
                              className="h-7 text-xs font-semibold"
                            />
                            <div className="flex gap-1">
                              <Input
                                type="time"
                                value={row.start_time ?? ""}
                                onChange={(e) => updateShiftRow.mutate({ id: row.id, start_time: e.target.value || null })}
                                className="h-7 text-xs w-24"
                              />
                              <Input
                                type="time"
                                value={row.end_time ?? ""}
                                onChange={(e) => updateShiftRow.mutate({ id: row.id, end_time: e.target.value || null })}
                                className="h-7 text-xs w-24"
                              />
                            </div>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground"
                              onClick={() => { if (confirm(`Delete shift "${row.label}"?`)) deleteShiftRow.mutate(row.id); }}
                            >
                              Remove
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="font-semibold">{row.label}</div>
                            {fmtTimeRange(row) && (
                              <div className="text-xs text-muted-foreground">{fmtTimeRange(row)}</div>
                            )}
                          </>
                        )}
                      </td>
                      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                        const cell = shiftCells.find((c) => c.shift_row_id === row.id && c.day_of_week === day) ?? {
                          id: "",
                          shift_row_id: row.id,
                          day_of_week: day,
                          task_text: "",
                          helps_client_id: null,
                          definition_id: null,
                        };
                        return (
                          <td key={day} className="p-1 min-w-[150px]">
                            {canEdit ? (
                              <ShiftCellEditor
                                cell={cell}
                                clients={clients}
                                defs={defs}
                                onChange={(v) =>
                                  upsertShiftCell.mutate({
                                    shift_row_id: row.id,
                                    day_of_week: day,
                                    task_text: v.task_text,
                                    helps_client_id: v.helps_client_id,
                                    definition_id: v.definition_id,
                                  })
                                }
                              />
                            ) : (
                              <div className="rounded bg-muted px-2 py-1 text-xs whitespace-pre-wrap">
                                {[
                                  cell.helps_client_id && `Help ${clientName(clients.find((c) => c.id === cell.helps_client_id) ?? { id: "", first_name: "?", last_name: "" })}`,
                                  defs.find((d) => d.id === cell.definition_id)?.chore_name,
                                  cell.task_text,
                                ].filter(Boolean).join(" · ") || "—"}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DefEditorDialog
        open={defEditorOpen}
        onOpenChange={setDefEditorOpen}
        initial={editDef}
        onSave={(v) => upsertDef.mutate(v, { onSuccess: () => setDefEditorOpen(false) })}
      />

      <Dialog open={pdfOpen} onOpenChange={(v) => { setPdfOpen(v); if (!v && pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl(null); } }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Chore Chart preview — {space.name}</DialogTitle>
          </DialogHeader>
          {pdfUrl && (
            <iframe src={pdfUrl} className="h-[70vh] w-full rounded border" title="Chore chart PDF preview" />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPdfOpen(false)}>Close</Button>
            <Button onClick={download} className="gap-1"><FileDown className="h-4 w-4" /> Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShiftCellEditor({
  cell, clients, defs, onChange,
}: {
  cell: {
    task_text: string;
    helps_client_id: string | null;
    definition_id: string | null;
  };
  clients: ClientLite[];
  defs: Def[];
  onChange: (v: {
    task_text: string;
    helps_client_id: string | null;
    definition_id: string | null;
  }) => void;
}) {
  const [text, setText] = useState(cell.task_text);
  const [helps, setHelps] = useState<string | null>(cell.helps_client_id);
  const [defId, setDefId] = useState<string | null>(cell.definition_id);
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <Select
          value={helps ?? NONE_VALUE}
          onValueChange={(v) => {
            const nv = v === NONE_VALUE ? null : v;
            setHelps(nv);
            onChange({ task_text: text, helps_client_id: nv, definition_id: defId });
          }}
        >
          <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue placeholder="Help…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>— no helper —</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>Help {clientName(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={defId ?? NONE_VALUE}
          onValueChange={(v) => {
            const nv = v === NONE_VALUE ? null : v;
            setDefId(nv);
            onChange({ task_text: text, helps_client_id: helps, definition_id: nv });
          }}
        >
          <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue placeholder="Chore…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>— none —</SelectItem>
            {defs.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.chore_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange({ task_text: text, helps_client_id: helps, definition_id: defId })}
        placeholder="Task…"
        className="h-7 text-xs"
      />
    </div>
  );
}

function DefEditorDialog({
  open, onOpenChange, initial, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Def | null;
  onSave: (v: { id?: string; chore_name: string; task_list: string }) => void;
}) {
  const [name, setName] = useState("");
  const [tasks, setTasks] = useState("");
  useEffect(() => {
    setName(initial?.chore_name ?? "");
    setTasks(initial?.task_list ?? "");
  }, [initial, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit chore" : "Add chore"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Chore name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kitchen/Dining Room" />
          </div>
          <div>
            <Label>Task breakdown</Label>
            <Textarea
              rows={5}
              value={tasks}
              onChange={(e) => setTasks(e.target.value)}
              placeholder="clean counters, load/unload dishwasher, sweep floor, take out trash…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!name.trim()}
            onClick={() => onSave({ id: initial?.id, chore_name: name.trim(), task_list: tasks })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
