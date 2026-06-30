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
  saveBillingCodeRow, removeExtractedField, restoreExtractedField,
  getJobAssigner, upsertManualAssignment, removeAssignmentMapRow,
} from "@/lib/smart-import-review.functions";
import { resolveMergeFlag, overrideValidationIssue } from "@/lib/import-checklist.functions";
import { type TenantIdentity } from "@/lib/service-classification";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Trash2, Plus, X, RotateCcw, Tag, UserPlus } from "lucide-react";

import { providerSignoff } from "@/lib/hive-migration.functions";

export const Route = createFileRoute("/dashboard/smart-import/$jobId/review")({
  head: () => ({ meta: [{ title: "Smart Import Review — NECTAR" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <ReviewPage />
    </RequirePermission>
  ),
});

// Core target fields (matches what extraction emits)
const CLIENT_FIELDS = ["first_name","last_name","full_name","date_of_birth","phone","address","medicaid_id","job_code","team_name","is_own_guardian","guardian_name","guardian_phone","guardian_relationship","guardian_email","emergency_contact_name","emergency_contact_phone"];
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
  const job = useQuery({ queryKey: ["smart-import-review", jobId], queryFn: () => getJob({ data: { jobId } }) });
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  const mode = job.data.job.mode as "employee" | "client";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/dashboard/smart-import" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Smart Import
        </Link>
        <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" /> NECTAR review</Badge>
      </div>

      <AttributionBar />

      {job.data.job.source === "white_glove" && (
        <WhiteGloveBanner job={job.data.job} onChanged={() => job.refetch()} />
      )}

      <RosterSummary mode={mode} total={total} ready={ready} needReview={needReview} jobId={jobId} whiteGlove={job.data.job.source === "white_glove"} signedOff={!!job.data.job.provider_signoff_at} />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <SubjectQueue subjects={subjects} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="space-y-4">
          {selectedId ? (
            <SubjectReview
              subjectId={selectedId}
              jobMode={mode}
              jobId={jobId}
              subjects={subjects}
              assignments={job.data.assignments ?? []}
              onChanged={() => job.refetch()}
            />
          ) : (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
              Select a person from the queue to begin review.
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

// ---------------------------- RosterSummary ----------------------------
function RosterSummary({
  mode, total, ready, needReview, jobId, whiteGlove, signedOff,
}: { mode: "employee" | "client"; total: number; ready: number; needReview: number; jobId: string; whiteGlove?: boolean; signedOff?: boolean }) {
  const submit = useServerFn(submitForSetup);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: () => submit({ data: { jobId } }),
    onSuccess: (res: { ok: boolean; committed?: boolean; results?: Array<{ committed: boolean; record_id?: string | null; subject_type?: string }> }) => {
      qc.invalidateQueries({ queryKey: ["smart-import-review", jobId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients-uncommitted-imports"] });
      qc.invalidateQueries({ queryKey: ["pending-client-subjects"] });
      const results = res.results ?? [];
      const committedRows = results.filter((r) => r.committed && r.record_id);
      const partial = results.length > 0 && committedRows.length < results.length;

      // White-glove path: no commit happens yet — fall back to the done page,
      // which renders the awaiting-signoff state.
      if (results.length === 0) {
        navigate({ to: "/dashboard/smart-import/$jobId/done", params: { jobId } });
        return;
      }

      if (!partial && committedRows.length > 0) {
        toast.success(`Client setup complete — ${committedRows.length === 1 ? "added to directory" : `${committedRows.length} clients added`}.`);
        if (committedRows.length === 1 && mode === "client" && committedRows[0].record_id) {
          navigate({ to: "/dashboard/clients/$clientId", params: { clientId: committedRows[0].record_id! } }).catch(() => navigate({ to: "/dashboard/clients" }));
        } else if (mode === "client") {
          navigate({ to: "/dashboard/clients" });
        } else {
          navigate({ to: "/dashboard/employees" });
        }
        return;
      }

      // Partial — stay on the review page; per-subject errors render inline.
      toast.warning(`${committedRows.length} of ${results.length} saved — review the remaining ${results.length - committedRows.length} below.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const noun = mode === "client" ? "client" : "staff";
  const commitDisabled = m.isPending || ready === 0 || (whiteGlove && !signedOff);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Job roster ({mode})</div>
        <div className="mt-1 text-base font-semibold">
          {total} {noun}{total === 1 ? "" : "s"} · <span className="text-emerald-600">{ready} ready</span> · <span className="text-amber-600">{needReview} need review</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Advisory throughout — flags surface to act on, never block.</p>
      </div>
      <Button onClick={() => m.mutate()} disabled={commitDisabled} size="lg" title={whiteGlove && !signedOff ? "Waiting for provider sign-off" : undefined}>
        {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        <Send className="mr-2 h-4 w-4" /> Complete {mode === "client" ? "client" : "staff"} setup
      </Button>
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
function SubjectQueue({
  subjects, selectedId, onSelect,
}: { subjects: SubjectRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-card)]">
      <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</div>
      <div className="max-h-[60vh] space-y-1 overflow-auto">
        {subjects.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No people in this job.</div>
        )}
        {subjects.map((s) => {
          const active = s.id === selectedId;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                active ? "bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{s.display_name}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <StatusDot status={s.review_status} />
                  <span className="capitalize">{s.review_status.replace("_", " ")}</span>
                  {s.match_status === "matched_existing" && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">match</Badge>}
                  {s.match_status === "ambiguous" && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px] text-amber-600">ambig</Badge>}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 opacity-50" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
function StatusDot({ status }: { status: SubjectRow["review_status"] }) {
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
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["smart-import-subject", subjectId] });
    onChanged();
  };

  if (q.isLoading) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (q.isError || !q.data) return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">Failed to load subject.</div>;

  const { subject, fields, unfiled, certs, questions, matched } = q.data;
  const tenant = (q.data as { tenant?: { codesHeld: string[]; names: string[] } }).tenant ?? { codesHeld: [], names: [] };
  const validation = (q.data as { validation?: { ok: boolean; issues: Array<{ key: string; severity: "error" | "warning"; field?: string; message: string }>; blocking: string[] } }).validation;
  const mergeFlags = (q.data as { mergeFlags?: Array<Record<string, string | number | boolean | null>> }).mergeFlags ?? [];
  const targetFields = jobMode === "client" ? CLIENT_FIELDS : EMPLOYEE_FIELDS;
  const canMarkReady = !validation || validation.ok;

  // Lift wizard step up so we can render the rail directly under the name header.
  const [step, setStep] = useState<WizardStepId>("person");
  const askCount = (questions as Array<{ answer: string | null }>).filter((qq) => !qq.answer).length;
  const extraCount = (unfiled as Array<{ filed_to: string | null }>).filter((u) => !u.filed_to).length;
  // Drop per-code routing issues — they're replaced by the inline billing table editor.
  const visibleIssues = (validation?.issues ?? []).filter(
    (i) => !/^code\.(confirm_owner|coordination|coordination_info|bill_as_ours|ignore)\./.test(i.key),
  );
  const issueCount = visibleIssues.length;
  const steps: Array<{ id: WizardStepId; label: string; badge?: number }> = [
    { id: "person", label: "Person & contacts" },
    { id: "services", label: "Services & health" },
    { id: "plan", label: "Plan & documents", badge: extraCount || undefined },
    { id: "staff", label: jobMode === "employee" ? "Certs & training" : "Staff & training" },
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
  "emergency_contact_name","emergency_contact_phone",
  "support_coordinator_name","support_coordinator_email","support_coordinator_phone","support_coordinator_company",
  "admission_date","discharge_date","has_abi",
]);
const SERVICES_FIELDS_SET = new Set([
  "billing_code_row","job_code","team_name",
  "pcp_name","pcp_phone","specialist_name","specialist_phone",
  "med_prescriber_name","med_prescriber_phone","medical_insurance",
  "hr_applicable","dnr_applicable",
]);

type WizardStepId = "person" | "services" | "plan" | "staff" | "review";

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
  const servicesFields = fields.filter((f) => SERVICES_FIELDS_SET.has(f.target_field));
  const otherFields = fields.filter((f) => !PERSON_FIELDS_SET.has(f.target_field) && !SERVICES_FIELDS_SET.has(f.target_field) && !f.is_custom_attribute);
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
          decision={decision} subjectId={subjectId} tenant={tenant} onChanged={onChanged}
        />
      )}
      {step === "plan" && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground shadow-[var(--shadow-card)]">
            PCSP and supporting documents (Human Rights, grievance policy, individualized plans, DNR) — additional uploads land here.
          </div>
          <UnfiledPanel items={unfiled} onChanged={onChanged} />
        </div>
      )}
      {step === "staff" && (
        jobMode === "employee" ? (
          <CertsPanel subjectId={subjectId} certs={certs} onChanged={onChanged} />
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground shadow-[var(--shadow-card)]">
              Assign staff and scope each one to the codes they're authorized for. Per-client training (Support strategies, Client-specific training, Person-Centered Thinking) unlocks after PCSP upload.
            </div>
            <AssignmentMapPanel jobId={jobId} subjects={subjects} assignments={assignments} onChanged={onChanged} />
          </div>
        )
      )}
      {step === "review" && (
        <div className="space-y-3">
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
              Use <strong>Complete {jobMode === "client" ? "client" : "staff"} setup</strong> at the top of this page to commit. Open flags become "Needed" items on the person's file — only the last name blocks creation.
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
    <ol className="flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-card)]">
      {steps.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        const allowJump = i <= activeIdx + 1;
        return (
          <li key={s.id} className="flex items-center">
            <button
              type="button"
              onClick={() => allowJump && onJump(i)}
              disabled={!allowJump}
              className={[
                "inline-flex min-h-[36px] items-center gap-2 rounded-full px-3 text-xs font-medium transition",
                active ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/40" :
                done ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15" :
                "text-muted-foreground hover:bg-muted",
                allowJump ? "cursor-pointer" : "cursor-not-allowed opacity-60",
              ].join(" ")}
            >
              <span className={[
                "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                done ? "bg-emerald-500 text-white" : active ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground",
              ].join(" ")}>
                {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              <span>{s.label}</span>
              {s.badge ? (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] text-amber-700 dark:text-amber-400">{s.badge}</span>
              ) : null}
            </button>
            {i < steps.length - 1 && <ChevronRight className="mx-0.5 h-3 w-3 text-muted-foreground/50" />}
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{subject.subject_type}</div>
        <div className="mt-0.5 text-lg font-semibold">{subject.display_name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="capitalize">{subject.match_status.replace("_", " ")}</Badge>
          {subject.review_decision && <Badge variant="outline" className="capitalize">{subject.review_decision.replace("_", " ")}</Badge>}
          <Badge variant="outline" className="capitalize">{subject.review_status.replace("_", " ")}</Badge>
        </div>
      </div>
      <Button
        variant={isReady ? "outline" : "default"}
        onClick={() => m.mutate(!isReady)}
        disabled={m.isPending || blocked}
        title={blocked ? "Resolve NECTAR validation issues below first" : undefined}
      >
        {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isReady ? "Reopen" : <><CheckCircle2 className="mr-2 h-4 w-4" /> Mark ready</>}
      </Button>
    </div>
  );
}

// ---------------------------- ValidationPanel ----------------------------
function ValidationPanel({
  subjectId, validation, onChanged,
}: {
  subjectId: string;
  validation: { ok: boolean; issues: Array<{ key: string; severity: "error" | "warning"; field?: string; message: string }>; blocking: string[] };
  onChanged: () => void;
}) {
  const overrideFn = useServerFn(overrideValidationIssue);
  const m = useMutation({
    mutationFn: (vars: { issueKey: string; overridden: boolean }) =>
      overrideFn({ data: { subjectId, issueKey: vars.issueKey, overridden: vars.overridden } }),
    onSuccess: () => { toast.success("Override saved"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const blockingSet = new Set(validation.blocking);
  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" />
        NECTAR needs you to confirm these before saving
      </div>
      <ul className="mt-2 space-y-2 text-sm">
        {validation.issues.map((i) => {
          const isBlocking = blockingSet.has(i.key);
          // Per-code routing buttons (Prompt 15): "code.confirm_owner.<CODE>",
          // "code.coordination.<CODE>", "code.coordination_info.<CODE>".
          // Each picks one of three explicit outcomes; only one override key
          // is kept active per code, the others are cleared.
          const codeMatch = i.key.match(/^code\.(confirm_owner|coordination|coordination_info)\.(.+)$/);
          const setCodeBucket = (code: string, bucket: "bill_as_ours" | "coordination" | "ignore") => {
            const all = ["bill_as_ours", "coordination", "ignore"] as const;
            all.forEach((b) => {
              const key = `code.${b}.${code}`;
              if (b === bucket) m.mutate({ issueKey: key, overridden: true });
              else m.mutate({ issueKey: key, overridden: false });
            });
            // Also clear the original blocking confirm_owner / coordination issue
            // so it disappears from the panel after the admin picks an outcome.
            m.mutate({ issueKey: i.key, overridden: true });
          };
          return (
            <li key={i.key} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/70 bg-background/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant={i.severity === "error" ? "destructive" : "outline"} className="capitalize text-[10px]">
                    {i.severity}
                  </Badge>
                  {i.field && <span className="text-xs text-muted-foreground">{i.field}</span>}
                </div>
                <div className="mt-1">{i.message}</div>
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
                ) : isBlocking ? (
                  <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ issueKey: i.key, overridden: true })}>
                    Confirm — I've reviewed this
                  </Button>
                ) : i.severity === "error" ? (
                  <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => m.mutate({ issueKey: i.key, overridden: false })}>
                    Un-confirm
                  </Button>
                ) : null}
              </div>
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
  fields, targetFields, matched, decision, subjectId, tenant, onChanged,
}: {
  fields: FieldRow[]; targetFields: string[]; matched: Record<string, string | null> | null;
  decision: SubjectRow["review_decision"]; subjectId: string; tenant: TenantIdentity; onChanged: () => void;
}) {
  // Prompt 18: peel billing-code rows out of the generic field list so we can
  // show them as a proper editable table. The remaining placement lineup keeps
  // its existing value→field shape for every other field.
  const billing = fields.filter((f) => f.target_field === "billing_code_row");
  const rest = fields.filter((f) => f.target_field !== "billing_code_row");
  // Prompt 24: limit lineup to SOW-required record fields. Incidental
  // mappings (extras NECTAR pulled but aren't required by §1.10) are
  // hidden here — they still live on the record as custom attributes.
  const required = new Set(targetFields);
  const core = rest.filter((f) => !f.is_custom_attribute && required.has(f.target_field));
  const custom = rest.filter((f) => f.is_custom_attribute);
  return (
    <div className="space-y-4">
      <BillingCodesEditor subjectId={subjectId} rows={billing} tenant={tenant} onChanged={onChanged} />
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Placement lineup</div>
          <div className="text-xs text-muted-foreground">SOW-required fields only. Edit or × to remove.</div>
        </div>
        <div className="space-y-2">
          {core.length === 0 && <div className="text-sm text-muted-foreground">No required fields extracted.</div>}
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
};
const UNIT_TYPE_OPTIONS = ["15 min", "day", "month", "session", "hour", "unit"];

function parseBillingRow(f: FieldRow): BillingRowShape | null {
  // Prefer value_json (jsonb on the row), fall back to parsing the text value.
  const raw = f.value_json ?? (() => { try { return f.value ? JSON.parse(f.value) : null; } catch { return null; } })();
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
  return {
    service_code: sc,
    provider_name: str(r.provider_name),
    unit_type: str(r.unit_type),
    rate: num(r.rate),
    max_units: num(r.max_units),
    monthly_max_units: num(r.monthly_max_units),
    plan_start: r.plan_start ? String(r.plan_start).slice(0, 10) : null,
    plan_end: r.plan_end ? String(r.plan_end).slice(0, 10) : null,
  };
}

function BillingCodesEditor({
  subjectId, rows, tenant: _tenant, onChanged,
}: {
  subjectId: string; rows: FieldRow[]; tenant: TenantIdentity; onChanged: () => void;
}) {
  type Parsed = { field: FieldRow; row: BillingRowShape };
  // Prompt 24: show every extracted code as one editable row. The Provider
  // column tells the admin whose code it is at a glance; deleting a row is
  // how the admin opts out of billing it. No separate "confirm bucket" wall.
  const parsed: Parsed[] = rows
    .map((f) => { const row = parseBillingRow(f); return row ? { field: f, row } : null; })
    .filter((x): x is Parsed => x !== null);

  const [adding, setAdding] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Billing codes (your authorization)</div>
          <div className="text-xs text-muted-foreground">
            Pre-filled from the PCSP. The Provider column shows whose code it is — delete (×)
            any row you don't bill. Blank rate or annual units commit with a "pending" flag
            (advisory; never blocks billing setup).
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="mr-1 h-3 w-3" /> Add code
        </Button>
      </div>

      {parsed.length === 0 && !adding && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          No billable codes were found in this document. Use "Add code" to enter them manually.
        </div>
      )}

      {(parsed.length > 0 || adding) && (
        <div className="overflow-x-auto rounded-md border border-border/60">
          <table className="w-full table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[64px]" />
              <col className="w-[18%]" />
              <col className="w-[80px]" />
              <col className="w-[72px]" />
              <col className="w-[84px]" />
              <col className="w-[76px]" />
              <col className="w-[170px]" />
              <col className="w-[96px]" />
              <col className="w-[64px]" />
            </colgroup>
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 px-1.5 font-medium">Code</th>
                <th className="py-2 px-1.5 font-medium">Provider</th>
                <th className="py-2 px-1.5 font-medium">Unit</th>
                <th className="py-2 px-1.5 font-medium">Rate</th>
                <th className="py-2 px-1.5 font-medium">Annual</th>
                <th className="py-2 px-1.5 font-medium">Mo. cap</th>
                <th className="py-2 px-1.5 font-medium">Term</th>
                <th className="py-2 px-1.5 font-medium">Status</th>
                <th className="py-2 px-1.5" />
              </tr>
            </thead>
            <tbody>
              {parsed.map((p) => (
                <BillingRowEditor key={p.field.id} fieldId={p.field.id} subjectId={subjectId} initial={p.row} onChanged={onChanged} />
              ))}
              {adding && (
                <BillingRowEditor
                  fieldId={null}
                  subjectId={subjectId}
                  initial={{ service_code: "" }}
                  isNew
                  onChanged={() => { setAdding(false); onChanged(); }}
                  onCancel={() => setAdding(false)}
                />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function isPending(r: BillingRowShape): boolean {
  return !(r.rate && r.rate > 0) || !(r.max_units && r.max_units > 0);
}

function BillingRowEditor({
  fieldId, subjectId, initial, isNew, onChanged, onCancel,
}: {
  fieldId: string | null;
  subjectId: string;
  initial: BillingRowShape;
  isNew?: boolean;
  onChanged: () => void;
  onCancel?: () => void;
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
          },
        },
      }),
    onSuccess: () => { toast.success("Saved"); setDirty(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: () => remove({ data: { fieldId: fieldId as string } }),
    onSuccess: () => { toast.success("Removed"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = isPending(row);
  const allCodes = EVV_SERVICE_CODES.map((c) => c.code);

  return (
    <tr className="border-b border-border/60 align-middle">
      <td className="py-1.5 px-1.5">
        {isNew ? (
          <Select value={row.service_code} onValueChange={(v) => patch("service_code", v)}>
            <SelectTrigger className="h-8 w-full px-1.5"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {allCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline" className="font-mono">{row.service_code}</Badge>
        )}
      </td>
      <td className="py-1.5 px-1.5">
        <Input className="h-8 w-full px-2" value={row.provider_name ?? ""} onChange={(e) => patch("provider_name", e.target.value || null)} />
      </td>
      <td className="py-1.5 px-1.5">
        <Select value={row.unit_type ?? ""} onValueChange={(v) => patch("unit_type", v)}>
          <SelectTrigger className="h-8 w-full px-1.5"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {UNIT_TYPE_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="py-1.5 px-1.5">
        <Input className="h-8 w-full px-1.5" inputMode="decimal" value={row.rate ?? ""} onChange={(e) => patch("rate", numOrNull(e.target.value))} />
      </td>
      <td className="py-1.5 px-1.5">
        <Input className="h-8 w-full px-1.5" inputMode="numeric" value={row.max_units ?? ""} onChange={(e) => patch("max_units", numOrNull(e.target.value))} />
      </td>
      <td className="py-1.5 px-1.5">
        <Input className="h-8 w-full px-1.5" inputMode="numeric" value={row.monthly_max_units ?? ""} onChange={(e) => patch("monthly_max_units", numOrNull(e.target.value))} />
      </td>
      <td className="py-1.5 px-1.5">
        <div className="flex items-center gap-1">
          <Input className="h-8 w-full px-1.5" type="date" value={row.plan_start ?? ""} onChange={(e) => patch("plan_start", e.target.value || null)} title="Start" />
          <span className="text-muted-foreground">–</span>
          <Input className="h-8 w-full px-1.5" type="date" value={row.plan_end ?? ""} onChange={(e) => patch("plan_end", e.target.value || null)} title="End" />
        </div>
      </td>
      <td className="py-1.5 px-1.5">
        {pending ? (
          <Badge variant="outline" className="whitespace-nowrap text-amber-600">
            <AlertTriangle className="mr-1 h-3 w-3" /> pending
          </Badge>
        ) : (
          <Badge variant="outline" className="text-emerald-600">ready</Badge>
        )}
      </td>
      <td className="py-1.5 pr-0">
        <div className="flex items-center justify-end gap-1">
          {dirty && (
            <Button size="sm" className="h-7" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !row.service_code}>
              {saveMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save
            </Button>
          )}
          {isNew && onCancel && (
            <Button size="sm" variant="ghost" className="h-7" onClick={onCancel}>Cancel</Button>
          )}
          {!isNew && fieldId && (
            <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => removeMut.mutate()} disabled={removeMut.isPending}>
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
            {targetFields.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            {!targetFields.includes(target) && <SelectItem value={target}>{target}</SelectItem>}
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
    return <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-[var(--shadow-card)]">Nothing leftover — every scrap has a home.</div>;
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

  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string>("");

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
        {editable.length === 0 && !adding && (
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

      {adding ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger className="h-8 w-[220px] text-xs">
              <SelectValue placeholder={availableStaff.length === 0 ? "All staff already assigned" : "Pick staff…"} />
            </SelectTrigger>
            <SelectContent>
              {availableStaff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!picked || upsertM.isPending}
            onClick={() => {
              upsertM.mutate({ staffId: picked, serviceCodes: null });
              setPicked(""); setAdding(false);
            }}
          >
            Assign (all codes)
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setPicked(""); setAdding(false); }}>Cancel</Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => setAdding(true)}
          disabled={availableStaff.length === 0}
        >
          <UserPlus className="mr-1 h-3 w-3" /> Add staff
        </Button>
      )}
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

