// Client Profile Hub — admin view of "everything about this client".
//
// IA principle: records live ONCE (in their canonical tables); this hub
// SURFACES them filtered to a single client. Reuses existing queries — no
// new tables, no business-logic changes, no billing math, no EVV CSV.
//
// Tabs: Overview / Plan & goals / Billing codes / Shifts / Daily logs /
// Incidents / Summaries / Host-home cert / Deadlines / Documents.

import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClientDocumentsCard } from "@/components/clients/client-documents-card";
import { CaseloadEditor } from "@/components/clients/caseload-editor";
import { FinishOnboardingCard } from "@/components/clients/finish-onboarding-card";
import { ClientReadinessCard } from "@/components/clients/client-readiness-card";
import { TrackedFieldsCard } from "@/components/clients/tracked-fields-card";
import {
  ArrowLeft, User, FileText, ClipboardList, Clock, AlertTriangle,
  Stethoscope, HomeIcon, CalendarClock, FolderOpen, Sparkles, Pencil, Users, Trash2,
  Phone,
} from "lucide-react";
import { saveAdminHours } from "@/lib/scheduler/scheduler.functions";
import { clientFeatureVisible } from "@/lib/client-features";

const search = z.object({
  tab: z
    .enum([
      "overview", "plan", "codes", "caseload", "shifts", "logs", "incidents",
      "summaries", "hhcert", "deadlines", "documents",
    ])
    .optional(),
});

export const Route = createFileRoute("/dashboard/clients/$clientId")({
  head: () => ({ meta: [{ title: "Client Profile — HIVE" }] }),
  validateSearch: search,
  component: () => (
    <RequirePermission perm="manage_users">
      <ClientProfileHub />
    </RequirePermission>
  ),
});

function ClientProfileHub() {
  const { clientId } = Route.useParams();
  const { tab } = Route.useSearch();
  const { data: org } = useCurrentOrg();
  const router = useRouter();
  const orgId = org?.organization_id;

  const clientQ = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, phone_number, physical_address, date_of_birth, medicaid_id, account_status, authorized_dspd_codes, pcsp_goals, job_code, special_directions, emergency_contact_name, emergency_contact_phone, emergency_contact_instructions, emergency_contact_2_name, emergency_contact_2_phone, emergency_contact_2_instructions, level_of_need, form_1056_number, form_1056_approved_date, grievance_acknowledged, grievance_signed_date, rights_restrictions, dnr_status, dnr_location, polst_status, palliative_care_status, hospice_status, team_id, admin_hours_per_week, feature_config, support_coordinator_name, support_coordinator_email, support_coordinator_phone, disability_category, bsp_status, diagnoses, advanced_directives, admission_date, discharge_date" as any)
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const client = clientQ.data;
  const fullName = client
    ? `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "—"
    : "Loading…";
  // Code-driven feature visibility. Derived per-render from
  // authorized_dspd_codes so plan edits re-evaluate without caching.
  const codes: string[] = Array.isArray(client?.job_code)
    ? (client?.job_code as string[])
    : Array.isArray(client?.authorized_dspd_codes)
    ? (client?.authorized_dspd_codes as string[])
    : [];
  const featureClient = client
    ? {
        feature_config: (client.feature_config as Record<string, boolean> | null) ?? null,
        authorized_dspd_codes: codes,
      }
    : null;
  const isHostHome = clientFeatureVisible(featureClient, "host_home");
  const showBehavior = clientFeatureVisible(featureClient, "behavior");



  const disabilityCategory = client?.disability_category as string | null | undefined;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/hub/clients" })}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Clients
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{fullName}</h1>
          <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
            {client?.medicaid_id ? <span>Medicaid #{String(client.medicaid_id)}</span> : null}
            {client?.account_status ? <Badge variant="outline">{String(client.account_status)}</Badge> : null}
            {isHostHome ? <Badge variant="secondary">Host home</Badge> : null}
            {disabilityCategory === "ABI" && <Badge className="bg-amber-100 text-amber-800 border border-amber-200">ABI</Badge>}
            {disabilityCategory === "ID-RC" && <Badge variant="outline">ID/RC</Badge>}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/clients">
            <Pencil className="h-4 w-4 mr-1" /> Edit in directory
          </Link>
        </Button>
      </div>

      <ClientReadinessCard clientId={clientId} />
      <FinishOnboardingCard clientId={clientId} />

      <Tabs value={tab ?? "overview"} className="w-full">
        <TabsList className="flex w-full flex-wrap h-auto justify-start">
          <TabTrigger value="overview" icon={<User className="h-3.5 w-3.5" />} label="Overview" clientId={clientId} />
          <TabTrigger value="plan" icon={<Sparkles className="h-3.5 w-3.5" />} label="Plan & goals" clientId={clientId} />
          <TabTrigger value="codes" icon={<FileText className="h-3.5 w-3.5" />} label="Billing codes" clientId={clientId} />
          <TabTrigger value="caseload" icon={<Users className="h-3.5 w-3.5" />} label="Caseload" clientId={clientId} />
          <TabTrigger value="shifts" icon={<Clock className="h-3.5 w-3.5" />} label="Shifts" clientId={clientId} />
          <TabTrigger value="logs" icon={<ClipboardList className="h-3.5 w-3.5" />} label="Daily logs" clientId={clientId} />
          <TabTrigger value="incidents" icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Incidents" clientId={clientId} />
          <TabTrigger value="summaries" icon={<Stethoscope className="h-3.5 w-3.5" />} label="Summaries" clientId={clientId} />
          {isHostHome ? (
            <TabTrigger value="hhcert" icon={<HomeIcon className="h-3.5 w-3.5" />} label="Host-home cert" clientId={clientId} />
          ) : null}
          <TabTrigger value="deadlines" icon={<CalendarClock className="h-3.5 w-3.5" />} label="Deadlines" clientId={clientId} />
          <TabTrigger value="documents" icon={<FolderOpen className="h-3.5 w-3.5" />} label="Documents" clientId={clientId} />
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewPanel client={client} clientId={clientId} isHostHome={isHostHome} showBehavior={showBehavior} orgId={orgId} />
        </TabsContent>
        <TabsContent value="plan" className="mt-6">
          <PlanGoalsPanel client={client} clientId={clientId} orgId={orgId} />
        </TabsContent>
        <TabsContent value="codes" className="mt-6">
          <BillingCodesPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="caseload" className="mt-6">
          <CaseloadEditor clientId={clientId} />
        </TabsContent>
        <TabsContent value="shifts" className="mt-6">
          <ShiftsPanel clientId={clientId} orgId={orgId} />
        </TabsContent>
        <TabsContent value="logs" className="mt-6">
          <DailyLogsPanel clientId={clientId} orgId={orgId} />
        </TabsContent>
        <TabsContent value="incidents" className="mt-6">
          <IncidentsPanel clientId={clientId} orgId={orgId} />
        </TabsContent>
        <TabsContent value="summaries" className="mt-6">
          <SummariesPanel clientId={clientId} orgId={orgId} client={client} />
        </TabsContent>
        {isHostHome ? (
          <TabsContent value="hhcert" className="mt-6">
            <HostHomeCertPanel clientId={clientId} orgId={orgId} />
          </TabsContent>
        ) : null}
        <TabsContent value="deadlines" className="mt-6">
          <DeadlinesPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="documents" className="mt-6">
          <ClientDocumentsCard clientId={clientId} clientName={fullName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabTrigger({
  value, icon, label, clientId,
}: { value: string; icon: React.ReactNode; label: string; clientId: string }) {
  return (
    <TabsTrigger value={value} asChild>
      <Link
        to="/dashboard/clients/$clientId"
        params={{ clientId }}
        search={{ tab: value } as never}
        className="flex items-center gap-1.5"
      >
        {icon}
        {label}
      </Link>
    </TabsTrigger>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

type ClientRow = Record<string, unknown> | null | undefined;

function OverviewPanel({ client, clientId, isHostHome, showBehavior, orgId }: { client: ClientRow; clientId: string; isHostHome: boolean; showBehavior: boolean; orgId?: string }) {
  if (!client) return <SkeletonCard />;

  const scName = client.support_coordinator_name as string | null | undefined;
  const scEmail = client.support_coordinator_email as string | null | undefined;
  const scPhone = client.support_coordinator_phone as string | null | undefined;
  const hasCoordinator = !!(scName || scEmail || scPhone);

  const diagnoses = Array.isArray(client.diagnoses)
    ? (client.diagnoses as string[]).join(", ")
    : (client.diagnoses as string | null | undefined) ?? null;
  const advancedDirectives = client.advanced_directives;
  const advancedDirectivesLabel =
    advancedDirectives === true ? "Yes" : advancedDirectives === false ? "No" : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <Field label="Phone" value={client.phone_number as string | null} />
          <Field label="Address" value={client.physical_address as string | null} />
          <Field label="Date of birth" value={client.date_of_birth as string | null} />
          <Field label="Admission" value={client.admission_date as string | null | undefined} />
          <Field label="Discharge" value={client.discharge_date as string | null | undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            Support Coordinator
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {hasCoordinator ? (
            <>
              <Field label="Name" value={scName ?? null} />
              <Field label="Phone" value={scPhone ?? null} />
              <Field label="Email" value={scEmail ?? null} />
            </>
          ) : (
            <span className="text-muted-foreground">No support coordinator on file.</span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Emergency contacts</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary</div>
            <Field label="Name" value={client.emergency_contact_name as string | null} />
            <Field label="Phone" value={client.emergency_contact_phone as string | null} />
            <Field label="How to reach" value={(client.emergency_contact_instructions as string | null) ?? null} />
          </div>
          {Boolean(client.emergency_contact_2_name || client.emergency_contact_2_phone) && (
            <div className="space-y-1 border-t border-border pt-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Secondary</div>
              <Field label="Name" value={client.emergency_contact_2_name as string | null} />
              <Field label="Phone" value={client.emergency_contact_2_phone as string | null} />
              <Field label="How to reach" value={(client.emergency_contact_2_instructions as string | null) ?? null} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">DSPD / SOW</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <Field label="Level of need" value={(client.level_of_need as string | null) ?? null} />
          <Field label="1056 number" value={(client.form_1056_number as string | null) ?? null} />
          <Field label="1056 approved" value={(client.form_1056_approved_date as string | null) ?? null} />
          <Field
            label="Grievance acknowledged"
            value={
              client.grievance_acknowledged === true
                ? `Yes${client.grievance_signed_date ? ` · ${client.grievance_signed_date}` : ""}`
                : client.grievance_acknowledged === false
                  ? "No"
                  : null
            }
          />
          <Field
            label="Rights restrictions"
            value={
              Array.isArray(client.rights_restrictions) && (client.rights_restrictions as string[]).length
                ? (client.rights_restrictions as string[]).join(", ")
                : null
            }
          />
        </CardContent>
      </Card>

      {(client.dnr_status || client.polst_status || client.palliative_care_status || client.hospice_status) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Advanced care / end-of-life</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {client.dnr_status && client.dnr_status !== "none" && (
              <>
                <Field label="DNR" value={client.dnr_status as string} />
                <Field label="DNR kept at" value={(client.dnr_location as string | null) ?? null} />
              </>
            )}
            {client.polst_status && client.polst_status !== "none" && (
              <Field label="POLST" value={client.polst_status as string} />
            )}
            {client.palliative_care_status && client.palliative_care_status !== "none" && (
              <Field label="Palliative care" value={client.palliative_care_status as string} />
            )}
            {client.hospice_status && client.hospice_status !== "none" && (
              <Field label="Hospice" value={client.hospice_status as string} />
            )}
          </CardContent>
        </Card>
      )}


      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
            Clinical
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <Field label="Disability category" value={(client.disability_category as string | null | undefined) ?? null} />
          <Field label="BSP status" value={(client.bsp_status as string | null | undefined) ?? null} />
          <Field label="Diagnoses" value={diagnoses} />
          <Field label="Adv. directives" value={advancedDirectivesLabel} />
        </CardContent>
      </Card>

      {isHostHome && (
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Administrative hours</CardTitle></CardHeader>
          <CardContent>
            <AdminHoursCard clientId={clientId} orgId={orgId} client={client} />
          </CardContent>
        </Card>
      )}
      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-base">Special directions</CardTitle></CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap">
          {(client.special_directions as string) || <span className="text-muted-foreground">None recorded.</span>}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-base">Quick links</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <QuickLink to="/dashboard/billing/$clientId" params={{ clientId }} label="Billing detail" />
          <QuickLink to="/dashboard/client-intake/$clientId" params={{ clientId }} label="Intake checklist" />
          {isHostHome && <QuickLink to="/dashboard/hhs-hub/$clientId" params={{ clientId }} label="HHS hub" />}
          {showBehavior && <QuickLink to="/dashboard/behavior-support/$clientId" params={{ clientId }} label="Behavior support" />}
          <QuickLink to="/dashboard/client-training/$clientId" params={{ clientId }} label="Client-specific training" />

        </CardContent>
      </Card>
      <div className="md:col-span-2">
        <TrackedFieldsCard clientId={clientId} />
      </div>
    </div>
  );
}

function AdminHoursCard({ clientId, orgId, client }: { clientId: string; orgId?: string; client: ClientRow }) {
  const qc = useQueryClient();
  const save = useServerFn(saveAdminHours);
  const current: number | null = typeof client?.admin_hours_per_week === "number" ? client.admin_hours_per_week as number : null;
  const [val, setVal] = useState<string>(current != null ? String(current) : "");

  const saveMut = useMutation({
    mutationFn: (hours: number | null) => {
      if (!orgId) throw new Error("No organization");
      return (save as any)({ data: { organization_id: orgId, client_id: clientId, hours } });
    },
    onSuccess: () => {
      toast.success("Administrative hours updated.");
      qc.invalidateQueries({ queryKey: ["client-profile"] });
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trimmed = val.trim();
  const parsed: number | null = trimmed === "" ? null : Number(trimmed);
  const isValid = parsed === null || (Number.isFinite(parsed) && parsed >= 0 && parsed <= 168);

  return (
    <div className="space-y-3 max-w-sm">
      <p className="text-sm text-muted-foreground">
        Set the weekly administrative hours for this host-home client. Clients with administrative hours (&gt; 0) appear in the scheduler's admin-hours flow. HHS direct care is daily-rate and is not scheduled here.
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={168}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="e.g. 10"
          className="w-28 text-center"
        />
        <span className="text-sm text-muted-foreground">hrs / week</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => saveMut.mutate(parsed)}
          disabled={saveMut.isPending || !isValid || !orgId}
        >
          {saveMut.isPending ? "Saving…" : "Save"}
        </Button>
        {(current != null && current > 0) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setVal(""); saveMut.mutate(null); }}
            disabled={saveMut.isPending || !orgId}
          >
            Clear
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {(current != null && current > 0)
          ? `Currently ${current} hrs/week — this client appears in the admin-hours scheduling flow.`
          : "Not currently scheduled for administrative hours."}
      </p>
    </div>
  );
}

function PlanGoalsPanel({ client, clientId, orgId }: { client: ClientRow; clientId: string; orgId?: string }) {
  const qc = useQueryClient();
  const initial = Array.isArray(client?.pcsp_goals) ? (client!.pcsp_goals as string[]) : [];
  const [draft, setDraft] = useState<string[]>(initial);
  const [adding, setAdding] = useState("");
  const [dirty, setDirty] = useState(false);
  const codes = Array.isArray(client?.authorized_dspd_codes) ? (client!.authorized_dspd_codes as string[]) : [];

  const saveMut = useMutation({
    mutationFn: async () => {
      const cleaned = draft.map((g) => g.trim()).filter((g) => g.length > 0);
      const { data, error } = await supabase
        .from("clients")
        .update({ pcsp_goals: cleaned })
        .eq("id", clientId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Goals not saved — record not found or you don't have permission.");
      }
      return cleaned;
    },
    onSuccess: (cleaned) => {
      toast.success("PCSP goals saved");
      setDraft(cleaned);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["client-profile", orgId, clientId] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save goals"),
  });

  const updateAt = (i: number, val: string) => {
    setDraft((d) => d.map((g, idx) => (idx === i ? val : g)));
    setDirty(true);
  };
  const removeAt = (i: number) => {
    setDraft((d) => d.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const addGoal = () => {
    const v = adding.trim();
    if (!v) return;
    setDraft((d) => [...d, v]);
    setAdding("");
    setDirty(true);
  };

  if (!client) return <SkeletonCard />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">PCSP goals</CardTitle>
          <Button
            size="sm"
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
          >
            {saveMut.isPending ? "Saving…" : "Save goals"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {draft.length === 0 ? (
            <p className="text-muted-foreground">No goals yet — add one below.</p>
          ) : (
            <ul className="space-y-2">
              {draft.map((g, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <textarea
                    className="flex-1 min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={g}
                    onChange={(e) => updateAt(i, e.target.value)}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeAt(i)}
                    aria-label="Remove goal"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 pt-2 border-t">
            <Input
              placeholder="Add a PCSP goal…"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addGoal();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addGoal} disabled={!adding.trim()}>
              Add goal
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Authorized DSPD codes</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-1.5 text-sm">
          {codes.length === 0 ? (
            <span className="text-muted-foreground">None.</span>
          ) : codes.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
        </CardContent>
      </Card>
    </div>
  );
}

function BillingCodesPanel({ clientId }: { clientId: string }) {
  const q = useQuery({
    queryKey: ["client-profile-codes", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("id, service_code, annual_unit_authorization, weekly_cap_units, monthly_max_units, unit_type, rate_per_unit, service_start_date, service_end_date")
        .eq("client_id", clientId)
        .order("service_start_date", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Billing authorizations (1056)</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/billing/$clientId" params={{ clientId }}>Open billing detail</Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No billing codes authorized."
          rows={q.data ?? []}
          columns={[
            { header: "Code", cell: (r) => <code className="font-mono">{r.service_code}</code> },
            { header: "Unit", cell: (r) => r.unit_type ?? "—" },
            { header: "Annual auth", cell: (r) => r.annual_unit_authorization ?? "—" },
            { header: "Rate", cell: (r) => (r.rate_per_unit != null ? `$${Number(r.rate_per_unit).toFixed(2)}` : "—") },
            { header: "Effective", cell: (r) => `${r.service_start_date ?? "—"} → ${r.service_end_date ?? "open"}` },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function ShiftsPanel({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-shifts", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("id, service_type_code, status, clock_in_timestamp, clock_out_timestamp, staff_id, billed_units")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("clock_in_timestamp", { ascending: false })
        .limit(200);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Recent shifts (last 200)</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No shifts recorded for this client."
          rows={q.data ?? []}
          columns={[
            { header: "Date", cell: (r) => r.clock_in_timestamp ? new Date(r.clock_in_timestamp).toLocaleDateString() : "—" },
            { header: "Code", cell: (r) => <code className="font-mono">{r.service_type_code ?? "—"}</code> },
            { header: "Status", cell: (r) => <Badge variant="outline">{r.status ?? "—"}</Badge> },
            { header: "Units", cell: (r) => r.billed_units ?? "—" },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function DailyLogsPanel({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-logs", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_logs")
        .select("id, log_date, status, narrative, submitted_at")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("log_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Daily logs (last 100)</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No daily logs recorded."
          rows={q.data ?? []}
          columns={[
            { header: "Date", cell: (r) => r.log_date ?? "—" },
            { header: "Status", cell: (r) => <Badge variant="outline">{r.status ?? "—"}</Badge> },
            { header: "Submitted", cell: (r) => r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—" },
            { header: "Narrative", cell: (r) => <span className="line-clamp-2 max-w-md">{r.narrative ?? "—"}</span> },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function IncidentsPanel({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-incidents", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_reports")
        .select("id, incident_date, incident_types, status, is_abuse_neglect, is_fatality, report_number")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("incident_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Incidents</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No incidents recorded."
          rows={q.data ?? []}
          columns={[
            { header: "Date", cell: (r) => r.incident_date ?? "—" },
            { header: "Report #", cell: (r) => <code className="font-mono text-xs">{r.report_number ?? "—"}</code> },
            { header: "Types", cell: (r) => Array.isArray(r.incident_types) ? (r.incident_types as string[]).join(", ") || "—" : "—" },
            {
              header: "Flags",
              cell: (r) => (
                <div className="flex gap-1">
                  {r.is_abuse_neglect ? <Badge variant="destructive">A/N</Badge> : null}
                  {r.is_fatality ? <Badge variant="destructive">Fatality</Badge> : null}
                  {!r.is_abuse_neglect && !r.is_fatality ? "—" : null}
                </div>
              ),
            },
            { header: "Status", cell: (r) => <Badge variant="outline">{r.status ?? "—"}</Badge> },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function SummariesPanel({ clientId, orgId, client }: { clientId: string; orgId?: string; client: ClientRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-summaries", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_progress_summaries")
        .select("id, summary_kind, period_kind, period_label, period_start, period_end, status, finalized_at, due_date")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("period_end", { ascending: false })
        .limit(60);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });

  const codes = Array.isArray(client?.authorized_dspd_codes)
    ? (client!.authorized_dspd_codes as string[])
    : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Progress summaries</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          New summary
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No progress summaries on file."
          rows={q.data ?? []}
          columns={[
            { header: "Kind", cell: (r) => <Badge variant="outline">{r.summary_kind ?? "—"}</Badge> },
            { header: "Cadence", cell: (r) => r.period_kind ?? "—" },
            { header: "Period", cell: (r) => r.period_label ?? `${r.period_start ?? "—"} → ${r.period_end ?? "—"}` },
            { header: "Status", cell: (r) => r.status ?? "—" },
            { header: "Finalized", cell: (r) => r.finalized_at ? new Date(r.finalized_at).toLocaleDateString() : "—" },
            {
              header: "",
              cell: (r) => (
                <Button asChild size="sm" variant="outline">
                  <Link to="/dashboard/summaries" search={{ open: r.id }}>
                    {r.status === "finalized" ? "View" : "Open editor"}
                  </Link>
                </Button>
              ),
            },
          ]}
        />
      </CardContent>
      {open ? (
        <NewSummaryDialog
          clientId={clientId}
          orgId={orgId!}
          serviceCodes={codes}
          onClose={() => setOpen(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["client-profile-summaries", orgId, clientId] });
            qc.invalidateQueries({ queryKey: ["deadlines", "summaries", orgId] });
            setOpen(false);
          }}
        />
      ) : null}
    </Card>
  );
}

function NewSummaryDialog({
  clientId, orgId, serviceCodes, onClose, onCreated,
}: {
  clientId: string;
  orgId: string;
  serviceCodes: string[];
  onClose: () => void;
  onCreated: (summaryId: string) => void;
}) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const defaultQuarter = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  const [periodKind, setPeriodKind] = useState<"monthly" | "quarterly">("quarterly");
  const [month, setMonth] = useState(defaultMonth);
  const [quarter, setQuarter] = useState(defaultQuarter);
  const [summaryKind, setSummaryKind] = useState<"narrative" | "financial_statement">("narrative");
  const [requiresUpi, setRequiresUpi] = useState(false);
  const [saving, setSaving] = useState(false);

  const computePeriod = () => {
    if (periodKind === "monthly") {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0));
      const due = new Date(Date.UTC(y, m, 15));
      return {
        period_label: month,
        period_start: start.toISOString().slice(0, 10),
        period_end: end.toISOString().slice(0, 10),
        due_date: due.toISOString().slice(0, 10),
      };
    }
    const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
    if (!match) throw new Error("Invalid quarter (use YYYY-Q1..Q4)");
    const y = Number(match[1]);
    const qIdx = Number(match[2]) - 1;
    const startMonth = qIdx * 3;
    const start = new Date(Date.UTC(y, startMonth, 1));
    const end = new Date(Date.UTC(y, startMonth + 3, 0));
    // Quarter due 15 days after quarter end
    const due = new Date(end);
    due.setUTCDate(due.getUTCDate() + 15);
    return {
      period_label: `${y}-Q${qIdx + 1}`,
      period_start: start.toISOString().slice(0, 10),
      period_end: end.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
    };
  };

  const submit = async () => {
    setSaving(true);
    try {
      const p = computePeriod();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("client_progress_summaries")
        .insert({
          organization_id: orgId,
          client_id: clientId,
          summary_kind: summaryKind,
          period_kind: periodKind,
          period_label: p.period_label,
          period_start: p.period_start,
          period_end: p.period_end,
          due_date: p.due_date,
          status: "pending",
          service_codes: serviceCodes,
          include_goal_progress: summaryKind === "narrative",
          requires_upi_attestation: requiresUpi,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error("Summary not created — record not returned.");
      toast.success("Summary created — open the editor to draft.");
      onCreated(data.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create summary";
      if (/duplicate|unique/i.test(msg)) {
        toast.error("A summary for that period already exists.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-semibold">New progress summary</h3>
          <p className="text-xs text-muted-foreground">Creates a draft row; open the editor to pre-fill from logs and finalize.</p>
        </div>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs font-medium">Cadence</span>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={periodKind}
                onChange={(e) => setPeriodKind(e.target.value as "monthly" | "quarterly")}
              >
                <option value="quarterly">Quarterly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium">Kind</span>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={summaryKind}
                onChange={(e) => setSummaryKind(e.target.value as "narrative" | "financial_statement")}
              >
                <option value="narrative">Narrative (progress)</option>
                <option value="financial_statement">Financial statement</option>
              </select>
            </label>
          </div>
          {periodKind === "monthly" ? (
            <label className="block space-y-1">
              <span className="text-xs font-medium">Month</span>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </label>
          ) : (
            <label className="block space-y-1">
              <span className="text-xs font-medium">Quarter (YYYY-Q#)</span>
              <Input value={quarter} onChange={(e) => setQuarter(e.target.value)} placeholder="2026-Q1" />
            </label>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={requiresUpi}
              onChange={(e) => setRequiresUpi(e.target.checked)}
            />
            Requires UPI attestation (SEI)
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create draft"}</Button>
        </div>
      </div>
    </div>
  );
}


function HostHomeCertPanel({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-hhcert", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_home_certifications")
        .select("id, inspection_date, next_due_date, determination, inspector_name, cert_type")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("inspection_date", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Host-home certifications</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No host-home certifications on file."
          rows={q.data ?? []}
          columns={[
            { header: "Inspection", cell: (r) => r.inspection_date ?? "—" },
            { header: "Cert type", cell: (r) => r.cert_type ?? "—" },
            { header: "Next due", cell: (r) => r.next_due_date ?? "—" },
            { header: "Determination", cell: (r) => <Badge variant="outline">{r.determination ?? "—"}</Badge> },
            { header: "Inspector", cell: (r) => r.inspector_name ?? "—" },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function DeadlinesPanel({ clientId }: { clientId: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Deadlines</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Client-scoped deadlines are tracked centrally. Open the deadlines desk and filter by this client.{" "}
        <Link className="underline" to="/dashboard/deadlines" search={{ client: clientId }}>
          Open deadlines →
        </Link>
      </CardContent>
    </Card>
  );
}


// ─── Tiny shared bits ─────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-28 shrink-0">{label}:</span>
      <span>{value || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent>
    </Card>
  );
}

function QuickLink<T extends Record<string, string>>({
  to, params, label,
}: { to: string; params: T; label: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Link to={to as any} params={params as any}>{label}</Link>
    </Button>
  );
}

type Col<R> = { header: string; cell: (row: R) => React.ReactNode };
function ReadOnlyTable<R extends Record<string, unknown>>({
  rows, columns, loading, empty,
}: { rows: R[]; columns: Col<R>[]; loading?: boolean; empty: string }) {
  if (loading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!rows.length) {
    return <div className="py-10 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => <TableHead key={c.header}>{c.header}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={(r.id as string) ?? i}>
              {columns.map((c) => <TableCell key={c.header}>{c.cell(r)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
