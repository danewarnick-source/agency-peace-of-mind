import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, X, UserPlus, Contact2, Pencil, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { JOB_CODES, jobCodeLabel } from "@/lib/job-codes";

import { BulkImporter } from "@/components/bulk-importer";
import { CustomAttributesSection } from "@/components/custom-attributes-section";
import { LifecyclePanel } from "@/components/lifecycle-panel";
import { MedicationsManager } from "@/components/medications-manager";
import { MarCalendar } from "@/components/mar-calendar";

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "CareAcademyEVV/1.0 (compliance@careacademy.app)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(json) || !json.length) return null;
    const lat = parseFloat(json[0].lat);
    const lng = parseFloat(json[0].lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function getBrowserPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

async function resolveCoords(addr: string): Promise<{ lat: number | null; lng: number | null }> {
  if (addr && addr.trim().toLowerCase() !== "testing headquarters") {
    const geo = await geocodeAddress(addr);
    if (geo) return { lat: geo.lat, lng: geo.lng };
  }
  try {
    const pos = await getBrowserPosition();
    return { lat: pos.lat, lng: pos.lng };
  } catch {
    return { lat: null, lng: null };
  }
}

export const Route = createFileRoute("/dashboard/clients")({
  head: () => ({ meta: [{ title: "Clients — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <ClientsPage />
    </RequirePermission>
  ),
});

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  physical_address: string | null;
  pcsp_goals: string[];
  job_code: string[] | null;
  medicaid_id: string | null;
  geofence_radius_feet?: number | null;
};

type ClientFormValues = {
  first_name: string;
  last_name: string;
  phone_number: string;
  physical_address: string;
  pcsp_goals: string[];
  job_code: string[];
  medicaid_id: string;
  geofence_radius_feet: number;
};

const GEOFENCE_OPTIONS: Array<{ v: number; l: string }> = [
  { v: 250, l: "250 Feet (Strict In-Home Control)" },
  { v: 500, l: "500 Feet (Standard Suburban Buffer)" },
  { v: 1000, l: "1,000 Feet (Medicaid Default Baseline)" },
  { v: 2500, l: "2,500 Feet (Community Outing Extension — 1/2 Mile)" },
  { v: 5000, l: "5,000 Feet (Rural/Open Campus Margin — 1 Mile)" },
];


function ClientsPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const { data: clients, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["clients", org?.organization_id],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, phone_number, physical_address, pcsp_goals, job_code, medicaid_id, account_status, geofence_radius_feet" as any)
        .eq("organization_id", org!.organization_id)
        .order("last_name", { ascending: true });
      if (error) throw error;
      // Hide archived clients from active operational views.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).filter((c) => (c.account_status ?? "active") !== "archived") as unknown as Client[];
    },
  });


  const addMutation = useMutation({
    mutationFn: async (input: ClientFormValues) => {
      const coords = await resolveCoords(input.physical_address);
      const { error } = await supabase.from("clients").insert({
        organization_id: org!.organization_id,
        ...input,
        home_latitude: coords.lat,
        home_longitude: coords.lng,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client added");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setAddOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async (input: ClientFormValues & { id: string }) => {
      const { id, ...rest } = input;
      const coords = await resolveCoords(rest.physical_address);
      const { error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ ...rest, home_latitude: coords.lat, home_longitude: coords.lng } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client updated");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Client Directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage individuals served, authorized service codes, and PCSP goals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkImporter organizationId={org?.organization_id} defaultKind="client" />
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="mr-2 h-4 w-4" /> Add new client</Button>
            </DialogTrigger>
            <ClientFormDialog
              title="Add a new client"
              submitLabel="Save client"
              pending={addMutation.isPending}
              onSubmit={(v) => addMutation.mutate(v)}
            />
          </Dialog>
        </div>
      </div>





      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !clients?.length ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <Contact2 className="h-8 w-8 text-muted-foreground/60" />
            <p>No clients yet. Add your first client to get started.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full name</TableHead>
                <TableHead>Medicaid ID</TableHead>
                <TableHead>Authorized codes</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Active goals</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
                  <TableCell className="font-mono text-xs">{c.medicaid_id || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(c.job_code ?? []).length ? (
                        (c.job_code ?? []).map((code) => (
                          <Badge key={code} variant="outline" className="font-mono" title={jobCodeLabel(code)}>{code}</Badge>
                        ))
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.phone_number || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.physical_address || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.pcsp_goals?.length ? (
                        c.pcsp_goals.map((g) => (
                          <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>
                        ))
                      ) : <span className="text-xs text-muted-foreground">No goals</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <ClientFormDialog
            title={`Edit ${editing.first_name} ${editing.last_name}`}
            submitLabel="Save changes"
            pending={editMutation.isPending}
            initial={{
              first_name: editing.first_name,
              last_name: editing.last_name,
              phone_number: editing.phone_number ?? "",
              physical_address: editing.physical_address ?? "",
              pcsp_goals: editing.pcsp_goals ?? [],
              job_code: editing.job_code ?? [],
              medicaid_id: editing.medicaid_id ?? "",
              geofence_radius_feet: editing.geofence_radius_feet ?? 1000,
            }}

            onSubmit={(v) => editMutation.mutate({ ...v, id: editing.id })}
            clientId={editing.id}
            organizationId={org?.organization_id}
          />
        )}
      </Dialog>
    </div>
  );
}

function ClientFormDialog({
  title, submitLabel, pending, onSubmit, initial, clientId, organizationId,
}: {
  title: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (v: ClientFormValues) => void;
  initial?: ClientFormValues;
  clientId?: string;
  organizationId?: string;
}) {
  const [first, setFirst] = useState(initial?.first_name ?? "");
  const [last, setLast] = useState(initial?.last_name ?? "");
  const [phone, setPhone] = useState(initial?.phone_number ?? "");
  const [addr, setAddr] = useState(initial?.physical_address ?? "");
  const [jobCodes, setJobCodes] = useState<string[]>(initial?.job_code ?? []);
  const [medicaidId, setMedicaidId] = useState(initial?.medicaid_id ?? "");
  const [goalInput, setGoalInput] = useState("");
  const [pinning, setPinning] = useState(false);
  const [goals, setGoals] = useState<string[]>(initial?.pcsp_goals ?? []);
  const [radius, setRadius] = useState<number>(initial?.geofence_radius_feet ?? 1000);


  // Reset state when initial changes (e.g. opening Edit for a different row)
  useEffect(() => {
    if (!initial) return;
    setFirst(initial.first_name);
    setLast(initial.last_name);
    setPhone(initial.phone_number);
    setAddr(initial.physical_address);
    setJobCodes(initial.job_code);
    setMedicaidId(initial.medicaid_id);
    setGoals(initial.pcsp_goals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(
    () => Boolean(first.trim() && last.trim() && addr.trim() && jobCodes.length > 0 && medicaidId.trim()),
    [first, last, addr, jobCodes, medicaidId]
  );

  const toggleCode = (code: string) =>
    setJobCodes((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);

  const addGoal = () => {
    const v = goalInput.trim();
    if (!v || goals.includes(v)) return;
    setGoals([...goals, v]);
    setGoalInput("");
  };
  const removeGoal = (g: string) => setGoals(goals.filter((x) => x !== g));

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          onSubmit({
            first_name: first.trim(),
            last_name: last.trim(),
            phone_number: phone.trim(),
            physical_address: addr.trim(),
            pcsp_goals: goals,
            job_code: jobCodes,
            medicaid_id: medicaidId.trim(),
            geofence_radius_feet: radius,
          });

        }}
        className="grid gap-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="first">First name</Label>
            <Input id="first" value={first} onChange={(e) => setFirst(e.target.value)} required maxLength={100} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="last">Last name</Label>
            <Input id="last" value={last} onChange={(e) => setLast(e.target.value)} required maxLength={100} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="medicaid">Individual Medicaid ID Number</Label>
          <Input id="medicaid" value={medicaidId} onChange={(e) => setMedicaidId(e.target.value)} required maxLength={50} placeholder="e.g. 1234567890" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="addr">Street address</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pinning}
              onClick={async () => {
                setPinning(true);
                try {
                  const pos = await getBrowserPosition();
                  setAddr("Testing Headquarters");
                  toast.success(`Pinned to current location (${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)})`);
                } catch {
                  toast.error("Could not get current location — check browser permissions");
                } finally {
                  setPinning(false);
                }
              }}
            >
              {pinning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <MapPin className="mr-1.5 h-3.5 w-3.5" />}
              Pin to My Current Location
            </Button>
          </div>
          <Input id="addr" value={addr} onChange={(e) => setAddr(e.target.value)} required maxLength={255} />
          <p className="text-[11px] text-muted-foreground">Address is auto-geocoded via OpenStreetMap on save. Use Pin for desk testing.</p>
        </div>
        <div className="grid gap-2">
          <Label>DSPD Authorization Billing Job Codes</Label>
          <div className="grid grid-cols-1 gap-1.5 rounded-md border border-border p-3 sm:grid-cols-2">
            {JOB_CODES.map((j) => (
              <label key={j.code} className="flex cursor-pointer items-start gap-2 rounded p-1.5 text-sm hover:bg-accent">
                <Checkbox
                  checked={jobCodes.includes(j.code)}
                  onCheckedChange={() => toggleCode(j.code)}
                  className="mt-0.5"
                />
                <span><span className="font-mono font-medium">{j.code}</span> <span className="text-xs text-muted-foreground">— {j.label.split("— ")[1]}</span></span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Select all codes this individual is authorized for. Staff will pick one per shift at clock-in.</p>
        </div>
        <div className="grid gap-2">
          <Label>PCSP goals</Label>
          <div className="flex gap-2">
            <Input
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGoal(); } }}
              placeholder="e.g. Independent Meal Prep"
              maxLength={120}
            />
            <Button type="button" variant="outline" size="icon" onClick={addGoal}><Plus className="h-4 w-4" /></Button>
          </div>
          {goals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {goals.map((g) => (
                <Badge key={g} variant="secondary" className="gap-1 font-normal">
                  {g}
                  <button type="button" onClick={() => removeGoal(g)} className="ml-0.5 rounded-full hover:bg-muted-foreground/20">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
        {clientId && (
          <>
            <CustomAttributesSection
              organizationId={organizationId}
              entityKind="client"
              entityId={clientId}
            />
            <div className="grid gap-4 rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold">💊 Medications & MAR</h3>
              <MedicationsManager clientId={clientId} organizationId={organizationId} />
              <MarCalendar clientId={clientId} />
            </div>
            <LifecyclePanel
              kind="client"
              id={clientId}
              fullName={`${first.trim()} ${last.trim()}`.trim()}
              organizationId={organizationId}
            />
          </>
        )}
        <DialogFooter>
          <Button type="submit" disabled={!canSubmit || pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
