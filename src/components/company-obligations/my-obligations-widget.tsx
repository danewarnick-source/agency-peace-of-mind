// Staff dashboard reminder widget for Company Obligations assigned to the
// logged-in user. Mirrors FormsReminderCard's compute-on-read pattern, but
// also supports completing attestation/upload evidence inline.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  listMyObligationInstances,
  recordCompletion,
  cadenceDescription,
  type MyObligationInstanceRow,
} from "@/lib/company-obligations.functions";
import { isFormUuid } from "@/lib/resolve-obligation-form";

const MY_OBLIGATIONS_KEY = "my-obligation-instances";

export function dueLabel(dueAt: string): { text: string; overdue: boolean } {
  const due = new Date(dueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  if (diffMs < 0) {
    const od = Math.max(1, Math.ceil(Math.abs(diffMs) / 86_400_000));
    return { text: `Overdue — ${od} day${od === 1 ? "" : "s"} ago`, overdue: true };
  }
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 0) return { text: "Due today", overdue: false };
  if (days === 1) return { text: "Due in 1 day", overdue: false };
  return { text: `Due in ${days} days`, overdue: false };
}

function EvidencePanel({
  orgId,
  instance,
  onDone,
}: {
  orgId: string;
  instance: MyObligationInstanceRow;
  onDone: () => void;
}) {
  const recordFn = useServerFn(recordCompletion);
  const ob = instance.obligation;
  const [checked, setChecked] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [nectarResult, setNectarResult] = useState<
    { status: "passed" | "failed"; certType: string | null; expiresAt: string | null; reasons: string[] } | null
  >(null);

  const needsUpload = ob.evidence_type === "upload" || ob.evidence_type === "upload_and_attestation";
  const needsAttestation = ob.evidence_type === "attestation" || ob.evidence_type === "upload_and_attestation";
  const canSubmit = (!needsUpload || !!file) && (!needsAttestation || checked);

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
      const result = await recordFn({
        data: {
          organizationId: orgId,
          instanceId: instance.id,
          evidenceTypeUsed: ob.evidence_type,
          uploadPath,
          uploadFilename,
          attestationSignedAt: needsAttestation ? new Date().toISOString() : null,
          attestationTextSnapshot: needsAttestation ? ob.attestation_text : null,
        },
      });
      const validation = (result as { nectarValidation?: { ran: boolean; status: "passed" | "failed" | null; reasons: string[]; cert_type: string | null; expires_date: string | null } }).nectarValidation;
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
        onDone();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (nectarResult?.status === "failed") {
    return (
      <div className="mt-2 space-y-1.5 rounded-lg border border-amber-300/60 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
        <div className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium">NECTAR couldn't verify this upload</p>
            <p>{nectarResult.reasons.join("; ")}</p>
            <p className="mt-1 font-medium">Pending admin review</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-background/60 p-3">
      {nectarResult?.status === "passed" && (
        <div className="flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 p-2 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>
            NECTAR verified — {nectarResult.certType ?? ob.nectar_cert_type_label ?? "document"}
            {nectarResult.expiresAt && ` / Expires: ${nectarResult.expiresAt}`}
          </span>
        </div>
      )}
      {needsUpload && (
        <div>
          <label className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">
            <Upload className="h-3.5 w-3.5" />
            {file ? file.name : "Choose file…"}
            <input
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      )}
      {needsAttestation && (
        <>
          <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">{ob.attestation_text}</div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
            I confirm the above statement is accurate and true
          </label>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" disabled={!canSubmit || busy} onClick={submit}>
          {ob.evidence_type === "attestation" ? "Sign and submit" : "Submit"}
        </Button>
      </div>
    </div>
  );
}

function WidgetItem({ orgId, instance }: { orgId: string; instance: MyObligationInstanceRow }) {
  const qc = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  const ob = instance.obligation;
  const due = dueLabel(instance.due_at);

  if (removed) return null;

  const onDone = () => {
    setRemoved(true);
    qc.invalidateQueries({ queryKey: [MY_OBLIGATIONS_KEY] });
  };

  return (
    <li className="rounded-lg border border-border bg-background/60 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{ob.title}</p>
          <p className="text-xs text-muted-foreground">{cadenceDescription(ob)}</p>
          <p className={`text-xs font-medium ${due.overdue ? "text-destructive" : "text-muted-foreground"}`}>
            {due.text}
          </p>
        </div>
        {ob.evidence_type === "form" && isFormUuid(ob.linked_form_id) ? (
          <Link
            to="/dashboard/forms/$formId/fill"
            params={{ formId: ob.linked_form_id }}
            search={{ obligation_instance: instance.id } as never}
          >
            <Button size="sm" variant="outline" className="shrink-0">
              Complete form <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        ) : ob.evidence_type === "form" ? (
          <p className="shrink-0 text-[11px] text-amber-800">Form not linked</p>
        ) : (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setPanelOpen((v) => !v)}>
            {ob.evidence_type === "attestation" ? "Sign off" : ob.evidence_type === "upload" ? "Upload file" : "Submit evidence"}
          </Button>
        )}
      </div>
      {panelOpen && ob.evidence_type !== "form" && (
        <EvidencePanel orgId={orgId} instance={instance} onDone={onDone} />
      )}
    </li>
  );
}

export function MyObligationsWidget() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const listFn = useServerFn(listMyObligationInstances);

  const { data: instances = [] } = useQuery<MyObligationInstanceRow[]>({
    queryKey: [MY_OBLIGATIONS_KEY, orgId, user?.id],
    enabled: !!orgId && !!user,
    queryFn: () => listFn({ data: { organizationId: orgId! } }),
    staleTime: 30_000,
  });

  const openItems = instances
    .filter((i) => i.status === "pending" || i.status === "overdue")
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

  if (openItems.length === 0 || !orgId) return null;

  const overdueCount = openItems.filter((i) => i.status === "overdue").length;
  const visible = openItems.slice(0, 3);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-[#137182]" />
        <h2 className="text-sm font-semibold">My obligations</h2>
        <Badge className={overdueCount > 0 ? "bg-rose-600 text-white hover:bg-rose-600" : "bg-amber-500 text-white hover:bg-amber-500"}>
          {openItems.length}
        </Badge>
      </div>
      <ul className="space-y-2">
        {visible.map((inst) => (
          <WidgetItem key={inst.id} orgId={orgId} instance={inst} />
        ))}
      </ul>
      <div className="mt-3 text-right">
        <Link to="/dashboard/my-obligations" className="text-xs font-medium text-[#137182] hover:underline">
          View all {openItems.length} <ArrowRight className="ml-0.5 inline h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
