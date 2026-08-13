import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardList, CheckCircle2, Upload, ExternalLink } from "lucide-react";
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
import { dueLabel } from "@/components/company-obligations/my-obligations-widget";

export const Route = createFileRoute("/dashboard/my-obligations")({
  head: () => ({ meta: [{ title: "My obligations — HIVE" }] }),
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
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function CompletedCard({ instance, completion }: { instance: MyObligationInstanceRow; completion: MyCompletionRow | undefined }) {
  const ob = instance.obligation;
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!completion?.upload_path) return;
    let cancelled = false;
    supabase.storage.from("obligation-evidence").createSignedUrl(completion.upload_path, 300).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setDownloadUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [completion?.upload_path]);

  const evidenceUsed = completion?.evidence_type_used ?? instance.evidence_type_used ?? ob.evidence_type;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{ob.title}</p>
          {ob.source === "sow" ? (
            <p className="text-xs text-muted-foreground">🔒 Required by state contract — DSPD SOW DHHS91172</p>
          ) : (
            ob.source_policy_section && <p className="text-xs text-muted-foreground">{ob.source_policy_section}</p>
          )}
          <p className="text-sm text-muted-foreground">{instance.period_key}</p>
          <p className="mt-1 text-sm font-medium text-success">
            Submitted {formatDateTime(completion?.completed_at ?? instance.completed_at)}
          </p>
          <p className="text-xs text-muted-foreground">Evidence: {evidenceUsed}</p>
          {evidenceUsed === "form" ? (
            <a
              href={`/dashboard/forms/${ob.linked_form_id}/submissions`}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#137182] hover:underline"
            >
              View submission <ExternalLink className="h-3 w-3" />
            </a>
          ) : downloadUrl ? (
            <a href={downloadUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#137182] hover:underline">
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
  const ob = instance.obligation;
  const due = dueLabel(instance.due_at);
  const [checked, setChecked] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const needsUpload = ob.evidence_type === "upload" || ob.evidence_type === "upload_and_attestation";
  const needsAttestation = ob.evidence_type === "attestation" || ob.evidence_type === "upload_and_attestation";
  const canSubmit = ob.evidence_type === "form"
    ? true
    : (!needsUpload || !!file) && (!needsAttestation || checked);

  const submit = async () => {
    setBusy(true);
    try {
      let uploadPath: string | null = null;
      let uploadFilename: string | null = null;
      if (needsUpload && file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${orgId}/${ob.id}/${instance.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("obligation-evidence").upload(path, file);
        if (upErr) throw new Error(upErr.message);
        uploadPath = path;
        uploadFilename = file.name;
      }
      await recordFn({
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
      toast.success("Evidence submitted");
      onCompleted();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="font-semibold">{ob.title}</p>
      {ob.source === "sow" ? (
        <p className="text-xs text-muted-foreground">🔒 Required by state contract — DSPD SOW DHHS91172</p>
      ) : (
        ob.source_policy_section && <p className="text-xs text-muted-foreground">{ob.source_policy_section}</p>
      )}
      <p className="mt-1 text-sm font-medium text-muted-foreground">{cadenceDescription(ob)}</p>
      <p className={`mt-1 text-lg font-semibold ${due.overdue ? "text-destructive" : "text-warning-foreground"}`}>
        {due.overdue ? `Overdue — was due ${new Date(instance.due_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}` : `Due ${new Date(instance.due_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`}
      </p>
      {ob.description && <p className="mt-2 text-sm text-muted-foreground">{ob.description}</p>}

      <div className="mt-3 space-y-2">
        {ob.evidence_type === "form" ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium">Linked form required</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This form is required {cadenceDescription(ob).toLowerCase()}. Due {new Date(instance.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
            </p>
            <a href={`/dashboard/forms/${ob.linked_form_id}/fill?obligation_instance=${instance.id}`}>
              <Button size="sm" className="mt-2">Open and complete form →</Button>
            </a>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Once you submit the form, this obligation will automatically close.
            </p>
          </div>
        ) : (
          <>
            {needsUpload && (
              <label className="flex min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground hover:bg-muted">
                <Upload className="h-4 w-4" />
                {file ? file.name : "Drop file here or click to browse"}
                <span className="text-[10px]">PDF, JPG, PNG, DOCX, XLSX, max 20MB</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
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
            {needsAttestation && (
              <>
                <div className="rounded-md border border-border bg-muted/40 p-2.5 text-sm">{ob.attestation_text}</div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
                  I confirm the above statement is accurate and true
                </label>
              </>
            )}
            <div className="flex justify-end">
              <Button disabled={!canSubmit || busy} onClick={submit}>
                {ob.evidence_type === "attestation" ? "Sign and submit" : "Submit"}
              </Button>
            </div>
          </>
        )}
      </div>
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

  useEffect(() => {
    if (orgId) checkFn({ data: { organizationId: orgId } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["my-obligation-instances", orgId, user?.id],
    enabled: !!orgId && !!user,
    queryFn: () => listFn({ data: { organizationId: orgId! } }),
  });

  const instanceIds = useMemo(() => instances.map((i) => i.id), [instances]);
  const { data: myCompletions = [] } = useQuery({
    queryKey: ["my-obligation-completions", orgId, user?.id, instanceIds],
    enabled: !!orgId && !!user && instanceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_obligation_completions")
        .select("instance_id, staff_name, completed_at, evidence_type_used, upload_path, upload_filename, attestation_text_snapshot, form_submission_id")
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

  const { open, completed } = useMemo(() => {
    const open: MyObligationInstanceRow[] = [];
    const completed: MyObligationInstanceRow[] = [];
    for (const inst of instances) {
      const iCompleted = inst.status === "completed" || inst.status === "waived" || completionByInstance.has(inst.id);
      if (iCompleted) completed.push(inst);
      else open.push(inst);
    }
    open.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
    completed.sort((a, b) => new Date(b.due_at).getTime() - new Date(a.due_at).getTime());
    return { open, completed };
  }, [instances, completionByInstance]);

  const dueSoon = open.filter((i) => !dueLabel(i.due_at).overdue);
  const overdue = open.filter((i) => dueLabel(i.due_at).overdue);

  const shown = tab === "all" ? open : tab === "due_soon" ? dueSoon : tab === "overdue" ? overdue : completed;

  const onCompleted = () => {
    qc.invalidateQueries({ queryKey: ["my-obligation-instances"] });
    qc.invalidateQueries({ queryKey: ["my-obligation-completions"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-[#137182]" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My obligations</h1>
          <p className="text-sm text-muted-foreground">Company requirements assigned to you.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-lg border border-border p-1">
        {([
          ["all", `All (${open.length})`],
          ["due_soon", `Due soon (${dueSoon.length})`],
          ["overdue", `Overdue (${overdue.length})`],
          ["completed", `Completed (${completed.length})`],
        ] as const).map(([key, label]) => (
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nothing here.
        </div>
      ) : (
        <div className="grid gap-3">
          {shown.map((inst) =>
            tab === "completed" || inst.status === "completed" || inst.status === "waived" || completionByInstance.has(inst.id) ? (
              <CompletedCard key={inst.id} instance={inst} completion={completionByInstance.get(inst.id)} />
            ) : (
              <OpenCard key={inst.id} orgId={orgId!} instance={inst} onCompleted={onCompleted} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
