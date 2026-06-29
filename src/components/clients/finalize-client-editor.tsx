// FinalizeClientEditor — generalized "complete missing info + finalize" dialog
// for any pending imported client subject. Reused by both the Pending Clients
// workspace and the Smart Import Done page. Backed by the real validator
// (validateClientDraft + filterBlocking via getPendingClientSubject) and the
// real commit path (commitSingleSubject) so finalization is end-to-end.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  applyClientFields,
  getPendingClientSubject,
  setSubjectReady,
  ISSUE_KEY_TO_TARGET,
} from "@/lib/smart-import-review.functions";
import { commitSingleSubject } from "@/lib/smart-import-commit.functions";

type FieldKey =
  | "first_name" | "last_name" | "date_of_birth" | "physical_address"
  | "medicaid_id" | "admission_date" | "discharge_date" | "form_1056_approved_date"
  | "is_own_guardian" | "guardian_name" | "guardian_phone"
  | "guardian_relationship" | "guardian_email"
  | "emergency_contact_name" | "emergency_contact_phone" | "phone";

const FIELD_GROUPS: Array<{
  title: string;
  fields: Array<{ key: FieldKey; label: string; type?: "text" | "date" | "bool"; required?: boolean; placeholder?: string }>;
}> = [
  {
    title: "Identity",
    fields: [
      { key: "first_name", label: "First name", required: true },
      { key: "last_name", label: "Last name", required: true },
      { key: "date_of_birth", label: "Date of birth", type: "date" },
      { key: "medicaid_id", label: "Medicaid ID", placeholder: "10 digits" },
      { key: "phone", label: "Phone" },
      { key: "physical_address", label: "Physical address", placeholder: "Street, City, ST ZIP" },
    ],
  },
  {
    title: "Dates",
    fields: [
      { key: "admission_date", label: "Admission date", type: "date" },
      { key: "discharge_date", label: "Discharge date", type: "date" },
      { key: "form_1056_approved_date", label: "1056 approved date", type: "date" },
    ],
  },
  {
    title: "Guardianship",
    fields: [
      { key: "is_own_guardian", label: "Client is their own guardian", type: "bool" },
      { key: "guardian_name", label: "Guardian name" },
      { key: "guardian_phone", label: "Guardian phone" },
      { key: "guardian_relationship", label: "Relationship" },
      { key: "guardian_email", label: "Guardian email" },
    ],
  },
  {
    title: "Emergency contact",
    fields: [
      { key: "emergency_contact_name", label: "Name" },
      { key: "emergency_contact_phone", label: "Phone" },
    ],
  },
];

export function FinalizeClientEditor({
  open,
  onOpenChange,
  subjectId,
  onFinalized,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subjectId: string | null;
  onFinalized?: () => void;
}) {
  const qc = useQueryClient();
  const getSubject = useServerFn(getPendingClientSubject);
  const apply = useServerFn(applyClientFields);
  const markReady = useServerFn(setSubjectReady);
  const commitOne = useServerFn(commitSingleSubject);

  const subjectQ = useQuery({
    enabled: open && !!subjectId,
    queryKey: ["pending-client-subject", subjectId],
    queryFn: () => getSubject({ data: { subjectId: subjectId! } }),
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [isOwn, setIsOwn] = useState(true);

  useEffect(() => {
    if (!subjectQ.data) return;
    const v = subjectQ.data.values || {};
    const next: Record<string, string> = {};
    for (const g of FIELD_GROUPS) {
      for (const f of g.fields) {
        if (f.key === "is_own_guardian") continue;
        next[f.key] = (v[f.key] ?? "") as string;
      }
    }
    setValues(next);
    const raw = (v.is_own_guardian ?? "").toString().toLowerCase();
    setIsOwn(raw === "" || raw === "true" || raw === '{"bool":true}');
  }, [subjectQ.data]);

  const blocking = subjectQ.data?.blocking ?? [];
  const displayName = subjectQ.data?.subject?.display_name?.trim() || "Unnamed imported client";

  const blockingByField = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const b of blocking) {
      const target = (b.field as string | null) ?? ISSUE_KEY_TO_TARGET[b.key] ?? "_other";
      const arr = m.get(target) ?? [];
      arr.push(b.message);
      m.set(target, arr);
    }
    return m;
  }, [blocking]);
  const unmappedIssues = blockingByField.get("_other") ?? [];

  const saveOnly = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string | boolean> = { is_own_guardian: isOwn };
      for (const [k, v] of Object.entries(values)) payload[k] = v;
      if (isOwn) {
        payload.guardian_name = "";
        payload.guardian_phone = "";
        payload.guardian_relationship = "";
        payload.guardian_email = "";
      }
      return apply({ data: { subjectId: subjectId!, values: payload } });
    },
    onSuccess: () => {
      toast.success("Saved.");
      subjectQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finalize = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string | boolean> = { is_own_guardian: isOwn };
      for (const [k, v] of Object.entries(values)) payload[k] = v;
      if (isOwn) {
        payload.guardian_name = "";
        payload.guardian_phone = "";
        payload.guardian_relationship = "";
        payload.guardian_email = "";
      }
      const applied = await apply({ data: { subjectId: subjectId!, values: payload } });
      if (!applied.readyToFinalize) {
        return { stage: "blocked" as const, blocking: applied.blocking };
      }
      const ready = await markReady({ data: { subjectId: subjectId!, ready: true } });
      if ("ok" in ready && ready.ok === false) {
        return { stage: "blocked" as const, blocking: (ready as { blocking: typeof applied.blocking }).blocking };
      }
      const res = await commitOne({ data: { subjectId: subjectId! } });
      return { stage: "committed" as const, results: res.results };
    },
    onSuccess: (out) => {
      if (out.stage === "blocked") {
        toast.error(`Still ${out.blocking.length} blocking issue${out.blocking.length === 1 ? "" : "s"} — see below.`);
        subjectQ.refetch();
        return;
      }
      const live = (out.results ?? []).filter((r) => r.committed && r.record_id).length;
      if (live > 0) {
        toast.success(`Imported ${live} record${live === 1 ? "" : "s"} into your directory.`);
      } else {
        const err = (out.results ?? [])[0]?.error;
        toast.error(err ? `Commit failed: ${err}` : "Commit returned no new records.");
      }
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients-uncommitted-imports"] });
      qc.invalidateQueries({ queryKey: ["pending-client-subjects"] });
      qc.invalidateQueries({ queryKey: ["smart-import-done"] });
      onFinalized?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = saveOnly.isPending || finalize.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" /> Finalize {displayName}
          </DialogTitle>
          <DialogDescription>
            Fix every required field. Save &amp; finalize will validate, mark ready, and commit this client into your directory.
          </DialogDescription>
        </DialogHeader>

        {subjectQ.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {subjectQ.data && (
          <div className="space-y-4">
            {/* Blocking summary */}
            <div className={`rounded-lg border p-3 text-sm ${blocking.length === 0 ? "border-emerald-300/50 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20"}`}>
              {blocking.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Ready to finalize — all required fields pass validation.
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    {blocking.length} issue{blocking.length === 1 ? "" : "s"} blocking finalization
                  </div>
                  <ul className="mt-1.5 ml-5 list-disc space-y-0.5 text-xs text-amber-900 dark:text-amber-200">
                    {blocking.map((b) => (
                      <li key={b.key}>{b.message}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {unmappedIssues.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
                <div className="font-medium text-destructive mb-1">Manual review needed</div>
                <ul className="ml-4 list-disc space-y-0.5">
                  {unmappedIssues.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}

            {FIELD_GROUPS.map((g) => (
              <div key={g.title} className="rounded-lg border border-border p-3 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{g.title}</div>
                {g.fields.map((f) => {
                  const issues = blockingByField.get(f.key) ?? [];
                  if (f.type === "bool") {
                    return (
                      <div key={f.key} className="flex items-center justify-between rounded border border-border/60 p-2">
                        <div className="text-sm">{f.label}</div>
                        <Switch checked={isOwn} onCheckedChange={setIsOwn} disabled={busy} />
                      </div>
                    );
                  }
                  const disabledByGuardian =
                    isOwn && (f.key === "guardian_name" || f.key === "guardian_phone" || f.key === "guardian_relationship" || f.key === "guardian_email");
                  return (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        {f.label}{f.required && <span className="text-destructive">*</span>}
                        {issues.length > 0 && <Badge variant="outline" className="ml-2 border-amber-400 text-amber-700 dark:text-amber-300 text-[10px]">blocking</Badge>}
                      </Label>
                      <Input
                        type={f.type === "date" ? "date" : "text"}
                        value={values[f.key] ?? ""}
                        placeholder={f.placeholder}
                        disabled={busy || disabledByGuardian}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      />
                      {issues.map((m, i) => (
                        <div key={i} className="text-[11px] text-amber-700 dark:text-amber-400">{m}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={() => saveOnly.mutate()} disabled={busy}>
            {saveOnly.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save progress
          </Button>
          <Button onClick={() => finalize.mutate()} disabled={busy}>
            {finalize.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Save &amp; finalize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
