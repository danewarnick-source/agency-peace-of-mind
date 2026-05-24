import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Package, Home, Clock3, Plus, Signature, AlertTriangle, ShieldCheck, Eraser } from "lucide-react";

export const Route = createFileRoute("/dashboard/dspd-controls")({
  head: () => ({ meta: [{ title: "DSPD Controls — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <DspdControlsPage />
    </RequirePermission>
  ),
});

type ClientLite = { id: string; first_name: string; last_name: string; job_code: string[] | null };

function DspdControlsPage() {
  const { data: org } = useCurrentOrg();

  const { data: clients } = useQuery({
    enabled: !!org,
    queryKey: ["dspd-clients", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, job_code")
        .eq("organization_id", org!.organization_id)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as ClientLite[];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">🛡️ DSPD Operational Controls</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          HHS / RHS / PPS / ELS unit caps, host-home respite limits, and Section 11.3(5) belongings inventory.
        </p>
      </div>

      <Tabs defaultValue="belongings" className="w-full">
        <TabsList>
          <TabsTrigger value="belongings"><Package className="mr-1.5 h-3.5 w-3.5" /> Belongings Inventory</TabsTrigger>
          <TabsTrigger value="els"><Clock3 className="mr-1.5 h-3.5 w-3.5" /> ELS Counter Matrix</TabsTrigger>
          <TabsTrigger value="respite"><Home className="mr-1.5 h-3.5 w-3.5" /> Host Home Respite</TabsTrigger>
        </TabsList>

        <TabsContent value="belongings" className="mt-6">
          <BelongingsTab clients={clients ?? []} />
        </TabsContent>
        <TabsContent value="els" className="mt-6">
          <ElsTab clients={clients ?? []} />
        </TabsContent>
        <TabsContent value="respite" className="mt-6">
          <RespiteTab clients={clients ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// BELONGINGS INVENTORY
// ============================================================
type Belonging = {
  id: string;
  client_id: string;
  item_name: string;
  description: string | null;
  estimated_value: number;
  inventoried_on: string;
  inventoried_by_name: string | null;
  guardian_signature_data_url: string | null;
  status: "active" | "discarded" | "replaced";
  discarded_on: string | null;
  discard_reason: string | null;
};

function BelongingsTab({ clients }: { clients: ClientLite[] }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const hhClients = useMemo(
    () => clients.filter((c) => (c.job_code ?? []).some((jc) => ["HHS", "RHS", "PPS"].includes(jc))),
    [clients]
  );
  const [selected, setSelected] = useState<string>("");
  useEffect(() => { if (!selected && hhClients[0]) setSelected(hhClients[0].id); }, [hhClients, selected]);

  const { data: items, isLoading } = useQuery({
    enabled: !!org && !!selected,
    queryKey: ["belongings", org?.organization_id, selected],
    queryFn: async (): Promise<Belonging[]> => {
      const { data, error } = await supabase
        .from("client_belongings" as never)
        .select("*")
        .eq("organization_id", org!.organization_id)
        .eq("client_id", selected)
        .order("inventoried_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Belonging[];
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [discarding, setDiscarding] = useState<Belonging | null>(null);

  const addMut = useMutation({
    mutationFn: async (input: { name: string; desc: string; value: number; date: string; evaluator: string }) => {
      const { error } = await supabase.from("client_belongings" as never).insert({
        organization_id: org!.organization_id,
        client_id: selected,
        item_name: input.name,
        description: input.desc || null,
        estimated_value: input.value,
        inventoried_on: input.date,
        inventoried_by: user!.id,
        inventoried_by_name: input.evaluator,
        created_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item added to inventory"); qc.invalidateQueries({ queryKey: ["belongings"] }); setAddOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const discardMut = useMutation({
    mutationFn: async (args: { id: string; reason: string; sig: string | null }) => {
      const { error } = await supabase.from("client_belongings" as never).update({
        status: "discarded",
        discarded_on: new Date().toISOString().slice(0, 10),
        discard_reason: args.reason,
        guardian_signature_data_url: args.sig,
        signed_at: args.sig ? new Date().toISOString() : null,
      } as never).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item marked discarded"); qc.invalidateQueries({ queryKey: ["belongings"] }); setDiscarding(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Host Home / RHS / PPS client</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-[280px]"><SelectValue placeholder="Choose a client" /></SelectTrigger>
            <SelectContent>
              {hhClients.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No HHS/RHS/PPS clients</div>}
              {hhClients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!selected}><Plus className="mr-1.5 h-4 w-4" /> Log new item</Button>
          </DialogTrigger>
          <AddItemDialog onSave={(v) => addMut.mutate(v)} pending={addMut.isPending} />
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Inventoried</TableHead>
              <TableHead>Evaluator</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && !items?.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No items inventoried yet.</TableCell></TableRow>}
            {items?.map((it) => {
              const high = Number(it.estimated_value) >= 50;
              return (
                <TableRow key={it.id}>
                  <TableCell>
                    <div className="font-medium">{it.item_name}</div>
                    {it.description && <div className="text-[11px] text-muted-foreground">{it.description}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono">${Number(it.estimated_value).toFixed(2)}</span>
                      {high && <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">≥$50 flagged</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{it.inventoried_on}</TableCell>
                  <TableCell className="text-sm">{it.inventoried_by_name || "—"}</TableCell>
                  <TableCell>
                    {it.status === "active" && <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Active</Badge>}
                    {it.status === "discarded" && <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">Discarded</Badge>}
                    {it.status === "replaced" && <Badge variant="outline">Replaced</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {it.status === "active" && (
                      <Button size="sm" variant="ghost" onClick={() => setDiscarding(it)}>
                        <Eraser className="mr-1 h-3.5 w-3.5" /> Discard
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!discarding} onOpenChange={(o) => !o && setDiscarding(null)}>
        {discarding && (
          <DiscardDialog
            item={discarding}
            pending={discardMut.isPending}
            onConfirm={(reason, sig) => discardMut.mutate({ id: discarding.id, reason, sig })}
          />
        )}
      </Dialog>
    </div>
  );
}

function AddItemDialog({ onSave, pending }: { onSave: (v: { name: string; desc: string; value: number; date: string; evaluator: string }) => void; pending: boolean }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [evaluator, setEvaluator] = useState("");
  const ok = name.trim() && value && evaluator.trim();
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Log new inventoried item</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-1.5"><Label>Item name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></div>
        <div className="grid gap-1.5"><Label>Description (optional)</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={500} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5"><Label>Estimated value (USD)</Label><Input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Inventory date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="grid gap-1.5"><Label>Evaluating staff</Label><Input value={evaluator} onChange={(e) => setEvaluator(e.target.value)} maxLength={120} /></div>
        {Number(value) >= 50 && (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
            ⚠ Items ≥ $50 will require a guardian signature before they can be discarded (Section 11.3(5)).
          </p>
        )}
      </div>
      <DialogFooter>
        <Button onClick={() => onSave({ name: name.trim(), desc: desc.trim(), value: Number(value), date, evaluator: evaluator.trim() })} disabled={!ok || pending}>
          {pending ? "Saving…" : "Save item"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DiscardDialog({ item, onConfirm, pending }: { item: Belonging; onConfirm: (reason: string, sig: string | null) => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  const requireSig = Number(item.estimated_value) >= 50;
  const [sig, setSig] = useState<string | null>(null);
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Discard: {item.item_name}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-1.5"><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={400} /></div>
        {requireSig ? (
          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5 text-xs"><Signature className="h-3.5 w-3.5" /> Guardian / client signature required (item value ≥ $50)</Label>
            <SignaturePad onChange={setSig} />
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Item value below $50 — no signature required.</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="destructive" disabled={!reason.trim() || (requireSig && !sig) || pending} onClick={() => onConfirm(reason.trim(), sig)}>
          {pending ? "Discarding…" : "Confirm discard"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SignaturePad({ onChange }: { onChange: (data: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const c = ref.current!; const r = c.getBoundingClientRect();
    const ctx = c.getContext("2d")!;
    ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const c = ref.current!; const r = c.getBoundingClientRect();
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke();
  };
  const end = () => { drawing.current = false; const c = ref.current!; onChange(c.toDataURL("image/png")); };
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onChange(null); };
  return (
    <div>
      <canvas ref={ref} width={400} height={120} className="w-full touch-none rounded-md border border-border bg-background" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
      <div className="mt-1 flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={clear}>Clear</Button></div>
    </div>
  );
}

// ============================================================
// ELS COUNTER MATRIX
// ============================================================
type ElsEntry = { id: string; client_id: string; service_date: string; units: number; notes: string | null };

function ElsTab({ clients }: { clients: ClientLite[] }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const elsClients = useMemo(() => clients.filter((c) => (c.job_code ?? []).includes("ELS")), [clients]);
  const [selected, setSelected] = useState<string>("");
  useEffect(() => { if (!selected && elsClients[0]) setSelected(elsClients[0].id); }, [elsClients, selected]);

  const { data: entries } = useQuery({
    enabled: !!org && !!selected,
    queryKey: ["els", org?.organization_id, selected],
    queryFn: async (): Promise<ElsEntry[]> => {
      const { data, error } = await supabase.from("els_usage_ledger" as never)
        .select("*").eq("organization_id", org!.organization_id).eq("client_id", selected)
        .order("service_date", { ascending: false }).limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as ElsEntry[];
    },
  });

  const stats = useMemo(() => {
    if (!entries) return { yearDays: 0, todayUnits: 0 };
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const today = new Date().toISOString().slice(0, 10);
    const inYear = entries.filter((e) => new Date(e.service_date) >= yearStart);
    const days = new Set(inYear.map((e) => e.service_date)).size;
    const todayUnits = inYear.filter((e) => e.service_date === today).reduce((s, e) => s + Number(e.units), 0);
    return { yearDays: days, todayUnits };
  }, [entries]);

  const [units, setUnits] = useState("4");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("els_usage_ledger" as never).insert({
        organization_id: org!.organization_id,
        client_id: selected,
        service_date: date,
        units: Number(units),
        notes: notes || null,
        created_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("ELS units logged"); qc.invalidateQueries({ queryKey: ["els"] }); setNotes(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">ELS client</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="w-[280px]"><SelectValue placeholder="Choose ELS client" /></SelectTrigger>
              <SelectContent>
                {elsClients.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No clients authorized for ELS</div>}
                {elsClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selected && (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <CapMeter label="Today's daily cap" used={stats.todayUnits} max={24} unit="units (15 min ea)" hint="Hard cap: 24 units = 6 hours / day" />
            <CapMeter label="Calendar-year service days" used={stats.yearDays} max={260} unit="days" hint="Article 10 ceiling: 260 days/year" />
          </div>
        )}
      </div>

      {selected && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">Log ELS time</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div className="grid gap-1.5"><Label>Service date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Units (1 = 15 min)</Label><Input type="number" min="1" max="24" value={units} onChange={(e) => setUnits(e.target.value)} /></div>
            <div className="grid gap-1.5 md:col-span-2"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} /></div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={() => addMut.mutate()} disabled={!units || addMut.isPending}>
              {addMut.isPending ? "Logging…" : "Log units"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Service date</TableHead><TableHead>Units</TableHead><TableHead>Hours</TableHead><TableHead>Notes</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {!entries?.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No ELS entries yet.</TableCell></TableRow>}
            {entries?.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.service_date}</TableCell>
                <TableCell className="font-mono">{e.units}</TableCell>
                <TableCell className="font-mono">{(Number(e.units) * 0.25).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.notes || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CapMeter({ label, used, max, unit, hint }: { label: string; used: number; max: number; unit: string; hint: string }) {
  const pct = Math.min(100, Math.round((used / max) * 100));
  const tone = pct >= 95 ? "red" : pct >= 75 ? "amber" : "emerald";
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-end justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={`font-mono text-sm font-semibold ${tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-emerald-600"}`}>
          {used} / {max} {unit}
        </span>
      </div>
      <Progress value={pct} className="mt-2 h-2" />
      <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

// ============================================================
// RESPITE
// ============================================================
type RespiteRow = { id: string; host_home_id: string; respite_client_id: string; start_date: string; end_date: string; notes: string | null };

function RespiteTab({ clients }: { clients: ClientLite[] }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const hosts = useMemo(() => clients.filter((c) => (c.job_code ?? []).includes("HHS")), [clients]);
  const [host, setHost] = useState("");
  const [respiteClient, setRespiteClient] = useState("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  useEffect(() => { if (!host && hosts[0]) setHost(hosts[0].id); }, [hosts, host]);

  const { data: stays } = useQuery({
    enabled: !!org,
    queryKey: ["respite", org?.organization_id, host],
    queryFn: async (): Promise<RespiteRow[]> => {
      let q = supabase.from("respite_stays" as never).select("*").eq("organization_id", org!.organization_id).order("start_date", { ascending: false });
      if (host) q = q.eq("host_home_id", host);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RespiteRow[];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("respite_stays" as never).insert({
        organization_id: org!.organization_id,
        host_home_id: host,
        respite_client_id: respiteClient,
        start_date: start,
        end_date: end,
        notes: notes || null,
        created_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Respite stay logged"); qc.invalidateQueries({ queryKey: ["respite"] }); setNotes(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const yearUsed = useMemo(() => {
    if (!stays) return 0;
    const ys = new Date(new Date().getFullYear(), 0, 1);
    return stays.filter((s) => new Date(s.start_date) >= ys).reduce((sum, s) => {
      const a = new Date(s.start_date); const b = new Date(s.end_date);
      return sum + Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
    }, 0);
  }, [stays]);

  const nameOf = (id: string) => clients.find((c) => c.id === id);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Host Home</Label>
          <Select value={host} onValueChange={setHost}>
            <SelectTrigger className="w-[280px]"><SelectValue placeholder="Pick host" /></SelectTrigger>
            <SelectContent>
              {hosts.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No HHS clients</div>}
              {hosts.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {host && (
          <div className="mt-4">
            <CapMeter label="Calendar-year respite days at this host" used={yearUsed} max={21} unit="days" hint="Annual ceiling: 21 days / household / plan year" />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">Log respite stay</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="grid gap-1.5 md:col-span-2">
            <Label>Respite client</Label>
            <Select value={respiteClient} onValueChange={setRespiteClient}>
              <SelectTrigger><SelectValue placeholder="Choose client" /></SelectTrigger>
              <SelectContent>
                {clients.filter((c) => c.id !== host).map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>End</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div className="grid gap-1.5 md:col-span-4"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} /></div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">Caps enforced automatically: 14 consecutive days max per stay, 21 days/year per host.</p>
          <Button onClick={() => addMut.mutate()} disabled={!host || !respiteClient || addMut.isPending}>
            {addMut.isPending ? "Logging…" : "Log stay"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Host</TableHead><TableHead>Respite client</TableHead><TableHead>Dates</TableHead><TableHead>Length</TableHead><TableHead>Notes</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {!stays?.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No respite stays logged.</TableCell></TableRow>}
            {stays?.map((s) => {
              const h = nameOf(s.host_home_id); const r = nameOf(s.respite_client_id);
              const days = Math.round((new Date(s.end_date).getTime() - new Date(s.start_date).getTime()) / 86400000) + 1;
              return (
                <TableRow key={s.id}>
                  <TableCell>{h ? `${h.first_name} ${h.last_name}` : "—"}</TableCell>
                  <TableCell>{r ? `${r.first_name} ${r.last_name}` : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.start_date} → {s.end_date}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{days}d</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.notes || "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
