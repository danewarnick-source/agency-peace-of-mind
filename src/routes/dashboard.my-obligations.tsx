import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ClipboardList, CheckCircle2, Upload, ExternalLink } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  checkAndMarkOverdue,
  listMyObligationInstances,
  recordCompletion,
  cadenceDescription,
  type MyObligationInstanceRow,
} from "@/lib/company-obligations.functions";
import { isFormUuid, isUnlinkedFormDuty } from "@/lib/resolve-obligation-form";
import { toDisplayNameCase } from "@/lib/person-name";
import { dueLabel } from "@/components/company-obligations/my-obligations-widget";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { IN_HIVE_COURSE_EVIDENCE, inHiveCourseIdForTitle } from "@/lib/in-hive-training";
import { hasAnyInHiveProgress } from "@/lib/in-hive-training.functions";
import {
  CLIENT_FORM_LABEL,
  clientFormKindForTitle,
  clientFormTitleForKind,
  type ClientFormKind,
} from "@/lib/client-form-obligations";
import { getMyClientTrainingStatuses } from "@/lib/client-specific-training.functions";
import { getAgencyPolicyForInstance } from "@/lib/agency-policies.functions";
import { policyMediaKind } from "@/lib/agency-policies";
import { isPackSentinel, obligationIsRequired } from "@/lib/obligation-packs";

function courseTopicCodes(courseId: "thirty-day" | "abi"): string[] {
  return courseId === "thirty-day"
    ? "ABCDEFGHIJKLMNOPQRSTUVW".split("")
    : "ABCDEF".split("");
}

export const Route = createFileRoute("/dashboard/my-obligations")({
  head: () => ({ meta: [{ title: "My obligations — Provider Interface" }] }),
  component: MyObligationsPage,
});

type MyCompletionRow = {
  instance_id: string;
  staff_name: string;
  completed_at: string | null;
  evidence_type_used: string | null;
  upload_path: string | null;
  upload_filename: string | null;
  attestation_text_snapshot: string | null;
  form_submission_id: string | null;
  nectar_validation_status: string | null;
  nectar_validation_reasons: string[] | null;
  nectar_extracted_cert_type: string | null;
  nectar_extracted_expires_date: string | null;
};

/** staff_per_client obligation titles carry a literal "[Client Name]"
 *  placeholder (e.g. "Client-Specific Training — [Client Name]") so staff
 *  clearly know which client a given instance is for. */
function resolveObligationTitle(
  ob: MyObligationInstanceRow["obligation"],
  instance: MyObligationInstanceRow,
): string {
  if (ob.scope === "staff_per_client" && instance.client_name) {
    return ob.title.replace("[Client Name]", toDisplayNameCase(instance.client_name));
  }
  return ob.title;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CompletedCard({
  instance,
  completion,
}: {
  instance: MyObligationInstanceRow;
  completion: MyCompletionRow | undefined;
}) {
  const ob = instance.obligation;
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!completion?.upload_path) return;
    let cancelled = false;
    supabase.storage
      .from("obligation-evidence")
      .createSignedUrl(completion.upload_path, 300)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setDownloadUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [completion?.upload_path]);

  const evidenceUsed =
    completion?.evidence_type_used ?? instance.evidence_type_used ?? ob.evidence_type;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{resolveObligationTitle(ob, instance)}</p>
          {ob.source === "sow" ? (
            <p className="text-xs text-muted-foreground">
              Required by state contract — DSPD SOW DHHS91172
            </p>
          ) : (
            ob.source_policy_section && (
              <p className="text-xs text-muted-foreground">{ob.source_policy_section}</p>
            )
          )}
          <p className="text-sm text-muted-foreground">{instance.period_key}</p>
          <p className="mt-1 text-sm font-medium text-success">
            Submitted {formatDateTime(completion?.completed_at ?? instance.completed_at)}
          </p>
          <p className="text-xs text-muted-foreground">Evidence: {evidenceUsed}</p>
          {evidenceUsed === IN_HIVE_COURSE_EVIDENCE || inHiveCourseIdForTitle(ob.title) ? (
            <Link
              to="/dashboard/my-obligations/course/$instanceId"
              params={{ instanceId: instance.id }}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--hive-ink)] hover:underline"
            >
              Open course / exam export <ExternalLink className="h-3 w-3" />
            </Link>
          ) : clientFormKindForTitle(ob.title) && instance.client_id ? (
            <Link
              to="/dashboard/client-training/$clientId"
              params={{ clientId: instance.client_id }}
              search={{
                trainingType: clientFormKindForTitle(ob.title)!,
                obligation_instance: instance.id,
              }}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--hive-ink)] hover:underline"
            >
              View form <ExternalLink className="h-3 w-3" />
            </Link>
          ) : evidenceUsed === "form" && isFormUuid(ob.linked_form_id) ? (
            <a
              href={`/dashboard/forms/${ob.linked_form_id}/submissions`}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--hive-ink)] hover:underline"
            >
              View submission <ExternalLink className="h-3 w-3" />
            </a>
          ) : downloadUrl ? (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--hive-ink)] hover:underline"
            >
              View submission <ExternalLink className="h-3 w-3" />
            </a>
          ) : completion?.attestation_text_snapshot ? (
            <div className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
              {completion.attestation_text_snapshot}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** A previously-submitted upload NECTAR could not verify — the assignee has
 *  already acted, so this reads like a status card (not the input form),
 *  but stays out of the "Completed" bucket until an admin confirms it. */
function PendingReviewCard({
  instance,
  completion,
}: {
  instance: MyObligationInstanceRow;
  completion: MyCompletionRow;
}) {
  const ob = instance.obligation;
  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-500/10 p-4 shadow-[var(--shadow-card)]">
      <p className="font-semibold">{resolveObligationTitle(ob, instance)}</p>
      <p className="text-sm text-muted-foreground">{instance.period_key}</p>
      <div className="mt-2 flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">NECTAR couldn't verify this upload</p>
          {(completion.nectar_validation_reasons?.length ?? 0) > 0 && (
            <p>{completion.nectar_validation_reasons!.join("; ")}</p>
          )}
          <p className="mt-1 font-medium">
            Pending admin review — an admin will confirm your upload.
          </p>
        </div>
      </div>
    </div>
  );
}

function OpenCard({
  orgId,
  instance,
  onCompleted,
}: {
  orgId: string;
  instance: MyObligationInstanceRow;
  onCompleted: () => void;
}) {
  const recordFn = useServerFn(recordCompletion);
  const policyFn = useServerFn(getAgencyPolicyForInstance);
  const ob = instance.obligation;
  const due = dueLabel(instance.due_at);
  const [checked, setChecked] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [nectarResult, setNectarResult] = useState<{
    status: "passed" | "failed";
    certType: string | null;
    expiresAt: string | null;
    reasons: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const courseId = inHiveCourseIdForTitle(ob.title);
  const formKind = clientFormKindForTitle(ob.title);
  const policyQ = useQuery({
    queryKey: ["agency-policy-for-instance", orgId, instance.id],
    enabled: !courseId && !formKind && ob.evidence_type === "attestation",
    queryFn: () =>
      policyFn({
        data: { organizationId: orgId, instanceId: instance.id },
      }),
  });
  const policy = policyQ.data?.policy ?? null;
  const policyUrl = policyQ.data?.signedUrl ?? null;
  const mediaKind = policy
    ? policyMediaKind(policy.file_mime, policy.file_name)
    : null;
  const { user } = useAuth();
  const resumeQ = useQuery({
    queryKey: ["in-hive-resume", user?.id, courseId],
    enabled: !!user && !!courseId,
    queryFn: () =>
      hasAnyInHiveProgress(user!.id, courseId!, courseTopicCodes(courseId!)),
  });
  const needsUpload =
    ob.evidence_type === "upload" || ob.evidence_type === "upload_and_attestation";
  const needsAttestation =
    ob.evidence_type === "attestation" || ob.evidence_type === "upload_and_attestation";
  const canSubmit =
    ob.evidence_type === "form" ? true : (!needsUpload || !!file) && (!needsAttestation || checked);

  const submit = async () => {
    setBusy(true);
    try {
      let uploadPath: string | null = null;
      let uploadFilename: string | null = null;
      if (needsUpload && file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${orgId}/${ob.id}/${instance.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("obligation-evidence")
          .upload(path, file);
        if (upErr) throw new Error(upErr.message);
        uploadPath = path;
        uploadFilename = file.name;
      }
      const result = await recordFn({
        data: {
          organizationId: orgId,
          instanceId: instance.id,
          evidenceTypeUsed: ob.evidence_type,
          uploadPath,
          uploadFilename,
          attestationSignedAt: needsAttestation ? new Date().toISOString() : null,
          attestationTextSnapshot: needsAttestation ? ob.attestation_text : null,
          notes: notes.trim() || null,
        },
      });
      const validation = (
        result as {
          nectarValidation?: {
            ran: boolean;
            status: "passed" | "failed" | null;
            reasons: string[];
            cert_type: string | null;
            expires_date: string | null;
          };
        }
      ).nectarValidation;
      if (validation?.ran && validation.status) {
        setNectarResult({
          status: validation.status,
          certType: validation.cert_type,
          expiresAt: validation.expires_date,
          reasons: validation.reasons,
        });
      }
      if (validation?.ran && validation.status === "failed") {
        toast.warning("Uploaded, but NECTAR couldn't verify it — pending admin review");
      } else {
        toast.success("Evidence submitted");
        onCompleted();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (nectarResult?.status === "failed") {
    return (
      <div className="rounded-xl border border-amber-300/60 bg-amber-500/10 p-4 shadow-[var(--shadow-card)]">
        <p className="font-semibold">{resolveObligationTitle(ob, instance)}</p>
        <div className="mt-2 flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">NECTAR couldn't verify this upload</p>
            <p>{nectarResult.reasons.join("; ")}</p>
            <p className="mt-1 font-medium">
              Pending admin review — an admin will confirm your upload.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="font-semibold">{resolveObligationTitle(ob, instance)}</p>
          {ob.source === "sow" ? (
            <p className="text-xs text-muted-foreground">
              Required by state contract — DSPD SOW DHHS91172
            </p>
          ) : (
            ob.source_policy_section && (
              <p className="text-xs text-muted-foreground">{ob.source_policy_section}</p>
            )
          )}
          <p className="mt-1 text-sm font-medium text-muted-foreground">{cadenceDescription(ob)}</p>
          {obligationIsRequired(ob) ? (
            <p
              className={`mt-1 text-lg font-semibold ${due.overdue ? "text-destructive" : "text-warning-foreground"}`}
            >
              {due.overdue
                ? `Overdue — was due ${new Date(instance.due_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`
                : `Due ${new Date(instance.due_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Optional — complete when you can. This does not block clock-in.
            </p>
          )}
      {ob.description && <p className="mt-2 text-sm text-muted-foreground">{ob.description}</p>}

      <div className="mt-3 space-y-2">
        {courseId ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium">In-Hive course</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Open the course from here. Finish each topic, then pass the competency exam (80%,
              three tries). Completing the exam greens this obligation.
            </p>
            <Link
              to="/dashboard/my-obligations/course/$instanceId"
              params={{ instanceId: instance.id }}
            >
              <Button size="sm" className="mt-2 min-h-[44px]">
                {resumeQ.data ? "Pick up where you left off" : "Open course"}
              </Button>
            </Link>
          </div>
        ) : formKind && instance.client_id ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium">Form</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Open and complete this form from here. Your existing attestation is saved to this
              obligation.
            </p>
            <Link
              to="/dashboard/client-training/$clientId"
              params={{ clientId: instance.client_id }}
              search={{ trainingType: formKind, obligation_instance: instance.id }}
            >
              <Button size="sm" className="mt-2 min-h-[44px]">
                Open and complete form
              </Button>
            </Link>
          </div>
        ) : ob.evidence_type === "form" ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium">Linked form required</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This form is required {cadenceDescription(ob).toLowerCase()}. Due{" "}
              {new Date(instance.due_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              .
            </p>
            {isFormUuid(ob.linked_form_id) ? (
              <a
                href={`/dashboard/forms/${ob.linked_form_id}/fill?obligation_instance=${instance.id}`}
              >
                <Button size="sm" className="mt-2">
                  Open and complete form →
                </Button>
              </a>
            ) : (
              <p className="mt-2 text-xs text-amber-800">
                Waiting on your administrator — this duty needs a published form before you can
                complete it.
              </p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              Once you submit the form, this obligation will automatically close.
            </p>
          </div>
        ) : (
          <>
            {needsUpload && (
              <div className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-3 py-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] shrink-0 gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {file ? "Change file" : "Choose file"}
                </Button>
                <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {file ? (
                    <span className="block truncate text-foreground">{file.name}</span>
                  ) : (
                    <span>No file selected</span>
                  )}
                  <span className="block text-[10px]">PDF, JPG, PNG, DOCX, XLSX, max 20MB</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
            {needsUpload && (
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              />
            )}
            {policy && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3" data-testid="policy-viewer">
                <p className="text-sm font-medium">Read or watch this policy</p>
                {policy.body_text ? (
                  <div className="max-h-64 overflow-auto whitespace-pre-wrap text-sm leading-relaxed">
                    {policy.body_text}
                  </div>
                ) : null}
                {policyUrl && mediaKind === "video" ? (
                  <video controls className="max-h-72 w-full rounded-md bg-black" src={policyUrl} />
                ) : null}
                {policyUrl && mediaKind === "image" ? (
                  <img alt={policy.file_name ?? "Policy"} className="max-h-72 w-full rounded-md object-contain" src={policyUrl} />
                ) : null}
                {policyUrl && mediaKind === "pdf" ? (
                  <iframe title={policy.file_name ?? "Policy"} className="h-72 w-full rounded-md border" src={policyUrl} />
                ) : null}
                {policyUrl && (mediaKind === "other" || !mediaKind) ? (
                  <a
                    href={policyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-[var(--hive-ink)] hover:underline"
                  >
                    Open {policy.file_name ?? "file"} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            )}
            {needsAttestation && (
              <>
                <div className="rounded-md border border-border bg-muted/40 p-2.5 text-sm leading-relaxed">
                  {ob.attestation_text}
                </div>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-md px-1 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => setChecked(v === true)}
                    className="h-5 w-5 shrink-0"
                  />
                  I confirm the above statement is accurate and true
                </label>
              </>
            )}
            <div className="flex justify-end">
              <Button className="min-h-[44px]" disabled={!canSubmit || busy} onClick={submit}>
                {ob.evidence_type === "attestation" ? "Sign and submit" : "Submit"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OverlayClientFormCard({
  row,
}: {
  row: {
    clientId: string;
    clientName: string;
    kind: ClientFormKind;
    completedAt: string | null;
    done: boolean;
  };
}) {
  const title = clientFormTitleForKind(row.kind).replace(
    "[Client Name]",
    toDisplayNameCase(row.clientName),
  );
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{CLIENT_FORM_LABEL[row.kind]}</p>
      {row.done ? (
        <p className="mt-1 text-sm font-medium text-success">
          Submitted {formatDateTime(row.completedAt)}
        </p>
      ) : (
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium">Form</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Open and complete this form. Completing it records your attestation.
          </p>
          <Link
            to="/dashboard/client-training/$clientId"
            params={{ clientId: row.clientId }}
            search={{ trainingType: row.kind }}
          >
            <Button size="sm" className="mt-2 min-h-[44px]">
              Open and complete form
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function MyObligationsPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const qc = useQueryClient();
  const listFn = useServerFn(listMyObligationInstances);
  const checkFn = useServerFn(checkAndMarkOverdue);
  const clientTrainingsFn = useServerFn(getMyClientTrainingStatuses);

  useEffect(() => {
    if (orgId) checkFn({ data: { organizationId: orgId } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const { data: instancesRaw = [], isLoading } = useQuery<MyObligationInstanceRow[]>({
    queryKey: ["my-obligation-instances", orgId, user?.id],
    enabled: !!orgId && !!user,
    queryFn: () => listFn({ data: { organizationId: orgId! } }),
  });
  const instances = (Array.isArray(instancesRaw) ? instancesRaw : []).filter(
    (row) => !isPackSentinel(row.obligation),
  );

  const { data: clientTrainings } = useQuery({
    queryKey: ["my-client-training-statuses", user?.id],
    enabled: !!user,
    queryFn: () => clientTrainingsFn(),
    staleTime: 60_000,
  });

  const instanceIds = useMemo(() => instances.map((i) => i.id), [instances]);
  const { data: myCompletions = [] } = useQuery({
    queryKey: ["my-obligation-completions", orgId, user?.id, instanceIds],
    enabled: !!orgId && !!user && instanceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_obligation_completions")
        .select(
          "instance_id, staff_name, completed_at, evidence_type_used, upload_path, upload_filename, attestation_text_snapshot, form_submission_id, nectar_validation_status, nectar_validation_reasons, nectar_extracted_cert_type, nectar_extracted_expires_date",
        )
        .eq("staff_id", user!.id)
        .in("instance_id", instanceIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as MyCompletionRow[];
    },
  });

  const completionByInstance = useMemo(() => {
    const m = new Map<string, MyCompletionRow>();
    for (const c of myCompletions) m.set(c.instance_id, c);
    return m;
  }, [myCompletions]);

  const [tab, setTab] = useState<"all" | "due_soon" | "overdue" | "completed">("all");

  // A completion whose NECTAR validation failed stays out of "Completed" —
  // the instance was never closed and an admin still needs to confirm it.
  const isPendingReview = (instId: string) =>
    completionByInstance.get(instId)?.nectar_validation_status === "failed";

  const formDoneByClientKind = useMemo(() => {
    const done = new Set<string>();
    for (const item of clientTrainings?.items ?? []) {
      for (const t of item.trainings ?? []) {
        if (t.setupStatus === "published" && t.completionStatus === "completed") {
          done.add(`${item.clientId}:${t.type}`);
        }
      }
    }
    return done;
  }, [clientTrainings]);

  const { open, completed, unlinkedFormCount, overlayOpen } = useMemo(() => {
    const open: MyObligationInstanceRow[] = [];
    const completed: MyObligationInstanceRow[] = [];
    let unlinkedFormCount = 0;
    const covered = new Set<string>();
    for (const inst of instances) {
      const kind = clientFormKindForTitle(inst.obligation.title);
      if (kind && inst.client_id) covered.add(`${inst.client_id}:${kind}`);
      const hasCompletion = completionByInstance.has(inst.id);
      const failedValidation =
        completionByInstance.get(inst.id)?.nectar_validation_status === "failed";
      const formAlreadyDone =
        !!kind && !!inst.client_id && formDoneByClientKind.has(`${inst.client_id}:${kind}`);
      const iCompleted =
        inst.status === "completed" ||
        inst.status === "waived" ||
        formAlreadyDone ||
        (hasCompletion && !failedValidation);
      if (iCompleted) {
        completed.push(inst);
        continue;
      }
      if (isUnlinkedFormDuty(inst.obligation)) {
        unlinkedFormCount += 1;
        continue;
      }
      open.push(inst);
    }
    open.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
    completed.sort((a, b) => new Date(b.due_at).getTime() - new Date(a.due_at).getTime());

    const overlayOpen: Array<{
      clientId: string;
      clientName: string;
      kind: ClientFormKind;
      completedAt: string | null;
      done: boolean;
    }> = [];
    for (const item of clientTrainings?.items ?? []) {
      for (const t of item.trainings ?? []) {
        if (t.setupStatus !== "published") continue;
        const key = `${item.clientId}:${t.type}`;
        if (covered.has(key)) continue;
        overlayOpen.push({
          clientId: item.clientId,
          clientName: item.clientName,
          kind: t.type as ClientFormKind,
          completedAt: t.completedAt ?? null,
          done: t.completionStatus === "completed",
        });
      }
    }
    return { open, completed, unlinkedFormCount, overlayOpen };
  }, [instances, completionByInstance, clientTrainings, formDoneByClientKind]);

  const overlayDue = overlayOpen.filter((o) => !o.done);
  const overlayDone = overlayOpen.filter((o) => o.done);
  const dueSoon = open.filter(
    (i) => obligationIsRequired(i.obligation) && !dueLabel(i.due_at).overdue,
  );
  const overdue = open.filter(
    (i) => obligationIsRequired(i.obligation) && dueLabel(i.due_at).overdue,
  );
  const openCount = open.length + overlayDue.length;
  const completedCount = completed.length + overlayDone.length;

  const shown =
    tab === "all"
      ? open
      : tab === "due_soon"
        ? dueSoon
        : tab === "overdue"
          ? overdue
          : completed;
  const shownOverlay = tab === "completed" ? overlayDone : tab === "overdue" ? [] : overlayDue;

  const onCompleted = () => {
    qc.invalidateQueries({ queryKey: ["my-obligation-instances"] });
    qc.invalidateQueries({ queryKey: ["my-obligation-completions"] });
    qc.invalidateQueries({ queryKey: ["my-client-training-statuses"] });
  };

  return (
    <div className="w-full space-y-6">
      <StaffPageHeader
        eyebrow="Compliance"
        eyebrowIcon={ClipboardList}
        title="My Obligations"
        subtitle="Company requirements assigned to you."
      />

      <div className="flex flex-wrap gap-1.5 rounded-lg border border-border p-1">
        {(
          [
            ["all", `All (${openCount})`],
            ["due_soon", `Due soon (${dueSoon.length + overlayDue.length})`],
            ["overdue", `Overdue (${overdue.length})`],
            ["completed", `Completed (${completedCount})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {unlinkedFormCount > 0 && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          {unlinkedFormCount} {unlinkedFormCount === 1 ? "duty is" : "duties are"} waiting on a
          published form. Ask an administrator to attach {unlinkedFormCount === 1 ? "it" : "them"}{" "}
          under Compliance — nothing for you to complete here yet.
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : instances.length === 0 && overlayOpen.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No obligations assigned yet. Check with your administrator.
        </div>
      ) : shown.length === 0 && shownOverlay.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {unlinkedFormCount > 0 ? "No duties you can complete yet." : "Nothing here."}
        </div>
      ) : (
        <div className="grid w-full gap-3">
          {(() => {
            const renderCard = (inst: MyObligationInstanceRow) => {
              if (isPendingReview(inst.id)) {
                return (
                  <PendingReviewCard
                    key={inst.id}
                    instance={inst}
                    completion={completionByInstance.get(inst.id)!}
                  />
                );
              }
              const formKind = clientFormKindForTitle(inst.obligation.title);
              const formAlreadyDone =
                !!formKind &&
                !!inst.client_id &&
                formDoneByClientKind.has(`${inst.client_id}:${formKind}`);
              if (
                tab === "completed" ||
                inst.status === "completed" ||
                inst.status === "waived" ||
                formAlreadyDone ||
                completionByInstance.has(inst.id)
              ) {
                return (
                  <CompletedCard
                    key={inst.id}
                    instance={inst}
                    completion={completionByInstance.get(inst.id)}
                  />
                );
              }
              return (
                <OpenCard key={inst.id} orgId={orgId!} instance={inst} onCompleted={onCompleted} />
              );
            };

            // Group scope='staff_per_client' instances (e.g. multiple
            // client-specific trainings) by client name so staff see all
            // their per-client obligations for one client together.
            type Group = {
              key: string;
              clientLabel: string | null;
              items: MyObligationInstanceRow[];
            };
            const groups: Group[] = [];
            const groupIndexByClient = new Map<string, number>();
            for (const inst of shown) {
              if (inst.obligation.scope === "staff_per_client" && inst.client_name) {
                const idx = groupIndexByClient.get(inst.client_name);
                if (idx === undefined) {
                  groupIndexByClient.set(inst.client_name, groups.length);
                  groups.push({
                    key: `client:${inst.client_name}`,
                    clientLabel: toDisplayNameCase(inst.client_name),
                    items: [inst],
                  });
                } else {
                  groups[idx].items.push(inst);
                }
              } else {
                groups.push({ key: `single:${inst.id}`, clientLabel: null, items: [inst] });
              }
            }

            const overlayCards = shownOverlay.map((row) => (
              <OverlayClientFormCard key={`${row.clientId}:${row.kind}`} row={row} />
            ));

            return (
              <>
                {groups.map((g, i) =>
                  g.clientLabel ? (
                    <div
                      key={g.key}
                      className={`space-y-2.5 ${i > 0 ? "border-t border-border pt-4" : ""}`}
                    >
                      <p className="px-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {g.clientLabel}
                      </p>
                      <div className="grid w-full gap-3">{g.items.map(renderCard)}</div>
                    </div>
                  ) : (
                    g.items.map(renderCard)
                  ),
                )}
                {overlayCards}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
