import { createFileRoute, useNavigate, Link, Outlet } from "@tanstack/react-router";
import { useState, useMemo } from "react";
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
  UserPlus, Contact2, MapPin, Loader2,
  ChevronRight, AlertTriangle, Search,
  ArrowLeft, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { OnboardingReturnBar } from "@/components/onboarding/onboarding-return-bar";
import { OnboardingGuidanceBanner } from "@/components/onboarding/onboarding-guidance-banner";
import { jobCodeLabel } from "@/lib/job-codes";
import { DspdCodesMultiSelect } from "@/components/clients/dspd-codes-multiselect";
import { isDailyServiceCode } from "@/lib/service-billing";
import { useClientIntakeProgress } from "@/hooks/use-client-intake-progress";

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


// ─── Constants ────────────────────────────────────────────────────────────────

const GEOFENCE_OPTIONS = [
  { v: 250,  l: "250 ft — Strict In-Home" },
  { v: 500,  l: "500 ft — Standard Suburban" },
  { v: 1000, l: "1,000 ft — Medicaid Baseline" },
  { v: 2500, l: "2,500 ft — Community Outing" },
  { v: 5000, l: "5,000 ft — Rural / Open Campus" },
];

// ─── Geocoding helpers (preserved exactly) ───────────────────────────────────

import { geocodeAddress } from "@/lib/geocode";



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

// Layout route — renders child routes (e.g. /dashboard/clients/$clientId).
// The directory page lives at /dashboard/clients/ in dashboard.clients.index.tsx.
export const Route = createFileRoute("/dashboard/clients")({
  component: () => <Outlet />,
  errorComponent: ClientsError,
});

// ─── Clients Page ─────────────────────────────────────────────────────────────

export function ClientsPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [rosterTab, setRosterTab] = useState<"active" | "archived">("active");

  const { data: allClients = [], isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["clients", org?.organization_id],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, first_name, last_name, phone_number, physical_address, pcsp_goals, job_code, authorized_dspd_codes, medicaid_id, account_status, geofence_radius_feet, special_directions, date_of_birth, emergency_contact_name, emergency_contact_phone, is_own_guardian, guardian_name, guardian_phone, guardian_relationship, guardian_email, feature_config, profile_photo_url, intake_status")
        .eq("organization_id", org!.organization_id)
        .order("last_name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({
        ...c,
        job_code: (c.authorized_dspd_codes?.length ? c.authorized_dspd_codes : c.job_code) ?? [],
      })) as Client[];
    },
  });

  const clients = useMemo(
    () => allClients.filter((c) =>
      rosterTab === "archived"
        ? (c.account_status ?? "active") === "archived"
        : (c.account_status ?? "active") !== "archived",
    ),
    [allClients, rosterTab],
  );
  const archivedCount = useMemo(
    () => allClients.filter((c) => (c.account_status ?? "active") === "archived").length,
    [allClients],
  );

  const reactivateM = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await (supabase as any)
        .from("clients")
        .update({ account_status: "active" })
        .eq("id", clientId)
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      return clientId;
    },
    onSuccess: () => {
      toast.success("Client reactivated.");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Count of pending client subjects (not jobs) across the org — banner
  // language and link now point to the Pending Clients workspace so admins
  // can finish or discard them instead of routing into one job's done page.
  const { data: pendingClientCount = 0 } = useQuery({
    enabled: !!org,
    queryKey: ["clients-uncommitted-imports", org?.organization_id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase as any)
        .from("import_subjects")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org!.organization_id)
        .eq("subject_type", "client")
        .is("committed_at", null)
        .is("discarded_at", null);
      if (error) return 0;
      return count ?? 0;
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
      toast.success(mode === "intake" ? "Client created — starting intake." : "Draft client saved. Finish required fields when you're ready.");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setAddOpen(false);
      if (mode === "intake") {
        navigate({ to: "/dashboard/client-intake/$clientId", params: { clientId: id } });
      } else {
        // Land on the new client so the draft state (missing fields, intake_status=pending) is visible.
        navigate({ to: "/dashboard/clients/$clientId", params: { clientId: id }, search: { tab: "overview" } });
      }
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


  // ── Directory view ────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <OnboardingReturnBar />
      <OnboardingGuidanceBanner step={4} />

      {pendingClientCount > 0 && (
        <Link
          to="/dashboard/clients/pending"
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50/60 px-4 py-2.5 text-sm hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
        >
          <span className="flex items-center gap-2 text-amber-900 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            {pendingClientCount} imported client{pendingClientCount === 1 ? "" : "s"} need{pendingClientCount === 1 ? "s" : ""} finishing before {pendingClientCount === 1 ? "it joins" : "they join"} your directory.
          </span>
          <span className="font-medium text-amber-900 dark:text-amber-300">Review pending →</span>
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

      {/* Active / Archived tabs */}
      <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
        {(["active", "archived"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setRosterTab(t)}
            className={
              "rounded px-3 py-1 font-medium capitalize transition-colors " +
              (rosterTab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t}
            {t === "archived" && archivedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                {archivedCount}
              </span>
            )}
          </button>
        ))}
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
                      onClick={(e) => {
                        if (e.defaultPrevented) return;
                        const t = e.target as HTMLElement;
                        if (t.closest('a,button,input,select,textarea,[role="menuitem"],[role="menu"],[data-no-row-nav]')) return;
                        navigate({ to: "/dashboard/clients/$clientId", params: { clientId: c.id }, search: { tab: "overview" } });
                      }}
                    >
                      <TableCell className="font-semibold whitespace-nowrap p-0">
                        <Link
                          to="/dashboard/clients/$clientId"
                          params={{ clientId: c.id }}
                          search={{ tab: "overview" }}
                          className="flex items-center gap-2 px-4 py-2 w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        >
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {c.first_name?.[0] ?? ""}{c.last_name?.[0] ?? ""}
                          </span>
                          <span className="truncate">{c.first_name} {c.last_name}</span>
                        </Link>
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
                      <TableCell className="py-2 w-[110px]" data-no-row-nav onClick={(e) => e.stopPropagation()}>
                        <IntakeChip
                          organizationId={org?.organization_id}
                          clientId={c.id}
                          intakeStatus={c.intake_status}
                        />
                      </TableCell>
                      <TableCell className="text-right py-2 w-[220px]" data-no-row-nav onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
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

