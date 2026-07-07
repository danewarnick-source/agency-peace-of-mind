import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Sparkles, Upload, ShieldCheck,
  UserCheck, FilePlus, FileQuestion, Pencil, Loader2, Users, ChevronRight,
  Link2, Inbox, Info, Send,
} from "lucide-react";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  getReviewJob, getReviewSubject, editExtractedField, setSubjectDecision,
  setSubjectReady, upsertCertDocument, answerNectarQuestion, fileUnfiledItem,
  computeProvisioningForecast, togglePlanItem, submitForSetup,
  saveBillingCodeRow, saveManualReviewRow, removeExtractedField, restoreExtractedField,
  getJobAssigner, upsertManualAssignment, removeAssignmentMapRow,
  listPendingClientSubjects,
} from "@/lib/smart-import-review.functions";

import { resolveMergeFlag, overrideValidationIssue } from "@/lib/import-checklist.functions";
import { type TenantIdentity, normalizeOrgName } from "@/lib/service-classification";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus, X, RotateCcw, Tag, UserPlus } from "lucide-react";

import { providerSignoff } from "@/lib/hive-migration.functions";
import { DiscardImportDialog } from "@/components/smart-import/discard-import-dialog";
import { ApprovalDialog } from "@/components/billing/ApprovalDialog";
import { lookupApprovalRequestsForFields, type ApprovalRequestRow } from "@/lib/billing-approvals.functions";

export const Route = createFileRoute("/dashboard/smart-import/$jobId/review")({
  head: () => ({ meta: [{ title: "Smart Import Review — NECTAR" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <ReviewPage />
    </RequirePermission>
  ),
});

// Core target fields (matches what extraction emits)
const CLIENT_FIELDS = [
  "first_name","last_name","full_name","date_of_birth","phone","address","physical_address","mailing_address","medicaid_id",
  "admission_date","discharge_date","pcsp_expiration_date","form_1056_number","form_1056_approved_date","job_code","team_name",
  "is_own_guardian","guardian_name","guardian_phone","guardian_relationship","guardian_email","guardian_address",
  "emergency_contact_name","emergency_contact_phone","emergency_contact_relationship","emergency_contact_instructions","emergency_contact_2_name","emergency_contact_2_phone","emergency_contact_2_relationship","emergency_contact_2_instructions",
  "support_coordinator_name","support_coordinator_email","support_coordinator_phone","support_coordinator_company",
  "billing_code_row","service_code","rate","max_units","monthly_max_units","unit_type",
  "pcp_name","pcp_phone","primary_care_name","primary_care_phone","specialist_name","specialist_phone","med_prescriber_name","med_prescriber_phone","neurologist_name","neurologist_phone","dentist_name","dentist_phone","prescriber_name","prescriber_phone",
  "medical_insurance","diagnoses","chronic_conditions","immunizations","allergies","dysphagia","swallowing_alerts","self_admin_med_support","clinical_alert","special_directions",
  "has_abi","hr_applicable","dnr_applicable","advanced_directives","emergency_medical_treatment_authorization","rights_restrictions","court_orders","dnr_status","dnr_location","polst_status","palliative_care_status","hospice_status",
  "bsp_status","plan_year","disability_category","staff_ratio","housing_voucher","preferred_living","preferred_activities","roommates","personal_belongings_inventory",
  "pcsp_goal","client_medication","pcsp_has_medications",
];
const EMPLOYEE_FIELDS = ["full_name","first_name","last_name","email","phone","position","hire_date","team_name"];

type SubjectRow = {
  id: string; display_name: string; subject_type: "client" | "employee";
  match_status: "new" | "matched_existing" | "ambiguous";
  matched_record_id: string | null;
  review_decision: "update" | "create_new" | "skip" | null;
  review_status: "pending" | "in_progress" | "ready" | "approved";
};

function ReviewPage() {
  const { jobId } = Route.useParams();
  const getJob = useServerFn(getReviewJob);
  const listPending = useServerFn(listPendingClientSubjects);
  const { data: org } = useCurrentOrg();
  const job = useQuery({ queryKey: ["smart-import-review", jobId], queryFn: () => getJob({ data: { jobId } }) });
  const orgPending = useQuery({
    queryKey: ["pending-client-subjects", org?.organization_id],
    queryFn: () => listPending({ data: { organizationId: org!.organization_id } }),
    enabled: !!org?.organization_id && job.data?.job.mode === "client",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const navigate = useNavigate();
  const mode = (job.data?.job?.mode ?? "client") as "employee" | "client";
  const commitCtx = useCompleteSetup({ jobId, mode, onSelectSubject: setSelectedId });

  // Auto-select first unfinished subject
  useEffect(() => {
    if (!selectedId && job.data?.subjects?.length) {
      const next = job.data.subjects.find((s: SubjectRow) => s.review_status !== "ready") ?? job.data.subjects[0];
      setSelectedId(next.id);
    }
  }, [job.data, selectedId]);

  if (job.isLoading) return <div className="text-sm text-muted-foreground">Loading review…</div>;
  if (job.isError || !job.data) return <div className="text-sm text-destructive">Failed to load job.</div>;

  const subjects = (job.data.subjects ?? []) as SubjectRow[];
  const total = subjects.length;
  const ready = subjects.filter((s) => s.review_status === "ready").length;
  const needReview = total - ready;
  // `mode` is declared above; keep the const above for hook wiring.

  // Build merged org-wide queue for client-mode jobs. Current job's subjects
  // come first (so nothing about the current experience changes), then any
  // pending clients from OTHER jobs — clicking those navigates the workbench.
  type QueueRow = {
    id: string; display_name: string; review_status: string;
    match_status: string; source: "current" | "other";
    import_job_id: string; job_label?: string;
  };
  const queue: QueueRow[] = mode === "client"
    ? (() => {
        const currentIds = new Set(subjects.map((s) => s.id));
        const currentRows: QueueRow[] = subjects.map((s) => ({
          id: s.id, display_name: s.display_name,
          review_status: s.review_status, match_status: s.match_status,
          source: "current" as const, import_job_id: jobId,
        }));
        const others: QueueRow[] = (orgPending.data?.items ?? [])
          .filter((p) => p.jobId !== jobId && !currentIds.has(p.subjectId))
          .map((p) => ({
            id: p.subjectId, display_name: p.display_name,
            review_status: p.review_status, match_status: p.match_status,
            source: "other" as const, import_job_id: p.jobId,
            job_label: p.import_date ? new Date(p.import_date).toLocaleDateString() : undefined,
          }));
        return [...currentRows, ...others];
      })()
    : subjects.map((s) => ({
        id: s.id, display_name: s.display_name,
        review_status: s.review_status, match_status: s.match_status,
        source: "current" as const, import_job_id: jobId,
      }));

  const onQueueSelect = (row: QueueRow) => {
    if (row.source === "other") {
      navigate({ to: "/dashboard/smart-import/$jobId/review", params: { jobId: row.import_job_id } });
      setSelectedId(row.id);
    } else {
      setSelectedId(row.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/dashboard/smart-import" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Smart Import
        </Link>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDiscardOpen(true)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Discard import
          </Button>
          <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" /> NECTAR review</Badge>
        </div>
      </div>

      <DiscardImportDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        jobId={jobId}
        onDiscarded={() => navigate({ to: "/dashboard/smart-import" })}
      />

      <AttributionBar />

      {job.data.job.source === "white_glove" && (
        <WhiteGloveBanner job={job.data.job} onChanged={() => job.refetch()} />
      )}

      <RosterSummary mode={mode} total={total} ready={ready} needReview={needReview} jobId={jobId} whiteGlove={job.data.job.source === "white_glove"} signedOff={!!job.data.job.provider_signoff_at} />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <SubjectQueue mode={mode} queue={queue} selectedId={selectedId} onSelect={onQueueSelect} />
        <div className="space-y-4">
          {selectedId ? (
            <SubjectReview
              subjectId={selectedId}
              jobMode={mode}
              jobId={jobId}
              subjects={subjects}
              assignments={job.data.assignments ?? []}
              onChanged={() => { job.refetch(); orgPending.refetch(); }}
            />
          ) : (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
              {mode === "client" && queue.length === 0
                ? "All caught up — no pending clients to review."
                : "Select a person from the queue to begin review."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ---------------------------- AttributionBar ----------------------------
function AttributionBar() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  return (
    <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
      <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
      <div>
        Reviewing as <strong>{user?.email ?? "admin"}</strong> · {org?.role === "super_admin" ? "Super Admin" : "Company Admin"}.
        Confirming approves this setup, including anything you changed or switched on; recorded with every item.
      </div>
    </div>
  );
}

// ---------------------------- Shared commit hook ----------------------------
type CommitResultRow = {
  subjectId?: string;
  display_name?: string;
  committed: boolean;
  record_id?: string | null;
  subject_type?: string;
  gaps?: string[];
  error?: string;
};

function useCompleteSetup({
  jobId, mode, onSelectSubject,
}: {
  jobId: string;
  mode: "employee" | "client";
  onSelectSubject?: (id: string) => void;
}) {
  const submit = useServerFn(submitForSetup);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [partial, setPartial] = useState<CommitResultRow[]>([]);
  const m = useMutation({
    mutationFn: () => submit({ data: { jobId } }),
    onSuccess: (res: { ok: boolean; committed?: boolean; results?: CommitResultRow[] }) => {
      qc.invalidateQueries({ queryKey: ["smart-import-review", jobId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients-uncommitted-imports"] });
      qc.invalidateQueries({ queryKey: ["pending-client-subjects"] });
      const results = res.results ?? [];
      const committedRows = results.filter((r) => r.committed && r.record_id);
      const failedRows = results.filter((r) => !r.committed);
      const isPartial = results.length > 0 && committedRows.length < results.length;

      // White-glove path: no commit happens yet — fall back to the done page.
      if (results.length === 0) {
        setPartial([]);
        navigate({ to: "/dashboard/smart-import/$jobId/done", params: { jobId } });
        return;
      }

      if (!isPartial && committedRows.length > 0) {
        setPartial([]);
        toast.success(`${mode === "client" ? "Client" : "Staff"} setup complete — ${committedRows.length === 1 ? "added to directory" : `${committedRows.length} added`}.`);
        if (committedRows.length === 1 && mode === "client" && committedRows[0].record_id) {
          navigate({ to: "/dashboard/clients/$clientId", params: { clientId: committedRows[0].record_id! } }).catch(() => navigate({ to: "/dashboard/clients" }));
        } else if (mode === "client") {
          navigate({ to: "/dashboard/clients" });
        } else {
          navigate({ to: "/dashboard/employees" });
        }
        return;
      }

      // Partial — stay on the review page; the roster banner now lists the reasons.
      setPartial(failedRows);
      const solo = failedRows.length === 1 ? failedRows[0] : null;
      toast.warning(
        solo?.display_name
          ? `${solo.display_name} wasn't saved — see the reason above.`
          : `${committedRows.length} of ${results.length} saved — review the remaining ${failedRows.length} above.`,
      );
      const firstWithId = failedRows.find((r) => r.subjectId);
      if (firstWithId?.subjectId && onSelectSubject) onSelectSubject(firstWithId.subjectId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return {
    commit: () => m.mutate(),
    isPending: m.isPending,
    partial,
    clearPartial: () => setPartial([]),
  };
}

// ---------------------------- RosterSummary ----------------------------
function RosterSummary({
  mode, total, ready, needReview, whiteGlove, signedOff,
  commit, commitPending, partial, onSelectSubject,
}: {
  mode: "employee" | "client";
  total: number; ready: number; needReview: number;
  whiteGlove?: boolean; signedOff?: boolean;
  commit: () => void;
  commitPending: boolean;
  partial: CommitResultRow[];
  onSelectSubject: (id: string) => void;
}) {
  const noun = mode === "client" ? "client" : "staff";
  const commitDisabled = commitPending || ready === 0 || (whiteGlove && !signedOff);
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Job roster ({mode})</div>
          <div className="mt-1 text-base font-semibold">
            {total} {noun}{total === 1 ? "" : "s"} · <span className="text-emerald-600">{ready} ready</span> · <span className="text-amber-600">{needReview} need review</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Advisory throughout — flags surface to act on, never block.</p>
        </div>
        <Button onClick={commit} disabled={commitDisabled} size="lg" title={whiteGlove && !signedOff ? "Waiting for provider sign-off" : undefined}>
          {commitPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Send className="mr-2 h-4 w-4" /> Complete {noun} setup
        </Button>
      </div>
      {partial.length > 0 && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50/40 p-3 shadow-[var(--shadow-card)] dark:bg-amber-950/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                {partial.length} {noun}{partial.length === 1 ? "" : "s"} still need attention
              </div>
              <div className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-200/80">
                Click a row to open it and fix the issue, then run Complete {noun} setup again.
              </div>
              <ul className="mt-2 space-y-1">
                {partial.map((r, i) => {
                  const reason = r.error ?? r.gaps?.[0] ?? "open this record to see what's needed";
                  return (
                    <li key={r.subjectId ?? `${r.display_name ?? "row"}-${i}`}>
                      <button
                        type="button"
                        onClick={() => r.subjectId && onSelectSubject(r.subjectId)}
                        disabled={!r.subjectId}
                        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-amber-100/70 disabled:opacity-60 dark:hover:bg-amber-900/30"
                      >
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{r.display_name ?? "Unnamed subject"}</span>
                          <span className="text-muted-foreground"> — {reason}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ---------------------------- WhiteGloveBanner (HIVE migration) ----------------------------
function WhiteGloveBanner({
  job, onChanged,
}: {
  job: {
    id: string; source: string; target_org_id: string | null;
    provider_signoff_at: string | null; provider_signoff_by: string | null;
  };
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const signoffFn = useServerFn(providerSignoff);
  const m = useMutation({
    mutationFn: () => signoffFn({ data: { jobId: job.id } }),
    onSuccess: () => { toast.success("Sign-off recorded. Commit unlocked."); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (job.provider_signoff_at) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-emerald-400/40 bg-emerald-50/40 p-3 text-sm dark:bg-emerald-950/30">
        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
        <div>
          <strong>Provider signed off.</strong> Commit is unlocked. (signed{" "}
          {new Date(job.provider_signoff_at).toLocaleString()})
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-400/50 bg-amber-50/40 p-3 text-sm dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 text-amber-700" />
        <div className="text-amber-900 dark:text-amber-100">
          <strong>White-glove migration.</strong> HIVE staff can prep this job, but
          commit is locked until the receiving company's admin signs off below.
        </div>
      </div>
      <Button
        size="sm"
        variant="default"
        disabled={m.isPending}
        onClick={() => m.mutate()}
        title={`Provider sign-off as ${user?.email ?? "current user"}`}
      >
        {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sign off &amp; unlock commit
      </Button>
    </div>
  );
}

// ---------------------------- SubjectQueue ----------------------------
type QueueRow = {
  id: string; display_name: string; review_status: string;
  match_status: string; source: "current" | "other";
  import_job_id: string; job_label?: string;
};
function SubjectQueue({
  mode, queue, selectedId, onSelect,
}: { mode: "employee" | "client"; queue: QueueRow[]; selectedId: string | null; onSelect: (row: QueueRow) => void }) {
  const currentCount = queue.filter((r) => r.source === "current").length;
  const otherRows = queue.filter((r) => r.source === "other");
  return (
    <div className="rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-card)]">
      <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {mode === "client" ? "Pending clients" : "People"}
      </div>
      <div className="max-h-[70vh] space-y-1 overflow-auto">
        {queue.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {mode === "client" ? "All caught up — no pending clients." : "No people in this job."}
          </div>
        )}
        {queue.slice(0, currentCount).map((r) => (
          <QueueButton key={r.id} row={r} active={r.id === selectedId} onSelect={onSelect} />
        ))}
        {otherRows.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              From other imports
            </div>
            {otherRows.map((r) => (
              <QueueButton key={r.id} row={r} active={r.id === selectedId} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function QueueButton({ row, active, onSelect }: { row: QueueRow; active: boolean; onSelect: (row: QueueRow) => void }) {
  return (
    <button
      onClick={() => onSelect(row)}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active ? "bg-primary/10 text-primary" : "hover:bg-muted"
      }`}
    >
      <div className="min-w-0">
        <div className="truncate font-medium">{row.display_name}</div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <StatusDot status={row.review_status} />
          <span className="capitalize">{row.review_status.replace("_", " ")}</span>
          {row.match_status === "matched_existing" && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">match</Badge>}
          {row.match_status === "ambiguous" && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px] text-amber-600">ambig</Badge>}
          {row.source === "other" && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Link2 className="h-3 w-3" />
              {row.job_label ?? "other import"}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 opacity-50" />
    </button>
  );
}
function StatusDot({ status }: { status: string }) {
  const color = status === "ready" ? "bg-emerald-500" : status === "in_progress" ? "bg-amber-500" : "bg-muted-foreground/40";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}


// ---------------------------- SubjectReview ----------------------------
function SubjectReview({
  subjectId, jobMode, jobId, subjects, assignments, onChanged,
}: {
  subjectId: string;
  jobMode: "employee" | "client";
  jobId: string;
  subjects: SubjectRow[];
  assignments: Array<{ id: string; relation_type: string; staff_subject_id: string | null; client_subject_id: string | null; status: string; inference_reason: string | null }>;
  onChanged: () => void;
}) {
  const getSubj = useServerFn(getReviewSubject);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["smart-import-subject", subjectId], queryFn: () => getSubj({ data: { subjectId } }) });
  // Lift wizard step up so we can render the rail directly under the name header.
  // Must be declared before any early returns to keep hook order stable.
  const [step, setStep] = useState<WizardStepId>("person");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["smart-import-subject", subjectId] });
    onChanged();
  };

  if (q.isLoading) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (q.isError || !q.data) return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">Failed to load subject.</div>;

  const { subject, fields, unfiled, certs, questions, matched } = q.data;
  const tenant = (q.data as { tenant?: { codesHeld: string[]; names: string[] } }).tenant ?? { codesHeld: [], names: [] };
  const validation = (q.data as { validation?: { ok: boolean; issues: Array<{ key: string; severity: "error" | "warning"; field?: string; message: string }>; blocking: string[]; overrides?: Record<string, boolean> } }).validation;
  const mergeFlags = (q.data as { mergeFlags?: Array<Record<string, string | number | boolean | null>> }).mergeFlags ?? [];
  const targetFields = jobMode === "client" ? CLIENT_FIELDS : EMPLOYEE_FIELDS;
  const canMarkReady = !validation || validation.ok;

  const askCount = (questions as Array<{ answer: string | null }>).filter((qq) => !qq.answer).length;
  const extraCount = (unfiled as Array<{ filed_to: string | null }>).filter((u) => !u.filed_to).length;
  // Drop per-code routing issues — they're replaced by the inline billing table editor.
  const validationOverrides = validation?.overrides ?? {};
  const visibleIssues = (validation?.issues ?? []).filter(
    (i) => !validationOverrides[i.key] && !/^code\.(confirm_owner|coordination|coordination_info|bill_as_ours|ignore)\./.test(i.key),
  );
  const issueCount = visibleIssues.length;
  const steps: Array<{ id: WizardStepId; label: string; badge?: number }> = jobMode === "client"
    ? [
        { id: "person", label: "Person & contacts" },
        { id: "health", label: "Health & medical" },
        { id: "medications", label: "Medications / MAR" },
        { id: "goals", label: "PCSP goals" },
        { id: "services", label: "Services" },
        { id: "plan", label: "Unmatched notes", badge: extraCount || undefined },
        { id: "staff", label: "Staff & training" },
        { id: "review", label: "Review", badge: (askCount + issueCount) || undefined },
      ]
    : [
        { id: "person", label: "Person & contacts" },
        { id: "services", label: "Role & team" },
        { id: "staff", label: "Certs & training" },
        { id: "review", label: "Review", badge: (askCount + issueCount) || undefined },
      ];
  const activeIdx = steps.findIndex((s) => s.id === step);

  return (
    <div className="space-y-4">
      <SubjectHeader subject={subject} onChanged={refresh} canMarkReady={canMarkReady} />
      <StepRail steps={steps} activeIdx={activeIdx} onJump={(i) => setStep(steps[i].id)} />
      <DedupBanner subject={subject} matched={matched} onChanged={refresh} />

      {validation && visibleIssues.length > 0 && (
        <ValidationPanel
          subjectId={subjectId}
          validation={{ ...validation, issues: visibleIssues }}
          onChanged={refresh}
          onNavigateStep={setStep}
        />
      )}
      {mergeFlags.length > 0 && (
        <MergeFlagsPanel flags={mergeFlags} onChanged={refresh} />
      )}


      <SubjectWizard
        subjectId={subjectId}
        jobMode={jobMode}
        fields={fields}
        targetFields={targetFields}
        matched={matched}
        decision={subject.review_decision}
        tenant={tenant}
        certs={certs}
        questions={questions}
        unfiled={unfiled}
        jobId={jobId}
        subjects={subjects}
        assignments={assignments}
        step={step}
        setStep={setStep}
        steps={steps}
        onChanged={refresh}
      />


    </div>
  );
}

// ---------------------------- SubjectWizard ----------------------------
// Presentational wrapper: groups existing review panels into a guided
// step rail. Reuses every existing piece (PlacementLineup, CertsPanel,
// QuestionsPanel, UnfiledPanel, ProvisioningPanel) — no new server fns,
// no rebuilt fields, no separate commit path.
const PERSON_FIELDS_SET = new Set([
  "first_name","last_name","full_name","date_of_birth","phone","address","mailing_address","medicaid_id",
  "is_own_guardian","guardian_name","guardian_phone","guardian_email","guardian_address","guardian_relationship",
  "emergency_contact_name","emergency_contact_phone","emergency_contact_relationship","emergency_contact_instructions",
  "emergency_contact_2_name","emergency_contact_2_phone","emergency_contact_2_relationship","emergency_contact_2_instructions",
  "support_coordinator_name","support_coordinator_email","support_coordinator_phone","support_coordinator_company",
  "admission_date","discharge_date","pcsp_expiration_date","has_abi",
]);
const HEALTH_FIELDS_SET = new Set([
  "pcp_name","pcp_phone","primary_care_name","primary_care_phone","specialist_name","specialist_phone",
  "med_prescriber_name","med_prescriber_phone","neurologist_name","neurologist_phone","dentist_name","dentist_phone","prescriber_name","prescriber_phone",
  "medical_insurance","diagnoses","chronic_conditions","immunizations","allergies","dysphagia","swallowing_alerts","self_admin_med_support",
  "clinical_alert","special_directions","bsp_status","has_abi","hr_applicable","dnr_applicable","advanced_directives","emergency_medical_treatment_authorization",
  "rights_restrictions","court_orders","dnr_status","dnr_location","polst_status","palliative_care_status","hospice_status",
]);
const SERVICES_FIELDS_SET = new Set([
  "billing_code_row","service_code","rate","max_units","monthly_max_units","unit_type","job_code","team_name",
]);

type WizardStepId = "person" | "health" | "medications" | "goals" | "services" | "plan" | "staff" | "review";

function SubjectWizard({
  subjectId, jobMode, fields, targetFields, matched, decision, tenant,
  certs, questions, unfiled, jobId, subjects, assignments, step, setStep, steps, onChanged,
}: {
  subjectId: string;
  jobMode: "employee" | "client";
  fields: FieldRow[];
  targetFields: string[];
  matched: Record<string, string | null> | null;
  decision: SubjectRow["review_decision"];
  tenant: TenantIdentity;
  certs: Array<{ id: string; cert_key: string; state: "unverified"|"verified"|"provisional"; file_name?: string|null; expiry_date?: string|null }>;
  questions: Array<{ id: string; question: string; context: string | null; answer: string | null }>;
  unfiled: Array<{ id: string; text: string; filed_to: string | null }>;
  jobId: string;
  subjects: SubjectRow[];
  assignments: Array<{ id: string; relation_type: string; staff_subject_id: string | null; client_subject_id: string | null; status: string; inference_reason: string | null }>;
  step: WizardStepId;
  setStep: (s: WizardStepId) => void;
  steps: Array<{ id: WizardStepId; label: string; badge?: number }>;
  onChanged: () => void;
}) {
  const personFields = fields.filter((f) => PERSON_FIELDS_SET.has(f.target_field));
  const healthFields = fields.filter((f) => HEALTH_FIELDS_SET.has(f.target_field));
  const servicesFields = fields.filter((f) => SERVICES_FIELDS_SET.has(f.target_field));
  const goalFields = fields.filter((f) => f.target_field === "pcsp_goal" || f.field_key === "pcsp_goal" || f.target_field === "pcsp_goal_extraction_failed");
  const medicationFields = fields.filter((f) => f.target_field === "client_medication" || f.field_key === "client_medication" || f.target_field === "pcsp_has_medications");
  const hiddenProfileFields = new Set(["pcsp_goal", "client_medication", "pcsp_has_medications"]);
  const otherFields = fields.filter((f) => !PERSON_FIELDS_SET.has(f.target_field) && !HEALTH_FIELDS_SET.has(f.target_field) && !SERVICES_FIELDS_SET.has(f.target_field) && !hiddenProfileFields.has(f.target_field) && !f.is_custom_attribute);
  // Anything we couldn't bucket falls into Person so nothing disappears.
  const personFieldsAll = [...personFields, ...otherFields, ...fields.filter((f) => f.is_custom_attribute)];

  const idx = steps.findIndex((s) => s.id === step);

  return (
    <div className="space-y-4">
      {step === "person" && (
        <PlacementLineup
          fields={personFieldsAll.filter((f) => f.target_field !== "billing_code_row")}
          targetFields={targetFields} matched={matched} decision={decision}
          subjectId={subjectId} tenant={tenant} onChanged={onChanged}
        />
      )}
      {step === "services" && (
        <PlacementLineup
          fields={servicesFields} targetFields={targetFields} matched={matched}
          decision={decision} subjectId={subjectId} tenant={tenant} onChanged={onChanged} showBilling
        />
      )}
      {step === "health" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-2.5 text-[11px] leading-snug text-muted-foreground shadow-[var(--shadow-card)]">
            This is the health/medical portion of the client profile preview. Confirm providers, diagnoses, allergies, swallowing risks, clinical alerts, human-rights/DNR flags, and other PCSP-pulled care details before creating the profile.
          </div>
          <PlacementLineup
            fields={healthFields} targetFields={targetFields} matched={matched}
            decision={decision} subjectId={subjectId} tenant={tenant} onChanged={onChanged}
          />
        </div>
      )}
      {step === "medications" && jobMode === "client" && (
        <MedicationsReviewPanel subjectId={subjectId} fields={medicationFields} onChanged={onChanged} />
      )}
      {step === "goals" && jobMode === "client" && (
        <GoalsReviewPanel subjectId={subjectId} fields={goalFields} onChanged={onChanged} />
      )}
      {step === "plan" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-2.5 text-[11px] leading-snug text-muted-foreground shadow-[var(--shadow-card)]">
            Notes NECTAR pulled from your uploads but couldn't confidently file into a section (Health, Behavioral, Preferences, etc.). Uploaded files themselves — PCSP, MAR, and any supporting docs — are stored with this import and don't need to be re-attached here. File each note under an existing section, create a new one, or leave it for later.
          </div>
          <UnfiledPanel items={unfiled} onChanged={onChanged} />
        </div>
      )}
      {step === "staff" && (
        jobMode === "employee" ? (
          <CertsPanel subjectId={subjectId} certs={certs} onChanged={onChanged} />
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-2.5 text-[11px] leading-snug text-muted-foreground shadow-[var(--shadow-card)]">
              Assign staff and scope each one to the codes they're authorized for. Per-client training (Support strategies, Client-specific training, Person-Centered Thinking) unlocks after PCSP upload.
            </div>
            <AssignmentMapPanel jobId={jobId} subjects={subjects} assignments={assignments} onChanged={onChanged} />
          </div>
        )
      )}
      {step === "review" && (
        <div className="space-y-3">
          <ImportSummaryPanel
            subject={{
              id: subjectId,
              display_name: (fields.find((f) => f.target_field === "full_name")?.value)
                ?? [fields.find((f) => f.target_field === "first_name")?.value, fields.find((f) => f.target_field === "last_name")?.value].filter(Boolean).join(" ")
                ?? "This person",
              subject_type: jobMode,
              match_status: "new",
              matched_record_id: null,
              review_decision: decision,
              review_status: "in_progress",
            }}
            fields={fields}
            unfiled={unfiled}
            assignments={assignments}
            subjects={subjects}
            tenant={tenant}
            jobMode={jobMode}
            onJumpToStep={setStep}
          />
          {questions.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">NECTAR asks</div>
              <QuestionsPanel questions={questions} onChanged={onChanged} />
            </div>
          )}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provisioning forecast</div>
            <ProvisioningPanel subjectId={subjectId} onChanged={onChanged} />
          </div>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
            <div className="font-semibold text-emerald-700 dark:text-emerald-400">Ready to create</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Everything in the outline above will be created for this {jobMode === "client" ? "client" : "staff member"} when you click <strong>Complete {jobMode === "client" ? "client" : "staff"} setup</strong> at the top of this page. Open flags become "Needed" items on the person's file — only the last name blocks creation.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => setStep(steps[Math.max(0, idx - 1)].id)} disabled={idx === 0}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
        </Button>
        <div className="text-xs text-muted-foreground">Step {idx + 1} of {steps.length}</div>
        <Button size="sm" onClick={() => setStep(steps[Math.min(steps.length - 1, idx + 1)].id)} disabled={idx === steps.length - 1}>
          Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function StepRail({
  steps, activeIdx, onJump,
}: { steps: Array<{ id: string; label: string; badge?: number }>; activeIdx: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex flex-nowrap items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-card px-1.5 py-1 shadow-[var(--shadow-card)] lg:flex-wrap lg:overflow-visible">
      {steps.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        const allowJump = i <= activeIdx + 1;
        return (
          <li key={s.id} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => allowJump && onJump(i)}
              disabled={!allowJump}
              className={[
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium transition",
                active ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/40" :
                done ? "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10" :
                "text-muted-foreground hover:bg-muted",
                allowJump ? "cursor-pointer" : "cursor-not-allowed opacity-60",
              ].join(" ")}
              title={s.label}
            >
              <span className={[
                "inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold",
                done ? "bg-emerald-500 text-white" : active ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground",
              ].join(" ")}>
                {done ? <CheckCircle2 className="h-2.5 w-2.5" /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{s.label}</span>
              {s.badge ? (
                <span className="inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[9px] text-amber-700 dark:text-amber-400">{s.badge}</span>
              ) : null}
            </button>
            {i < steps.length - 1 && <ChevronRight className="mx-0 h-3 w-3 shrink-0 text-muted-foreground/40" />}
          </li>
        );
      })}
    </ol>
  );
}



// ---------------------------- SubjectHeader ----------------------------
function SubjectHeader({ subject, onChanged, canMarkReady = true }: { subject: SubjectRow; onChanged: () => void; canMarkReady?: boolean }) {
  const setReady = useServerFn(setSubjectReady);
  const m = useMutation({
    mutationFn: (ready: boolean) => setReady({ data: { subjectId: subject.id, ready } }),
    onSuccess: () => { toast.success("Updated"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const isReady = subject.review_status === "ready";
  const blocked = !isReady && !canMarkReady;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-[var(--shadow-card)]">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{subject.subject_type}</div>
        <div className="truncate text-base font-semibold">{subject.display_name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">{subject.match_status.replace("_", " ")}</Badge>
          {subject.review_decision && <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">{subject.review_decision.replace("_", " ")}</Badge>}
          <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">{subject.review_status.replace("_", " ")}</Badge>
        </div>
      </div>
      <Button
        size="sm"
        variant={isReady ? "outline" : "default"}
        onClick={() => m.mutate(!isReady)}
        disabled={m.isPending || blocked}
        title={blocked ? "Resolve NECTAR validation issues below first" : undefined}
      >
        {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isReady ? "Reopen" : <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Mark ready</>}
      </Button>
    </div>
  );
}


// ---------------------------- Client field labels ----------------------------
const CLIENT_FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  preferred_name: "Preferred name",
  date_of_birth: "Date of birth",
  gender: "Gender",
  medicaid_id: "Medicaid ID",
  ssn: "SSN",
  phone: "Phone",
  email: "Email",
  mailing_address: "Mailing address",
  physical_address: "Physical address",
  address_line1: "Address line 1",
  address_line2: "Address line 2",
  city: "City",
  state: "State",
  postal_code: "ZIP code",
  guardian_name: "Guardian name",
  guardian_phone: "Guardian phone",
  guardian_email: "Guardian email",
  guardian_relationship: "Guardian relationship",
  support_coordinator_name: "Support coordinator name",
  support_coordinator_email: "Support coordinator email",
  support_coordinator_phone: "Support coordinator phone",
  support_coordinator_company: "Support coordinator company",
  primary_care_physician: "Primary care physician",
  plan_year: "Plan year",
  pcsp_effective_date: "PCSP effective date",
  pcsp_expiration_date: "PCSP expiration date",
};
function labelForField(key: string): string {
  if (CLIENT_FIELD_LABELS[key]) return CLIENT_FIELD_LABELS[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fieldKeyFromIssue(key: string): string | null {
  const m = key.match(/^client\.(?:missing|address)\.(.+)$/);
  return m ? m[1] : null;
}

// ---------------------------- ValidationPanel ----------------------------
type IssueHelp = {
  whatToDo: string;
  action?: { label: string; onClick: () => void };
};

function getIssueHelp(
  key: string,
  onNavigateStep?: (id: WizardStepId) => void,
): IssueHelp {
  if (key === "org.codes_held_missing") {
    return {
      whatToDo:
        "Two ways to clear this: (a) Open Company Profile and check off the DSPD codes your agency is awarded — this is a one-time setup and every future import benefits, or (b) if you've already reviewed the billing codes on this client and they're correct as shown, click Dismiss. This warning never blocks saving the client.",
      action: {
        label: "Set awarded codes in Company Profile",
        onClick: () => {
          window.open("/dashboard/nectar-company-profile#codes-held", "_blank");
        },
      },
    };
  }
  if (/^client\.(missing|address)/.test(key)) {
    const field = fieldKeyFromIssue(key);
    return {
      whatToDo: field
        ? `Type the ${labelForField(field).toLowerCase()} in the box that opened below — it's saved straight onto this client and the warning clears automatically. Only click Dismiss if the field genuinely doesn't apply.`
        : "Fill in this field in the box that opened below, or click Dismiss if it doesn't apply.",
    };
  }
  if (/^code\./.test(key)) {
    return {
      whatToDo: "Fix the row in the Billing codes table below — edit values or delete the row.",
      action: onNavigateStep
        ? {
            label: "Jump to billing table",
            onClick: () => {
              onNavigateStep("services");
              setTimeout(() => {
                document.getElementById("billing-codes")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 100);
            },
          }
        : undefined,
    };
  }
  return {
    whatToDo: "Review this item and either fix it above/below or click Confirm to acknowledge.",
  };
}

function ValidationPanel({
  subjectId, validation, onChanged, onNavigateStep,
}: {
  subjectId: string;
  validation: { ok: boolean; issues: Array<{ key: string; severity: "error" | "warning"; field?: string; message: string }>; blocking: string[] };
  onChanged: () => void;
  onNavigateStep?: (id: WizardStepId) => void;
}) {
  const overrideFn = useServerFn(overrideValidationIssue);
  const saveManualFn = useServerFn(saveManualReviewRow);
  const m = useMutation({
    mutationFn: (vars: { issueKey: string; overridden: boolean }) =>
      overrideFn({ data: { subjectId, issueKey: vars.issueKey, overridden: vars.overridden } }),
    onSuccess: () => { toast.success("Saved"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const addFieldM = useMutation({
    mutationFn: (vars: { targetField: string; value: string }) =>
      saveManualFn({ data: { subjectId, targetField: vars.targetField, value: vars.value } }),
    onSuccess: () => { toast.success("Added"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const [inlineValue, setInlineValue] = useState<Record<string, string>>({});
  const blockingSet = new Set(validation.blocking);
  // Sort: blocking errors first, then warnings.
  const sortedIssues = [...validation.issues].sort((a, b) => {
    const aBlock = blockingSet.has(a.key) ? 0 : a.severity === "error" ? 1 : 2;
    const bBlock = blockingSet.has(b.key) ? 0 : b.severity === "error" ? 1 : 2;
    return aBlock - bBlock;
  });
  const blockingCount = sortedIssues.filter((i) => blockingSet.has(i.key)).length;
  const advisoryCount = sortedIssues.length - blockingCount;
  const anyBlocking = blockingCount > 0;
  const panelClass = anyBlocking
    ? "rounded-2xl border border-destructive/40 bg-destructive/5 p-4"
    : "rounded-2xl border border-amber-300/60 bg-amber-50/40 p-4 dark:bg-amber-950/20";
  const headerClass = anyBlocking
    ? "flex items-center gap-2 text-sm font-semibold text-destructive"
    : "flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400";
  return (
    <div className={panelClass}>
      <div className={headerClass}>
        <AlertTriangle className="h-4 w-4" />
        {anyBlocking
          ? `${sortedIssues.length} thing${sortedIssues.length === 1 ? "" : "s"} to review before saving`
          : `${sortedIssues.length} optional item${sortedIssues.length === 1 ? "" : "s"} — nothing is blocking this client`}
        <span className="text-xs font-normal opacity-80">
          ({blockingCount} blocking, {advisoryCount} advisory)
        </span>
      </div>
      <ul className="mt-2 space-y-2 text-sm">
        {sortedIssues.map((i) => {
          const isBlocking = blockingSet.has(i.key);
          const codeMatch = i.key.match(/^code\.(confirm_owner|coordination|coordination_info)\.(.+)$/);
          const setCodeBucket = (code: string, bucket: "bill_as_ours" | "coordination" | "ignore") => {
            const all = ["bill_as_ours", "coordination", "ignore"] as const;
            all.forEach((b) => {
              const key = `code.${b}.${code}`;
              if (b === bucket) m.mutate({ issueKey: key, overridden: true });
              else m.mutate({ issueKey: key, overridden: false });
            });
            m.mutate({ issueKey: i.key, overridden: true });
          };
          const help = getIssueHelp(i.key, onNavigateStep);
          const missingField = fieldKeyFromIssue(i.key);
          return (
            <li key={i.key} className="flex flex-col gap-2 rounded-md border border-border/70 bg-background/60 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={isBlocking ? "destructive" : "outline"} className="capitalize text-[10px]">
                      {isBlocking ? "blocking" : i.severity}
                    </Badge>
                    {i.field && <span className="text-xs text-muted-foreground">{i.field}</span>}
                  </div>
                  <div className="mt-1">{i.message}</div>
                  {!codeMatch && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">What to do: </span>
                      {help.whatToDo}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {codeMatch ? (
                    <>
                      <Button size="sm" variant="default" disabled={m.isPending} onClick={() => setCodeBucket(codeMatch[2], "bill_as_ours")}>
                        Bill this (ours)
                      </Button>
                      <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => setCodeBucket(codeMatch[2], "coordination")}>
                        Coordination only (won't bill)
                      </Button>
                      <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => setCodeBucket(codeMatch[2], "ignore")}>
                        File as info / ignore
                      </Button>
                    </>
                  ) : (
                    <>
                      {help.action && (
                        <Button size="sm" variant="outline" disabled={m.isPending} onClick={help.action.onClick}>
                          {help.action.label}
                        </Button>
                      )}
                      {!missingField && (isBlocking ? (
                        <Button size="sm" variant="default" disabled={m.isPending} onClick={() => m.mutate({ issueKey: i.key, overridden: true })}>
                          Confirm — I've reviewed this
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => m.mutate({ issueKey: i.key, overridden: true })}>
                          Dismiss
                        </Button>
                      ))}
                      {missingField && (
                        <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => m.mutate({ issueKey: i.key, overridden: true })}>
                          Doesn't apply — dismiss
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {missingField && (
                <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border/70 bg-muted/30 px-2 py-2">
                  <label className="text-xs font-medium text-foreground/80 min-w-[120px]">
                    Add {labelForField(missingField).toLowerCase()}
                  </label>
                  <Input
                    className="h-8 flex-1 min-w-[180px]"
                    placeholder={`Type the ${labelForField(missingField).toLowerCase()}…`}
                    value={inlineValue[i.key] ?? ""}
                    onChange={(e) => setInlineValue((prev) => ({ ...prev, [i.key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = (inlineValue[i.key] ?? "").trim();
                        if (v) addFieldM.mutate({ targetField: missingField, value: v });
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={addFieldM.isPending || !(inlineValue[i.key] ?? "").trim()}
                    onClick={() => {
                      const v = (inlineValue[i.key] ?? "").trim();
                      if (v) addFieldM.mutate({ targetField: missingField, value: v });
                    }}
                  >
                    {addFieldM.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    Save {labelForField(missingField).toLowerCase()}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------- MergeFlagsPanel ----------------------------
function MergeFlagsPanel({
  flags, onChanged,
}: {
  flags: Array<Record<string, string | number | boolean | null>>;
  onChanged: () => void;
}) {
  const resolveFn = useServerFn(resolveMergeFlag);
  const m = useMutation({
    mutationFn: (vars: { flagId: string; action: "keep_both" | "merge_into_existing" | "replace" }) =>
      resolveFn({ data: vars }),
    onSuccess: () => { toast.success("Merge resolved"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="rounded-2xl border border-amber-300/60 bg-amber-50/30 p-4 dark:bg-amber-950/20">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        Merge review — {flags.length} unresolved
      </div>
      <ul className="mt-2 space-y-2 text-sm">
        {flags.map((f) => (
          <li key={String(f.id)} className="rounded-md border border-border/70 bg-background/60 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="capitalize">{String(f.kind ?? "").replace("_", " ")}</Badge>
              <span>{String(f.field ?? "")}</span>
              {f.source_document_type && <span>· source: {String(f.source_document_type)}</span>}
            </div>
            <div className="mt-1 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              <div><span className="text-muted-foreground">Existing:</span> {String(f.existing_value ?? "—")}</div>
              <div><span className="text-muted-foreground">Incoming:</span> {String(f.incoming_value ?? "—")}</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ flagId: String(f.id), action: "keep_both" })}>Keep both</Button>
              <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ flagId: String(f.id), action: "merge_into_existing" })}>Keep existing</Button>
              <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ flagId: String(f.id), action: "replace" })}>Use incoming</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------- DedupBanner ----------------------------
function DedupBanner({
  subject, matched, onChanged,
}: { subject: SubjectRow; matched: Record<string, string | null> | null; onChanged: () => void }) {
  const setDecision = useServerFn(setSubjectDecision);
  const m = useMutation({
    mutationFn: (decision: "update" | "create_new" | "skip") => setDecision({ data: { subjectId: subject.id, decision } }),
    onSuccess: () => { toast.success("Decision saved"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (subject.match_status === "new") return null;
  // Once a decision is made, dismiss the banner so the admin moves on.
  // create_new / update both proceed via downstream commit; skip means the
  // admin has acknowledged the match and chosen to do nothing here.
  if (subject.review_decision === "skip") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span>Match acknowledged — skipped. This subject will not be committed.</span>
        <Button size="sm" variant="ghost" onClick={() => m.mutate("create_new")} disabled={m.isPending}>Change decision</Button>
      </div>
    );
  }
  if (subject.review_decision === "update" || subject.review_decision === "create_new") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300/50 bg-emerald-50/40 px-3 py-2 text-xs dark:bg-emerald-950/20">
        <span className="text-emerald-800 dark:text-emerald-300">
          Decision: <strong className="capitalize">{subject.review_decision.replace("_", " ")}</strong>.
        </span>
        <Button size="sm" variant="ghost" onClick={() => m.mutate("skip")} disabled={m.isPending}>Change</Button>
      </div>
    );
  }
  const existingName = matched
    ? [(matched as Record<string, string | null>).first_name, (matched as Record<string, string | null>).last_name].filter(Boolean).join(" ")
      || ((matched as Record<string, string | null>).full_name as string)
      || ((matched as Record<string, string | null>).email as string)
      || "existing record"
    : "an existing record";
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/50 bg-amber-50/40 p-4 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-sm">
        <UserCheck className="mt-0.5 h-4 w-4 text-amber-600" />
        <div>
          <div className="font-medium">This looks like {existingName}</div>
          <div className="text-xs text-muted-foreground">
            {subject.match_status === "ambiguous" ? "Multiple possible matches — choose how to handle." : "Update the existing record or create a new one."}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => m.mutate("update")} disabled={m.isPending}>Update existing</Button>
        <Button size="sm" variant="outline" onClick={() => m.mutate("create_new")} disabled={m.isPending}>Create new</Button>
        <Button size="sm" variant="ghost" onClick={() => m.mutate("skip")} disabled={m.isPending}>Skip</Button>
      </div>
    </div>
  );
}

// ---------------------------- PlacementLineup ----------------------------
type FieldRow = {
  id: string; target_field: string; value: string | null; status: string;
  confidence: number | null; source_snippet: string | null;
  is_custom_attribute: boolean; provenance: string;
  value_json?: unknown;
  field_key?: string | null;
  dismissed_at?: string | null;
};
function PlacementLineup({
  fields, targetFields, matched, decision, subjectId, tenant, onChanged, showBilling = false,
}: {
  fields: FieldRow[]; targetFields: string[]; matched: Record<string, string | null> | null;
  decision: SubjectRow["review_decision"]; subjectId: string; tenant: TenantIdentity; onChanged: () => void; showBilling?: boolean;
}) {
  // Prompt 18: peel billing-code rows out of the generic field list so we can
  // show them as a proper editable table. The remaining placement lineup keeps
  // its existing value→field shape for every other field.
  const billing = fields.filter((f) => f.target_field === "billing_code_row" && !f.dismissed_at);
  const rest = fields.filter((f) => f.target_field !== "billing_code_row");
  // Prompt 24: limit lineup to SOW-required record fields. Incidental
  // mappings (extras NECTAR pulled but aren't required by §1.10) are
  // hidden here — they still live on the record as custom attributes.
  const required = new Set(targetFields);
  const core = rest.filter((f) => !f.is_custom_attribute && required.has(f.target_field));
  const custom = rest.filter((f) => f.is_custom_attribute);
  return (
    <div className="space-y-4">
      {showBilling && <BillingCodesEditor subjectId={subjectId} rows={billing} tenant={tenant} onChanged={onChanged} />}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Information NECTAR pulled from the file</div>
            <div className="text-xs text-muted-foreground">
              These are the required fields for a client record. Edit any value, remove a row with ×, or add anything NECTAR missed.
            </div>
          </div>
          <AddMissingFieldPopover
            subjectId={subjectId}
            targetFields={targetFields}
            presentFields={core.map((f) => f.target_field)}
            onChanged={onChanged}
          />
        </div>
        <div className="space-y-2">
          {core.length === 0 && <div className="text-sm text-muted-foreground">No required fields extracted yet — use "+ Add a field" to enter them manually.</div>}
          {core.map((f) => (
            <FieldRowEditor key={f.id} field={f} targetFields={targetFields} matchedValue={matched ? (matched[f.target_field] as string | null) ?? null : null} showDiff={decision === "update"} onChanged={onChanged} />
          ))}
        </div>
      </div>
      {custom.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2"><FilePlus className="h-4 w-4" /> Custom attributes</div>
            <div className="text-xs text-muted-foreground">Unknown columns — kept as-is on the person.</div>
          </div>
          <div className="space-y-2">
            {custom.map((f) => (
              <FieldRowEditor key={f.id} field={f} targetFields={targetFields} matchedValue={null} showDiff={false} onChanged={onChanged} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AddMissingFieldPopover({
  subjectId, targetFields, presentFields, onChanged,
}: {
  subjectId: string;
  targetFields: string[];
  presentFields: string[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const saveFn = useServerFn(saveManualReviewRow);
  const m = useMutation({
    mutationFn: () => saveFn({ data: { subjectId, targetField: field, value: value.trim() } }),
    onSuccess: () => {
      toast.success(`Added ${labelForField(field).toLowerCase()}`);
      setField(""); setValue(""); setOpen(false);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const present = new Set(presentFields);
  const options = targetFields.filter((f) => !present.has(f)).sort((a, b) => labelForField(a).localeCompare(labelForField(b)));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <Plus className="mr-1 h-3.5 w-3.5" /> Add a field
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="text-sm font-semibold">Add a field NECTAR missed</div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Field</label>
          <Select value={field} onValueChange={setField}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Pick a field…" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {options.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">All required fields are already present.</div>}
              {options.map((f) => (
                <SelectItem key={f} value={f}>{labelForField(f)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Value</label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={field ? `Type the ${labelForField(field).toLowerCase()}…` : "Pick a field first"}
            disabled={!field}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" disabled={!field || !value.trim() || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------- Profile-shaped clinical review panels ----------------------------
function parseJsonValue(f: FieldRow): Record<string, unknown> | null {
  if (!f.value) return null;
  try {
    const raw = JSON.parse(f.value);
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function valueString(v: unknown): string {
  return v == null ? "" : String(v);
}

type MedicationReviewRow = {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  schedule: string;
  scheduled_time: string;
  prescriber: string;
  support_level: string;
  support_explanation: string;
};

const emptyMedicationRow: MedicationReviewRow = {
  name: "",
  dose: "",
  route: "",
  frequency: "",
  schedule: "",
  scheduled_time: "",
  prescriber: "",
  support_level: "",
  support_explanation: "",
};

function parseMedicationReviewRow(f: FieldRow): MedicationReviewRow {
  const raw = parseJsonValue(f);
  if (!raw) return { ...emptyMedicationRow, name: f.value ?? "" };
  return {
    name: valueString(raw.name ?? raw.medication_name),
    dose: valueString(raw.dose ?? raw.dosage),
    route: valueString(raw.route),
    frequency: valueString(raw.frequency),
    schedule: valueString(raw.schedule),
    scheduled_time: valueString(raw.scheduled_time),
    prescriber: valueString(raw.prescriber),
    support_level: valueString(raw.support_level),
    support_explanation: valueString(raw.support_explanation),
  };
}

function MedicationsReviewPanel({ subjectId, fields, onChanged }: { subjectId: string; fields: FieldRow[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const meds = fields.filter((f) => (f.target_field === "client_medication" || f.field_key === "client_medication") && !f.dismissed_at);
  const hasNoMedsSignal = fields.some((f) => f.target_field === "pcsp_has_medications" && String(f.value ?? "").toLowerCase() === "false" && !f.dismissed_at);
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Medications / MAR</div>
          <div className="text-[11px] text-muted-foreground">
            Review PCSP/MAR-extracted meds before finalizing.{" "}
            <details className="inline">
              <summary className="inline cursor-pointer underline decoration-dotted">Why this matters</summary>
              <span className="block mt-1 text-[11px]">
                These rows create the client's active medication list used by MAR/eMAR, medication attestations, client-specific training, and daily care documentation.
              </span>
            </details>
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {hasNoMedsSignal && meds.length === 0 && (
        <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
          NECTAR: PCSP says no medications. Add rows here if that's wrong.
        </div>
      )}
      {meds.length === 0 && !adding && !hasNoMedsSignal && (
        <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-50/40 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          No medications extracted. Add manually if the PCSP/MAR lists any.
        </div>
      )}

      {(meds.length > 0 || adding) && (
        <div className="mt-2 space-y-2">
          {meds.map((f) => (
            <MedicationReviewRowEditor key={f.id} subjectId={subjectId} fieldId={f.id} initial={parseMedicationReviewRow(f)} onChanged={onChanged} />
          ))}
          {adding && (
            <MedicationReviewRowEditor subjectId={subjectId} fieldId={null} initial={emptyMedicationRow} isNew onChanged={() => { setAdding(false); onChanged(); }} onCancel={() => setAdding(false)} />
          )}
        </div>
      )}
    </div>
  );
}

function MedField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function MedicationReviewRowEditor({
  subjectId, fieldId, initial, isNew, onChanged, onCancel,
}: {
  subjectId: string; fieldId: string | null; initial: MedicationReviewRow; isNew?: boolean; onChanged: () => void; onCancel?: () => void;
}) {
  const [row, setRow] = useState<MedicationReviewRow>(initial);
  const [dirty, setDirty] = useState(!!isNew);
  const save = useServerFn(saveManualReviewRow);
  const remove = useServerFn(removeExtractedField);
  const patch = <K extends keyof MedicationReviewRow>(key: K, value: MedicationReviewRow[K]) => {
    setRow((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };
  const saveMut = useMutation({
    mutationFn: () => save({ data: { subjectId, fieldId, targetField: "client_medication", value: row } }),
    onSuccess: () => { toast.success("Saved medication"); setDirty(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: () => remove({ data: { fieldId: fieldId as string } }),
    onSuccess: () => { toast.success("Removed from this import"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="rounded-md border border-border/60 bg-background p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          className="h-8 flex-1 min-w-0 text-sm font-medium"
          value={row.name}
          onChange={(e) => patch("name", e.target.value)}
          placeholder="Medication name"
        />
        <div className="flex shrink-0 items-center gap-1">
          {dirty && (
            <Button size="sm" className="h-7 px-2" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !row.name.trim()}>
              {saveMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save
            </Button>
          )}
          {isNew && onCancel && (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onCancel}>Cancel</Button>
          )}
          {!isNew && fieldId && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => removeMut.mutate()} disabled={removeMut.isPending}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <MedField label="Dose"><Input className="h-8 text-xs" value={row.dose} onChange={(e) => patch("dose", e.target.value)} placeholder="e.g. 10 mg" /></MedField>
        <MedField label="Route"><Input className="h-8 text-xs" value={row.route} onChange={(e) => patch("route", e.target.value)} placeholder="PO, IM…" /></MedField>
        <MedField label="Time"><Input className="h-8 text-xs" value={row.scheduled_time} onChange={(e) => patch("scheduled_time", e.target.value)} placeholder="08:00" /></MedField>
        <MedField label="Prescriber"><Input className="h-8 text-xs" value={row.prescriber} onChange={(e) => patch("prescriber", e.target.value)} placeholder="Prescriber" /></MedField>
      </div>

      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
        <MedField label="Frequency"><Input className="h-8 text-xs" value={row.frequency} onChange={(e) => patch("frequency", e.target.value)} placeholder="e.g. Daily" /></MedField>
        <MedField label="Schedule notes"><Input className="h-8 text-xs" value={row.schedule} onChange={(e) => patch("schedule", e.target.value)} placeholder="e.g. With food" /></MedField>
      </div>

      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-[160px_1fr]">
        <MedField label="Support level">
          <Select value={row.support_level || "__blank"} onValueChange={(v) => patch("support_level", v === "__blank" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__blank">Not specified</SelectItem>
              <SelectItem value="independent">Independent</SelectItem>
              <SelectItem value="reminder">Reminder</SelectItem>
              <SelectItem value="set_up">Set up</SelectItem>
              <SelectItem value="full_assist">Full assist</SelectItem>
            </SelectContent>
          </Select>
        </MedField>
        <MedField label="Support instructions"><Input className="h-8 text-xs" value={row.support_explanation} onChange={(e) => patch("support_explanation", e.target.value)} placeholder="How staff supports this med" /></MedField>
      </div>
    </div>
  );
}

// ---------------------------- PCSP Goals (structured) ----------------------------
type GoalShape = {
  text: string;
  domain?: string;
  why?: string;
  responsible_party?: string;
  service_codes?: string[];
  supports?: string;
  data_capture?: string;
  behavior_plan_link?: string;
  intake_sources?: string;
  success_criteria?: string;
  current_status?: string;
  strengths?: string;
  barriers?: string;
};

function parseGoal(value: string | null): GoalShape {
  if (!value) return { text: "" };
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return { text: trimmed };
  try {
    const j = JSON.parse(trimmed) as Record<string, unknown>;
    const codes = Array.isArray(j.service_codes)
      ? (j.service_codes as unknown[]).map((s) => String(s).trim()).filter(Boolean)
      : typeof j.service_codes === "string"
        ? String(j.service_codes).split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
        : undefined;
    return {
      text: typeof j.text === "string" ? j.text : "",
      domain: typeof j.domain === "string" ? j.domain : undefined,
      why: typeof j.why === "string" ? j.why : undefined,
      responsible_party: typeof j.responsible_party === "string" ? j.responsible_party : undefined,
      service_codes: codes && codes.length ? codes : undefined,
      supports: typeof j.supports === "string" ? j.supports : undefined,
      data_capture: typeof j.data_capture === "string" ? j.data_capture : undefined,
      behavior_plan_link: typeof j.behavior_plan_link === "string" ? j.behavior_plan_link : undefined,
      intake_sources: typeof j.intake_sources === "string" ? j.intake_sources : undefined,
      success_criteria: typeof j.success_criteria === "string" ? j.success_criteria : undefined,
      current_status: typeof j.current_status === "string" ? j.current_status : undefined,
      strengths: typeof j.strengths === "string" ? j.strengths : undefined,
      barriers: typeof j.barriers === "string" ? j.barriers : undefined,
    };
  } catch {
    return { text: trimmed };
  }
}

function serializeGoal(g: GoalShape): GoalShape {
  // Drop empty keys so the stored JSON stays compact and fieldText's { text } fallback keeps working.
  const out: GoalShape = { text: g.text.trim() };
  const put = <K extends keyof GoalShape>(k: K, v: GoalShape[K]) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && !v.trim()) return;
    if (Array.isArray(v) && v.length === 0) return;
    (out[k] as unknown) = typeof v === "string" ? v.trim() : v;
  };
  put("domain", g.domain);
  put("why", g.why);
  put("responsible_party", g.responsible_party);
  put("service_codes", g.service_codes);
  put("supports", g.supports);
  put("data_capture", g.data_capture);
  put("behavior_plan_link", g.behavior_plan_link);
  put("intake_sources", g.intake_sources);
  put("success_criteria", g.success_criteria);
  put("current_status", g.current_status);
  put("strengths", g.strengths);
  put("barriers", g.barriers);
  return out;
}

const GOAL_COMPLETENESS_CHECKS: Array<{ key: keyof GoalShape; label: string }> = [
  { key: "text", label: "Statement" },
  { key: "domain", label: "Domain" },
  { key: "why", label: "Why this goal" },
  { key: "responsible_party", label: "Who's responsible" },
  { key: "service_codes", label: "Service codes" },
  { key: "supports", label: "How staff support it" },
  { key: "data_capture", label: "What to track in daily logs" },
  { key: "success_criteria", label: "Success criteria" },
];

function goalCompleteness(g: GoalShape): { filled: number; total: number; missing: string[]; missingKeys: Set<keyof GoalShape> } {
  const missing: string[] = [];
  const missingKeys = new Set<keyof GoalShape>();
  let filled = 0;
  for (const { key, label } of GOAL_COMPLETENESS_CHECKS) {
    const v = g[key];
    const has = Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : !!v;
    if (has) filled += 1;
    else { missing.push(label); missingKeys.add(key); }
  }
  return { filled, total: GOAL_COMPLETENESS_CHECKS.length, missing, missingKeys };
}


function GoalsReviewPanel({ subjectId, fields, onChanged }: { subjectId: string; fields: FieldRow[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const extractionFailed = fields.some(
    (f) => (f.target_field === "pcsp_goal_extraction_failed" || f.field_key === "pcsp_goal_extraction_failed") && !f.dismissed_at,
  );
  const goals = fields.filter(
    (f) =>
      !f.dismissed_at &&
      f.target_field !== "pcsp_goal_extraction_failed" &&
      f.field_key !== "pcsp_goal_extraction_failed",
  );
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold">PCSP goals — full outline</div>
          <p className="mt-1 text-xs text-muted-foreground">
            NECTAR extracts more than the goal sentence. Confirm the rationale, who's responsible,
            which service codes fund each goal, how staff support it day-to-day, and what to
            capture in daily logs — this is what transitions into support strategies, client-specific
            training, the Person-Centered Profile, and the daily documentation staff are held to.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add goal
        </Button>
      </div>
      {extractionFailed && goals.length === 0 && (
        <div className="mt-3 rounded-lg border-2 border-amber-500 bg-amber-100/70 p-3 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="mb-1 text-sm font-semibold">NECTAR could not extract goals from this PCSP.</div>
          The uploaded document appears to contain a goals section, but NECTAR's extraction returned nothing after a
          focused retry. This is an extraction miss — do NOT publish this client until goals are entered. Add them
          manually below, or re-upload the PCSP to re-run extraction.
        </div>
      )}
      {!extractionFailed && goals.length === 0 && !adding && (
        <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50/40 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          No PCSP goals were found. If the PCSP includes goals, add them here so they are not missing from the live client profile.
        </div>
      )}
      <div className="mt-3 space-y-3">
        {goals.map((f, idx) => (
          <GoalReviewRowEditor key={f.id} subjectId={subjectId} fieldId={f.id} initial={f.value ?? ""} label={`Goal ${idx + 1}`} onChanged={onChanged} />
        ))}
        {adding && (
          <GoalReviewRowEditor subjectId={subjectId} fieldId={null} initial="" label="New goal" isNew onChanged={() => { setAdding(false); onChanged(); }} onCancel={() => setAdding(false)} />
        )}
      </div>
    </div>
  );
}

function GoalReviewRowEditor({
  subjectId, fieldId, initial, label, isNew, onChanged, onCancel,
}: {
  subjectId: string; fieldId: string | null; initial: string; label: string; isNew?: boolean; onChanged: () => void; onCancel?: () => void;
}) {
  const [goal, setGoal] = useState<GoalShape>(() => parseGoal(initial));
  const [dirty, setDirty] = useState(!!isNew);
  const [expanded, setExpanded] = useState(!!isNew);
  const [codesText, setCodesText] = useState(() => (goal.service_codes ?? []).join(", "));
  const save = useServerFn(saveManualReviewRow);
  const remove = useServerFn(removeExtractedField);

  const update = <K extends keyof GoalShape>(k: K, v: GoalShape[K]) => {
    setGoal((g) => ({ ...g, [k]: v }));
    setDirty(true);
  };
  const updateCodes = (raw: string) => {
    setCodesText(raw);
    const parsed = raw.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    setGoal((g) => ({ ...g, service_codes: parsed.length ? parsed : undefined }));
    setDirty(true);
  };

  const saveMut = useMutation({
    mutationFn: () => save({ data: { subjectId, fieldId, targetField: "pcsp_goal", value: serializeGoal(goal) } }),
    onSuccess: () => { toast.success("Saved goal"); setDirty(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: () => remove({ data: { fieldId: fieldId as string } }),
    onSuccess: () => { toast.success("Removed from this import"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeness = goalCompleteness(goal);
  const complete = completeness.missing.length === 0;

  return (
    <div className="rounded-lg border border-border/70 bg-background/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${complete ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"}`}>
            {completeness.filled}/{completeness.total} outlined
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide details" : "Show details"}
          </Button>
          {dirty && <Button size="sm" className="h-7" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !goal.text.trim()}>{saveMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save</Button>}
          {isNew && onCancel && <Button size="sm" variant="ghost" className="h-7" onClick={onCancel}>Cancel</Button>}
          {!isNew && fieldId && <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => removeMut.mutate()} disabled={removeMut.isPending}><Trash2 className="h-3 w-3" /></Button>}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Goal statement</label>
          {completeness.missingKeys.has("text") && <MissingBadge />}
        </div>
        <Textarea
          value={goal.text}
          onChange={(e) => update("text", e.target.value)}
          placeholder="Exactly as written on the PCSP (e.g. 'Blake will independently prepare two meals per week.')"
          className={`min-h-[64px] text-sm ${completeness.missingKeys.has("text") ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
        />
      </div>

      {!complete && !expanded && (
        <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-50/40 p-2 text-[11px] text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          <b>Needs your input:</b> {completeness.missing.join(" · ")}. Click <b>Show details</b> — the empty fields are highlighted in amber.
        </div>
      )}

      {expanded && !complete && (
        <div className="mt-3 rounded-md border border-amber-300/60 bg-amber-50/40 p-2 text-[11px] text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          <b>Still needed:</b> {completeness.missing.join(" · ")}. The empty fields below are outlined in amber.
        </div>
      )}

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Domain" placeholder="Community Living / Healthy Living / Safety / Employment" value={goal.domain ?? ""} onChange={(v) => update("domain", v)} isMissing={completeness.missingKeys.has("domain")} />
            <TextField label="Who's responsible" placeholder="Direct Support Staff, Support Coordinator, Guardian, Behaviorist…" value={goal.responsible_party ?? ""} onChange={(v) => update("responsible_party", v)} isMissing={completeness.missingKeys.has("responsible_party")} />
          </div>
          <TextField label="Service codes that fund / track this goal" placeholder="e.g. SLN, DSI, SEI" value={codesText} onChange={updateCodes} hint="Comma-separated DSPD codes. Drives which daily-log codes count toward this goal." isMissing={completeness.missingKeys.has("service_codes")} />
          <AreaField label="Why this goal exists (rationale)" placeholder="From the PCSP narrative or team discussion — the person-centered reason this goal matters." value={goal.why ?? ""} onChange={(v) => update("why", v)} isMissing={completeness.missingKeys.has("why")} />
          <AreaField label="How staff support it (day-to-day)" placeholder="Prompts, cues, environmental supports, task analysis, staffing ratio…" value={goal.supports ?? ""} onChange={(v) => update("supports", v)} isMissing={completeness.missingKeys.has("supports")} />
          <AreaField label="What staff capture in daily logs" placeholder="Frequency, independence level, quantity, mood, incidents — exactly what a shift note must include to show progress." value={goal.data_capture ?? ""} onChange={(v) => update("data_capture", v)} isMissing={completeness.missingKeys.has("data_capture")} />
          <div className="grid gap-3 md:grid-cols-2">
            <AreaField label="Related behavior plan section" placeholder="e.g. BSP Objective 2 (aggression replacement)" value={goal.behavior_plan_link ?? ""} onChange={(v) => update("behavior_plan_link", v)} />
            <AreaField label="Related intake / independence sources" placeholder="e.g. Client Independence Assessment §3; Intake Q12" value={goal.intake_sources ?? ""} onChange={(v) => update("intake_sources", v)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <AreaField label="Current status / baseline" placeholder="Where the person is today toward this goal." value={goal.current_status ?? ""} onChange={(v) => update("current_status", v)} />
            <AreaField label="Success criteria" placeholder="What 'achieved' looks like, measurably." value={goal.success_criteria ?? ""} onChange={(v) => update("success_criteria", v)} isMissing={completeness.missingKeys.has("success_criteria")} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <AreaField label="Strengths" placeholder="Personal strengths that support this goal." value={goal.strengths ?? ""} onChange={(v) => update("strengths", v)} />
            <AreaField label="Barriers" placeholder="Known barriers that staff need to plan around." value={goal.barriers ?? ""} onChange={(v) => update("barriers", v)} />
          </div>
        </div>
      )}
    </div>
  );
}

function MissingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="h-2.5 w-2.5" /> Needs input
    </span>
  );
}


function TextField({ label, value, onChange, placeholder, hint, isMissing }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; isMissing?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
        {isMissing && <MissingBadge />}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-md border bg-background px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 ${isMissing ? "border-amber-400 focus:ring-amber-400" : "border-input focus:ring-ring"}`}
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AreaField({ label, value, onChange, placeholder, isMissing }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; isMissing?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
        {isMissing && <MissingBadge />}
      </div>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`min-h-[64px] text-sm ${isMissing ? "border-amber-400 focus-visible:ring-amber-400" : ""}`} />
    </div>
  );
}



// ---------------------------- BillingCodesEditor (Prompt 18) ----------------------------
type BillingRowShape = {
  service_code: string;
  provider_name?: string | null;
  unit_type?: string | null;
  rate?: number | null;
  max_units?: number | null;
  monthly_max_units?: number | null;
  plan_start?: string | null;
  plan_end?: string | null;
  ownership_ack?: "not_ours" | null;
};
const UNIT_TYPE_OPTIONS = ["15 min", "day", "month", "session", "hour", "unit"];

function parseBillingRow(f: FieldRow): BillingRowShape | null {
  // Structured rows are stored as JSON text in staging for live-schema compatibility.
  const raw = (() => { try { return f.value ? JSON.parse(f.value) : null; } catch { return null; } })();
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sc = r.service_code ? String(r.service_code).toUpperCase() : "";
  if (!sc) return null;
  const num = (x: unknown): number | null => {
    if (x === null || x === undefined || x === "") return null;
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) ? n : null;
  };
  const str = (x: unknown): string | null => (x === null || x === undefined ? null : String(x));
  const ack = r.ownership_ack === "not_ours" ? "not_ours" as const : null;
  return {
    service_code: sc,
    provider_name: str(r.provider_name),
    unit_type: str(r.unit_type),
    rate: num(r.rate),
    max_units: num(r.max_units),
    monthly_max_units: num(r.monthly_max_units),
    plan_start: r.plan_start ? String(r.plan_start).slice(0, 10) : null,
    plan_end: r.plan_end ? String(r.plan_end).slice(0, 10) : null,
    ownership_ack: ack,
  };
}

function providerOwnership(providerName: string | null | undefined, tenant: TenantIdentity): "ours" | "external" | "unknown" {
  const norm = normalizeOrgName(providerName);
  if (!norm) return "unknown";
  for (const n of tenant.names) {
    const t = normalizeOrgName(n);
    if (!t) continue;
    if (norm === t || norm.includes(t) || t.includes(norm)) return "ours";
  }
  return "external";
}

function BillingCodesEditor({
  subjectId, rows, tenant, onChanged,
}: {
  subjectId: string; rows: FieldRow[]; tenant: TenantIdentity; onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());

  // Load persistent HIVE-approval status for every extracted-field row in
  // this billing table. Provider self-attestation is gone — status is
  // driven by billing_code_approval_requests / _messages.
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const { jobId } = Route.useParams();
  const lookupFn = useServerFn(lookupApprovalRequestsForFields);
  const fieldIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const approvalsQ = useQuery({
    enabled: !!orgId && fieldIds.length > 0,
    queryKey: ["approval-lookup", orgId, fieldIds],
    queryFn: () => lookupFn({ data: { organizationId: orgId!, extractedFieldIds: fieldIds } }),
  });
  const approvals: Record<string, ApprovalRequestRow | null> = approvalsQ.data ?? {};

  // Dialog target: which row are we asking / viewing right now.
  const [dialog, setDialog] = useState<null | {
    fieldId: string;
    code: string;
    providerName: string | null;
    requestId: string | null;
  }>(null);

  useEffect(() => {
    setRemovedIds((prev) => {
      if (prev.size === 0) return prev;
      const currentIds = new Set(rows.map((r) => r.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (currentIds.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const markRemoved = (fieldId: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(fieldId);
      return next;
    });
  };

  type Parsed = { field: FieldRow; row: BillingRowShape };
  const parsed: Parsed[] = rows
    .filter((f) => !f.dismissed_at && !removedIds.has(f.id))
    .map((f) => { const row = parseBillingRow(f); return row ? { field: f, row } : null; })
    .filter((x): x is Parsed => x !== null);

  const orgLabel = tenant.names[0] ?? "your organization";
  const externalRows = parsed.filter((p) => providerOwnership(p.row.provider_name, tenant) === "external");
  const activeExternal = externalRows.filter((p) => p.row.ownership_ack !== "not_ours");
  const unresolvedExternal = activeExternal;
  const pendingCount = unresolvedExternal.filter((p) => approvals[p.field.id]?.status === "pending").length;
  const approvedCount = unresolvedExternal.filter((p) => approvals[p.field.id]?.status === "approved").length;

  return (
    <div id="billing-codes" className="rounded-2xl border border-border bg-card p-3 md:p-4 shadow-[var(--shadow-card)]">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Billing codes on the PCSP</div>
          <div className="text-[11px] leading-snug text-muted-foreground">
            Ownership shows who bills each code. Only <span className="font-medium">Ours</span> flows to your 520s.{" "}
            <details className="inline">
              <summary className="inline cursor-pointer text-primary underline underline-offset-2">Details</summary>
              <span className="ml-1">
                For an external code, click <span className="font-medium">Not my organization</span> to keep it on the record without billing responsibility, or <span className="font-medium">Request HIVE approval</span> to have HIVE Admin review it in your Inbox.
              </span>
            </details>
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="mr-1 h-3 w-3" /> Add code
        </Button>
      </div>

      {parsed.length === 0 && !adding && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
          No billable codes were found in this document. Use "Add code" to enter them manually.
        </div>
      )}

      {(parsed.length > 0 || adding) && (
        <div className="overflow-x-auto rounded-md border border-border/60">
          <table className="w-full text-left text-[11px]">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-1.5 px-1.5 font-medium w-[56px]">Code</th>
                <th className="py-1.5 px-1.5 font-medium">Provider</th>
                <th className="py-1.5 px-1.5 font-medium w-[150px]">Ownership</th>
                <th className="py-1.5 px-1.5 font-medium w-[70px]">Unit</th>
                <th className="py-1.5 px-1.5 font-medium w-[64px]">Rate</th>
                <th className="py-1.5 px-1.5 font-medium w-[68px]">Annual</th>
                <th className="py-1.5 px-1.5 font-medium w-[56px]">Mo</th>
                <th className="py-1.5 px-1.5 font-medium w-[150px]">Term</th>
                <th className="py-1.5 px-1.5 font-medium w-[70px]">Status</th>
                <th className="py-1.5 px-1.5 w-[36px]" />
              </tr>
            </thead>
            <tbody>
              {parsed.map((p) => (
                <BillingRowEditor
                  key={p.field.id}
                  fieldId={p.field.id}
                  subjectId={subjectId}
                  initial={p.row}
                  tenant={tenant}
                  approvalRequest={approvals[p.field.id] ?? null}
                  onOpenApproval={(codeValue, providerName, requestId) => setDialog({
                    fieldId: p.field.id, code: codeValue, providerName, requestId,
                  })}
                  onChanged={onChanged}
                  onRemoved={markRemoved}
                />
              ))}
              {adding && (
                <BillingRowEditor
                  fieldId={null}
                  subjectId={subjectId}
                  initial={{ service_code: "" }}
                  tenant={tenant}
                  approvalRequest={null}
                  onOpenApproval={() => {}}
                  isNew
                  onChanged={() => { setAdding(false); onChanged(); }}
                  onCancel={() => setAdding(false)}
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeExternal.length > 0 && (
        <details className="mt-2 rounded-md border border-amber-300/60 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <summary className="cursor-pointer font-semibold">
            {activeExternal.length} outside-provider code{activeExternal.length === 1 ? "" : "s"} on this PCSP
            <span className="ml-1 font-normal">· {approvedCount} approved · {pendingCount} awaiting HIVE</span>
          </summary>
          <div className="mt-1.5">
            Provider on {activeExternal.length === 1 ? "this line" : "these lines"} does not match <span className="font-medium">{orgLabel}</span>. Use <span className="font-medium">Not my organization</span> to keep it purely informational, or <span className="font-medium">Request HIVE approval</span> to have HIVE Admin review it.
          </div>
          <div className="mt-1 font-mono text-[10px]">
            {activeExternal.map((p) => `${p.row.service_code} → ${p.row.provider_name ?? "unknown"}`).join("  •  ")}
          </div>
        </details>
      )}


      {dialog && orgId && (
        <ApprovalDialog
          open={!!dialog}
          onOpenChange={(o) => { if (!o) setDialog(null); }}
          organizationId={orgId}
          requestId={dialog.requestId}
          code={dialog.code}
          providerNameOnPcsp={dialog.providerName}
          importJobId={jobId}
          subjectId={subjectId}
          extractedFieldId={dialog.fieldId}
          onCreated={() => { approvalsQ.refetch(); }}
        />
      )}
    </div>
  );
}

function isPending(r: BillingRowShape): boolean {
  return !(r.rate && r.rate > 0) || !(r.max_units && r.max_units > 0);
}

function BillingRowEditor({
  fieldId, subjectId, initial, tenant, approvalRequest, onOpenApproval, isNew, onChanged, onCancel, onRemoved,
}: {
  fieldId: string | null;
  subjectId: string;
  initial: BillingRowShape;
  tenant: TenantIdentity;
  approvalRequest: ApprovalRequestRow | null;
  onOpenApproval: (code: string, providerName: string | null, requestId: string | null) => void;
  isNew?: boolean;
  onChanged: () => void;
  onCancel?: () => void;
  onRemoved?: (fieldId: string) => void;
}) {
  const [row, setRow] = useState<BillingRowShape>(initial);
  const [dirty, setDirty] = useState(!!isNew);
  const save = useServerFn(saveBillingCodeRow);
  const remove = useServerFn(removeExtractedField);

  const patch = <K extends keyof BillingRowShape>(k: K, v: BillingRowShape[K]) => {
    setRow((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
  };
  const numOrNull = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          subjectId,
          fieldId: fieldId ?? null,
          row: {
            service_code: row.service_code.toUpperCase(),
            provider_name: row.provider_name ?? null,
            unit_type: row.unit_type ?? null,
            rate: row.rate ?? null,
            max_units: row.max_units ?? null,
            monthly_max_units: row.monthly_max_units ?? null,
            plan_start: row.plan_start ?? null,
            plan_end: row.plan_end ?? null,
            ownership_ack: row.ownership_ack ?? null,
          },
        },
      }),
    onSuccess: () => { toast.success("Saved"); setDirty(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: () => remove({ data: { fieldId: fieldId as string } }),
    onSuccess: () => {
      if (fieldId) onRemoved?.(fieldId);
      toast.success("Removed from this import — it will not be created or billed.");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = isPending(row);
  const allCodes = EVV_SERVICE_CODES.map((c) => c.code);
  const notOurs = row.ownership_ack === "not_ours";
  const ro = (v: string | number | null | undefined) =>
    v == null || v === "" ? <span className="text-muted-foreground/60">—</span> : <span>{v}</span>;

  return (
    <tr className={`border-b border-border/60 align-middle ${notOurs ? "bg-muted/30 text-muted-foreground" : ""}`}>
      <td className="py-1 px-1.5">
        {isNew ? (
          <Select value={row.service_code} onValueChange={(v) => patch("service_code", v)}>
            <SelectTrigger className="h-7 w-full px-1.5 text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {allCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">{row.service_code}</Badge>
        )}
      </td>
      <td className="py-1 px-1.5">
        {notOurs ? (
          <span className="text-[11px]">{row.provider_name ?? <span className="text-muted-foreground/60">—</span>}</span>
        ) : (
          <Input className="h-7 w-full px-1.5 text-[11px]" value={row.provider_name ?? ""} onChange={(e) => patch("provider_name", e.target.value || null)} />
        )}
      </td>
      <td className="py-1 px-1.5">
        {(() => {
          const own = providerOwnership(row.provider_name, tenant);
          if (own === "ours") {
            return <Badge variant="outline" className="whitespace-nowrap border-emerald-500/60 text-emerald-600 text-[10px] px-1.5 py-0">Ours</Badge>;
          }
          if (own === "unknown") {
            return <Badge variant="outline" className="whitespace-nowrap text-muted-foreground text-[10px] px-1.5 py-0">Unspecified</Badge>;
          }
          // Admin already acknowledged this external code is not ours.
          // Row stays visible for the record; no HIVE approval required.
          if (row.ownership_ack === "not_ours") {
            const clearAck = () => {
              const next: BillingRowShape = { ...row, ownership_ack: null };
              setRow(next);
              save({ data: { subjectId, fieldId: fieldId ?? null, row: {
                service_code: next.service_code.toUpperCase(),
                provider_name: next.provider_name ?? null,
                unit_type: next.unit_type ?? null,
                rate: next.rate ?? null,
                max_units: next.max_units ?? null,
                monthly_max_units: next.monthly_max_units ?? null,
                plan_start: next.plan_start ?? null,
                plan_end: next.plan_end ?? null,
                ownership_ack: null,
              } } }).then(() => { toast.success("Undone"); onChanged(); }).catch((e: Error) => toast.error(e.message));
            };
            return (
              <div className="flex flex-col gap-0.5">
                <Badge variant="outline" className="whitespace-nowrap border-slate-400/60 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0">
                  Not our organization
                </Badge>
                <span className="text-[9px] text-muted-foreground leading-tight">Informational only — not billed or tracked.</span>
                <button type="button" className="text-[10px] text-primary underline underline-offset-2 text-left" onClick={clearAck}>
                  Undo
                </button>
              </div>
            );
          }
          // External provider: replace self-attest with a HIVE approval workflow.
          const ar = approvalRequest;
          const openDialog = () => onOpenApproval(row.service_code, row.provider_name ?? null, ar?.id ?? null);
          const markNotOurs = () => {
            const next: BillingRowShape = { ...row, ownership_ack: "not_ours" };
            setRow(next);
            save({ data: { subjectId, fieldId: fieldId ?? null, row: {
              service_code: next.service_code.toUpperCase(),
              provider_name: next.provider_name ?? null,
              unit_type: next.unit_type ?? null,
              rate: next.rate ?? null,
              max_units: next.max_units ?? null,
              monthly_max_units: next.monthly_max_units ?? null,
              plan_start: next.plan_start ?? null,
              plan_end: next.plan_end ?? null,
              ownership_ack: "not_ours",
            } } }).then(() => { toast.success("Marked as not your organization"); onChanged(); }).catch((e: Error) => toast.error(e.message));
          };
          let statusEl: React.ReactNode;
          let btnLabel: string;
          if (!ar || ar.status === "withdrawn") {
            statusEl = null;
            btnLabel = "Request HIVE approval";
          } else if (ar.status === "pending") {
            statusEl = <Badge variant="outline" className="whitespace-nowrap border-amber-500/60 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0">Awaiting HIVE</Badge>;
            btnLabel = "View thread";
          } else if (ar.status === "approved") {
            statusEl = <Badge variant="outline" className="whitespace-nowrap border-emerald-500/60 text-emerald-700 dark:text-emerald-300 text-[10px] px-1.5 py-0"><ShieldCheck className="mr-1 h-2.5 w-2.5" />HIVE approved</Badge>;
            btnLabel = "View thread";
          } else {
            statusEl = <Badge variant="outline" className="whitespace-nowrap border-destructive/60 text-destructive text-[10px] px-1.5 py-0">Denied</Badge>;
            btnLabel = "View thread";
          }
          return (
            <div className="flex flex-col gap-0.5">
              <Badge variant="outline" className="whitespace-nowrap border-amber-500/60 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0">
                <AlertTriangle className="mr-1 h-2.5 w-2.5" /> External
              </Badge>
              {statusEl}
              {fieldId && (!ar || ar.status === "withdrawn") && (
                <button
                  type="button"
                  className="text-[10px] text-slate-600 dark:text-slate-300 underline underline-offset-2 text-left"
                  onClick={markNotOurs}
                  title="Keep this code on the record but confirm this org is not responsible for billing it"
                >
                  Not my org
                </button>
              )}
              {fieldId && (
                <button
                  type="button"
                  className="text-[10px] text-primary underline underline-offset-2 text-left"
                  onClick={openDialog}
                  title="Send a justification to HIVE Admin for review"
                >
                  {btnLabel}
                  {ar && ar.unread_for_me > 0 && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-destructive px-1.5 py-0 text-[9px] font-semibold text-white">
                      {ar.unread_for_me}
                    </span>
                  )}
                </button>
              )}
            </div>
          );
        })()}
      </td>
      <td className="py-1 px-1.5">
        {notOurs ? (
          <span className="text-[11px]">{ro(row.unit_type)}</span>
        ) : (
          <Select value={row.unit_type ?? ""} onValueChange={(v) => patch("unit_type", v)}>
            <SelectTrigger className="h-7 w-full px-1.5 text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {UNIT_TYPE_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="py-1 px-1.5 text-right">
        {notOurs ? (
          <span className="text-[11px]">{ro(row.rate)}</span>
        ) : (
          <Input className="h-7 w-full px-1.5 text-[11px] text-right" inputMode="decimal" value={row.rate ?? ""} onChange={(e) => patch("rate", numOrNull(e.target.value))} />
        )}
      </td>
      <td className="py-1 px-1.5 text-right">
        {notOurs ? (
          <span className="text-[11px]">{ro(row.max_units)}</span>
        ) : (
          <Input className="h-7 w-full px-1.5 text-[11px] text-right" inputMode="numeric" value={row.max_units ?? ""} onChange={(e) => patch("max_units", numOrNull(e.target.value))} />
        )}
      </td>
      <td className="py-1 px-1.5 text-right">
        {notOurs ? (
          <span className="text-[11px]">{ro(row.monthly_max_units)}</span>
        ) : (
          <Input className="h-7 w-full px-1.5 text-[11px] text-right" inputMode="numeric" value={row.monthly_max_units ?? ""} onChange={(e) => patch("monthly_max_units", numOrNull(e.target.value))} />
        )}
      </td>
      <td className="py-1 px-1.5">
        {notOurs ? (
          <span className="text-[10px]">
            {row.plan_start ?? "—"} – {row.plan_end ?? "—"}
          </span>
        ) : (
          <div className="flex items-center gap-0.5">
            <Input className="h-7 w-full px-1 text-[10px]" type="date" value={row.plan_start ?? ""} onChange={(e) => patch("plan_start", e.target.value || null)} title="Start" />
            <span className="text-muted-foreground text-[10px]">–</span>
            <Input className="h-7 w-full px-1 text-[10px]" type="date" value={row.plan_end ?? ""} onChange={(e) => patch("plan_end", e.target.value || null)} title="End" />
          </div>
        )}
      </td>
      <td className="py-1 px-1.5">
        {notOurs ? null : pending ? (
          <Badge variant="outline" className="whitespace-nowrap text-amber-600 text-[10px] px-1.5 py-0">
            <AlertTriangle className="mr-1 h-2.5 w-2.5" /> pending
          </Badge>
        ) : (
          <Badge variant="outline" className="text-emerald-600 text-[10px] px-1.5 py-0">ready</Badge>
        )}
      </td>
      <td className="py-1 pr-0">
        <div className="flex items-center justify-end gap-0.5">
          {dirty && !notOurs && (
            <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !row.service_code}>
              {saveMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save
            </Button>
          )}
          {isNew && onCancel && (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={onCancel}>Cancel</Button>
          )}
          {!isNew && fieldId && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => removeMut.mutate()} disabled={removeMut.isPending}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}


function FieldRowEditor({
  field, targetFields, matchedValue, showDiff, onChanged,
}: {
  field: FieldRow; targetFields: string[]; matchedValue: string | null; showDiff: boolean; onChanged: () => void;
}) {
  const edit = useServerFn(editExtractedField);
  const dismiss = useServerFn(removeExtractedField);
  const restore = useServerFn(restoreExtractedField);
  const [value, setValue] = useState(field.value ?? "");
  const [target, setTarget] = useState(field.target_field);
  const [dirty, setDirty] = useState(false);
  const dismissed = !!field.dismissed_at;

  const m = useMutation({
    mutationFn: () => edit({ data: { fieldId: field.id, value, target_field: target } }),
    onSuccess: () => { toast.success("Saved"); setDirty(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dismissM = useMutation({
    mutationFn: () => dismiss({ data: { fieldId: field.id } }),
    onSuccess: () => { toast.success("Dismissed — will not commit"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const restoreM = useMutation({
    mutationFn: () => restore({ data: { fieldId: field.id } }),
    onSuccess: () => { toast.success("Restored"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const flag = field.status === "flag";
  const placed = field.status === "placed";
  const edited = field.status === "edited";

  let diffTag: React.ReactNode = null;
  if (showDiff && !dismissed) {
    if (!matchedValue) diffTag = <Badge variant="outline" className="text-emerald-600">new</Badge>;
    else if ((matchedValue ?? "") !== (value ?? "")) diffTag = <Badge variant="outline" className="text-amber-600">changed</Badge>;
    else diffTag = <Badge variant="outline" className="text-muted-foreground">same</Badge>;
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border border-border p-2 sm:flex-row sm:items-center ${dismissed ? "bg-muted/40 opacity-60" : ""}`}
    >
      <Input
        className={`sm:max-w-xs ${dismissed ? "line-through text-muted-foreground" : ""}`}
        value={value}
        onChange={(e) => { setValue(e.target.value); setDirty(true); }}
        disabled={dismissed}
      />
      <span className="text-xs text-muted-foreground">→</span>
      {field.is_custom_attribute ? (
        <Input
          className={`sm:max-w-[200px] ${dismissed ? "line-through text-muted-foreground" : ""}`}
          value={target}
          onChange={(e) => { setTarget(e.target.value); setDirty(true); }}
          disabled={dismissed}
        />
      ) : (
        <Select value={target} onValueChange={(v) => { setTarget(v); setDirty(true); }} disabled={dismissed}>
          <SelectTrigger className={`sm:max-w-[200px] ${dismissed ? "line-through text-muted-foreground" : ""}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {targetFields.map((t) => <SelectItem key={t} value={t}>{labelForField(t)}</SelectItem>)}
            {!targetFields.includes(target) && <SelectItem value={target}>{labelForField(target)}</SelectItem>}

          </SelectContent>
        </Select>
      )}
      <div className="flex flex-1 items-center gap-1.5 text-xs">
        {dismissed && <Badge variant="outline" className="text-muted-foreground">dismissed</Badge>}
        {!dismissed && placed && <Badge variant="outline" className="text-emerald-600">placed</Badge>}
        {!dismissed && flag && <Badge variant="outline" className="text-amber-600"><AlertTriangle className="mr-1 h-3 w-3" />check</Badge>}
        {!dismissed && edited && <Badge variant="outline" className="text-primary"><Pencil className="mr-1 h-3 w-3" />edited</Badge>}
        {diffTag}
        {showDiff && !dismissed && matchedValue && matchedValue !== value && (
          <span className="text-muted-foreground">was: <span className="font-mono">{matchedValue}</span></span>
        )}
      </div>
      {dirty && !dismissed && (
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}Save
        </Button>
      )}
      {dismissed ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => restoreM.mutate()}
          disabled={restoreM.isPending}
          title="Restore this mapping"
        >
          <RotateCcw className="mr-1 h-3 w-3" /> Undo
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => dismissM.mutate()}
          disabled={dismissM.isPending}
          title="Exclude this row from commit"
          aria-label="Dismiss row"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// ---------------------------- CertsPanel ----------------------------
const DEFAULT_CERTS = ["cpr_first_aid", "medication_admin", "tb_screening", "background_check"];
function CertsPanel({
  subjectId, certs, onChanged,
}: { subjectId: string; certs: Array<{ id: string; cert_key: string; state: "unverified"|"verified"|"provisional"; file_name?: string|null; expiry_date?: string|null }>; onChanged: () => void }) {
  const known = new Set(certs.map((c) => c.cert_key));
  const all = [...DEFAULT_CERTS, ...certs.map((c) => c.cert_key).filter((k) => !DEFAULT_CERTS.includes(k))];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-2 text-sm font-semibold">Certs & training documents</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Upload the document → <strong>Verified</strong>. Admin sign-off without a doc → <strong>Provisional</strong> (reminder runs in Requirements until on file).
        Renewal alerts reuse the existing Requirements system.
      </p>
      <div className="space-y-2">
        {all.map((key) => {
          const existing = certs.find((c) => c.cert_key === key);
          return <CertRow key={key} subjectId={subjectId} certKey={key} existing={existing} onChanged={onChanged} hint={!known.has(key) ? "Default cert" : undefined} />;
        })}
      </div>
    </div>
  );
}
function CertRow({
  subjectId, certKey, existing, onChanged, hint,
}: {
  subjectId: string; certKey: string;
  existing: { id: string; cert_key: string; state: "unverified"|"verified"|"provisional"; file_name?: string|null; expiry_date?: string|null } | undefined;
  onChanged: () => void; hint?: string;
}) {
  const { jobId } = Route.useParams();
  const upsert = useServerFn(upsertCertDocument);
  const [uploading, setUploading] = useState(false);

  const state = existing?.state ?? "unverified";
  const badge = state === "verified"
    ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Verified</Badge>
    : state === "provisional"
      ? <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Provisional · reminder</Badge>
      : <Badge variant="outline">Unverified</Badge>;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `cert/${jobId}/${subjectId}/${certKey}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("import-documents").upload(path, file, { upsert: false });
      if (upErr) throw new Error(upErr.message);
      // crude expiry inference: try to parse a date in the filename
      const dateMatch = file.name.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
      const expiry = dateMatch ? dateMatch[1].replace(/\//g, "-") : undefined;
      await upsert({ data: { subjectId, cert_key: certKey, storage_path: path, file_name: file.name, expiry_date: expiry, state: "verified" } });
      toast.success(`${certKey} verified`);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const signOff = useMutation({
    mutationFn: () => upsert({ data: { subjectId, cert_key: certKey, state: "provisional", notes: "Admin sign-off; document pending" } }),
    onSuccess: () => { toast.success("Marked provisional — reminder set"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium">{certKey.replace(/_/g, " ")}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {badge}
          {existing?.file_name && <span className="truncate">{existing.file_name}</span>}
          {existing?.expiry_date && <span>· expires {existing.expiry_date}</span>}
          {hint && !existing && <span>· {hint}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload
          <input type="file" className="hidden" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={handleUpload} disabled={uploading} />
        </label>
        <Button size="sm" variant="outline" onClick={() => signOff.mutate()} disabled={signOff.isPending || state === "provisional"}>
          Admin sign-off
        </Button>
      </div>
    </div>
  );
}

// ---------------------------- QuestionsPanel ----------------------------
function QuestionsPanel({
  questions, onChanged,
}: { questions: Array<{ id: string; question: string; context: string | null; answer: string | null }>; onChanged: () => void }) {
  if (questions.length === 0) {
    return <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-[var(--shadow-card)]">No clarifying questions from NECTAR.</div>;
  }
  return (
    <div className="space-y-2">
      {questions.map((q) => <QuestionItem key={q.id} q={q} onChanged={onChanged} />)}
    </div>
  );
}
function QuestionItem({ q, onChanged }: { q: { id: string; question: string; context: string | null; answer: string | null }; onChanged: () => void }) {
  const answer = useServerFn(answerNectarQuestion);
  const [text, setText] = useState(q.answer ?? "");
  const m = useMutation({
    mutationFn: () => answer({ data: { questionId: q.id, answer: text } }),
    onSuccess: () => { toast.success("Answer saved"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-2">
        <FileQuestion className="mt-0.5 h-4 w-4 text-primary" />
        <div className="flex-1">
          <div className="text-sm font-medium">{q.question}</div>
          {q.context && <div className="mt-0.5 text-xs text-muted-foreground">{q.context}</div>}
          <Textarea className="mt-2" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || !text.trim()}>{m.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}Save answer</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------- UnfiledPanel ----------------------------
const FILE_SECTIONS = ["notes", "contact_info", "emergency_contact", "preferences", "medical", "behavioral"];
function UnfiledPanel({
  items, onChanged,
}: { items: Array<{ id: string; text: string; filed_to: string | null }>; onChanged: () => void }) {
  if (items.length === 0) {
    return <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-[var(--shadow-card)]">NECTAR filed every note from your uploads into a section. Nothing here needs your attention.</div>;
  }
  return (
    <div className="space-y-2">
      {items.map((it) => <UnfiledItem key={it.id} item={it} onChanged={onChanged} />)}
    </div>
  );
}
function UnfiledItem({ item, onChanged }: { item: { id: string; text: string; filed_to: string | null }; onChanged: () => void }) {
  const file = useServerFn(fileUnfiledItem);
  const [section, setSection] = useState(item.filed_to ?? "");
  const [newSection, setNewSection] = useState("");
  const [mode, setMode] = useState<"existing" | "new" | "leave">(item.filed_to ? "existing" : "leave");

  const m = useMutation({
    mutationFn: () => file({ data: { itemId: item.id, filed_to: mode === "leave" ? null : mode === "new" ? newSection.trim() : section } }),
    onSuccess: () => { toast.success("Filed"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-2 text-sm">
        <Inbox className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="flex-1">{item.text}</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={mode} onValueChange={(v) => setMode(v as "existing" | "new" | "leave")}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="existing">File under existing</SelectItem>
            <SelectItem value="new">Create new section</SelectItem>
            <SelectItem value="leave">Leave for later</SelectItem>
          </SelectContent>
        </Select>
        {mode === "existing" && (
          <Select value={section} onValueChange={setSection}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Pick a section" /></SelectTrigger>
            <SelectContent>
              {FILE_SECTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {mode === "new" && <Input className="w-[200px]" placeholder="New section name" value={newSection} onChange={(e) => setNewSection(e.target.value)} />}
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || (mode === "existing" && !section) || (mode === "new" && !newSection.trim())}>
          {m.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}Save
        </Button>
      </div>
      {item.filed_to && <div className="mt-2 text-xs text-muted-foreground">Currently filed under <strong>{item.filed_to}</strong></div>}
    </div>
  );
}

// ---------------------------- ImportSummaryPanel ----------------------------
// Final read-only outline shown at Step 8. Recaps every previous step so the
// admin sees the complete "this is what will be created" record in one place
// before clicking Complete client setup. All editing still happens in Steps 1-7.
function ImportSummaryPanel({
  subject, fields, unfiled, assignments, subjects, tenant, jobMode, onJumpToStep,
}: {
  subject: SubjectRow;
  fields: FieldRow[];
  unfiled: Array<{ id: string; text: string; filed_to: string | null }>;
  assignments: Array<{ id: string; relation_type: string; staff_subject_id: string | null; client_subject_id: string | null; status: string; inference_reason: string | null }>;
  subjects: SubjectRow[];
  tenant: TenantIdentity;
  jobMode: "employee" | "client";
  onJumpToStep: (s: WizardStepId) => void;
}) {
  const byField = (key: string): string | null => {
    const f = fields.find((x) => x.target_field === key && !x.dismissed_at);
    return f?.value?.trim() || null;
  };
  const many = (key: string): string[] => {
    return fields
      .filter((x) => x.target_field === key && !x.dismissed_at && x.value?.trim())
      .map((x) => x.value!.trim());
  };
  const missing = (v: string | null | undefined) =>
    v ? <span>{v}</span> : <span className="text-muted-foreground/60 italic">— none captured —</span>;

  // Person
  const firstName = byField("first_name") ?? subject.display_name.split(/\s+/)[0] ?? null;
  const lastName = byField("last_name");
  const dob = byField("date_of_birth");
  const medicaid = byField("medicaid_id");
  const address = byField("mailing_address") ?? byField("address");
  const phone = byField("phone");
  const scName = byField("support_coordinator_name");
  const scCompany = byField("support_coordinator_company");
  const guardianName = byField("guardian_name");
  const guardianRel = byField("guardian_relationship");
  const guardianPhone = byField("guardian_phone");
  const isOwnGuardian = (byField("is_own_guardian") ?? "").toLowerCase() === "true";

  // Health
  const diagnoses = many("diagnoses").concat(many("chronic_conditions"));
  const allergies = many("allergies");
  const abi = (byField("has_abi") ?? "").toLowerCase() === "true";
  const dnr = (byField("dnr_applicable") ?? byField("dnr_status") ?? "").toLowerCase();
  const hasDnr = dnr && !["false", "no", "none", ""].includes(dnr);
  const hr = (byField("hr_applicable") ?? "").toLowerCase() === "true";
  const pcpName = byField("pcp_name") ?? byField("primary_care_name");
  const pcpPhone = byField("pcp_phone") ?? byField("primary_care_phone");

  // Medications
  const medRows = fields.filter(
    (f) => (f.target_field === "client_medication" || f.field_key === "client_medication") && !f.dismissed_at,
  );
  const hasNoMedsSignal = fields.some(
    (f) => f.target_field === "pcsp_has_medications" && String(f.value ?? "").toLowerCase() === "false" && !f.dismissed_at,
  );
  const parsedMeds = medRows.map(parseMedicationReviewRow);

  // Goals
  const goalRows = fields.filter(
    (f) => (f.target_field === "pcsp_goal" || f.field_key === "pcsp_goal") && !f.dismissed_at,
  );
  const goalExtractionFailed = fields.some(
    (f) => (f.target_field === "pcsp_goal_extraction_failed" || f.field_key === "pcsp_goal_extraction_failed") && !f.dismissed_at,
  );
  const parsedGoals = goalRows.map((f) => parseGoal(f.value));
  const incompleteGoals = parsedGoals.filter((g) => goalCompleteness(g).missing.length > 0).length;

  // Services / billing rows
  const billingFields = fields.filter((f) => f.target_field === "billing_code_row" && !f.dismissed_at);
  const parsedBilling = billingFields
    .map((f) => parseBillingRow(f))
    .filter((b): b is BillingRowShape => b !== null);
  const oursCount = parsedBilling.filter((r) => providerOwnership(r.provider_name, tenant) === "ours").length;
  const externalActive = parsedBilling.filter(
    (r) => providerOwnership(r.provider_name, tenant) === "external" && r.ownership_ack !== "not_ours",
  );
  const notOursCount = parsedBilling.filter((r) => r.ownership_ack === "not_ours").length;
  const unknownProviderCount = parsedBilling.filter((r) => providerOwnership(r.provider_name, tenant) === "unknown").length;

  // Documents (unfiled = supporting docs bucket)
  const docs = unfiled;

  // Staff / assignments
  const clientId = subject.id;
  const staffAssignments = assignments.filter(
    (a) => (jobMode === "client" ? a.client_subject_id === clientId : a.staff_subject_id === clientId),
  );
  const staffNames = staffAssignments.map((a) => {
    const other = jobMode === "client" ? a.staff_subject_id : a.client_subject_id;
    return subjects.find((s) => s.id === other)?.display_name ?? "Unknown";
  });

  // Missing blockers (only last_name is a hard blocker; surface others as advisory)
  const missingBlockers: string[] = [];
  if (!lastName) missingBlockers.push("Last name");

  const SectionHeader = ({
    title, count, tone = "neutral", step,
  }: { title: string; count?: string; tone?: "neutral" | "amber" | "emerald"; step: WizardStepId }) => {
    const toneCls =
      tone === "amber" ? "text-amber-700 dark:text-amber-300 border-amber-300/60"
      : tone === "emerald" ? "text-emerald-700 dark:text-emerald-300 border-emerald-300/60"
      : "text-muted-foreground border-border";
    return (
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide">{title}</div>
          {count && (
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${toneCls}`}>{count}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onJumpToStep(step)}
          className="text-[10px] text-primary underline underline-offset-2 hover:no-underline"
        >
          Edit
        </button>
      </div>
    );
  };

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-0.5 text-[11px]">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{value}</div>
    </div>
  );

  const cardCls = "rounded-lg border border-border bg-card/60 p-2.5 shadow-[var(--shadow-card)]";

  return (
    <div className="space-y-2">
      {/* Header strip */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Final review — everything below will be created on Complete client setup</div>
            <div className="mt-0.5 text-sm font-semibold">
              {[firstName, lastName].filter(Boolean).join(" ") || subject.display_name}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {missingBlockers.length > 0 ? (
              <span className="rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                Blocked · missing {missingBlockers.join(", ")}
              </span>
            ) : (
              <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                Required fields present
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Two-column outline on wide screens */}
      <div className="grid gap-2 md:grid-cols-2">
        {/* Person & contacts */}
        <div className={cardCls}>
          <SectionHeader title="Person & contacts" step="person" />
          <Row label="First name" value={missing(firstName)} />
          <Row label="Last name" value={lastName ? <span>{lastName}</span> : <span className="text-destructive">— required —</span>} />
          <Row label="Date of birth" value={missing(dob)} />
          <Row label="Medicaid ID" value={missing(medicaid)} />
          <Row label="Address" value={missing(address)} />
          <Row label="Phone" value={missing(phone)} />
          <Row label="Support coordinator" value={missing([scName, scCompany].filter(Boolean).join(" · ") || null)} />
          <Row
            label="Guardian"
            value={
              isOwnGuardian ? <span>Self / own guardian</span>
              : guardianName ? <span>{[guardianName, guardianRel, guardianPhone].filter(Boolean).join(" · ")}</span>
              : missing(null)
            }
          />
        </div>

        {/* Health & medical */}
        <div className={cardCls}>
          <SectionHeader title="Health & medical" step="health" count={`${diagnoses.length} dx · ${allergies.length} allergy`} />
          <Row label="Diagnoses" value={diagnoses.length ? diagnoses.join(", ") : missing(null)} />
          <Row label="Allergies" value={allergies.length ? allergies.join(", ") : missing(null)} />
          <Row
            label="Clinical flags"
            value={
              [abi && "ABI", hasDnr && "DNR", hr && "Human Rights"].filter(Boolean).length
                ? [abi && "ABI", hasDnr && "DNR", hr && "Human Rights"].filter(Boolean).join(" · ")
                : missing(null)
            }
          />
          <Row label="PCP" value={pcpName ? <span>{pcpName}{pcpPhone ? ` · ${pcpPhone}` : ""}</span> : missing(null)} />
        </div>

        {/* Medications */}
        <div className={cardCls}>
          <SectionHeader
            title="Medications"
            step="medications"
            tone={parsedMeds.length === 0 && !hasNoMedsSignal ? "amber" : "neutral"}
            count={parsedMeds.length ? `${parsedMeds.length} med${parsedMeds.length === 1 ? "" : "s"}` : hasNoMedsSignal ? "none per PCSP" : "0 · needs review"}
          />
          {parsedMeds.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">
              {hasNoMedsSignal ? "PCSP indicates no medications." : "— none captured — add manually in Step 3 if the PCSP lists any."}
            </div>
          ) : (
            <ul className="space-y-0.5 text-[11px]">
              {parsedMeds.map((m, i) => (
                <li key={i}>
                  <span className="font-medium">{m.name || "(unnamed)"}</span>
                  {(m.dose || m.frequency) && <span className="text-muted-foreground"> · {[m.dose, m.frequency].filter(Boolean).join(" · ")}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* PCSP goals */}
        <div className={cardCls}>
          <SectionHeader
            title="PCSP goals"
            step="goals"
            tone={goalExtractionFailed || incompleteGoals > 0 ? "amber" : parsedGoals.length ? "emerald" : "neutral"}
            count={
              goalExtractionFailed && parsedGoals.length === 0
                ? "extraction failed"
                : `${parsedGoals.length} goal${parsedGoals.length === 1 ? "" : "s"}${incompleteGoals ? ` · ${incompleteGoals} incomplete` : ""}`
            }
          />
          {parsedGoals.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">— none captured — add manually in Step 4.</div>
          ) : (
            <ul className="space-y-0.5 text-[11px]">
              {parsedGoals.map((g, i) => {
                const c = goalCompleteness(g);
                return (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate">{g.text || "(no statement)"}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0 text-[9px] ${c.missing.length === 0 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"}`}>
                      {c.filled}/{c.total}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Services / billing */}
        <div className={`${cardCls} md:col-span-2`}>
          <SectionHeader
            title="Services & billing codes"
            step="services"
            tone={externalActive.length > 0 ? "amber" : oursCount > 0 ? "emerald" : "neutral"}
            count={`${oursCount} ours · ${externalActive.length} external · ${notOursCount} not-my-org${unknownProviderCount ? ` · ${unknownProviderCount} unspecified` : ""}`}
          />
          {parsedBilling.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">— no billing codes captured —</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[11px]">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-1.5 py-1 font-medium">Code</th>
                    <th className="px-1.5 py-1 font-medium">Provider</th>
                    <th className="px-1.5 py-1 font-medium">Status</th>
                    <th className="px-1.5 py-1 font-medium">Unit</th>
                    <th className="px-1.5 py-1 text-right font-medium">Rate</th>
                    <th className="px-1.5 py-1 text-right font-medium">Cap</th>
                    <th className="px-1.5 py-1 font-medium">Plan dates</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedBilling.map((r, i) => {
                    const own = providerOwnership(r.provider_name, tenant);
                    const notOurs = r.ownership_ack === "not_ours";
                    let statusLabel = "Ours · will create";
                    let statusCls = "text-emerald-700 dark:text-emerald-300";
                    if (notOurs) { statusLabel = "Not my org · informational"; statusCls = "text-muted-foreground"; }
                    else if (own === "external") { statusLabel = "External · coordination / HIVE"; statusCls = "text-amber-700 dark:text-amber-300"; }
                    else if (own === "unknown") { statusLabel = "Provider unspecified"; statusCls = "text-muted-foreground"; }
                    return (
                      <tr key={i} className={`border-b border-border/40 ${notOurs ? "bg-muted/20 text-muted-foreground" : ""}`}>
                        <td className="px-1.5 py-1 font-mono">{r.service_code}</td>
                        <td className="px-1.5 py-1">{r.provider_name ?? <span className="text-muted-foreground/60">—</span>}</td>
                        <td className={`px-1.5 py-1 ${statusCls}`}>{statusLabel}</td>
                        <td className="px-1.5 py-1">{r.unit_type ?? "—"}</td>
                        <td className="px-1.5 py-1 text-right">{r.rate ?? "—"}</td>
                        <td className="px-1.5 py-1 text-right">{r.max_units ?? r.monthly_max_units ?? "—"}</td>
                        <td className="px-1.5 py-1">{r.plan_start ?? "—"} – {r.plan_end ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Plan & documents */}
        <div className={cardCls}>
          <SectionHeader title="Unmatched notes" step="plan" count={`${docs.length} note${docs.length === 1 ? "" : "s"} still to file`} />
          {docs.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">— every note from your uploads was filed automatically —</div>
          ) : (
            <ul className="space-y-0.5 text-[11px]">
              {docs.slice(0, 8).map((d) => (
                <li key={d.id} className="truncate">
                  <span>{d.text}</span>
                  {d.filed_to && <span className="text-muted-foreground"> · filed to {d.filed_to}</span>}
                </li>
              ))}
              {docs.length > 8 && (
                <li className="text-muted-foreground">+ {docs.length - 8} more</li>
              )}
            </ul>
          )}
        </div>

        {/* Staff & training */}
        <div className={cardCls}>
          <SectionHeader
            title="Staff & training"
            step="staff"
            count={`${staffNames.length} staff assigned`}
          />
          {staffNames.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">— no staff assigned yet —</div>
          ) : (
            <div className="text-[11px]">{staffNames.join(" · ")}</div>
          )}
          <div className="mt-1 text-[10px] text-muted-foreground">
            Per-client training (Support strategies, Client-specific training, Person-Centered Thinking) is created automatically once PCSP + goals are finalized.
          </div>
        </div>
      </div>
    </div>
  );
}


// ---------------------------- ProvisioningPanel ----------------------------
function ProvisioningPanel({ subjectId, onChanged }: { subjectId: string; onChanged: () => void }) {
  const compute = useServerFn(computeProvisioningForecast);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["subject-forecast", subjectId],
    queryFn: () => compute({ data: { subjectId } }),
  });
  const toggle = useServerFn(togglePlanItem);
  const m = useMutation({
    mutationFn: (vars: { planId: string; state: "will_create" | "draft" | "added_by_admin" | "na"; note?: string }) =>
      toggle({ data: { planId: vars.planId, state: vars.state, override_note: vars.note } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subject-forecast", subjectId] }); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">Computing forecast…</div>;
  const plan = q.data?.plan ?? [];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-2 text-sm">
        <Info className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <div className="font-semibold">Provisioning forecast</div>
          <p className="text-xs text-muted-foreground">Preview only — nothing is created here. Based on active automation rules for this person.</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {plan.length === 0 && <div className="text-sm text-muted-foreground">No automation rules matched.</div>}
        {plan.map((p: { id: string; target_module: string; planned_action: string; state: string; reason: string | null }) => (
          <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">{p.target_module.replace(/_/g, " ")} · <span className="text-xs uppercase tracking-wide text-muted-foreground">{p.planned_action.replace(/_/g, " ")}</span></div>
              {p.reason && <div className="mt-0.5 text-xs text-muted-foreground">{p.reason}</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="capitalize">{p.state.replace(/_/g, " ")}</Badge>
              <Select value={p.state} onValueChange={(v) => m.mutate({ planId: p.id, state: v as "will_create" | "draft" | "added_by_admin" | "na" })}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="will_create">Will create</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="added_by_admin">Added by admin</SelectItem>
                  <SelectItem value="na">N/A (skip)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------- AssignmentMapPanel ----------------------------
// Prompt 17: interactive per-client staff assigner. PCSPs don't name staff, so
// NECTAR usually proposes nothing here — the admin picks staff and, per staff,
// scopes the assignment to specific authorized codes (the client's "ours"
// codes from prompt 15). Rows are staged in `assignment_map` and written to
// `staff_assignments` only on commit.
type AssignerAssignment = {
  id: string; relation_type: string; status: string;
  staff_subject_id: string | null; client_subject_id: string | null;
  staff_record_id: string | null; service_codes: string[] | null;
  inference_reason: string | null;
  staff_name: string | null; client_name: string | null;
};
type AssignerClient = {
  client_subject_id: string;
  display_name: string;
  authorized_codes: string[];
};

function AssignmentMapPanel({
  jobId, subjects, assignments: _legacyAssignments, onChanged,
}: {
  jobId: string;
  subjects: SubjectRow[];
  assignments: Array<{ id: string; relation_type: string; staff_subject_id: string | null; client_subject_id: string | null; status: string; inference_reason: string | null }>;
  onChanged: () => void;
}) {
  void _legacyAssignments; // superseded by getJobAssigner (richer payload)
  const getAssigner = useServerFn(getJobAssigner);
  const q = useQuery({
    queryKey: ["smart-import-assigner", jobId],
    queryFn: () => getAssigner({ data: { jobId } }),
  });
  const refresh = () => { q.refetch(); onChanged(); };

  const clientSubjects = subjects.filter((s) => s.subject_type === "client");

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Assignment map</div>
        <Badge variant="outline" className="ml-auto"><Users className="mr-1 h-3 w-3" />Job-level</Badge>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Assign staff to each client — optionally scoped to specific authorized codes
        (e.g. "Julie covers HHS only"). Staff↔client rows are written to caseloads
        on commit. Coordination-only codes from other providers aren't selectable.
      </p>

      {q.isLoading && <div className="text-xs text-muted-foreground">Loading assigner…</div>}
      {q.isError && <div className="text-xs text-destructive">Failed to load: {(q.error as Error).message}</div>}

      {q.data && clientSubjects.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          No client subjects in this job to assign.
        </div>
      )}

      {q.data && (
        <div className="space-y-3">
          {clientSubjects.map((cs) => {
            const client = q.data.clients.find((c: AssignerClient) => c.client_subject_id === cs.id);
            const rows = q.data.assignments.filter((a: AssignerAssignment) => a.client_subject_id === cs.id);
            return (
              <ClientAssignerBlock
                key={cs.id}
                jobId={jobId}
                clientSubjectId={cs.id}
                clientName={cs.display_name}
                authorizedCodes={client?.authorized_codes ?? []}
                staffPool={q.data.staffPool}
                assignments={rows}
                onChanged={refresh}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClientAssignerBlock({
  jobId, clientSubjectId, clientName, authorizedCodes, staffPool, assignments, onChanged,
}: {
  jobId: string;
  clientSubjectId: string;
  clientName: string;
  authorizedCodes: string[];
  staffPool: Array<{ id: string; name: string }>;
  assignments: AssignerAssignment[];
  onChanged: () => void;
}) {
  const upsert = useServerFn(upsertManualAssignment);
  const remove = useServerFn(removeAssignmentMapRow);

  const upsertM = useMutation({
    mutationFn: (vars: { staffId: string; serviceCodes: string[] | null }) =>
      upsert({ data: { jobId, clientSubjectId, staffId: vars.staffId, serviceCodes: vars.serviceCodes } }),
    onSuccess: () => { toast.success("Assignment saved"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeM = useMutation({
    mutationFn: (assignmentId: string) => remove({ data: { assignmentId } }),
    onSuccess: () => { toast.success("Removed"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Caseload-style rows the admin can edit (staff_record_id set).
  const editable = assignments.filter((a) => a.staff_record_id);
  // NECTAR proposals (staff_subject_id only) — show read-only above for context.
  const proposals = assignments.filter((a) => !a.staff_record_id && a.staff_subject_id);
  const assignedIds = new Set(editable.map((a) => a.staff_record_id!));
  const availableStaff = staffPool.filter((s) => !assignedIds.has(s.id));

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filteredStaff = availableStaff.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const allFilteredSelected = filteredStaff.length > 0 && filteredStaff.every((s) => selected.has(s.id));

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function toggleAllFiltered() {
    const next = new Set(selected);
    if (allFilteredSelected) filteredStaff.forEach((s) => next.delete(s.id));
    else filteredStaff.forEach((s) => next.add(s.id));
    setSelected(next);
  }
  function openPicker() {
    setSelected(new Set());
    setSearch("");
    setPickerOpen(true);
  }
  async function assignSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      for (const staffId of ids) {
        await upsert({ data: { jobId, clientSubjectId, staffId, serviceCodes: null } });
      }
      toast.success(`Assigned ${ids.length} staff`);
      setPickerOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign");
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{clientName}</div>
        <div className="flex items-center gap-2">
          {authorizedCodes.length > 0 ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {authorizedCodes.length} authorized code{authorizedCodes.length === 1 ? "" : "s"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              No own-org codes yet — staff default to all codes
            </Badge>
          )}
        </div>
      </div>

      {proposals.length > 0 && (
        <div className="mt-2 space-y-1 rounded border border-dashed border-border bg-muted/30 p-2 text-xs">
          <div className="font-medium text-muted-foreground">NECTAR proposals (subjects not yet committed)</div>
          {proposals.map((p) => (
            <div key={p.id} className="text-muted-foreground">
              {p.relation_type}: <span className="font-medium">staff subject {p.staff_subject_id?.slice(0, 6)}…</span>
              {p.inference_reason && <span className="opacity-70"> · {p.inference_reason}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        {editable.length === 0 && (
          <div className="text-xs text-muted-foreground">No staff assigned yet.</div>
        )}
        {editable.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2 rounded border border-border bg-background p-2 text-xs">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{row.staff_name ?? "Staff"}</span>
            <AssignerScopePopover
              authorized={authorizedCodes}
              value={row.service_codes}
              onChange={(codes) => upsertM.mutate({ staffId: row.staff_record_id!, serviceCodes: codes })}
              disabled={upsertM.isPending}
            />
            <Badge variant="outline" className="ml-auto text-[10px] capitalize">{row.status}</Badge>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => removeM.mutate(row.id)}
              disabled={removeM.isPending}
              title="Remove"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        onClick={openPicker}
        disabled={availableStaff.length === 0}
      >
        <UserPlus className="mr-1 h-3 w-3" />
        {availableStaff.length === 0 ? "All staff assigned" : "Add staff"}
      </Button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign staff to {clientName}</DialogTitle>
            <DialogDescription>
              Select one, several, or all employees. Each will be assigned to this client with access to all authorized codes — you can narrow the scope per staff after adding.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              placeholder="Search staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={toggleAllFiltered}
                  disabled={filteredStaff.length === 0}
                />
                <span className="font-medium">
                  Select all{search ? " (filtered)" : ""} ({filteredStaff.length})
                </span>
              </label>
              <span className="text-muted-foreground">{selected.size} selected</span>
            </div>
            <div className="max-h-72 overflow-y-auto rounded border border-border divide-y divide-border">
              {filteredStaff.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  {availableStaff.length === 0 ? "No unassigned staff remaining." : "No staff match your search."}
                </div>
              ) : (
                filteredStaff.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted cursor-pointer">
                    <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleOne(s.id)} />
                    <span>{s.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button
              onClick={assignSelected}
              disabled={selected.size === 0 || upsertM.isPending}
            >
              {upsertM.isPending ? "Assigning…" : `Assign ${selected.size || ""} staff`.trim()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function AssignerScopePopover({
  authorized, value, onChange, disabled,
}: {
  authorized: string[];
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  disabled?: boolean;
}) {
  const isAll = value === null || value === undefined;
  const subset = new Set(value ?? []);
  const summary = isAll
    ? `All codes${authorized.length ? ` (${authorized.length})` : ""}`
    : (value && value.length > 0 ? value.join(", ") : "No codes");

  function toggle(code: string) {
    const cur = new Set<string>(isAll ? authorized : (value ?? []));
    if (cur.has(code)) cur.delete(code); else cur.add(code);
    const arr = Array.from(cur);
    if (arr.length === 0) { onChange([]); return; }
    if (authorized.length > 0 && arr.length === authorized.length) onChange(null);
    else onChange(arr);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px] gap-1" disabled={disabled}>
          <Tag className="h-3 w-3" />
          <span className="max-w-[180px] truncate">{summary}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="text-xs font-medium px-1 pb-1">Service-code scope</div>
        {authorized.length === 0 ? (
          <div className="px-1 py-2 text-xs text-muted-foreground">
            No own-org authorized codes for this client yet. Staff is assigned with "All codes" — narrow later from the client's caseload tab once codes are in.
          </div>
        ) : (
          <>
            <button
              type="button"
              className={`w-full text-left text-xs rounded px-2 py-1.5 hover:bg-muted ${isAll ? "bg-muted font-medium" : ""}`}
              onClick={() => onChange(null)}
            >
              All codes ({authorized.length})
            </button>
            <div className="my-1 h-px bg-border" />
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {authorized.map((c) => {
                const on = isAll ? true : subset.has(c);
                return (
                  <label key={c} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted cursor-pointer">
                    <Checkbox checked={on} onCheckedChange={() => toggle(c)} />
                    <span className="font-mono">{c}</span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

