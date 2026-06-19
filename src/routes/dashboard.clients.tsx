import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
  ArrowLeft, Users, Camera, Sparkles, Brain, Info,
  Activity as ActivityIcon, HandCoins, Wallet, ClipboardList,
  ExternalLink, Stethoscope, Gavel,
} from "lucide-react";
import { toast } from "sonner";
import { OnboardingReturnBar } from "@/components/onboarding/onboarding-return-bar";
import { OnboardingGuidanceBanner } from "@/components/onboarding/onboarding-guidance-banner";
import { JOB_CODES, jobCodeLabel } from "@/lib/job-codes";
import { DspdCodesMultiSelect } from "@/components/clients/dspd-codes-multiselect";
import { BillingCodesDetail } from "@/components/clients/billing-codes-detail";
import { isDailyServiceCode } from "@/lib/service-billing";
import { LivingArrangementFlag } from "@/components/clients/living-arrangement-flag";
import { ClientDocumentsCard } from "@/components/clients/client-documents-card";
import { ClientIntakeChecklistCard } from "@/components/clients/client-intake-checklist-card";
import { PerShiftFormsCareSection } from "@/components/clients/per-shift-forms-care-section";
import { IntakeProgress } from "@/components/clients/intake-progress";
import { useClientIntakeProgress } from "@/hooks/use-client-intake-progress";
import { useClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { ClientLoanMarker } from "@/components/loans/client-loan-marker";
// Smart Import replaces the legacy NECTAR Bulk Importer dialog.
import { CustomAttributesSection } from "@/components/custom-attributes-section";
import { LifecyclePanel } from "@/components/lifecycle-panel";
import { MedicationsManager } from "@/components/medications-manager";
import { MarCalendar } from "@/components/mar-calendar";
import { ApprovedLocationsEditor } from "@/components/evv/approved-locations-editor";
import { ClientPhoto } from "@/components/client-photo";
import { BehaviorSupportConfigCard } from "@/components/behavior-support/bs-config-card";
import { ClientSpecificTrainingCard } from "@/components/clients/client-specific-training-card";
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
  // Guardianship — when is_own_guardian = true, the other guardian_* fields
  // must be empty. See `validate_client_guardianship` trigger.
  is_own_guardian: boolean | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_relationship: string | null;
  guardian_email: string | null;
  // feature toggles stored as JSON
  feature_config: Record<string, boolean> | null;
  profile_photo_url: string | null;
  intake_status: string | null;
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
  // Optional — only included by forms that expose guardianship editing.
  is_own_guardian?: boolean;
  guardian_name?: string;
  guardian_phone?: string;
  guardian_relationship?: string;
  guardian_email?: string;
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

function ClientsError({ error }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-start justify-center p-8">
      <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
        <h2 className="text-base font-semibold">Something went wrong in Client Directory</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >Reload</button>
          <a href="/dashboard" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground">Dashboard home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/dashboard/clients")({
  head: () => ({ meta: [{ title: "Client Directory — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <ClientsPage />
    </RequirePermission>
  ),
  errorComponent: ClientsError,
});

// ─── Clients Page ─────────────────────────────────────────────────────────────

export function ClientsPage() {
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
        .select("id, first_name, last_name, phone_number, physical_address, pcsp_goals, job_code, authorized_dspd_codes, medicaid_id, account_status, geofence_radius_feet, special_directions, date_of_birth, emergency_contact_name, emergency_contact_phone, is_own_guardian, guardian_name, guardian_phone, guardian_relationship, guardian_email, feature_config, profile_photo_url, intake_status")
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

  // Surface Smart Import jobs whose ready subjects never finished committing,
  // so the directory makes their absence obvious instead of silently hiding them.
  const { data: stuckImports = [] } = useQuery({
    enabled: !!org,
    queryKey: ["clients-uncommitted-imports", org?.organization_id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("import_subjects")
        .select("import_job_id, import_jobs!inner(id, org_id, mode, status)")
        .eq("subject_type", "client")
        .eq("review_status", "ready")
        .is("committed_at", null)
        .eq("import_jobs.org_id", org!.organization_id);
      if (error) return [];
      const seen = new Set<string>();
      const jobs: string[] = [];
      for (const row of (data ?? []) as Array<{ import_job_id: string }>) {
        if (!seen.has(row.import_job_id)) {
          seen.add(row.import_job_id);
          jobs.push(row.import_job_id);
        }
      }
      return jobs;
    },
  });

  const navigate = useNavigate();

  const addMutation = useMutation({
    mutationFn: async (input: ClientFormValues & { intake_mode: "intake" | "profile-only" }) => {
      const coords = await resolveCoords(input.physical_address);
      const isOwn = input.is_own_guardian ?? true;
      const { data, error } = await (supabase as any).from("clients").insert({
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
        intake_status:        input.intake_mode === "intake" ? "in_progress" : "pending",
        is_own_guardian:      isOwn,
        guardian_name:        isOwn ? null : (input.guardian_name?.trim() || null),
        guardian_phone:       isOwn ? null : (input.guardian_phone?.trim() || null),
        guardian_relationship:isOwn ? null : (input.guardian_relationship?.trim() || null),
        guardian_email:       isOwn ? null : (input.guardian_email?.trim() || null),
      }).select("id").single();
      if (error) throw error;

      const codes = (input.job_code ?? []).map((c) => c.toUpperCase()).filter(Boolean);
      if (codes.length) {
        const stubRows = codes.map((service_code) => ({
          organization_id: org!.organization_id,
          client_id: data!.id,
          service_code,
          unit_type: isDailyServiceCode(service_code) ? "day" : "unit",
          annual_unit_authorization: 0,
          rate_per_unit: 0,
        }));
        const { error: bcErr } = await (supabase as any)
          .from("client_billing_codes")
          .upsert(stubRows, { onConflict: "organization_id,client_id,service_code" });
        if (bcErr) throw bcErr;
      }

      return { id: data!.id as string, mode: input.intake_mode };
    },
    onSuccess: ({ id, mode }) => {
      toast.success(mode === "intake" ? "Client created — starting intake." : "Client added.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setAddOpen(false);
      if (mode === "intake") {
        navigate({ to: "/dashboard/client-intake/$clientId", params: { clientId: id } });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const editMutation = useMutation({
    mutationFn: async (input: ClientFormValues & { id: string }) => {
      const { id, ...rest } = input;
      const coords = await resolveCoords(rest.physical_address);
      const patch: Record<string, unknown> = {
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
      };
      // Guardianship — only patch when the form exposed these fields. The DB
      // trigger validates the combination (own-guardian => guardian_* null;
      // otherwise name + phone required).
      if (rest.is_own_guardian !== undefined) {
        patch.is_own_guardian = !!rest.is_own_guardian;
        patch.guardian_name = rest.is_own_guardian ? null : (rest.guardian_name?.trim() || null);
        patch.guardian_phone = rest.is_own_guardian ? null : (rest.guardian_phone?.trim() || null);
        patch.guardian_relationship = rest.is_own_guardian ? null : (rest.guardian_relationship?.trim() || null);
        patch.guardian_email = rest.is_own_guardian ? null : (rest.guardian_email?.trim() || null);
      }
      const { error } = await (supabase as any)
        .from("clients")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },

    onSuccess: () => {
      toast.success("Client updated.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client-auth-codes"] });
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
      <OnboardingReturnBar />
      <OnboardingGuidanceBanner step={4} />

      {stuckImports.length > 0 && (
        <Link
          to="/dashboard/smart-import/$jobId/done"
          params={{ jobId: stuckImports[0] }}
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50/60 px-4 py-2.5 text-sm hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
        >
          <span className="flex items-center gap-2 text-amber-900 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            {stuckImports.length} Smart Import {stuckImports.length === 1 ? "job has" : "jobs have"} uncommitted client{stuckImports.length === 1 ? "" : "s"} — finish import to add them here.
          </span>
          <span className="font-medium text-amber-900 dark:text-amber-300">Finish import →</span>
        </Link>
      )}


      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Client Directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage individuals served, authorized service codes, and care configurations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="border-primary/40 text-primary hover:bg-primary/5">
            <Link to="/dashboard/smart-import" search={{ mode: "client" }}>
              <Sparkles className="mr-2 h-4 w-4" /> Smart Import
            </Link>
          </Button>

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
          <div className="max-h-[calc(100vh-16rem)] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
                <TableRow>
                  <TableHead className="font-semibold">Full Name</TableHead>
                  <TableHead className="font-semibold">Medicaid ID</TableHead>
                  <TableHead className="font-semibold">Service Codes</TableHead>
                  <TableHead className="font-semibold">Phone</TableHead>
                  <TableHead className="font-semibold">Address</TableHead>
                  <TableHead className="font-semibold w-[110px]">Intake</TableHead>
                  <TableHead className="text-right font-semibold w-[160px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const codes = c.job_code ?? [];
                  const shownCodes = codes.slice(0, 3);
                  const extraCodes = codes.length - shownCodes.length;
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer h-12 hover:bg-muted/50 transition-colors"
                      onClick={() => setActiveClient(c)}
                    >
                      <TableCell className="font-semibold whitespace-nowrap py-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {c.first_name?.[0] ?? ""}{c.last_name?.[0] ?? ""}
                          </span>
                          <span className="truncate">{c.first_name} {c.last_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap py-2">
                        {c.medicaid_id || "—"}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {shownCodes.length ? (
                            <>
                              {shownCodes.map((code) => (
                                <Badge key={code} variant="outline" className="font-mono text-[10px]"
                                  title={jobCodeLabel(code)}>{code}</Badge>
                              ))}
                              {extraCodes > 0 && (
                                <Badge variant="secondary" className="text-[10px]" title={codes.slice(3).join(", ")}>
                                  +{extraCodes}
                                </Badge>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap py-2">
                        {c.phone_number || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2 max-w-[220px]">
                        <div className="truncate" title={c.physical_address ?? undefined}>
                          {c.physical_address || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 w-[110px]">
                        <IntakeChip
                          organizationId={org?.organization_id}
                          clientId={c.id}
                          intakeStatus={c.intake_status}
                        />
                      </TableCell>
                      <TableCell className="text-right py-2 w-[220px]" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                            <Link
                              to="/dashboard/clients/$clientId"
                              params={{ clientId: c.id }}
                              search={{ tab: "overview" }}
                            >
                              Profile
                            </Link>
                          </Button>
                          <IntakeAction
                            organizationId={org?.organization_id}
                            clientId={c.id}
                            intakeStatus={c.intake_status}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

        )}
      </div>
    </div>
  );
}

// ─── Compact Intake Chip + Action (list view) ────────────────────────────────

function IntakeChip({
  organizationId,
  clientId,
  intakeStatus,
}: {
  organizationId: string | undefined;
  clientId: string;
  intakeStatus: string | null | undefined;
}) {
  const { isLoading, error, hasItems, required, satisfied, isComplete } =
    useClientIntakeProgress(organizationId, clientId);
  if (error) return null;
  if (isLoading) {
    return <span className="text-[11px] text-muted-foreground">…</span>;
  }
  if (!hasItems) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Intake —
      </span>
    );
  }
  const done = isComplete && intakeStatus === "complete";
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums " +
        (done
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-muted text-muted-foreground")
      }
    >
      Intake {satisfied}/{required}
    </span>
  );
}

function IntakeAction({
  organizationId,
  clientId,
  intakeStatus,
}: {
  organizationId: string | undefined;
  clientId: string;
  intakeStatus: string | null | undefined;
}) {
  const { isLoading, error, hasItems, isComplete } = useClientIntakeProgress(
    organizationId,
    clientId,
  );
  if (isLoading || error) return null;
  const done = hasItems && isComplete && intakeStatus === "complete";
  if (done) return null;
  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className="h-7 gap-1 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <Link to="/dashboard/client-intake/$clientId" params={{ clientId }}>
        Continue intake <ChevronRight className="h-3 w-3" />
      </Link>
    </Button>
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
  const billingCodesQ = useClientBillingCodes(client.id);
  const billingCodes = Array.from(new Set((billingCodesQ.data ?? []).map((b) => b.service_code)));

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
            {client.first_name?.[0] ?? ""}{client.last_name?.[0] ?? ""}
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
          {billingCodes.map((code) => (
            <Badge key={code} variant="outline" className="font-mono text-[10px]">{code}</Badge>
          ))}
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            Active
          </Badge>
        </div>
      </div>

      {client.intake_status !== "complete" && (
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Intake progress
          </div>
          <IntakeProgress
            organizationId={orgId}
            clientId={client.id}
            intakeStatus={client.intake_status}
            size="md"
          />
        </div>
      )}

      {/* Tab navigation — 4 hubs: Profile · Care · Activity · Funds */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList className="h-10 w-full justify-start rounded-none border-b border-border bg-transparent p-0">
          {[
            { value: "profile",  label: "Profile",  icon: User },
            { value: "care",     label: "Care",     icon: Stethoscope },
            { value: "activity", label: "Activity", icon: ActivityIcon },
            { value: "funds",    label: "Funds",    icon: Wallet },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              className={`relative flex h-11 min-h-[44px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${
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

        {/* PROFILE — the "who": identity, contact, alerts, docs, custom attrs, danger zone */}
        <TabsContent value="profile" className="mt-5 space-y-6">
          <ProfileTab client={client} orgId={orgId} onSave={onSave} saving={saving} billingCodes={billingCodes} />
        </TabsContent>

        {/* CARE — the "how": clinical/operational config */}
        <TabsContent value="care" className="mt-5 space-y-6">
          <CareSectionShell
            title="Placement"
            description="Team & home assignment for this client."
            linkTo="/dashboard/teams"
            linkLabel="Open Teams & Homes"
            icon={Users}
            storageKey={`${client.id}:placement`}
            summary="Team & home assignment"
          >
            <StaffAssignmentTab clientId={client.id} orgId={orgId} />
          </CareSectionShell>

          <CareSectionShell
            title="Authorized DSPD billing codes"
            description="Per-client service codes. Selected codes appear in the caregiver's EVV clock-in dropdown."
            linkTo="/dashboard/billing/$clientId"
            linkParams={{ clientId: client.id }}
            linkLabel="Open Billing"
            icon={ClipboardList}
            storageKey={`${client.id}:billing`}
            summary={
              billingCodes.length
                ? `${billingCodes.length} code${billingCodes.length === 1 ? "" : "s"} · ${billingCodes.join(", ")}`
                : "No codes"
            }
          >
            <LivingArrangementFlag clientId={client.id} />
            <AuthorizedCodesEditor
              clientId={client.id}
              orgId={orgId}
              currentCodes={billingCodes}
              billingRows={billingCodesQ.data ?? []}
            />
            <div className="mt-4">
              <BillingCodesDetail
                clientId={client.id}
                clientName={`${client.first_name} ${client.last_name}`.trim()}
                medicaidId={client.medicaid_id ?? null}
              />
            </div>
          </CareSectionShell>

          <CareSectionShell
            title="Person-centered support plan goals"
            description="PCSP goals appear as checkboxes during daily-note and eMAR documentation."
            linkTo="/dashboard/hub/clients"
            linkLabel="Open Clients Hub"
            icon={Sparkles}
            storageKey={`${client.id}:goals`}
            summary={`${(client.pcsp_goals ?? []).length} goal${(client.pcsp_goals ?? []).length === 1 ? "" : "s"}`}
          >
            <PcspTab client={client} onSave={onSave} saving={saving} />
          </CareSectionShell>

          <CareSectionShell
            title="Intake checklist"
            description="State-specific intake requirements for this client."
            linkTo="/dashboard/hub/clients"
            linkLabel="Open Clients Hub"
            icon={CheckCircle2}
            storageKey={`${client.id}:intake`}
            summary="State-specific intake"
          >
            <ClientIntakeChecklistCard
              organizationId={orgId}
              clientId={client.id}
              clientName={`${client.first_name} ${client.last_name}`.trim()}
            />
          </CareSectionShell>

          <CareSectionShell
            title="Per-shift tracking forms"
            description="Company-defined data collected on this client's shifts."
            linkTo="/dashboard/forms"
            linkLabel="Open Forms"
            icon={ClipboardList}
            storageKey={`${client.id}:per-shift-tracking`}
            summary="Tracked data"
          >
            <PerShiftFormsCareSection clientId={client.id} orgId={orgId} />
          </CareSectionShell>

          {emarEnabled && (
            <CareSectionShell
              title="Medications & MAR"
              description="Active prescriptions, administration schedules, and monthly MAR calendar."
              linkTo="/dashboard/workspace/$clientId"
              linkParams={{ clientId: client.id }}
              linkLabel="Open workspace"
              icon={Pill}
              storageKey={`${client.id}:meds`}
              summary="Prescriptions & MAR"
            >
              <div className="space-y-4">
                <MedicationsManager clientId={client.id} organizationId={orgId} />
                <MarCalendar clientId={client.id} />
              </div>
            </CareSectionShell>
          )}

          <CareSectionShell
            title="Behavior support plan"
            description="Current BSP status from the Behavior Support module."
            linkTo="/dashboard/behavior-support/$clientId"
            linkParams={{ clientId: client.id }}
            linkLabel="Open Behavior Support"
            icon={Brain}
            storageKey={`${client.id}:bsp`}
            summary="BSP status"
          >
            <BehaviorSupportConfigCard
              clientId={client.id}
              organizationId={orgId}
              clientName={`${client.first_name} ${client.last_name}`.trim()}
            />
          </CareSectionShell>

          <CareSectionShell
            title="Client-Specific Training"
            description="NECTAR-assembled training from this client's own authoritative data. Admin reviews, edits, and publishes."
            linkTo="/dashboard/clients"
            linkLabel="Open Clients"
            icon={Sparkles}
            storageKey={`${client.id}:client-specific-training`}
            summary="Per-client training"
          >
            <ClientSpecificTrainingCard clientId={client.id} />
          </CareSectionShell>

          <RightsSafeguardsCard clientId={client.id} />

          {/* Feature configuration — collapsed by default */}
          <CollapsibleCard
            title="Feature configuration"
            description="Enable or disable specific platform features for this client."
            icon={Settings2}
            storageKey={`${client.id}:features`}
            summary="Per-client feature toggles"
          >
            <SettingsTab client={client} orgId={orgId} onSave={onSave} saving={saving} />
          </CollapsibleCard>
        </TabsContent>

        {/* ACTIVITY — read-only date-sorted feed of client-linked records */}
        <TabsContent value="activity" className="mt-5 space-y-6">
          <CollapsibleCard
            title="Activity feed"
            description="Chronological list of forms, MAR entries, notes, incidents and shifts for this client."
            icon={ActivityIcon}
            storageKey={`${client.id}:activity`}
            summary="Recent client activity"
          >
            <ClientActivityFeed organizationId={orgId} clientId={client.id} />
          </CollapsibleCard>
        </TabsContent>

        {/* FUNDS — this client's money: trust account + loan agreements */}
        <TabsContent value="funds" className="mt-5 space-y-6">
          <CollapsibleCard
            title="Trust account & loans"
            description="Personal funds, spending log, and active loan agreements for this client."
            icon={Wallet}
            storageKey={`${client.id}:funds`}
            summary="Trust funds & loans"
          >
            <ClientFundsTab organizationId={orgId} clientId={client.id} />
          </CollapsibleCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Session-scoped expand/collapse memory ───────────────────────────────────
function useSessionToggle(key: string | undefined, defaultOpen: boolean) {
  const [open, setOpen] = useState<boolean>(() => {
    if (!key || typeof window === "undefined") return defaultOpen;
    try {
      const v = window.sessionStorage.getItem(`clients:section:${key}`);
      return v == null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });
  useEffect(() => {
    if (!key || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(`clients:section:${key}`, open ? "1" : "0");
    } catch { /* ignore */ }
  }, [key, open]);
  return [open, setOpen] as const;
}

// ─── Care section shell (collapsible) ────────────────────────────────────────
function CareSectionShell({
  title, description, linkTo, linkParams, linkLabel, children, icon: Icon,
  summary, defaultOpen = false, storageKey,
}: {
  title: string;
  description: string;
  linkTo: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  linkParams?: Record<string, any>;
  linkLabel: string;
  children: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any;
  summary?: string;
  defaultOpen?: boolean;
  storageKey?: string;
}) {
  const [open, setOpen] = useSessionToggle(storageKey, defaultOpen);
  return (
    <section className="rounded-xl border border-border/60 bg-card p-1">
      <header className="flex flex-col gap-2 px-4 pt-4 pb-3 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-start gap-2.5 text-left min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md -mx-1 px-1"
        >
          <ChevronRight
            className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
          {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#137182]" />}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-medium text-[#0B1126]">{title}</h3>
              {!open && summary && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {summary}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </button>
        <Button asChild variant="ghost" size="sm" className="gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground md:self-auto">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link to={linkTo as any} params={linkParams as any}>
            {linkLabel} <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      </header>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

// ─── Collapsible card (generic) ──────────────────────────────────────────────
function CollapsibleCard({
  title, description, icon: Icon, children, defaultOpen = false,
  summary, storageKey, tone = "default",
}: {
  title: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
  summary?: string;
  storageKey?: string;
  tone?: "default" | "amber" | "primary";
}) {
  const [open, setOpen] = useSessionToggle(storageKey, defaultOpen);
  const toneClasses =
    tone === "amber"
      ? "border-amber-500/60 bg-amber-50/60 dark:bg-amber-950/20"
      : tone === "primary"
        ? "border-primary/20 bg-primary/5"
        : "border-border/60 bg-card";
  const iconColor =
    tone === "amber" ? "text-amber-600"
      : tone === "primary" ? "text-primary"
        : "text-[#137182]";
  const titleColor =
    tone === "amber" ? "text-amber-900 dark:text-amber-100"
      : tone === "primary" ? "text-primary"
        : "text-[#0B1126]";
  return (
    <section className={`rounded-xl border ${toneClasses}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-xl"
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {Icon && <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`text-base font-medium ${titleColor}`}>{title}</h3>
              {!open && summary && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {summary}
                </span>
              )}
            </div>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

// ─── Authorized codes editor (writes to client_billing_codes; trigger syncs job_code) ─
function AuthorizedCodesEditor({
  clientId,
  orgId,
  currentCodes,
  billingRows,
}: {
  clientId: string;
  orgId: string;
  currentCodes: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  billingRows: any[];
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>(currentCodes);

  // Re-sync local state whenever the saved set changes (after a save or external edit).
  const savedKey = [...currentCodes].sort().join(",");
  useEffect(() => {
    setSelected(currentCodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const dirty = useMemo(() => {
    const a = [...selected].sort().join(",");
    return a !== savedKey;
  }, [selected, savedKey]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const currentSet = new Set(currentCodes);
      const nextSet = new Set(selected);
      const added = selected.filter((c) => !currentSet.has(c));
      const removed = currentCodes.filter((c) => !nextSet.has(c));

      // Soft-close removed codes: set service_end_date = today on every active row.
      const closeIds: string[] = billingRows
        .filter(
          (r) =>
            removed.includes(r.service_code) &&
            (r.service_end_date == null || r.service_end_date >= today),
        )
        .map((r) => r.id);

      if (closeIds.length) {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("client_billing_codes" as any)
          .update({ service_end_date: today })
          .in("id", closeIds);
        if (error) throw error;
      }

      if (added.length) {
        const { data: existingRows, error: existingError } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("client_billing_codes" as any)
          .select("id, service_code, service_end_date")
          .eq("organization_id", orgId)
          .eq("client_id", clientId)
          .in("service_code", added);
        if (existingError) throw existingError;

        const existingByCode = new Map(
          ((existingRows ?? []) as unknown as Array<{ id: string; service_code: string; service_end_date: string | null }>)
            .map((row) => [row.service_code, row]),
        );

        const reopenIds = added
          .map((code) => existingByCode.get(code))
          .filter((row): row is { id: string; service_code: string; service_end_date: string | null } => !!row)
          .filter((row) => !!row.service_end_date)
          .map((row) => row.id);

        if (reopenIds.length) {
          const { error } = await supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from("client_billing_codes" as any)
            .update({ service_end_date: null })
            .in("id", reopenIds);
          if (error) throw error;
        }

        const rows = added
          .filter((code) => !existingByCode.has(code))
          .map((code) => ({
            organization_id: orgId,
            client_id: clientId,
            service_code: code,
            service_start_date: today,
          }));

        if (rows.length) {
          const { error } = await supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from("client_billing_codes" as any)
            .insert(rows);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Authorized codes updated");
      qc.invalidateQueries({ queryKey: ["client-billing-codes"] });
      qc.invalidateQueries({ queryKey: ["all-client-billing-codes"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client-profile"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to save codes";
      toast.error(msg);
    },
  });

  return (
    <RequirePermission perm="manage_users">
      <div className="space-y-3">
        <DspdCodesMultiSelect value={selected} onChange={setSelected} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Selected codes are the single source of truth — they drive the EVV clock-in dropdown,
            scheduling, time clocks, and the Billing tab. Removing a code closes its authorization
            today; historical billing is preserved.
          </p>
          {dirty && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(currentCodes)}
                disabled={saveMut.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
              >
                {saveMut.isPending ? "Saving…" : "Save codes"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </RequirePermission>
  );
}



// ─── Rights & safeguards (collapsible link-out card) ─────────────────────────
function RightsSafeguardsCard({ clientId }: { clientId: string }) {
  return (
    <CollapsibleCard
      title="Rights & safeguards"
      description="Rights-restriction status and HRC review workflow live in the HRC module."
      icon={Gavel}
      storageKey={`${clientId}:rights`}
      summary="Managed in HRC module"
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <Gavel className="mt-0.5 h-4 w-4 text-[#137182]" />
          <p>
            Open the HRC module to view this client's rights-restriction status and committee reviews.
            Edits and approvals stay in the HRC workflow.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/dashboard/hrc">
            Open HRC <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      </div>
    </CollapsibleCard>
  );
}

// ─── Activity feed (read-only) ────────────────────────────────────────────────
type ClientActivityItem = {
  id: string;
  kind: "Form" | "MAR" | "Note" | "Incident" | "Shift";
  title: string;
  status: string;
  date: string;
};

function ClientActivityFeed({ organizationId, clientId }: { organizationId: string; clientId: string }) {
  const [filter, setFilter] = useState<"all" | ClientActivityItem["kind"]>("all");

  const formsQ = useQuery({
    enabled: !!organizationId && !!clientId,
    queryKey: ["client-activity-forms", organizationId, clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("form_submissions")
        .select("id, status, submitted_at, created_at, forms:form_id(name)")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });

  const marQ = useQuery({
    enabled: !!organizationId && !!clientId,
    queryKey: ["client-activity-mar", organizationId, clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("emar_logs")
        .select("id, status, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });

  const notesQ = useQuery({
    enabled: !!organizationId && !!clientId,
    queryKey: ["client-activity-notes", organizationId, clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("daily_logs")
        .select("id, status, log_date, submitted_at, created_at")
        .eq("client_id", clientId)
        .order("log_date", { ascending: false, nullsFirst: false })
        .limit(100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });

  const incidentsQ = useQuery({
    enabled: !!organizationId && !!clientId,
    queryKey: ["client-activity-incidents", organizationId, clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("incident_reports")
        .select("id, report_number, status, incident_date, filed_at")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("filed_at", { ascending: false, nullsFirst: false })
        .limit(100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });

  const shiftsQ = useQuery({
    enabled: !!organizationId && !!clientId,
    queryKey: ["client-activity-shifts", organizationId, clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("evv_timesheets")
        .select("id, status, clock_in_timestamp, service_code")
        .eq("client_id", clientId)
        .order("clock_in_timestamp", { ascending: false, nullsFirst: false })
        .limit(100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });

  const items = useMemo<ClientActivityItem[]>(() => {
    const out: ClientActivityItem[] = [];
    for (const r of formsQ.data ?? []) {
      out.push({
        id: `form-${r.id}`,
        kind: "Form",
        title: String(r.forms?.name ?? "Form"),
        status: String(r.status ?? "submitted"),
        date: String(r.submitted_at ?? r.created_at ?? new Date().toISOString()),
      });
    }
    for (const r of marQ.data ?? []) {
      out.push({
        id: `mar-${r.id}`,
        kind: "MAR",
        title: "Medication administration",
        status: String(r.status ?? "logged"),
        date: String(r.created_at ?? new Date().toISOString()),
      });
    }
    for (const r of notesQ.data ?? []) {
      out.push({
        id: `note-${r.id}`,
        kind: "Note",
        title: "Progress note",
        status: String(r.status ?? "logged"),
        date: String(r.log_date ?? r.submitted_at ?? r.created_at ?? new Date().toISOString()),
      });
    }
    for (const r of incidentsQ.data ?? []) {
      out.push({
        id: `inc-${r.id}`,
        kind: "Incident",
        title: String(r.report_number ?? "Incident"),
        status: String(r.status ?? "filed"),
        date: String(r.filed_at ?? r.incident_date ?? new Date().toISOString()),
      });
    }
    for (const r of shiftsQ.data ?? []) {
      out.push({
        id: `shift-${r.id}`,
        kind: "Shift",
        title: String(r.service_code ?? "Shift"),
        status: String(r.status ?? ""),
        date: String(r.clock_in_timestamp ?? new Date().toISOString()),
      });
    }
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return out;
  }, [formsQ.data, marQ.data, notesQ.data, incidentsQ.data, shiftsQ.data]);

  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const isLoading =
    formsQ.isLoading || marQ.isLoading || notesQ.isLoading || incidentsQ.isLoading || shiftsQ.isLoading;

  const chips: Array<{ k: "all" | ClientActivityItem["kind"]; label: string }> = [
    { k: "all", label: "All" },
    { k: "Form", label: "Forms" },
    { k: "MAR", label: "MARs" },
    { k: "Note", label: "Notes" },
    { k: "Incident", label: "Incidents" },
    { k: "Shift", label: "Shifts" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 space-y-0 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-base">Client activity</CardTitle>
        <span className="text-xs text-muted-foreground">Read-only · newest first</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.k}
              type="button"
              onClick={() => setFilter(c.k)}
              className={`min-h-[36px] rounded-full border px-3 py-1 text-xs font-medium transition ${
                filter === c.k
                  ? "border-[#137182] bg-[#137182] text-white"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity to show in this filter.</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((it) => (
              <li key={it.id} className="flex flex-col gap-1 py-2 text-sm md:flex-row md:items-center md:justify-between md:gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <ActivityKindBadge kind={it.kind} />
                  <span className="truncate font-medium">{it.title}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] capitalize">{it.status}</Badge>
                  <span>{new Date(it.date).toLocaleDateString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityKindBadge({ kind }: { kind: ClientActivityItem["kind"] }) {
  const map: Record<ClientActivityItem["kind"], { Icon: typeof FileText; cls: string }> = {
    Form:     { Icon: FileText,      cls: "bg-muted text-foreground/80" },
    MAR:      { Icon: Pill,          cls: "bg-[#137182]/10 text-[#137182]" },
    Note:     { Icon: ClipboardList, cls: "bg-[#0B1126]/10 text-[#0B1126]" },
    Incident: { Icon: AlertTriangle, cls: "bg-rose-100 text-rose-700" },
    Shift:    { Icon: Users,         cls: "bg-amber-100 text-amber-800" },
  };
  const { Icon, cls } = map[kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      <Icon className="h-3 w-3" /> {kind}
    </span>
  );
}

// ─── Funds tab ────────────────────────────────────────────────────────────────
function ClientFundsTab({ organizationId, clientId }: { organizationId: string; clientId: string }) {
  // Trust (PBA) account + recent transactions for this client only
  const acctQ = useQuery({
    enabled: !!organizationId && !!clientId,
    queryKey: ["client-pba-account", organizationId, clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("pba_accounts")
        .select("id, current_balance, medicaid_threshold, opened_on")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .maybeSingle();
      return data as { id: string; current_balance: number; medicaid_threshold: number; opened_on: string } | null;
    },
  });

  const txQ = useQuery({
    enabled: !!acctQ.data?.id,
    queryKey: ["client-pba-tx", acctQ.data?.id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("pba_transactions")
        .select("id, txn_type, amount, occurred_on, memo")
        .eq("account_id", acctQ.data!.id)
        .order("occurred_on", { ascending: false })
        .limit(20);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });

  // Loans for this client (gated by org loan setting)
  const loanStatusQ = useQuery({
    enabled: !!organizationId,
    queryKey: ["loan-feature-status", organizationId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("org_loan_settings")
        .select("enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      return { enabled: !!data?.enabled };
    },
  });

  const loansQ = useQuery({
    enabled: !!organizationId && !!clientId && !!loanStatusQ.data?.enabled,
    queryKey: ["client-loans", organizationId, clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("client_loans")
        .select("id, purpose, advance_amount, agreement_date, status, maturity_date")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("agreement_date", { ascending: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });

  const fmt$ = (n: number | null | undefined) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n ?? 0));

  return (
    <div className="space-y-6">
      {/* Trust (PBA) */}
      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-[#137182]" /> Trust account (PBA)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              This client's slice of the PBA Trust Ledger. Add transactions in the full ledger.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 self-start md:self-auto">
            <Link to="/dashboard/pba-ledger">
              Open PBA Trust Ledger <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {acctQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !acctQ.data ? (
            <p className="text-sm text-muted-foreground">
              No trust account on file for this client. Open the PBA Trust Ledger to create one.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Balance</p>
                  <p className="mt-1 text-lg font-semibold text-[#0B1126]">{fmt$(acctQ.data.current_balance)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Medicaid threshold</p>
                  <p className="mt-1 text-lg font-semibold">{fmt$(acctQ.data.medicaid_threshold)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Opened</p>
                  <p className="mt-1 text-sm font-medium">
                    {acctQ.data.opened_on ? new Date(acctQ.data.opened_on).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-right text-xs">Amount</TableHead>
                      <TableHead className="text-xs">Memo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(txQ.data ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                          No transactions yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (txQ.data ?? []).map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs">{new Date(t.occurred_on).toLocaleDateString()}</TableCell>
                          <TableCell className="text-xs capitalize">{String(t.txn_type ?? "")}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt$(t.amount)}</TableCell>
                          <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                            {t.memo ?? ""}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Loans — only if org feature is enabled */}
      {loanStatusQ.data?.enabled && (
        <Card>
          <CardHeader className="flex flex-col gap-2 space-y-0 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <HandCoins className="h-4 w-4 text-amber-700" /> Loan agreements
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Agreements for this client from the Client Loan Ledger.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1.5 self-start md:self-auto">
              <Link to="/dashboard/client-loans">
                Open Client Loan Ledger <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loansQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (loansQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No loan agreements on file. Open the ledger to create one.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs">Agreement</TableHead>
                      <TableHead className="text-xs">Purpose</TableHead>
                      <TableHead className="text-right text-xs">Advance</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Maturity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(loansQ.data ?? []).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">
                          {l.agreement_date ? new Date(l.agreement_date).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs">{l.purpose ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmt$(l.advance_amount)}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="capitalize">{String(l.status ?? "")}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {l.maturity_date ? new Date(l.maturity_date).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({
  client, orgId, onSave, saving, billingCodes,
}: { client: Client; orgId: string; onSave: (v: ClientFormValues) => void; saving: boolean; billingCodes: string[] }) {
  const qc = useQueryClient();
  const [first, setFirst]               = useState(client.first_name);
  const [last, setLast]                 = useState(client.last_name);
  const [phone, setPhone]               = useState(client.phone_number ?? "");
  const [addr, setAddr]                 = useState(client.physical_address ?? "");
  const [medicaidId, setMedicaidId]     = useState(client.medicaid_id ?? "");
  const [dob, setDob]                   = useState(client.date_of_birth ?? "");
  const [ecName, setEcName]             = useState(client.emergency_contact_name ?? "");
  const [ecPhone, setEcPhone]           = useState(client.emergency_contact_phone ?? "");
  const [isOwnGuardian, setIsOwnGuardian] = useState<boolean>(!!client.is_own_guardian);
  const [gName, setGName]               = useState(client.guardian_name ?? "");
  const [gPhone, setGPhone]             = useState(client.guardian_phone ?? "");
  const [gRel, setGRel]                 = useState(client.guardian_relationship ?? "");
  const [gEmail, setGEmail]             = useState(client.guardian_email ?? "");

  const [jobCodes, setJobCodes]         = useState<string[]>(client.job_code ?? []);
  const [radius, setRadius]             = useState(client.geofence_radius_feet ?? 1000);
  const [pinning, setPinning]           = useState(false);
  const [goals]                         = useState<string[]>(client.pcsp_goals ?? []);
  const [specialDir, setSpecialDir]     = useState(client.special_directions ?? "");
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
    isOwnGuardian !== !!client.is_own_guardian ||
    gName !== (client.guardian_name ?? "") ||
    gPhone !== (client.guardian_phone ?? "") ||
    gRel !== (client.guardian_relationship ?? "") ||
    gEmail !== (client.guardian_email ?? "") ||
    JSON.stringify(jobCodes) !== JSON.stringify(client.job_code ?? [])
  ), [first, last, phone, addr, medicaidId, dob, ecName, ecPhone, radius, jobCodes, isOwnGuardian, gName, gPhone, gRel, gEmail, client]);

  const guardianInvalid = !isOwnGuardian && (!gName.trim() || !gPhone.trim());

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
      is_own_guardian: isOwnGuardian,
      guardian_name: gName,
      guardian_phone: gPhone,
      guardian_relationship: gRel,
      guardian_email: gEmail,

    });
  }

  return (
    <div className={`space-y-5 ${dirty ? "pb-24" : ""}`}>

    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-5">

        {/* Identity & contact — expanded by default */}
        <CollapsibleCard
          title="Identity & contact"
          description="Core facts: name, Medicaid ID, DOB, phone, service address."
          icon={User}
          defaultOpen
          storageKey={`${client.id}:identity`}
          summary={`${client.first_name} ${client.last_name}${client.medicaid_id ? ` · ${client.medicaid_id}` : ""}`}
        >
          <div className="space-y-4">
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
                        {client.first_name?.[0] ?? ""}{client.last_name?.[0] ?? ""}
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
                <ClientLoanMarker clientId={client.id} />
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
          </div>
        </CollapsibleCard>

        {/* Emergency contact — collapsed by default */}
        <CollapsibleCard
          title="Emergency contact"
          description="Who to call if something goes wrong on shift."
          icon={Contact2}
          storageKey={`${client.id}:emergency`}
          summary={ecName.trim() ? `${ecName.trim()}${ecPhone.trim() ? ` · ${ecPhone.trim()}` : ""}` : "Not set"}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>
        </CollapsibleCard>

        {/* Guardianship — drives whether the 24h guardian-notification duty
            applies to incident reports for this client. */}
        <CollapsibleCard
          title="Guardianship"
          description="Is this client their own guardian, or is there a separate legal guardian to notify on incidents?"
          icon={Gavel}
          storageKey={`${client.id}:guardianship`}
          summary={isOwnGuardian
            ? "Self-guardian — no separate guardian to notify"
            : (gName.trim() ? `${gName.trim()}${gPhone.trim() ? ` · ${gPhone.trim()}` : ""}` : "Not set")}
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <div className="font-medium">Is the client their own guardian?</div>
                <div className="text-xs text-muted-foreground">
                  If yes, no separate guardian notification is required on incidents.
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={isOwnGuardian ? "default" : "outline"}
                  onClick={() => setIsOwnGuardian(true)}
                >
                  Self-guardian
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!isOwnGuardian ? "default" : "outline"}
                  onClick={() => setIsOwnGuardian(false)}
                >
                  Has guardian
                </Button>
              </div>
            </div>

            {!isOwnGuardian && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-semibold">Guardian Name *</Label>
                    <Input value={gName} onChange={(e) => setGName(e.target.value)}
                      placeholder="Full legal name" maxLength={150} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-semibold">Guardian Phone *</Label>
                    <Input value={gPhone} onChange={(e) => setGPhone(e.target.value)}
                      placeholder="(801) 555-0100" maxLength={30} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-semibold">Relationship</Label>
                    <Input value={gRel} onChange={(e) => setGRel(e.target.value)}
                      placeholder="Mother, Brother, Court-appointed, …" maxLength={80} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-semibold">Email</Label>
                    <Input value={gEmail} onChange={(e) => setGEmail(e.target.value)}
                      placeholder="optional" maxLength={150} />
                  </div>
                </div>
                {guardianInvalid && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Guardian name and phone are required when the client is not their own guardian.
                  </p>
                )}
              </div>
            )}
          </div>
        </CollapsibleCard>


        {/* Clinical alert — the one colored callout on Profile; expanded by default */}
        <CollapsibleCard
          title="Clinical alert"
          description="High-priority clinical notices displayed prominently to staff in the client workspace."
          icon={AlertTriangle}
          tone="amber"
          defaultOpen
          storageKey={`${client.id}:alert`}
          summary={specialDir.trim() ? "Active" : "None set"}
        >
          <div className="space-y-2">
            {specialDir.trim() && (
              <Badge className="bg-amber-100 text-amber-800 text-[10px] dark:bg-amber-950/40 dark:text-amber-200">
                Active
              </Badge>
            )}
            <Textarea
              value={specialDir}
              onChange={(e) => setSpecialDir(e.target.value)}
              rows={4}
              placeholder="Example: CHOKING RISK — All meds crushed with applesauce; seated upright at 90°."
              className="text-sm bg-white/70 dark:bg-amber-950/40"
            />
          </div>
        </CollapsibleCard>

        {/* Service address & geofence + approved locations — collapsed by default */}
        <CollapsibleCard
          title="Service address & approved locations"
          description="EVV clock-in radius and the list of approved alternate locations."
          icon={MapPin}
          tone="primary"
          storageKey={`${client.id}:geofence`}
          summary={`${radius.toLocaleString()} ft radius`}
        >
          <div className="space-y-3">
            <Label className="text-xs font-semibold">Maximum clock-in radius</Label>
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
              variance justification.
            </p>
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-[11px] font-semibold text-primary">Current: {radius.toLocaleString()} ft</p>
            </div>
            <div className="mt-3 border-t border-primary/20 pt-3">
              <ApprovedLocationsEditor
                clientId={client.id}
                organizationId={orgId}
                canEdit={true}
              />
            </div>
          </div>
        </CollapsibleCard>

        {/* Client documents — collapsed by default */}
        <CollapsibleCard
          title="Client documents"
          description="Uploaded PDFs, scans, and other files attached to this client."
          icon={FileText}
          storageKey={`${client.id}:documents`}
          summary="View & manage documents"
        >
          <ClientDocumentsCard
            clientId={client.id}
            clientName={`${client.first_name} ${client.last_name}`.trim()}
          />
        </CollapsibleCard>
      </div>

      {/* Right column — meta only */}
      <div className="space-y-5">
        {/* Client record info (meta) */}
        <Card className="border-border/60 bg-muted/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Client record info
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Record ID</span>
              <span className="font-mono">{client.id.slice(0, 8)}…</span>
            </div>
            <div className="flex justify-between">
              <span>Status</span>
              <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Active</Badge>
            </div>
            <div className="flex justify-between">
              <span>Service codes</span>
              <span>{billingCodes.length ? billingCodes.join(", ") : "None"}</span>
            </div>
            <div className="flex justify-between">
              <span>PCSP goals</span>
              <span>{(client.pcsp_goals ?? []).length}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    {/* Custom attributes — full-width, first-class section, collapsed by default */}
    <CollapsibleCard
      title="Custom attributes"
      description="Agency-specific fields, including any imported from a PCSP."
      icon={Sparkles}
      storageKey={`${client.id}:custom-attrs`}
      summary="Agency-specific fields"
    >
      <CustomAttributesSection
        organizationId={orgId}
        entityKind="client"
        entityId={client.id}
      />
    </CollapsibleCard>

    {/* Danger zone — quiet, at the very bottom */}
    <div className="mt-6 border-t border-border/60 pt-4">
      <LifecyclePanel
        kind="client"
        id={client.id}
        fullName={`${client.first_name} ${client.last_name}`.trim()}
        organizationId={orgId}
      />
    </div>

    {/* Sticky save bar — visible whenever there are unsaved profile edits,
        regardless of which field/column the user is editing. Reuses the
        existing editMutation (user-scoped supabase client → RLS enforced). */}
    {dirty && (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-500/40 bg-amber-50/95 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.1)] backdrop-blur dark:bg-amber-950/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">You have unsaved changes to this client profile.</p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !first.trim() || !last.trim()}
            className="min-w-[160px]"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Profile
          </Button>
        </div>
      </div>
    )}
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
            {/* Per-section PCSP goal extraction removed — use NECTAR Bulk Import (AI PDF mode) to auto-populate goals from a PCSP. */}
          </CardContent>
        </Card>

        {/* Special directions are edited on the Profile tab → Clinical alert card. */}
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
      // No FK organization_members→profiles: two queries, join in JS.
      const { data, error } = await (supabase as any)
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("active", true);
      if (error) throw error;
      const ids = ((data ?? []) as any[]).map((r: any) => r.user_id).filter(Boolean);
      if (!ids.length) return [];
      const { data: profiles, error: pErr } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      if (pErr) throw pErr;
      return ((profiles ?? []) as any[]).filter((p: any): p is StaffMember => !!p?.id);
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

          {/* Per-document NECTAR Analyze removed — uploaded documents are still RAG-indexed on save; whole-profile population happens via NECTAR Bulk Import (AI PDF mode). */}
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
}: { pending: boolean; onSubmit: (v: ClientFormValues & { intake_mode: "intake" | "profile-only" }) => void }) {
  const [mode, setMode] = useState<"intake" | "profile-only" | null>(null);
  const [first, setFirst]         = useState("");
  const [last, setLast]           = useState("");
  const [phone, setPhone]         = useState("");
  const [addr, setAddr]           = useState("");
  const [medicaidId, setMedicaidId] = useState("");
  const [jobCodes, setJobCodes]   = useState<string[]>([]);
  const [radius, setRadius]       = useState(1000);
  const [pinning, setPinning]     = useState(false);
  const [isOwnGuardian, setIsOwnGuardian] = useState(true);
  const [gName, setGName]         = useState("");
  const [gPhone, setGPhone]       = useState("");
  const [gRel, setGRel]           = useState("");
  const [gEmail, setGEmail]       = useState("");

  const guardianInvalid = !isOwnGuardian && (!gName.trim() || !gPhone.trim());
  const canSubmit = first.trim() && last.trim() && addr.trim() && jobCodes.length > 0 && medicaidId.trim() && !guardianInvalid;

  if (!mode) {
    return (
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            How do you want to proceed?
          </p>
          <button
            type="button"
            onClick={() => setMode("intake")}
            className="w-full rounded-lg border border-border bg-background p-4 text-left transition hover:border-primary hover:bg-primary/5"
          >
            <div className="font-semibold">Create profile &amp; begin intake now</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Create the client profile and immediately start the new-client intake procedure.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode("profile-only")}
            className="w-full rounded-lg border border-border bg-background p-4 text-left transition hover:border-primary hover:bg-primary/5"
          >
            <div className="font-semibold">Create profile only (not ready for intake)</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Save the client profile now and complete the intake procedure later.
            </p>
          </button>
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {mode === "intake" ? "New Client — Begin Intake" : "New Client — Profile Only"}
        </DialogTitle>
      </DialogHeader>
      <button
        type="button"
        onClick={() => setMode(null)}
        className="-mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back
      </button>
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

        <div className="rounded-lg border border-border p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <Checkbox checked={isOwnGuardian} onCheckedChange={(v) => setIsOwnGuardian(!!v)} />
            Client is their own guardian
          </label>
          {!isOwnGuardian && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold">Guardian Name *</Label>
                  <Input value={gName} onChange={(e) => setGName(e.target.value)} maxLength={150} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold">Guardian Phone *</Label>
                  <Input value={gPhone} onChange={(e) => setGPhone(e.target.value)} maxLength={30} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold">Relationship</Label>
                  <Input value={gRel} onChange={(e) => setGRel(e.target.value)} maxLength={100} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold">Guardian Email</Label>
                  <Input value={gEmail} onChange={(e) => setGEmail(e.target.value)} maxLength={150} type="email" />
                </div>
              </div>
            </div>
          )}
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
            is_own_guardian: isOwnGuardian,
            guardian_name: isOwnGuardian ? "" : gName.trim(),
            guardian_phone: isOwnGuardian ? "" : gPhone.trim(),
            guardian_relationship: isOwnGuardian ? "" : gRel.trim(),
            guardian_email: isOwnGuardian ? "" : gEmail.trim(),
            intake_mode: mode,
          })}
          disabled={!canSubmit || pending}
        >
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "intake" ? "Create & Start Intake" : "Create Profile"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

