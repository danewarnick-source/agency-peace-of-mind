// Client Profile Hub — admin view of "everything about this client".
//
// IA principle: records live ONCE (in their canonical tables); this hub
// SURFACES them filtered to a single client. Reuses existing queries — no
// new tables, no business-logic changes, no billing math, no EVV CSV.
//
// Tabs: Overview / Plan & goals / Billing codes / Shifts / Daily logs /
// Incidents / Summaries / Host-home cert / Deadlines / Documents.

import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { previewClientUpdateFromDocument, applySelectedClientFields } from "@/lib/import-checklist.functions";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClientDocumentsCard } from "@/components/clients/client-documents-card";
import { CaseloadEditor } from "@/components/clients/caseload-editor";
import { ClientProfileTab } from "@/components/clients/profile-tab";
import { SectionsView, ClientSpecificTrainingCard, GoalsEditor, PublishConfirmDialog } from "@/components/clients/client-specific-training-card";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Loader2, Pencil, RefreshCw, Sparkles, Trash2, Upload, UserCircle2 } from "lucide-react";
import { clientFeatureVisible } from "@/lib/client-features";
import {
  getClientSpecificTraining,
  getSupportStrategiesTraining,
  draftSupportStrategies,
  attachSupportStrategyDocument,
  updateClientSpecificTraining,
  publishClientSpecificTraining,
  extractPcspGoalsForTraining,
  draftClientSpecificTrainingBlank,
  createPersonCenteredProfile,
  type CSTContent,
  type CSTGoal,
  type CSTReviewQuestion,
} from "@/lib/client-specific-training.functions";

const search = z.object({
  tab: z
    .enum([
      "profile", "care", "activity", "funds", "files",
      // legacy deep-link values kept for backwards compat
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

// Map legacy deep-link tab values to the new five-tab model
function resolveTab(raw: string | undefined): "profile" | "care" | "activity" | "funds" | "files" {
  if (!raw) return "profile";
  if (raw === "profile" || raw === "overview") return "profile";
  if (raw === "care" || raw === "plan" || raw === "caseload") return "care";
  if (raw === "activity" || raw === "shifts" || raw === "logs" || raw === "incidents" || raw === "summaries" || raw === "hhcert" || raw === "deadlines") return "activity";
  if (raw === "funds" || raw === "codes") return "funds";
  if (raw === "files" || raw === "documents") return "files";
  return "profile";
}

function CollapsibleSimpleCard({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
            className="rounded p-1 hover:bg-muted"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}

function ClientProfileHub() {
  const { clientId } = Route.useParams();
  const { tab: rawTab } = Route.useSearch();
  const { data: org } = useCurrentOrg();
  const router = useRouter();
  const orgId = org?.organization_id;

  const activeTab = resolveTab(rawTab);

  const setTab = (t: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.navigate({ search: ((prev: Record<string, unknown>) => ({ ...prev, tab: t })) as any });
  };

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

  const disabilityCategory = client?.disability_category as string | null | undefined;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Back nav + client header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/dashboard/hub/clients" })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Client directory
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
      </div>

      {/* Tab navigation */}
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="care">Care</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="funds">Funds</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <UpdateInfoFromDocumentCard clientId={clientId} orgId={orgId} />
          <ClientProfileTab clientId={clientId} onOpenFiles={() => setTab("files")} />
        </TabsContent>

        <TabsContent value="care" className="space-y-4">
          <TrainingSetupBadge clientId={clientId} />
          <PlanGoalsPanel client={client} clientId={clientId} orgId={orgId} />
          <SupportStrategiesPanel client={client} clientId={clientId} orgId={orgId} />
          <CollapsibleSimpleCard title="Client-specific training">
            <ClientSpecificTrainingCard clientId={clientId} />
          </CollapsibleSimpleCard>
          <PersonCenteredProfilePanel clientId={clientId} orgId={orgId} />
          <CaseloadEditor clientId={clientId} />
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <ShiftsPanel clientId={clientId} orgId={orgId} />
          <DailyLogsPanel clientId={clientId} orgId={orgId} />
          <IncidentsPanel clientId={clientId} orgId={orgId} />
          <SummariesPanel clientId={clientId} orgId={orgId} client={client} />
          {isHostHome && <HostHomeCertPanel clientId={clientId} orgId={orgId} />}
          <DeadlinesPanel clientId={clientId} />
        </TabsContent>

        <TabsContent value="funds" className="space-y-4">
          <BillingCodesPanel clientId={clientId} />
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          <ClientDocumentsCard clientId={clientId} clientName={fullName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

type ClientRow = Record<string, unknown> | null | undefined;

function TrainingSetupBadge({ clientId }: { clientId: string }) {
  const getFn = useServerFn(getClientSpecificTraining);
  const getSS = useServerFn(getSupportStrategiesTraining);

  const { data: psData } = useQuery({
    queryKey: ["client-specific-training", clientId],
    queryFn: () => getFn({ data: { clientId } }),
    staleTime: 60_000,
  });
  const { data: ssData } = useQuery({
    queryKey: ["support-strategies-training", clientId],
    queryFn: () => getSS({ data: { clientId } }),
    staleTime: 60_000,
  });

  const psStatus = (psData?.training as { status?: string } | null)?.status;
  const ssStatus = (ssData?.training as { status?: string } | null)?.status;

  if (psStatus === "published" && ssStatus === "published") return null;

  const msgs: string[] = [];
  if (!psStatus) msgs.push("Person-specific: not set up");
  else if (psStatus !== "published") msgs.push("Person-specific: draft");
  if (!ssStatus) msgs.push("Support strategies: not set up");
  else if (ssStatus !== "published") msgs.push("Support strategies: draft");

  if (!msgs.length) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>Trainings need setup: {msgs.join(" · ")}</span>
    </div>
  );
}

function PlanGoalsPanel({ client, clientId, orgId }: { client: ClientRow; clientId: string; orgId?: string }) {
  const qc = useQueryClient();
  const codes = Array.isArray(client?.authorized_dspd_codes) ? (client!.authorized_dspd_codes as string[]) : [];
  const [editingCodes, setEditingCodes] = useState(false);
  const [codeDraft, setCodeDraft] = useState<string[]>(codes);
  const [addingCode, setAddingCode] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const getCST = useServerFn(getClientSpecificTraining);
  const extractFn = useServerFn(extractPcspGoalsForTraining);
  const updateCST = useServerFn(updateClientSpecificTraining);
  const draftBlankCST = useServerFn(draftClientSpecificTrainingBlank);
  const { data: cstData } = useQuery({
    queryKey: ["client-specific-training", clientId],
    queryFn: () => getCST({ data: { clientId } }),
    staleTime: 30_000,
  });
  const { data: planHasPcsp } = useQuery({
    queryKey: ["client-has-pcsp", clientId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("client_documents")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .ilike("document_type", "pcsp");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    staleTime: 30_000,
  });
  const extractedGoals = ((cstData?.training as { goals?: CSTGoal[] } | null)?.goals ?? []) as CSTGoal[];
  const goalIsIncomplete = (g: CSTGoal) => !g.supports?.trim() || !g.details?.trim();
  const missingLabel = (g: CSTGoal) => {
    const ms = !g.supports?.trim();
    const md = !g.details?.trim();
    if (ms && md) return "Needs supports & details";
    if (ms) return "Needs supports";
    if (md) return "Needs details";
    return "";
  };
  const incompleteCount = extractedGoals.filter(goalIsIncomplete).length;
  const [openGoal, setOpenGoal] = useState<string | number | null>(null);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draftGoals, setDraftGoals] = useState<CSTGoal[] | null>(null);

  const saveGoalsMut = useMutation({
    mutationFn: async () => {
      if (!draftGoals) throw new Error("No goals to save");
      let tid = (cstData?.training as { id?: string } | null)?.id;
      if (!tid) {
        const res = await draftBlankCST({ data: { clientId } });
        tid = (res?.training as { id?: string } | null)?.id;
        if (!tid) throw new Error("Could not create training record");
      }
      await updateCST({ data: { id: tid, goals: draftGoals } });
      const flat = draftGoals.map((g) => g.goal).filter((g): g is string => !!g && g.trim().length > 0);
      const { error } = await supabase.from("clients").update({ pcsp_goals: flat }).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Goals updated");
      setEditingGoals(false);
      setDraftGoals(null);
      qc.invalidateQueries({ queryKey: ["client-specific-training", clientId] });
      qc.invalidateQueries({ queryKey: ["client-profile", orgId, clientId] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save goals"),
  });

  function startManualEntry() {
    setDraftGoals([{ id: crypto.randomUUID(), goal: "", supports: "", details: "", job_codes: [] } as CSTGoal]);
    setEditingGoals(true);
  }


  const codesMut = useMutation({
    mutationFn: async () => {
      const cleaned = codeDraft.map((c) => c.trim().toUpperCase()).filter(Boolean);
      const { data, error } = await supabase
        .from("clients")
        .update({ authorized_dspd_codes: cleaned })
        .eq("id", clientId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Codes not saved — record not found or you don't have permission.");
      }
      return cleaned;
    },
    onSuccess: (cleaned) => {
      toast.success("DSPD codes saved");
      setCodeDraft(cleaned);
      setEditingCodes(false);
      qc.invalidateQueries({ queryKey: ["client-profile", orgId, clientId] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save codes"),
  });

  async function syncFlatGoals() {
    const res = await getCST({ data: { clientId } });
    const goals = ((res?.training as { goals?: CSTGoal[] } | null)?.goals ?? []) as CSTGoal[];
    const flat = goals.map((g) => g.goal).filter((g): g is string => !!g && g.trim().length > 0);
    await supabase.from("clients").update({ pcsp_goals: flat }).eq("id", clientId);
    qc.invalidateQueries({ queryKey: ["client-specific-training", clientId] });
    qc.invalidateQueries({ queryKey: ["client-profile", orgId, clientId] });
    qc.invalidateQueries({ queryKey: ["client", clientId] });
  }

  async function runExtract() {
    setBusy(true);
    try {
      const res = await extractFn({ data: { clientId } });
      if (!res?.ok) {
        toast.error(res?.reason ?? "Extraction failed");
        return;
      }
      toast.success(`Extracted ${res.goalCount} goals from the PCSP`);
      await syncFlatGoals();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePcspUpload(file: File) {
    if (!orgId) {
      toast.error("Organization not loaded");
      return;
    }
    setBusy(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${orgId}/${clientId}/pcsp/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("client_documents").insert({
        client_id: clientId,
        organization_id: orgId,
        document_type: "pcsp",
        file_name: file.name,
        file_url: path,
        storage_path: path,
      });
      if (insErr) throw insErr;
      // PCSP is one document shown in both Care and Files — refresh both.
      qc.invalidateQueries({ queryKey: ["client-docs", orgId, clientId] });
      qc.invalidateQueries({ queryKey: ["client-has-pcsp", clientId] });
      const res = await extractFn({ data: { clientId } });
      if (!res?.ok) {
        toast.error(res?.reason ?? "Extraction failed");
        return;
      }
      toast.success(`Extracted ${res.goalCount} goals from the PCSP`);
      await syncFlatGoals();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  if (!client) return <SkeletonCard />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PCSP goals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.txt,.doc"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handlePcspUpload(f);
              e.target.value = "";
            }}
          />
          {editingGoals ? (
            <div className="space-y-2">
              <GoalsEditor goals={draftGoals ?? []} onChange={setDraftGoals} />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditingGoals(false); setDraftGoals(null); }}
                  disabled={saveGoalsMut.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => saveGoalsMut.mutate()}
                  disabled={saveGoalsMut.isPending}
                  className="gap-1"
                >
                  {saveGoalsMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  Save goals
                </Button>
              </div>
            </div>
          ) : extractedGoals.length === 0 ? (
            <div className="space-y-2">
              {planHasPcsp ? (
                <p className="text-muted-foreground">
                  PCSP on file — pull goals from it, or add them manually.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  No goals yet — upload a PCSP so NECTAR can pull them, or add them manually.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {planHasPcsp ? (
                  <Button
                    type="button"
                    onClick={() => void runExtract()}
                    disabled={busy}
                    className="gap-2"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {busy ? "Extracting…" : "Extract goals from existing PCSP"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy || !orgId}
                    className="gap-2"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {busy ? "Extracting…" : "Upload PCSP & extract goals (NECTAR)"}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={startManualEntry}
                  disabled={busy}
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Add goals manually
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{extractedGoals.length} goals extracted from PCSP</p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => { setDraftGoals(structuredClone(extractedGoals)); setEditingGoals(true); }}
                    disabled={busy}
                    aria-label="Edit goals"
                    className="h-7 w-7"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void runExtract()}
                    disabled={busy}
                    className="gap-1"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Re-extract from PCSP
                  </Button>
                </div>
              </div>
              {incompleteCount > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {incompleteCount} of {extractedGoals.length} goals need supports or details — click the pencil to add them.
                </p>
              )}
              <ul className="space-y-2">
                {extractedGoals.map((g, i) => {
                  const key = g.id ?? i;
                  const isOpen = openGoal === key;
                  const incomplete = goalIsIncomplete(g);
                  return (
                    <li key={key} className="rounded-md border border-border p-2">
                      <button
                        type="button"
                        onClick={() => setOpenGoal(isOpen ? null : key)}
                        className="flex w-full items-start gap-2 text-left"
                        aria-expanded={isOpen}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        )}
                        <p className={isOpen ? "flex-1" : "flex-1 line-clamp-2"}>{g.goal}</p>
                      </button>
                      {(incomplete || (Array.isArray(g.job_codes) && g.job_codes.length > 0)) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1 pl-5">
                          {incomplete && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                              ⚠ {missingLabel(g)}
                            </span>
                          )}
                          {Array.isArray(g.job_codes) && g.job_codes.map((c, j) => (
                            <Badge key={`${c}-${j}`} variant="outline" className="text-[10px]">{c}</Badge>
                          ))}
                        </div>
                      )}
                      {isOpen && (
                        <div className="mt-2 space-y-1 pl-5 text-xs text-muted-foreground">
                          <p><span className="font-medium text-foreground">Supports:</span> {g.supports?.trim() ? g.supports : "—"}</p>
                          <p><span className="font-medium text-foreground">Details:</span> {g.details?.trim() ? g.details : "—"}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Authorized DSPD codes</CardTitle>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Edit codes"
            onClick={() => setEditingCodes((v) => !v)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </CardHeader>
        {editingCodes ? (
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {codeDraft.length === 0 ? (
                <span className="text-muted-foreground">None.</span>
              ) : codeDraft.map((c, i) => (
                <Badge key={`${c}-${i}`} variant="outline" className="gap-1">
                  {c}
                  <button
                    type="button"
                    aria-label={`Remove ${c}`}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                    onClick={() => setCodeDraft((d) => d.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add code…"
                value={addingCode}
                onChange={(e) => setAddingCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = addingCode.trim().toUpperCase();
                    if (v) {
                      setCodeDraft((d) => [...d, v]);
                      setAddingCode("");
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const v = addingCode.trim().toUpperCase();
                  if (!v) return;
                  setCodeDraft((d) => [...d, v]);
                  setAddingCode("");
                }}
                disabled={!addingCode.trim()}
              >
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => codesMut.mutate()}
                disabled={codesMut.isPending}
              >
                {codesMut.isPending ? "Saving…" : "Save codes"}
              </Button>
            </div>
          </CardContent>
        ) : (
          <CardContent className="flex flex-wrap gap-1.5 text-sm">
            {codes.length === 0 ? (
              <span className="text-muted-foreground">None.</span>
            ) : codes.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function isUploadDoc(content: CSTContent): boolean {
  const s = content?.sections ?? [];
  return s.length === 1 && s[0].items.length === 1 && s[0].items[0].kind === "link";
}

function SSStatusBadge({ status, version }: { status: string; version: number }) {
  if (status === "published") {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> Published v{version}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-amber-100 text-amber-800 border border-amber-200">
      Draft v{version}
    </Badge>
  );
}

function SupportStrategiesPanel({ clientId, orgId }: { client: ClientRow; clientId: string; orgId?: string }) {
  const qc = useQueryClient();
  const getSS = useServerFn(getSupportStrategiesTraining);
  const draftSS = useServerFn(draftSupportStrategies);
  const attachSS = useServerFn(attachSupportStrategyDocument);
  const updateFn = useServerFn(updateClientSpecificTraining);
  const publishFn = useServerFn(publishClientSpecificTraining);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState<CSTContent | null>(null);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [showPcspPrompt, setShowPcspPrompt] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);

  const { data: hasPcsp } = useQuery({
    queryKey: ["client-has-pcsp", clientId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("client_documents")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .ilike("document_type", "pcsp");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    staleTime: 30_000,
  });
  const pcspReady = hasPcsp === true;

  const queryKey = useMemo(() => ["support-strategies-training", clientId], [clientId]);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getSS({ data: { clientId } }),
  });

  type SSRow = {
    id: string; title: string; content: CSTContent;
    review_questions: CSTReviewQuestion[] | null;
    status: string; version: number;
    approved_by: string | null; approved_at: string | null; updated_at: string;
  };
  const training = (data?.training ?? null) as SSRow | null;

  const draftMut = useMutation({
    mutationFn: (mode: "nectar" | "blank" | "rebuild") => draftSS({ data: { clientId, mode } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setEditing(false);
      setDraftContent(null);
      toast.success("Support strategies draft ready.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: string; content: CSTContent }) => updateFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setEditing(false);
      setDraftContent(null);
      toast.success("Saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => publishFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success("Support strategies published."); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleFileUpload(file: File) {
    if (!orgId) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${orgId}/${clientId}/support-strategy/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      await attachSS({ data: { clientId, fileName: file.name, storagePath: path } });
      qc.invalidateQueries({ queryKey });
      toast.success("Document attached.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      className="hidden"
      accept=".pdf,.docx,.txt,.doc"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void handleFileUpload(file);
        e.target.value = "";
      }}
    />
  );

  if (isLoading) return <SkeletonCard />;

  const pcspDialog = (
    <Dialog open={showPcspPrompt} onOpenChange={setShowPcspPrompt}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Upload the PCSP first</DialogTitle>
          <DialogDescription>
            This client has no PCSP on file. Support strategies and client-specific training are built from the PCSP, so you'll need to upload it before drafting. Add it under the client's Files tab.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowPcspPrompt(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!training) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Support strategies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Support strategies are required for each PCSP goal (SOW §1.24). NECTAR pulls your goals verbatim; you write the staff instructions.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => pcspReady ? draftMut.mutate("nectar") : setShowPcspPrompt(true)} disabled={draftMut.isPending}>
                {draftMut.isPending
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />}
                Build from PCSP goals (NECTAR)
              </Button>
              <Button size="sm" variant="outline" onClick={() => pcspReady ? draftMut.mutate("blank") : setShowPcspPrompt(true)} disabled={draftMut.isPending}>
                Write manually
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => pcspReady ? fileInputRef.current?.click() : setShowPcspPrompt(true)}
                disabled={uploading || !orgId}
              >
                {uploading
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                Upload document
              </Button>
              {fileInput}
            </div>
          </CardContent>
        </Card>
        {pcspDialog}
      </>
    );
  }

  const content = training.content as CSTContent;

  if (isUploadDoc(content)) {
    const linkItem = content.sections[0].items[0];
    const fileName = linkItem.kind === "link" ? (linkItem.links[0]?.label ?? "document") : "document";
    return (
      <>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBodyOpen((v) => !v)}
                aria-label={bodyOpen ? "Collapse" : "Expand"}
                className="rounded p-1 hover:bg-muted"
              >
                {bodyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <CardTitle className="text-base">Support strategies</CardTitle>
            </div>
            <SSStatusBadge status={training.status} version={training.version} />
          </CardHeader>
          {bodyOpen && (
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
              <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground">Uploaded provider document</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {training.status !== "published" && (
                <Button size="sm" onClick={() => setShowPublishDialog(true)} disabled={publishMut.isPending}>
                  {publishMut.isPending
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  Approve & Publish
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading || !orgId}>
                {uploading
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                Replace
              </Button>
              {fileInput}
            </div>
          </CardContent>
          )}
        </Card>
        {pcspDialog}
        <PublishConfirmDialog
          open={showPublishDialog}
          onOpenChange={setShowPublishDialog}
          clientId={clientId}
          orgId={orgId}
          kindLabel="support strategies"
          isPublishing={publishMut.isPending}
          publishAsync={() => publishMut.mutateAsync(training.id)}
        />
      </>
    );
  }

  const workingContent: CSTContent = editing && draftContent ? draftContent : content;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBodyOpen((v) => !v)}
              aria-label={bodyOpen ? "Collapse" : "Expand"}
              className="rounded p-1 hover:bg-muted"
            >
              {bodyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <CardTitle className="text-base">Support strategies</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SSStatusBadge status={training.status} version={training.version} />
            {!editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => {
                  setDraftContent(structuredClone(content));
                  setEditing(true);
                }}>Edit</Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => {
                    if (!pcspReady) { setShowPcspPrompt(true); return; }
                    if (window.confirm("Rebuild from current PCSP goals? The existing draft will be replaced.")) {
                      draftMut.mutate("rebuild");
                    }
                  }}
                  disabled={draftMut.isPending}
                >
                  {draftMut.isPending
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                  Rebuild from goals
                </Button>
                {training.status !== "published" && (
                  <Button size="sm" onClick={() => setShowPublishDialog(true)} disabled={publishMut.isPending}>
                    {publishMut.isPending
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                    Approve & Publish
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraftContent(null); }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => { if (training && draftContent) updateMut.mutate({ id: training.id, content: draftContent }); }} disabled={updateMut.isPending}>
                  {updateMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        {bodyOpen && (
        <CardContent className="space-y-4">
          <SectionsView
            content={workingContent}
            editing={editing}
            onChange={setDraftContent}
          />
        </CardContent>
        )}
      </Card>
      {pcspDialog}
      <PublishConfirmDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
        clientId={clientId}
        orgId={orgId}
        kindLabel="support strategies"
        isPublishing={publishMut.isPending}
        publishAsync={() => publishMut.mutateAsync(training.id)}
      />
    </>
  );
}

function PersonCenteredProfilePanel({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createPersonCenteredProfile);
  const publishFn = useServerFn(publishClientSpecificTraining);
  const [showPublish, setShowPublish] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);

  const q = useQuery({
    queryKey: ["person-centered-profile", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_specific_trainings")
        .select("id, status, version, updated_at, approved_at, review_questions")
        .eq("client_id", clientId)
        .eq("training_type", "person_centered")
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; status: string; version: number; updated_at: string | null; approved_at: string | null; review_questions: Array<{ id: string; tab?: string; prompt: string }> | null } | null;
    },

  });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { clientId } }),
    onSuccess: () => {
      toast.success("Person-centered profile created");
      qc.invalidateQueries({ queryKey: ["person-centered-profile", clientId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create profile"),
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => publishFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Person-centered profile published");
      qc.invalidateQueries({ queryKey: ["person-centered-profile", clientId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to publish profile"),
  });

  const training = q.data;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBodyOpen((v) => !v)}
              aria-label={bodyOpen ? "Collapse" : "Expand"}
              className="rounded p-1 hover:bg-muted"
            >
              {bodyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <UserCircle2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Person-Centered Thinking</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {training && (
              <Badge variant={training.status === "published" ? "default" : "secondary"}>
                {training.status === "published" ? `Published v${training.version}` : "Draft"}
              </Badge>
            )}
            {!training && !q.isLoading && (
              <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Create profile
              </Button>
            )}
            {training && training.status !== "published" && (
              <Button size="sm" onClick={() => setShowPublish(true)} disabled={publishMut.isPending}>
                {publishMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Review & Publish
              </Button>
            )}

          </div>
        </CardHeader>
        {bodyOpen && (
          <CardContent className="text-sm text-muted-foreground">
            {q.isLoading ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</span>
            ) : !training ? (
              <p>
                A person-centered profile is completed by staff together with the client, capturing
                who they are and how they want to be supported. Create the profile to publish the
                10 standard questions for staff to complete.
              </p>
            ) : training.status === "published" ? (
              <p>
                Published{training.approved_at ? ` on ${new Date(training.approved_at).toLocaleDateString()}` : ""}.
                Staff can complete the profile from their client training list.
              </p>
            ) : (
              <p>
                Review the questions and publish to assign this profile to staff for completion with the person.
              </p>
            )}
          </CardContent>
        )}
      </Card>
      {training && (
        <PublishConfirmDialog
          open={showPublish}
          onOpenChange={setShowPublish}
          clientId={clientId}
          orgId={orgId}
          kindLabel="person-centered profile"
          isPublishing={publishMut.isPending}
          publishAsync={() => publishMut.mutateAsync(training.id)}
          questions={(training.review_questions ?? []).map((q) => ({ id: q.id, prompt: q.prompt }))}
        />
      )}

    </>
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

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent>
    </Card>
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

// ── Update info from document (review-then-apply) ──────────────────────
// Admin uploads a doc, NECTAR extracts proposed field updates, and admin
// reviews against current values before any write. Distinct from manual
// "edit" — this is bulk-from-document with explicit per-field approval.
type UpdateProposal = {
  field_key: string;
  label: string;
  incomingValue: string;
  currentValue: string | null;
  changed: boolean;
  confidence: number;
  field: {
    field_key: string;
    value_text?: string | null;
    value_number?: number | null;
    value_date?: string | null;
    value_bool?: boolean | null;
    value_array?: string[] | null;
    value_json?: unknown;
    confidence?: number | null;
  };
};

function UpdateInfoFromDocumentCard({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [documentType, setDocumentType] = useState<"pcsp" | "1056_budget" | "other">("pcsp");
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [proposals, setProposals] = useState<UpdateProposal[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const previewFn = useServerFn(previewClientUpdateFromDocument);
  const applyFn = useServerFn(applySelectedClientFields);

  const reset = () => {
    setProposals(null);
    setReason(null);
    setChecked({});
    setUploading(false);
    setPreviewing(false);
  };

  const onPickFile = async (file: File) => {
    if (!orgId) return;
    setReason(null);
    setProposals(null);
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const storagePath = `${orgId}/${clientId}/update/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("client-documents")
        .upload(storagePath, file, { upsert: false });
      if (upErr) throw upErr;
      setUploading(false);
      setPreviewing(true);
      const res = await previewFn({
        data: {
          clientId,
          documentType,
          fileName: file.name,
          storagePath,
        },
      });
      if (!res.ok) {
        setReason(res.reason);
      } else {
        setProposals(res.proposals);
        const init: Record<string, boolean> = {};
        for (const p of res.proposals) {
          init[p.field_key] = p.changed && !!p.incomingValue;
        }
        setChecked(init);
      }
    } catch (e) {
      setReason((e as Error).message || "Upload or extraction failed.");
    } finally {
      setUploading(false);
      setPreviewing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const applyMut = useMutation({
    mutationFn: async () => {
      if (!proposals) return { appliedCount: 0 } as { appliedCount: number };
      const fields = proposals
        .filter((p) => checked[p.field_key])
        .map((p) => p.field);
      if (!fields.length) return { appliedCount: 0 } as { appliedCount: number };
      return applyFn({ data: { clientId, fields } });
    },
    onSuccess: (res) => {
      const n = (res as { appliedCount?: number })?.appliedCount ?? 0;
      toast.success(n > 0 ? `Profile updated (${n} fields applied)` : "Nothing selected");
      qc.invalidateQueries({ queryKey: ["client-profile", orgId, clientId] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      setOpen(false);
      reset();
    },
    onError: (e: unknown) => toast.error((e as Error).message || "Failed to apply updates"),
  });

  const selectedCount = proposals
    ? proposals.filter((p) => checked[p.field_key]).length
    : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Update info from document</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a PCSP, 1056, or intake document and review NECTAR's proposed changes before applying.
          </p>
        </div>
        <Button size="sm" onClick={() => { reset(); setOpen(true); }} disabled={!orgId}>
          <Upload className="h-4 w-4 mr-1" /> Update info from document (NECTAR)
        </Button>
      </CardHeader>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update client info from document</DialogTitle>
            <DialogDescription>
              NECTAR extracts proposed updates. Nothing is written to the client until you click "Apply selected".
            </DialogDescription>
          </DialogHeader>

          {!proposals && !reason && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Document type</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 text-sm bg-background"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as typeof documentType)}
                  disabled={uploading || previewing}
                >
                  <option value="pcsp">PCSP</option>
                  <option value="1056_budget">1056</option>
                  <option value="other">Intake / other</option>
                </select>
              </div>
              <div className="rounded-md border border-dashed p-6 text-center">
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onPickFile(f);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || previewing || !orgId}
                >
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading…</>
                  ) : previewing ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Extracting…</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-1" /> Choose document</>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">PDF, DOCX, or TXT</p>
              </div>
            </div>
          )}

          {reason && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>{reason}</div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setReason(null); }}>Try another file</Button>
                <Button size="sm" onClick={() => { setOpen(false); reset(); }}>Close</Button>
              </div>
            </div>
          )}

          {proposals && (
            <div className="space-y-3">
              {proposals.length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  NECTAR didn't find any profile fields to update from this document.
                </div>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground">
                    Review proposed changes. Pre-checked rows are fields where the document differs from the current value. Untick anything you don't want applied.
                  </div>
                  <div className="border rounded-md divide-y max-h-[50vh] overflow-y-auto">
                    {proposals.map((p) => (
                      <label
                        key={p.field_key}
                        className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/40 ${p.changed ? "bg-amber-50/50" : ""}`}
                      >
                        <Checkbox
                          className="mt-1"
                          checked={!!checked[p.field_key]}
                          onCheckedChange={(v) =>
                            setChecked((c) => ({ ...c, [p.field_key]: v === true }))
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{p.label}</span>
                            {p.changed ? (
                              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">changed</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">unchanged</Badge>
                            )}
                          </div>
                          <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div>
                              <div className="text-muted-foreground">Current</div>
                              <div className="break-words">{p.currentValue ?? <span className="text-muted-foreground">—</span>}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">From document</div>
                              <div className="break-words">{p.incomingValue}</div>
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={() => applyMut.mutate()}
                  disabled={applyMut.isPending || selectedCount === 0}
                >
                  {applyMut.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Applying…</>
                  ) : (
                    <>Apply selected ({selectedCount})</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
