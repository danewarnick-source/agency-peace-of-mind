import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, X, UserPlus, Contact2, Pencil, MapPin, Loader2,
  User, FileText, Pill, Shield, Settings2, ChevronRight,
  Upload, Trash2, CheckCircle2, AlertTriangle, Search,
  ArrowLeft, Users, Camera, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { JOB_CODES, jobCodeLabel } from "@/lib/job-codes";
import { DspdCodesMultiSelect } from "@/components/clients/dspd-codes-multiselect";
import { BillingCodesDetail } from "@/components/clients/billing-codes-detail";
import { ClientDocumentsCard } from "@/components/clients/client-documents-card";
import { BulkImporter } from "@/components/bulk-importer";
import { CustomAttributesSection } from "@/components/custom-attributes-section";
import { LifecyclePanel } from "@/components/lifecycle-panel";
import { MedicationsManager } from "@/components/medications-manager";
import { MarCalendar } from "@/components/mar-calendar";
import { ApprovedLocationsEditor } from "@/components/evv/approved-locations-editor";
import { ClientPhoto } from "@/components/client-photo";
import {
  isClientFeatureEnabled,
  isFeatureTierDisabled,
  useDisabledTierFeatures,
  type ClientFeatureKey,
} from "@/lib/client-features";

// ─── Types ────────────────────────────────────────────────────────────────────

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  physical_address: string | null;
  pcsp_goals: string[];
  job_code: string[];
  authorized_dspd_codes: string[];
  medicaid_id: string | null;
  account_status: string | null;
  geofence_radius_feet: number | null;
  special_directions: string | null;
  date_of_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  // feature toggles stored as JSON
  feature_config: Record<string, boolean> | null;
  profile_photo_url: string | null;
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
  special_directions: string;
  date_of_birth: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  profile_photo_url: string;
};

type StaffMember = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ClientDocument = {
  id: string;
  file_name: string;
  document_type: string;
  file_url: string;
  storage_path: string | null;
  uploaded_at: string;
  uploaded_by_name: string | null;
  file_size_bytes: number | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const GEOFENCE_OPTIONS = [
  { v: 250,  l: "250 ft — Strict In-Home" },
  { v: 500,  l: "500 ft — Standard Suburban" },
  { v: 1000, l: "1,000 ft — Medicaid Baseline" },
  { v: 2500, l: "2,500 ft — Community Outing" },
  { v: 5000, l: "5,000 ft — Rural / Open Campus" },
];

const DOCUMENT_TYPES = [
  "Physician Order",
  "State PCSP",
  "Guardianship Papers",
  "Emergency Authorization",
  "Insurance Card",
  "Behavior Support Plan",
  "Medical History",
  "Consent Form",
  "Incident Report",
  "Other",
];

const FEATURE_TOGGLES: { key: string; label: string; description: string; wired?: boolean }[] = [
  { key: "emar",          label: "MAR / eMAR",     description: "Electronic medication administration records", wired: true },
  { key: "daily_notes",   label: "Daily Notes",    description: "Staff daily progress note submission" },
  { key: "attendance",    label: "Attendance",     description: "Monthly attendance tracking" },
  { key: "trust_ledger",  label: "Trust Ledger",   description: "PBA financial trust account tracking" },
  { key: "incident_forms",label: "Incident Forms", description: "Critical event and incident reporting" },
  { key: "scheduling",    label: "Scheduling",     description: "Shift scheduling and calendar" },
];

// ─── Geocoding helpers (preserved exactly) ───────────────────────────────────

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
  } catch { return null; }
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
  } catch { return { lat: null, lng: null }; }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/clients")({
  head: () => ({ meta: [{ title: "Client Directory — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <ClientsPage />
    </RequirePermission>
  ),
});

// ─── Clients Page ─────────────────────────────────────────────────────────────

function ClientsPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [activeClient, setActiveClient] = useState<Client | null>(null);

  const { data: clients = [], isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["clients", org?.organization_id],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, first_name, last_name, phone_number, physical_address, pcsp_goals, job_code, authorized_dspd_codes, medicaid_id, account_status, geofence_radius_feet, special_directions, date_of_birth, emergency_contact_name, emergency_contact_phone, feature_config, profile_photo_url")
        .eq("organization_id", org!.organization_id)
        .order("last_name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((c) => (c.account_status ?? "active") !== "archived")
        .map((c) => ({
          ...c,
          job_code: (c.authorized_dspd_codes?.length ? c.authorized_dspd_codes : c.job_code) ?? [],
        })) as Client[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (input: ClientFormValues) => {
      const coords = await resolveCoords(input.physical_address);
      const { error } = await (supabase as any).from("clients").insert({
        organization_id:      org!.organization_id,
        first_name:           input.first_name,
        last_name:            input.last_name,
        phone_number:         input.phone_number,
        physical_address:     input.physical_address,
        pcsp_goals:           input.pcsp_goals,
        authorized_dspd_codes: input.job_code,
        job_code:             input.job_code,
        medicaid_id:          input.medicaid_id,
        geofence_radius_feet: input.geofence_radius_feet,
        special_directions:   input.special_directions || null,
        date_of_birth:        input.date_of_birth || null,
        emergency_contact_name:  input.emergency_contact_name || null,
        emergency_contact_phone: input.emergency_contact_phone || null,
        home_latitude:        coords.lat,
        home_longitude:       coords.lng,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client added.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setAddOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async (input: ClientFormValues & { id: string }) => {
      const { id, ...rest } = input;
      const coords = await resolveCoords(rest.physical_address);
      const { error } = await (supabase as any)
        .from("clients")
        .update({
          first_name:           rest.first_name,
          last_name:            rest.last_name,
          phone_number:         rest.phone_number,
          physical_address:     rest.physical_address,
          pcsp_goals:           rest.pcsp_goals,
          authorized_dspd_codes: rest.job_code,
          job_code:             rest.job_code,
          medicaid_id:          rest.medicaid_id,
          geofence_radius_feet: rest.geofence_radius_feet,
          special_directions:   rest.special_directions || null,
          date_of_birth:        rest.date_of_birth || null,
          emergency_contact_name:  rest.emergency_contact_name || null,
          emergency_contact_phone: rest.emergency_contact_phone || null,
          profile_photo_url:    input.profile_photo_url ?? null,
          home_latitude:        coords.lat,
          home_longitude:       coords.lng,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client updated.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      // Refresh active client
      setActiveClient((prev) => prev ? { ...prev } : null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.medicaid_id ?? "").toLowerCase().includes(q)
    );
  }, [clients, search]);

  // Full-window workspace mode
  if (activeClient) {
    // Refresh client data from list
    const fresh = clients.find((c) => c.id === activeClient.id) ?? activeClient;
    return (
      <ClientWorkspace
        client={fresh}
        orgId={org?.organization_id ?? ""}
        onBack={() => setActiveClient(null)}
        onSave={(v) => editMutation.mutate({ ...v, id: fresh.id })}
        saving={editMutation.isPending}
      />
    );
  }

  // ── Directory view ────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Client Directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage individuals served, authorized service codes, and care configurations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkImporter organizationId={org?.organization_id} defaultKind="client" />
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="mr-2 h-4 w-4" /> Add New Client
              </Button>
            </DialogTrigger>
            <AddClientDialog
              pending={addMutation.isPending}
              onSubmit={(v) => addMutation.mutate(v)}
            />
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or Medicaid ID..."
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading clients...
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <Contact2 className="h-8 w-8 text-muted-foreground/40" />
            <p>{search ? "No clients match your search." : "No clients yet. Add your first client to get started."}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold">Full Name</TableHead>
                <TableHead className="font-semibold">Medicaid ID</TableHead>
                <TableHead className="font-semibold">Service Codes</TableHead>
                <TableHead className="font-semibold">Phone</TableHead>
                <TableHead className="font-semibold">Address</TableHead>
                <TableHead className="font-semibold">PCSP Goals</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/30 transition"
                  onClick={() => setActiveClient(c)}
                >
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {c.first_name[0]}{c.last_name[0]}
                      </span>
                      {c.first_name} {c.last_name}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.medicaid_id || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(c.job_code ?? []).length
                        ? (c.job_code ?? []).map((code) => (
                            <Badge key={code} variant="outline" className="font-mono text-[10px]"
                              title={jobCodeLabel(code)}>{code}</Badge>
                          ))
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.phone_number || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                    {c.physical_address || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(c.pcsp_goals ?? []).length
                        ? (c.pcsp_goals ?? []).slice(0, 2).map((g) => (
                            <Badge key={g} variant="secondary" className="text-[10px] font-normal">{g}</Badge>
                          ))
                        : <span className="text-xs text-muted-foreground">No goals</span>}
                      {(c.pcsp_goals ?? []).length > 2 && (
                        <Badge variant="outline" className="text-[10px]">+{c.pcsp_goals.length - 2}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => setActiveClient(c)}
                      className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" /> Open
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ─── Full-Window Client Workspace ─────────────────────────────────────────────

function ClientWorkspace({
  client,
  orgId,
  onBack,
  onSave,
  saving,
}: {
  client: Client;
  orgId: string;
  onBack: () => void;
  onSave: (v: ClientFormValues) => void;
  saving: boolean;
}) {
  const [activeTab, setActiveTab] = useState("profile");
  const { data: disabledTier } = useDisabledTierFeatures();
  const emarEnabled = isClientFeatureEnabled(client, "emar", disabledTier ?? null);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col space-y-4">
      {/* Workspace header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Client Directory
        </Button>
        <span className="text-muted-foreground">/</span>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {client.first_name[0]}{client.last_name[0]}
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-none">
              {client.first_name} {client.last_name}
            </h2>
            {client.medicaid_id && (
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                Medicaid ID: {client.medicaid_id}
              </p>
            )}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {(client.job_code ?? []).map((code) => (
            <Badge key={code} variant="outline" className="font-mono text-[10px]">{code}</Badge>
          ))}
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            Active
          </Badge>
        </div>
      </div>

      {/* Tab navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList className="h-10 w-full justify-start rounded-none border-b border-border bg-transparent p-0">
          {[
            { value: "profile",    label: "Client Profile",     icon: User,     show: true        },
            { value: "pcsp",       label: "PCSP & Directives",  icon: FileText, show: true        },
            { value: "staff",      label: "Staff Assignment",   icon: Users,    show: true        },
            { value: "medications",label: "Medications & MAR",  icon: Pill,     show: emarEnabled },
            { value: "documents",  label: "Documents",          icon: Shield,   show: true        },
            { value: "settings",   label: "Settings",           icon: Settings2, show: true       },
          ].filter((t) => t.show).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              className={`relative flex h-10 items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${
                activeTab === value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </TabsList>

        {/* ── PROFILE TAB ── */}
        <TabsContent value="profile" className="mt-5">
          <ProfileTab client={client} orgId={orgId} onSave={onSave} saving={saving} />
        </TabsContent>

        {/* ── PCSP TAB ── */}
        <TabsContent value="pcsp" className="mt-5">
          <PcspTab client={client} onSave={onSave} saving={saving} />
        </TabsContent>

        {/* ── STAFF ASSIGNMENT TAB ── */}
        <TabsContent value="staff" className="mt-5">
          <StaffAssignmentTab clientId={client.id} orgId={orgId} />
        </TabsContent>

        {/* ── MEDICATIONS TAB (gated by per-client eMAR feature) ── */}
        {emarEnabled && (
          <TabsContent value="medications" className="mt-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold">Medications & MAR Overview</h3>
              <p className="text-xs text-muted-foreground">
                Active prescriptions, administration schedules, and monthly MAR calendar.
              </p>
            </div>
            <MedicationsManager clientId={client.id} organizationId={orgId} />
            <MarCalendar clientId={client.id} />
          </TabsContent>
        )}

        {/* ── DOCUMENTS TAB ── */}
        <TabsContent value="documents" className="mt-5">
          <DocumentsTab clientId={client.id} orgId={orgId} />
        </TabsContent>

        {/* ── SETTINGS TAB ── */}
        <TabsContent value="settings" className="mt-5">
          <SettingsTab client={client} orgId={orgId} onSave={onSave} saving={saving} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({
  client, orgId, onSave, saving,
}: { client: Client; orgId: string; onSave: (v: ClientFormValues) => void; saving: boolean }) {
  const qc = useQueryClient();
  const [first, setFirst]               = useState(client.first_name);
  const [last, setLast]                 = useState(client.last_name);
  const [phone, setPhone]               = useState(client.phone_number ?? "");
  const [addr, setAddr]                 = useState(client.physical_address ?? "");
  const [medicaidId, setMedicaidId]     = useState(client.medicaid_id ?? "");
  const [dob, setDob]                   = useState(client.date_of_birth ?? "");
  const [ecName, setEcName]             = useState(client.emergency_contact_name ?? "");
  const [ecPhone, setEcPhone]           = useState(client.emergency_contact_phone ?? "");
  const [jobCodes, setJobCodes]         = useState<string[]>(client.job_code ?? []);
  const [radius, setRadius]             = useState(client.geofence_radius_feet ?? 1000);
  const [pinning, setPinning]           = useState(false);
  const [goals]                         = useState<string[]>(client.pcsp_goals ?? []);
  const [specialDir]                    = useState(client.special_directions ?? "");
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoUrl, setPhotoUrl] = useState(client.profile_photo_url ?? "");

  async function handlePhotoUpload(file: File) {
    setPhotoUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      // client-photos bucket is PRIVATE (PHI). Store the storage path; the UI
      // resolves it to a short-lived signed URL via <ClientPhoto>.
      const path = `${orgId}/${client.id}/profile.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("client-photos")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      setPhotoUrl(path);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("clients").update({ profile_photo_url: path }).eq("id", client.id);
      toast.success("Profile photo updated.");
      qc.invalidateQueries({ queryKey: ["clients"] });
    } catch (e) {
      toast.error((e as Error).message ?? "Photo upload failed.");
    } finally {
      setPhotoUploading(false);
    }
  }

  const dirty = useMemo(() => (
    first !== client.first_name ||
    last !== client.last_name ||
    phone !== (client.phone_number ?? "") ||
    addr !== (client.physical_address ?? "") ||
    medicaidId !== (client.medicaid_id ?? "") ||
    dob !== (client.date_of_birth ?? "") ||
    ecName !== (client.emergency_contact_name ?? "") ||
    ecPhone !== (client.emergency_contact_phone ?? "") ||
    radius !== (client.geofence_radius_feet ?? 1000) ||
    JSON.stringify(jobCodes) !== JSON.stringify(client.job_code ?? [])
  ), [first, last, phone, addr, medicaidId, dob, ecName, ecPhone, radius, jobCodes, client]);

  function handleSave() {
    onSave({
      first_name: first.trim(),
      last_name: last.trim(),
      phone_number: phone.trim(),
      physical_address: addr.trim(),
      pcsp_goals: goals,
      job_code: jobCodes,
      medicaid_id: medicaidId.trim(),
      geofence_radius_feet: radius,
      special_directions: specialDir,
      date_of_birth: dob,
      emergency_contact_name: ecName.trim(),
      emergency_contact_phone: ecPhone.trim(),
      profile_photo_url: photoUrl,
    });
  }

  return (
    <div className="space-y-5">
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-5">

        {/* Identity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Identity & Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="relative h-16 w-16 rounded-full overflow-hidden border-2 border-border hover:border-primary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  title="Upload profile photo"
                >
                  <ClientPhoto
                    path={photoUrl}
                    alt="Profile"
                    className="h-full w-full object-cover"
                    fallback={
                      <span className="flex h-full w-full items-center justify-center bg-primary/10 text-xl font-bold text-primary">
                        {client.first_name[0]}{client.last_name[0]}
                      </span>
                    }
                  />

                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                    {photoUploading
                      ? <Loader2 className="h-5 w-5 animate-spin text-white" />
                      : <Camera className="h-5 w-5 text-white" />}
                  </div>
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }}
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{client.first_name} {client.last_name}</h3>
                <p className="text-xs text-muted-foreground">Click photo to update. JPEG or PNG, max 5MB.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">First Name *</Label>
                <Input value={first} onChange={(e) => setFirst(e.target.value)} maxLength={100} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">Last Name *</Label>
                <Input value={last} onChange={(e) => setLast(e.target.value)} maxLength={100} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">Individual Medicaid ID *</Label>
                <Input value={medicaidId} onChange={(e) => setMedicaidId(e.target.value)}
                  placeholder="e.g. 1234567890" maxLength={50} className="font-mono" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">Date of Birth</Label>
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Phone Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30}
                placeholder="(801) 555-0100" />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Service Address *</Label>
                <Button type="button" variant="outline" size="sm" disabled={pinning}
                  onClick={async () => {
                    setPinning(true);
                    try {
                      const pos = await getBrowserPosition();
                      setAddr("Testing Headquarters");
                      toast.success(`Pinned (${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)})`);
                    } catch { toast.error("Location access denied"); }
                    finally { setPinning(false); }
                  }}
                  className="h-7 gap-1.5 text-xs">
                  {pinning ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
                  Pin to Current Location
                </Button>
              </div>
              <Input value={addr} onChange={(e) => setAddr(e.target.value)} maxLength={255}
                placeholder="Full street address for EVV geofencing" />
              <p className="text-[11px] text-muted-foreground">
                Auto-geocoded via OpenStreetMap on save. Used as the EVV clock-in reference point.
              </p>
            </div>
            <div className="border-t border-border pt-3">
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs"
                onClick={() => toast.info("NECTAR import: drop a client intake form, referral PDF, or demographics sheet and NECTAR will auto-populate the profile fields.")}>
                <Sparkles className="h-3.5 w-3.5" />
                NECTAR Import — Auto-fill from Document
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Upload a referral, intake form, or assessment to auto-populate profile fields.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Emergency contact */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Emergency Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Contact Name</Label>
              <Input value={ecName} onChange={(e) => setEcName(e.target.value)}
                placeholder="Full name of emergency contact" maxLength={100} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Contact Phone</Label>
              <Input value={ecPhone} onChange={(e) => setEcPhone(e.target.value)}
                placeholder="(801) 555-0100" maxLength={30} />
            </div>
          </CardContent>
        </Card>

        {/* Billing codes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Authorized DSPD Billing Codes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <DspdCodesMultiSelect value={jobCodes} onChange={setJobCodes} />
            <p className="text-[11px] text-muted-foreground">
              Selected codes appear in the caregiver's EVV clock-in service type dropdown.
              Includes all 35 Utah DSPD codes including HHS.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Right column */}
      <div className="space-y-5">
        {/* EVV Geofence */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
              EVV Geofence Control
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label className="text-xs font-semibold">Maximum Clock-In Radius</Label>
            <Select value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GEOFENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Caregivers clocking in beyond this distance from the service address must submit a
              variance justification before the clock-in completes.
            </p>
            <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-[11px] font-semibold text-primary">Current: {radius.toLocaleString()} ft</p>
            </div>

            <div className="mt-4 border-t border-primary/20 pt-3">
              <ApprovedLocationsEditor
                clientId={client.id}
                organizationId={orgId}
                canEdit={true}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        {dirty && (
          <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p className="text-sm font-medium">Unsaved changes</p>
              </div>
              <Button onClick={handleSave} disabled={saving || !first.trim() || !last.trim()}
                className="w-full">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Profile
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Custom attributes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Custom Attributes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CustomAttributesSection
              organizationId={client.id ? undefined : undefined}
              entityKind="client"
              entityId={client.id}
            />
          </CardContent>
        </Card>

        {/* Lifecycle */}
        <LifecyclePanel
          kind="client"
          id={client.id}
          fullName={`${client.first_name} ${client.last_name}`.trim()}
          organizationId={undefined}
        />
      </div>
    </div>

    {/* Billing Codes Detail — per-code ledger lives beneath the multi-select */}
    <BillingCodesDetail
      clientId={client.id}
      clientName={`${client.first_name} ${client.last_name}`.trim()}
      medicaidId={client.medicaid_id ?? null}
    />

    {/* Client-specific documents — flows into Company Docs */}
    <ClientDocumentsCard
      clientId={client.id}
      clientName={`${client.first_name} ${client.last_name}`.trim()}
    />
    </div>
  );
}

// ─── PCSP Tab ─────────────────────────────────────────────────────────────────

function PcspTab({
  client, onSave, saving,
}: { client: Client; onSave: (v: ClientFormValues) => void; saving: boolean }) {
  const [goals, setGoals]         = useState<string[]>(client.pcsp_goals ?? []);
  const [goalInput, setGoalInput] = useState("");
  const [specialDir, setSpecialDir] = useState(client.special_directions ?? "");

  const dirty = useMemo(() => (
    JSON.stringify(goals) !== JSON.stringify(client.pcsp_goals ?? []) ||
    specialDir !== (client.special_directions ?? "")
  ), [goals, specialDir, client]);

  function addGoal() {
    const v = goalInput.trim();
    if (!v || goals.includes(v)) return;
    setGoals([...goals, v]);
    setGoalInput("");
  }

  function handleSave() {
    onSave({
      first_name:              client.first_name,
      last_name:               client.last_name,
      phone_number:            client.phone_number ?? "",
      physical_address:        client.physical_address ?? "",
      pcsp_goals:              goals,
      job_code:                client.job_code ?? [],
      medicaid_id:             client.medicaid_id ?? "",
      geofence_radius_feet:    client.geofence_radius_feet ?? 1000,
      special_directions:      specialDir,
      date_of_birth:           client.date_of_birth ?? "",
      emergency_contact_name:  client.emergency_contact_name ?? "",
      emergency_contact_phone: client.emergency_contact_phone ?? "",
      profile_photo_url:       client.profile_photo_url ?? "",
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-5">

        {/* PCSP Goals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Person-Centered Support Plan Goals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              PCSP goals appear as checkboxes during daily note and eMAR documentation.
              Staff must address each checked goal in their narrative.
            </p>
            <div className="flex gap-2">
              <Input
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGoal(); } }}
                placeholder="e.g. Independent Meal Preparation"
                maxLength={200}
              />
              <Button type="button" variant="outline" onClick={addGoal} className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {goals.length > 0 ? (
              <div className="space-y-1.5">
                {goals.map((g, i) => (
                  <div key={g}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground/50 tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm">{g}</span>
                    </div>
                    <button type="button" onClick={() => setGoals(goals.filter((x) => x !== g))}
                      className="rounded p-1 text-muted-foreground hover:bg-rose-100 hover:text-rose-600 transition">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">No PCSP goals entered. Add goals above.</p>
              </div>
            )}
            <div className="border-t border-border pt-3">
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs"
                onClick={() => toast.info("NECTAR import: drop a PCSP document and NECTAR will extract and populate the goals list automatically.")}>
                <Sparkles className="h-3.5 w-3.5" />
                NECTAR Import — Extract Goals from PCSP Document
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Upload a state PCSP PDF to automatically extract and populate goals.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Special Directions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Special Directions & Clinical Alerts
              </CardTitle>
              {specialDir.trim() && (
                <Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-950/40 dark:text-amber-200">
                  Active
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              High-priority clinical notices displayed prominently to staff in the client workspace.
              Include choking/swallowing alerts, transfer instructions, behavioral de-escalation notes.
            </p>
            <Textarea
              value={specialDir}
              onChange={(e) => setSpecialDir(e.target.value)}
              rows={5}
              placeholder="Example: CHOKING RISK — Client requires all medications crushed and mixed with applesauce. Must be seated upright at 90 degrees during all meals and medication passes. Contact supervisor immediately if any swallowing difficulty is observed."
              className="text-sm"
            />
            {specialDir.trim() && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2.5 dark:bg-amber-950/20">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  This alert will appear at the top of every client workspace tab visible to staff.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right */}
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              {goals.length} PCSP goal{goals.length !== 1 ? "s" : ""} on file.
            </p>
            {dirty && (
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save PCSP & Directives
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Staff Assignment Tab ─────────────────────────────────────────────────────

function StaffAssignmentTab({ clientId, orgId }: { clientId: string; orgId: string }) {
  const qc = useQueryClient();
  const [selectedStaffId, setSelectedStaffId] = useState("");

  const { data: allStaff = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["sched-staff", orgId],
    queryFn: async (): Promise<StaffMember[]> => {
      const { data, error } = await (supabase as any)
        .from("organization_members")
        .select("profiles:user_id (id, full_name, email)")
        .eq("organization_id", orgId)
        .eq("active", true);
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((r: any) => r.profiles)
        .filter((p: any): p is StaffMember => !!p?.id);
    },
  });

  const { data: assigned = [] } = useQuery({
    enabled: !!clientId,
    queryKey: ["staff-assignments", clientId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any)
        .from("staff_assignments")
        .select("staff_id")
        .eq("client_id", clientId);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any) => r.staff_id as string);
    },
  });

  const assignedSet = new Set(assigned);
  const assignedStaff = allStaff.filter((s) => assignedSet.has(s.id));
  const unassignedStaff = allStaff.filter((s) => !assignedSet.has(s.id));

  const assignMut = useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await (supabase as any).from("staff_assignments").insert({
        client_id: clientId, staff_id: staffId, organization_id: orgId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-assignments", clientId] });
      qc.invalidateQueries({ queryKey: ["caseload"] });
      setSelectedStaffId("");
      toast.success("Staff assigned to client.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await (supabase as any)
        .from("staff_assignments").delete()
        .eq("client_id", clientId).eq("staff_id", staffId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-assignments", clientId] });
      qc.invalidateQueries({ queryKey: ["caseload"] });
      toast.success("Staff removed from client.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Assign Staff to This Client
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Assigned staff will see this client in their caseload immediately. Medication updates, PCSP
              changes, and special directions sync to their portal in real time.
            </p>
            <div className="flex gap-2">
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={
                    unassignedStaff.length === 0
                      ? "All active staff are already assigned"
                      : "Select a staff member to assign..."
                  } />
                </SelectTrigger>
                <SelectContent>
                  {unassignedStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name ?? s.email ?? s.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={!selectedStaffId || assignMut.isPending}
                onClick={() => { if (selectedStaffId) assignMut.mutate(selectedStaffId); }}
                className="shrink-0 gap-1.5"
              >
                {assignMut.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Plus className="h-4 w-4" />}
                Assign
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Assigned Caregivers
              </CardTitle>
              <Badge variant="outline">{assignedStaff.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {assignedStaff.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No staff assigned yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use the dropdown above to assign caregivers to this client.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {assignedStaff.map((s) => (
                  <li key={s.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                        {(s.full_name ?? s.email ?? "?")[0].toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{s.full_name ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{s.email}</p>
                      </div>
                    </div>
                    <Button
                      type="button" variant="ghost" size="sm"
                      onClick={() => removeMut.mutate(s.id)}
                      disabled={removeMut.isPending}
                      className="h-8 px-2 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 transition gap-1.5"
                    >
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Real-Time Sync</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All changes made in this workspace sync immediately to assigned staff portals:
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                PCSP goals update in daily notes
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                Medication changes appear in MAR
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                Special directions show as alerts
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                Service codes update in EVV clock-in
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                Geofence radius enforced immediately
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Documents Tab ────────────────────────────────────────────────────────────

function DocumentsTab({ clientId, orgId }: { clientId: string; orgId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [docType, setDocType] = useState(DOCUMENT_TYPES[0]);
  const [uploading, setUploading] = useState(false);

  const { data: docs = [], isLoading } = useQuery({
    enabled: !!clientId,
    queryKey: ["client-docs", clientId],
    queryFn: async (): Promise<ClientDocument[]> => {
      const { data, error } = await (supabase as any)
        .from("client_documents")
        .select("id, file_name, document_type, file_url, storage_path, uploaded_at, uploaded_by_name, file_size_bytes")
        .eq("client_id", clientId)
        .order("uploaded_at", { ascending: false });
      if (error) {
        // Table may not exist yet — return empty
        if (error.code === "42P01") return [];
        throw error;
      }
      return (data ?? []) as ClientDocument[];
    },
  });

  async function handleUpload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      // Upload to Supabase Storage bucket "client-documents"
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${orgId}/${clientId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      // Bucket is private + org-scoped; keep a stable reference but the UI
      // resolves a short-lived signed URL on demand via storage_path.
      const fileUrlRef = `storage://client-documents/${path}`;

      // Insert record
      const { error: insertError } = await (supabase as any)
        .from("client_documents")
        .insert({
          client_id:         clientId,
          organization_id:   orgId,
          file_name:         file.name,
          document_type:     docType,
          file_url:          fileUrlRef,
          storage_path:      path,
          file_size_bytes:   file.size,
          uploaded_by_name:  null,
        });

      if (insertError) throw insertError;

      toast.success(`${file.name} uploaded.`);
      qc.invalidateQueries({ queryKey: ["client-docs", clientId] });
    } catch (e: any) {
      // If bucket/table doesn't exist yet, show a clear message
      toast.error(e.message ?? "Upload failed. Ensure the client-documents storage bucket exists in Supabase.");
    } finally {
      setUploading(false);
    }
  }

  const deleteMut = useMutation({
    mutationFn: async (doc: ClientDocument) => {
      await (supabase as any).from("client_documents").delete().eq("id", doc.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-docs", clientId] });
      toast.success("Document removed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function fmtSize(bytes: number | null): string {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Secure Document Repository</h3>
          <p className="text-xs text-muted-foreground">
            HIPAA-compliant clinical file storage. Supports PDF, DOCX, PNG, and other standard formats.
            All documents are encrypted at rest and in transit.
          </p>
        </div>
      </div>

      {/* Upload dropzone */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleUpload(f);
            }}
            className="cursor-pointer rounded-xl border-2 border-dashed border-border bg-muted/20 p-8 text-center transition hover:border-primary/40 hover:bg-primary/5"
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading securely...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">Drop file here or click to browse</p>
                <p className="text-xs text-muted-foreground">
                  PDF, DOCX, PNG, JPG — max 20 MB · Stored encrypted in HIPAA-compliant cloud storage
                </p>
              </div>
            )}
            <input
              ref={fileRef} type="file" className="hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.xlsx,.csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            />
          </div>

          <div className="border-t border-border pt-3 mt-3">
            <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs"
              onClick={() => toast.info("NECTAR will index this document for AI-powered compliance search and auto-population across the platform.")}>
              <Sparkles className="h-3.5 w-3.5" />
              NECTAR Analyze — Index for AI Search
            </Button>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Documents indexed by NECTAR can be referenced during AI-assisted documentation.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Document list */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading documents...
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold">File Name</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold">Size</TableHead>
                <TableHead className="font-semibold">Uploaded</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          if (doc.storage_path) {
                            const { data, error } = await supabase.storage
                              .from("client-documents")
                              .createSignedUrl(doc.storage_path, 60 * 10);
                            if (error) throw error;
                            window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                          } else if (doc.file_url && /^https?:\/\//.test(doc.file_url)) {
                            // Legacy public URL fallback (will only work if RLS allows)
                            window.open(doc.file_url, "_blank", "noopener,noreferrer");
                          } else {
                            toast.error("This document is missing a storage path.");
                          }
                        } catch (e: any) {
                          toast.error(e?.message ?? "Could not open document.");
                        }
                      }}
                      className="flex items-center gap-1.5 font-medium text-primary hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      {doc.file_name}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">{doc.document_type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtSize(doc.file_size_bytes)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(doc.uploaded_at).toLocaleDateString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => deleteMut.mutate(doc)}
                      className="h-7 px-2 text-muted-foreground hover:text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function FeatureTogglesList({
  features,
  onToggle,
}: {
  features: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  const { data: disabledTier } = useDisabledTierFeatures();
  return (
    <>
      {FEATURE_TOGGLES.map((item) => {
        const tierOff = isFeatureTierDisabled(item.key as ClientFeatureKey, disabledTier ?? null);
        const wired = !!item.wired;
        const checked = features[item.key] ?? true;
        const disabled = tierOff || !wired;
        const stateLabel = tierOff
          ? "Requires plan upgrade"
          : !wired
          ? "Coming soon"
          : checked
          ? "Enabled"
          : "Disabled";
        const stateClass = tierOff
          ? "text-amber-600"
          : !wired
          ? "text-muted-foreground italic"
          : checked
          ? "text-emerald-600"
          : "text-muted-foreground";
        return (
          <div
            key={item.key}
            className={`flex items-center justify-between rounded-lg border border-border px-4 py-3 transition ${
              disabled ? "opacity-60" : "hover:bg-muted/30"
            }`}
          >
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-[11px] text-muted-foreground">{item.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-medium ${stateClass}`}>{stateLabel}</span>
              <Switch
                checked={checked && wired && !tierOff}
                disabled={disabled}
                onCheckedChange={() => onToggle(item.key)}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}


function SettingsTab({
  client, orgId, onSave, saving,
}: { client: Client; orgId: string; onSave: (v: ClientFormValues) => void; saving: boolean }) {
  const [features, setFeatures] = useState<Record<string, boolean>>(
    client.feature_config ?? Object.fromEntries(FEATURE_TOGGLES.map((t) => [t.key, true]))
  );
  const [featureDirty, setFeatureDirty] = useState(false);
  const qc = useQueryClient();

  async function saveFeatures() {
    const { error } = await (supabase as any)
      .from("clients")
      .update({ feature_config: features })
      .eq("id", client.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Feature configuration saved.");
    qc.invalidateQueries({ queryKey: ["clients"] });
    setFeatureDirty(false);
  }

  function toggle(key: string) {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
    setFeatureDirty(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-5">

        {/* Feature toggles */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Feature Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="mb-4 text-xs text-muted-foreground">
              Enable or disable specific platform features for this individual client profile.
              Wired features are hidden from caregivers working with this client when disabled.
              Items marked <span className="font-medium">Coming soon</span> are not yet enforced.
            </p>
            <FeatureTogglesList
              features={features}
              onToggle={toggle}
            />
            {featureDirty && (
              <div className="pt-3">
                <Button onClick={saveFeatures} disabled={saving} className="w-full">
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Feature Configuration
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="border-border bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Client Record Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Record ID</span>
              <span className="font-mono">{client.id.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between">
              <span>Status</span>
              <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Active</Badge>
            </div>
            <div className="flex justify-between">
              <span>Service Codes</span>
              <span>{(client.job_code ?? []).join(", ") || "None"}</span>
            </div>
            <div className="flex justify-between">
              <span>PCSP Goals</span>
              <span>{(client.pcsp_goals ?? []).length}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Add Client Dialog (quick-add, not full workspace) ────────────────────────

function AddClientDialog({
  pending, onSubmit,
}: { pending: boolean; onSubmit: (v: ClientFormValues) => void }) {
  const [first, setFirst]         = useState("");
  const [last, setLast]           = useState("");
  const [phone, setPhone]         = useState("");
  const [addr, setAddr]           = useState("");
  const [medicaidId, setMedicaidId] = useState("");
  const [jobCodes, setJobCodes]   = useState<string[]>([]);
  const [radius, setRadius]       = useState(1000);
  const [pinning, setPinning]     = useState(false);

  const canSubmit = first.trim() && last.trim() && addr.trim() && jobCodes.length > 0 && medicaidId.trim();

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
      <DialogHeader>
        <DialogTitle>Add New Client</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">First Name *</Label>
            <Input value={first} onChange={(e) => setFirst(e.target.value)} maxLength={100} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">Last Name *</Label>
            <Input value={last} onChange={(e) => setLast(e.target.value)} maxLength={100} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold">Medicaid ID *</Label>
          <Input value={medicaidId} onChange={(e) => setMedicaidId(e.target.value)}
            placeholder="e.g. 1234567890" maxLength={50} className="font-mono" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold">Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Service Address *</Label>
            <Button type="button" variant="outline" size="sm" disabled={pinning} className="h-7 text-xs gap-1"
              onClick={async () => {
                setPinning(true);
                try {
                  const pos = await getBrowserPosition();
                  setAddr("Testing Headquarters");
                  toast.success(`Pinned (${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)})`);
                } catch { toast.error("Location access denied"); }
                finally { setPinning(false); }
              }}>
              {pinning ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
              Pin Location
            </Button>
          </div>
          <Input value={addr} onChange={(e) => setAddr(e.target.value)} maxLength={255} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold">Authorized DSPD Billing Codes *</Label>
          <DspdCodesMultiSelect value={jobCodes} onChange={setJobCodes} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold">EVV Geofence Radius</Label>
          <Select value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GEOFENCE_OPTIONS.map((o) => (
                <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() => onSubmit({
            first_name: first.trim(), last_name: last.trim(),
            phone_number: phone.trim(), physical_address: addr.trim(),
            pcsp_goals: [], job_code: jobCodes,
            medicaid_id: medicaidId.trim(), geofence_radius_feet: radius,
            special_directions: "", date_of_birth: "",
            emergency_contact_name: "", emergency_contact_phone: "",
            profile_photo_url: "",
          })}
          disabled={!canSubmit || pending}
        >
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Client
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
