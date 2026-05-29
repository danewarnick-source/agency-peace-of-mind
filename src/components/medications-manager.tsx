import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill, Plus, Upload, X, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { parseMedicationsAI } from "@/lib/medications.functions";

export type Medication = {
  id: string;
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  scheduled_times: string[];
  instructions: string | null;
  prescriber: string | null;
  is_active: boolean;
  discontinued_at: string | null;
};

type FormVals = {
  medication_name: string; dosage: string; frequency: string; route: string;
  scheduled_times: string[]; instructions: string; prescriber: string;
};

const EMPTY: FormVals = {
  medication_name: "", dosage: "", frequency: "", route: "PO",
  scheduled_times: [], instructions: "", prescriber: "",
};

export function MedicationsManager({
  clientId, organizationId,
}: { clientId: string; organizationId?: string }) {
  const qc = useQueryClient();
  const parseAI = useServerFn(parseMedicationsAI);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const { data: meds, isLoading } = useQuery({
    queryKey: ["client-medications", clientId],
    queryFn: async (): Promise<Medication[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("client_medications" as any)
        .select("id, medication_name, dosage, frequency, route, scheduled_times, instructions, prescriber, is_active, discontinued_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Medication[]) ?? [];
    },
  });

  const insertMut = useMutation({
    mutationFn: async (v: FormVals) => {
      if (!organizationId) throw new Error("Missing organization");
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("client_medications" as any).insert({
          organization_id: organizationId, client_id: clientId, ...v,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Medication added");
      qc.invalidateQueries({ queryKey: ["client-medications", clientId] });
      setAddOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discontinueMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("client_medications" as any)
        .update({ is_active: false, discontinued_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked inactive (history preserved)");
      qc.invalidateQueries({ queryKey: ["client-medications", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkInsertMut = useMutation({
    mutationFn: async (rows: FormVals[]) => {
      if (!organizationId) throw new Error("Missing organization");
      const payload = rows.map((r) => ({ organization_id: organizationId, client_id: clientId, ...r }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("client_medications" as any).insert(payload as any);
      if (error) throw error;
    },
    onSuccess: (_d, rows) => {
      toast.success(`Imported ${rows.length} medication${rows.length === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["client-medications", clientId] });
      setImportOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = (meds ?? []).filter((m) => showInactive || m.is_active);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Active prescriptions</h3>
          <Badge variant="outline">{visible.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hide inactive" : "Show inactive"}
          </Button>
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline"><Sparkles className="mr-1.5 h-3.5 w-3.5" />⚡ NECTAR Import Medications</Button>
            </DialogTrigger>
            <AIImportDialog
              onParse={async (payload) => {
                const r = await parseAI({ data: payload });
                return r.medications as unknown as FormVals[];
              }}
              onCommit={(rows) => bulkInsertMut.mutate(rows)}
              committing={bulkInsertMut.isPending}
            />
          </Dialog>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Add Medication</Button>
            </DialogTrigger>
            <MedFormDialog title="Add medication" onSubmit={(v) => insertMut.mutate(v)} pending={insertMut.isPending} />
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !visible.length ? (
        <p className="text-xs text-muted-foreground">No medications recorded.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medication</TableHead>
              <TableHead>Dose</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Times</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((m) => (
              <TableRow key={m.id} className={!m.is_active ? "opacity-50" : ""}>
                <TableCell className="font-medium">
                  {m.medication_name}
                  {m.prescriber && <div className="text-[10px] text-muted-foreground">Rx: {m.prescriber}</div>}
                </TableCell>
                <TableCell className="text-xs">{m.dosage || "—"}</TableCell>
                <TableCell className="text-xs">{m.route || "—"}</TableCell>
                <TableCell className="text-xs">{m.frequency || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(m.scheduled_times ?? []).map((t) => (
                      <Badge key={t} variant="secondary" className="font-mono text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {m.is_active
                    ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Active</Badge>
                    : <Badge variant="outline">Discontinued</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  {m.is_active && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => discontinueMut.mutate(m.id)}>
                      <X className="mr-1 h-3 w-3" /> Discontinue
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function MedFormDialog({
  title, initial, onSubmit, pending,
}: { title: string; initial?: FormVals; onSubmit: (v: FormVals) => void; pending: boolean }) {
  const [v, setV] = useState<FormVals>(initial ?? EMPTY);
  const [timeInput, setTimeInput] = useState("");
  const addTime = () => {
    const t = timeInput.trim();
    if (!/^\d{2}:\d{2}$/.test(t)) { toast.error("Use HH:MM"); return; }
    if (v.scheduled_times.includes(t)) return;
    setV({ ...v, scheduled_times: [...v.scheduled_times, t].sort() });
    setTimeInput("");
  };
  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-2"><Label>Medication name *</Label>
          <Input value={v.medication_name} onChange={(e) => setV({ ...v, medication_name: e.target.value })} maxLength={200} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-2"><Label>Dosage</Label>
            <Input value={v.dosage} onChange={(e) => setV({ ...v, dosage: e.target.value })} placeholder="10 mg" /></div>
          <div className="grid gap-2"><Label>Route</Label>
            <Input value={v.route} onChange={(e) => setV({ ...v, route: e.target.value })} placeholder="PO" /></div>
          <div className="grid gap-2"><Label>Frequency</Label>
            <Input value={v.frequency} onChange={(e) => setV({ ...v, frequency: e.target.value })} placeholder="BID" /></div>
        </div>
        <div className="grid gap-2">
          <Label>Scheduled times (24h)</Label>
          <div className="flex gap-2">
            <Input type="time" value={timeInput} onChange={(e) => setTimeInput(e.target.value)} />
            <Button type="button" variant="outline" onClick={addTime}>Add</Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {v.scheduled_times.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 font-mono">{t}
                <button type="button" onClick={() => setV({ ...v, scheduled_times: v.scheduled_times.filter((x) => x !== t) })}>
                  <X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        </div>
        <div className="grid gap-2"><Label>Prescriber</Label>
          <Input value={v.prescriber} onChange={(e) => setV({ ...v, prescriber: e.target.value })} /></div>
        <div className="grid gap-2"><Label>Special instructions</Label>
          <Textarea value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} rows={2} /></div>
      </div>
      <DialogFooter>
        <Button type="button" disabled={!v.medication_name.trim() || pending} onClick={() => onSubmit(v)}>
          {pending ? "Saving…" : "Save medication"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AIImportDialog({
  onParse, onCommit, committing,
}: {
  onParse: (payload: { imageBase64?: string; mime?: string; text?: string }) => Promise<FormVals[]>;
  onCommit: (rows: FormVals[]) => void;
  committing: boolean;
}) {
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<FormVals[]>([]);
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      if (file.type.startsWith("image/")) {
        const b64 = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res((r.result as string).split(",")[1] ?? "");
          r.readAsDataURL(file);
        });
        const m = await onParse({ imageBase64: b64, mime: file.type });
        setRows(m);
      } else {
        const t = await file.text();
        const m = await onParse({ text: t });
        setRows(m);
      }
      toast.success(`NECTAR extracted ${rows.length} medications`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setParsing(false); }
  };

  return (
    <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>⚡ NECTAR Medication Importer</DialogTitle></DialogHeader>
      {!rows.length ? (
        <div className="space-y-3">
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className="cursor-pointer rounded-lg border-2 border-dashed border-border p-8 text-center hover:bg-accent/30"
          >
            {parsing ? (
              <><Loader2 className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Parsing with NECTAR…</p></>
            ) : (
              <><Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Drop physician order, MAR, or pharmacy list</p>
                <p className="text-xs text-muted-foreground">PDF, image, CSV, or text — NECTAR extracts meds, dose, route, frequency, times.</p></>
            )}
            <input
              ref={fileRef} type="file" className="hidden"
              accept="image/*,.pdf,.csv,.txt,.xlsx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
          <div className="text-center text-xs text-muted-foreground">or paste order text</div>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste physician order text here…" />
          <Button type="button" disabled={!text.trim() || parsing} onClick={async () => {
            setParsing(true);
            try { setRows(await onParse({ text })); } catch (e) { toast.error((e as Error).message); }
            finally { setParsing(false); }
          }}>{parsing ? "Parsing…" : "Parse text"}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Review and edit before committing. Highlighted fields are missing.</p>
          <div className="rounded-md border border-border max-h-[420px] overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Medication</TableHead><TableHead>Dose</TableHead><TableHead>Route</TableHead>
                <TableHead>Frequency</TableHead><TableHead>Times</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell><Input value={r.medication_name} className={!r.medication_name ? "border-rose-400" : ""}
                      onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, medication_name: e.target.value } : x))} /></TableCell>
                    <TableCell><Input value={r.dosage || ""} className={!r.dosage ? "border-rose-300" : ""}
                      onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, dosage: e.target.value } : x))} /></TableCell>
                    <TableCell><Input value={r.route || ""}
                      onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, route: e.target.value } : x))} /></TableCell>
                    <TableCell><Input value={r.frequency || ""}
                      onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, frequency: e.target.value } : x))} /></TableCell>
                    <TableCell className="font-mono text-xs">{(r.scheduled_times || []).join(", ") || "—"}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRows([])}>Start over</Button>
            <Button disabled={!rows.length || committing} onClick={() => onCommit(rows)}>
              {committing ? "Saving…" : `Finalize & Save ${rows.length}`}
            </Button>
          </DialogFooter>
        </div>
      )}
    </DialogContent>
  );
}
