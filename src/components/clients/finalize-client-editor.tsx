// FinalizeClientEditor — single-action finalize dialog for any pending
// imported client subject. Reused by the Pending Clients workspace and
// the Smart Import Done page. One "Items needing review" panel unifies
// validation errors, contradictions, and open NECTAR questions; one
// "Finalize Client" button normalizes → validates → marks ready → commits
// → routes to the new client.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle, CheckCircle2, HelpCircle, Info, Loader2, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  applyClientFields,
  getPendingClientSubject,
  setSubjectReady,
  answerNectarQuestion,
  ISSUE_KEY_TO_TARGET,
} from "@/lib/smart-import-review.functions";
import { commitSingleSubject } from "@/lib/smart-import-commit.functions";
import { setClientCaseload } from "@/lib/scheduler/setup.functions";
import { useCurrentOrg } from "@/hooks/use-org";
import { CaseloadEditor, type CaseloadDraftValue } from "@/components/clients/caseload-editor";

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

type ReviewItem = {
  id: string;
  category: "required" | "confirmation" | "optional";
  field: string | null;
  message: string;
  source: "validation" | "contradiction" | "nectar_question";
  questionId?: string;
};

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
  const navigate = useNavigate();
  const getSubject = useServerFn(getPendingClientSubject);
  const apply = useServerFn(applyClientFields);
  const markReady = useServerFn(setSubjectReady);
  const commitOne = useServerFn(commitSingleSubject);
  const answerQ = useServerFn(answerNectarQuestion);
  const saveCaseload = useServerFn(setClientCaseload);
  const { data: org } = useCurrentOrg();

  const subjectQ = useQuery({
    enabled: open && !!subjectId,
    queryKey: ["pending-client-subject", subjectId],
    queryFn: () => getSubject({ data: { subjectId: subjectId! } }),
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [isOwn, setIsOwn] = useState(true);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});
  const [draftAssignments, setDraftAssignments] = useState<CaseloadDraftValue>(new Map());

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
    // Default to self-guardian when unset (matches commit-time default).
    setIsOwn(raw === "" || raw === "true" || raw === '{"bool":true}');
  }, [subjectQ.data]);

  const reviewItems = (subjectQ.data?.reviewItems ?? []) as ReviewItem[];
  const blocking = subjectQ.data?.blocking ?? [];
  const displayName = subjectQ.data?.subject?.display_name?.trim() || "Unnamed imported client";

  // Best-effort: derive the client's authorized codes from extracted values so
  // the draft-mode CaseloadEditor can offer per-code scoping pre-commit.
  // Codes a staff is scoped to must be a subset of this set, validated again
  // server-side after the client row exists.
  const draftAuthorizedCodes = useMemo(() => {
    const v = subjectQ.data?.values ?? {};
    const raw = (v.authorized_dspd_codes ?? v.job_code ?? "") as string;
    if (!raw) return [] as string[];
    return Array.from(new Set(
      raw.split(/[,\s;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean),
    ));
  }, [subjectQ.data]);

  const grouped = useMemo(() => {
    const required: ReviewItem[] = [];
    const confirmation: ReviewItem[] = [];
    const optional: ReviewItem[] = [];
    for (const it of reviewItems) {
      if (it.category === "required") required.push(it);
      else if (it.category === "confirmation") confirmation.push(it);
      else optional.push(it);
    }
    return { required, confirmation, optional };
  }, [reviewItems]);

  const issuesByField = useMemo(() => {
    const m = new Map<string, ReviewItem[]>();
    for (const it of reviewItems) {
      const target = it.field ?? ISSUE_KEY_TO_TARGET[it.id] ?? null;
      if (!target) continue;
      const arr = m.get(target) ?? [];
      arr.push(it);
      m.set(target, arr);
    }
    return m;
  }, [reviewItems]);

  const buildPayload = (): Record<string, string | boolean> => {
    const payload: Record<string, string | boolean> = { is_own_guardian: isOwn };
    for (const [k, v] of Object.entries(values)) payload[k] = v;
    if (isOwn) {
      // Shared normalizer will null these on the server too, but clear here
      // so the UI and the saved values stay in sync immediately.
      payload.guardian_name = "";
      payload.guardian_phone = "";
      payload.guardian_relationship = "";
      payload.guardian_email = "";
    }
    return payload;
  };

  const saveOnly = useMutation({
    mutationFn: async () => apply({ data: { subjectId: subjectId!, values: buildPayload() } }),
    onSuccess: () => {
      toast.success("Saved.");
      subjectQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const answerM = useMutation({
    mutationFn: async ({ questionId, answer }: { questionId: string; answer: string }) =>
      answerQ({ data: { questionId, answer } }),
    onSuccess: () => subjectQ.refetch(),
    onError: (e: Error) => toast.error(e.message),
  });

  const finalize = useMutation({
    mutationFn: async () => {
      const applied = await apply({ data: { subjectId: subjectId!, values: buildPayload() } });
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
        toast.error(`Still ${out.blocking.length} item${out.blocking.length === 1 ? "" : "s"} blocking finalize — see panel.`);
        subjectQ.refetch();
        return;
      }
      const first = (out.results ?? []).find((r) => r.committed && r.record_id);
      if (first?.record_id) {
        toast.success(`${displayName} is now in your directory.`);
      } else {
        const err = (out.results ?? [])[0]?.error;
        toast.error(err ? `Commit failed: ${err}` : "Commit returned no new record.");
        return;
      }
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients-uncommitted-imports"] });
      qc.invalidateQueries({ queryKey: ["pending-client-subjects"] });
      qc.invalidateQueries({ queryKey: ["smart-import-done"] });
      onFinalized?.();
      onOpenChange(false);
      if (first?.record_id) {
        navigate({ to: "/dashboard/clients/$clientId", params: { clientId: first.record_id } }).catch(() => {
          navigate({ to: "/dashboard/clients" });
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = saveOnly.isPending || finalize.isPending || answerM.isPending;
  const hasBlocking = blocking.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" /> Finalize {displayName}
          </DialogTitle>
          <DialogDescription>
            Resolve items below, then click <strong>Finalize Client</strong> to add this client to your directory.
          </DialogDescription>
        </DialogHeader>

        {subjectQ.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {subjectQ.data && (
          <div className="space-y-4">
            {/* Unified review panel */}
            <div className={`rounded-lg border p-3 text-sm ${
              !hasBlocking && reviewItems.length === 0
                ? "border-emerald-300/50 bg-emerald-50/60 dark:bg-emerald-950/20"
                : hasBlocking
                  ? "border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20"
                  : "border-border bg-muted/30"
            }`}>
              {reviewItems.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Ready to finalize — nothing left to review.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 font-medium">
                    <Info className="h-4 w-4" />
                    Items needing review
                  </div>
                  {grouped.required.length > 0 && (
                    <IssueGroup
                      title="Required before finalizing"
                      tone="error"
                      items={grouped.required}
                    />
                  )}
                  {grouped.confirmation.length > 0 && (
                    <IssueGroup
                      title="Needs confirmation"
                      tone="warning"
                      items={grouped.confirmation}
                      renderItem={(it) => {
                        if (it.id === "contradiction.guardian_self_vs_named" || it.id === "guardian.unknown_status") {
                          return (
                            <div className="space-y-2">
                              <div className="text-xs">{it.message}</div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant={isOwn ? "default" : "outline"}
                                  disabled={busy}
                                  onClick={() => {
                                    setIsOwn(true);
                                    saveOnly.mutate();
                                  }}
                                >
                                  Their own guardian
                                </Button>
                                <Button
                                  size="sm"
                                  variant={!isOwn ? "default" : "outline"}
                                  disabled={busy}
                                  onClick={() => {
                                    setIsOwn(false);
                                    saveOnly.mutate();
                                  }}
                                >
                                  Has a separate guardian
                                </Button>
                              </div>
                            </div>
                          );
                        }
                        if (it.source === "nectar_question" && it.questionId) {
                          const draft = questionDrafts[it.questionId] ?? "";
                          return (
                            <div className="space-y-2">
                              <div className="flex items-start gap-1.5 text-xs">
                                <HelpCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>{it.message}</span>
                              </div>
                              <Textarea
                                rows={2}
                                value={draft}
                                placeholder="Your answer…"
                                disabled={busy}
                                onChange={(e) => setQuestionDrafts((d) => ({ ...d, [it.questionId!]: e.target.value }))}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || !draft.trim()}
                                onClick={() => answerM.mutate({ questionId: it.questionId!, answer: draft.trim() })}
                              >
                                Save answer
                              </Button>
                            </div>
                          );
                        }
                        return <div className="text-xs">{it.message}</div>;
                      }}
                    />
                  )}
                  {grouped.optional.length > 0 && (
                    <IssueGroup title="Optional" tone="muted" items={grouped.optional} />
                  )}
                </div>
              )}
            </div>

            {FIELD_GROUPS.map((g) => (
              <div key={g.title} className="rounded-lg border border-border p-3 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{g.title}</div>
                {g.fields.map((f) => {
                  const issues = issuesByField.get(f.key) ?? [];
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
                        {issues.some((i) => i.category === "required") && (
                          <Badge variant="outline" className="ml-2 border-amber-400 text-amber-700 dark:text-amber-300 text-[10px]">required</Badge>
                        )}
                      </Label>
                      <Input
                        type={f.type === "date" ? "date" : "text"}
                        value={values[f.key] ?? ""}
                        placeholder={f.placeholder}
                        disabled={busy || disabledByGuardian}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      />
                      {issues.map((it) => (
                        <div key={it.id} className="text-[11px] text-amber-700 dark:text-amber-400">{it.message}</div>
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
            Finalize Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueGroup({
  title,
  tone,
  items,
  renderItem,
}: {
  title: string;
  tone: "error" | "warning" | "muted";
  items: ReviewItem[];
  renderItem?: (it: ReviewItem) => React.ReactNode;
}) {
  const toneClasses =
    tone === "error"
      ? "text-amber-900 dark:text-amber-200"
      : tone === "warning"
        ? "text-amber-800 dark:text-amber-300"
        : "text-muted-foreground";
  return (
    <div>
      <div className={`text-xs font-semibold uppercase tracking-wide ${toneClasses}`}>{title}</div>
      <ul className="mt-1.5 space-y-2">
        {items.map((it) => (
          <li key={it.id} className="rounded border border-border/60 bg-background/60 p-2">
            {renderItem ? renderItem(it) : (
              <div className="flex items-start gap-1.5 text-xs">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{it.message}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
