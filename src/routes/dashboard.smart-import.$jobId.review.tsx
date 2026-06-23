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
  computeProvisioningForecast, togglePlanItem, confirmAssignment, submitForSetup,
} from "@/lib/smart-import-review.functions";
import { resolveMergeFlag, overrideValidationIssue } from "@/lib/import-checklist.functions";
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
            <SubjectReview subjectId={selectedId} jobMode={mode} onChanged={() => job.refetch()} />
          ) : (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
              Select a person from the queue to begin review.
            </div>
          )}
          <AssignmentMapPanel jobId={jobId} subjects={subjects} assignments={job.data.assignments ?? []} onChanged={() => job.refetch()} />
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
    onSuccess: () => {
      toast.success("Submitted for setup — running commit.");
      qc.invalidateQueries({ queryKey: ["smart-import-review", jobId] });
      navigate({ to: "/dashboard/smart-import/$jobId/done", params: { jobId }, search: { commit: "1" } as never });
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
        <Send className="mr-2 h-4 w-4" /> Submit for setup
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
  subjectId, jobMode, onChanged,
}: { subjectId: string; jobMode: "employee" | "client"; onChanged: () => void }) {
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
  const validation = (q.data as { validation?: { ok: boolean; issues: Array<{ key: string; severity: "error" | "warning"; field?: string; message: string }>; blocking: string[] } }).validation;
  const mergeFlags = (q.data as { mergeFlags?: Array<Record<string, string | number | boolean | null>> }).mergeFlags ?? [];
  const targetFields = jobMode === "client" ? CLIENT_FIELDS : EMPLOYEE_FIELDS;
  const canMarkReady = !validation || validation.ok;

  return (
    <div className="space-y-4">
      <SubjectHeader subject={subject} onChanged={refresh} canMarkReady={canMarkReady} />
      <DedupBanner subject={subject} matched={matched} onChanged={refresh} />

      {validation && validation.issues.length > 0 && (
        <ValidationPanel subjectId={subjectId} validation={validation} onChanged={refresh} />
      )}
      {mergeFlags.length > 0 && (
        <MergeFlagsPanel flags={mergeFlags} onChanged={refresh} />
      )}


      <Tabs defaultValue="placement">
        <TabsList className={jobMode === "employee" ? "grid grid-cols-5" : "grid grid-cols-4"}>
          <TabsTrigger value="placement">Placement</TabsTrigger>
          {jobMode === "employee" && (
            <TabsTrigger value="certs">Certs / training</TabsTrigger>
          )}
          <TabsTrigger value="questions">NECTAR asks {questions.length > 0 && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">{questions.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="unfiled">Additional info {unfiled.length > 0 && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">{unfiled.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="provision">Forecast</TabsTrigger>
        </TabsList>

        <TabsContent value="placement" className="mt-3">
          <PlacementLineup fields={fields} targetFields={targetFields} matched={matched} decision={subject.review_decision} onChanged={refresh} />
        </TabsContent>
        {jobMode === "employee" && (
          <TabsContent value="certs" className="mt-3">
            <CertsPanel subjectId={subjectId} certs={certs} onChanged={refresh} />
          </TabsContent>
        )}
        <TabsContent value="questions" className="mt-3">
          <QuestionsPanel questions={questions} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="unfiled" className="mt-3">
          <UnfiledPanel items={unfiled} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="provision" className="mt-3">
          <ProvisioningPanel subjectId={subjectId} onChanged={refresh} />
        </TabsContent>
      </Tabs>
    </div>
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
              <div className="flex shrink-0 items-center gap-2">
                {isBlocking ? (
                  <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ issueKey: i.key, overridden: true })}>
                    Override — I've checked
                  </Button>
                ) : i.severity === "error" ? (
                  <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => m.mutate({ issueKey: i.key, overridden: false })}>
                    Un-override
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
        <Button size="sm" variant={subject.review_decision === "update" ? "default" : "outline"} onClick={() => m.mutate("update")} disabled={m.isPending}>Update existing</Button>
        <Button size="sm" variant={subject.review_decision === "create_new" ? "default" : "outline"} onClick={() => m.mutate("create_new")} disabled={m.isPending}>Create new</Button>
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
};
function PlacementLineup({
  fields, targetFields, matched, decision, onChanged,
}: {
  fields: FieldRow[]; targetFields: string[]; matched: Record<string, string | null> | null;
  decision: SubjectRow["review_decision"]; onChanged: () => void;
}) {
  const core = fields.filter((f) => !f.is_custom_attribute);
  const custom = fields.filter((f) => f.is_custom_attribute);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Placement lineup</div>
          <div className="text-xs text-muted-foreground">Value → field. Edit either side.</div>
        </div>
        <div className="space-y-2">
          {core.length === 0 && <div className="text-sm text-muted-foreground">No core fields extracted.</div>}
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
function FieldRowEditor({
  field, targetFields, matchedValue, showDiff, onChanged,
}: {
  field: FieldRow; targetFields: string[]; matchedValue: string | null; showDiff: boolean; onChanged: () => void;
}) {
  const edit = useServerFn(editExtractedField);
  const [value, setValue] = useState(field.value ?? "");
  const [target, setTarget] = useState(field.target_field);
  const [dirty, setDirty] = useState(false);

  const m = useMutation({
    mutationFn: () => edit({ data: { fieldId: field.id, value, target_field: target } }),
    onSuccess: () => { toast.success("Saved"); setDirty(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const flag = field.status === "flag";
  const placed = field.status === "placed";
  const edited = field.status === "edited";

  let diffTag: React.ReactNode = null;
  if (showDiff) {
    if (!matchedValue) diffTag = <Badge variant="outline" className="text-emerald-600">new</Badge>;
    else if ((matchedValue ?? "") !== (value ?? "")) diffTag = <Badge variant="outline" className="text-amber-600">changed</Badge>;
    else diffTag = <Badge variant="outline" className="text-muted-foreground">same</Badge>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-2 sm:flex-row sm:items-center">
      <Input
        className="sm:max-w-xs"
        value={value}
        onChange={(e) => { setValue(e.target.value); setDirty(true); }}
      />
      <span className="text-xs text-muted-foreground">→</span>
      {field.is_custom_attribute ? (
        <Input
          className="sm:max-w-[200px]"
          value={target}
          onChange={(e) => { setTarget(e.target.value); setDirty(true); }}
        />
      ) : (
        <Select value={target} onValueChange={(v) => { setTarget(v); setDirty(true); }}>
          <SelectTrigger className="sm:max-w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {targetFields.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            {!targetFields.includes(target) && <SelectItem value={target}>{target}</SelectItem>}
          </SelectContent>
        </Select>
      )}
      <div className="flex flex-1 items-center gap-1.5 text-xs">
        {placed && <Badge variant="outline" className="text-emerald-600">placed</Badge>}
        {flag && <Badge variant="outline" className="text-amber-600"><AlertTriangle className="mr-1 h-3 w-3" />check</Badge>}
        {edited && <Badge variant="outline" className="text-primary"><Pencil className="mr-1 h-3 w-3" />edited</Badge>}
        {diffTag}
        {showDiff && matchedValue && matchedValue !== value && (
          <span className="text-muted-foreground">was: <span className="font-mono">{matchedValue}</span></span>
        )}
      </div>
      {dirty && (
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}Save
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
function AssignmentMapPanel({
  jobId, subjects, assignments, onChanged,
}: {
  jobId: string;
  subjects: SubjectRow[];
  assignments: Array<{ id: string; relation_type: string; staff_subject_id: string | null; client_subject_id: string | null; status: string; inference_reason: string | null }>;
  onChanged: () => void;
}) {
  const confirm = useServerFn(confirmAssignment);
  const m = useMutation({
    mutationFn: (vars: { assignmentId: string; status: "confirmed" | "rejected" | "edited" }) => confirm({ data: vars }),
    onSuccess: () => { toast.success("Assignment updated"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const nameOf = useMemo(() => {
    const map = new Map(subjects.map((s) => [s.id, s.display_name]));
    return (id: string | null) => (id ? map.get(id) ?? "(unknown)" : "—");
  }, [subjects]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Assignment map</div>
        <Badge variant="outline" className="ml-auto"><Users className="mr-1 h-3 w-3" />Job-level</Badge>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Proposed staff ↔ client relationships from NECTAR. Confirm to populate caseloads on commit. {assignments.length === 0 && "No relationships proposed yet."}
      </p>
      <div className="space-y-2">
        {assignments.map((a) => (
          <div key={a.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium capitalize">{a.relation_type}: <strong>{nameOf(a.staff_subject_id)}</strong> ↔ <strong>{nameOf(a.client_subject_id)}</strong></div>
              {a.inference_reason && <div className="mt-0.5 text-xs text-muted-foreground">NECTAR: {a.inference_reason}</div>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">{a.status}</Badge>
              <Button size="sm" variant={a.status === "confirmed" ? "outline" : "default"} onClick={() => m.mutate({ assignmentId: a.id, status: "confirmed" })} disabled={m.isPending}>Confirm</Button>
              <Button size="sm" variant="ghost" onClick={() => m.mutate({ assignmentId: a.id, status: "rejected" })} disabled={m.isPending}>Reject</Button>
            </div>
          </div>
        ))}
      </div>
      {/* Job id reference for action audit context */}
      <input type="hidden" value={jobId} readOnly />
    </div>
  );
}
