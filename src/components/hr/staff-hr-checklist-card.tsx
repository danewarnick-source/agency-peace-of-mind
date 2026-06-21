import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload, FileText, Eye, Trash2, ShieldAlert, GraduationCap, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getStaffChecklist,
  getStaffPii,
  upsertChecklistCompletion,
  updateStaffPii,
  listHrDocuments,
  createHrDocumentUploadUrl,
  getHrDocumentUrl,
  deleteHrDocument,
} from "@/lib/hr-staff.functions";
import {
  markBaselineTrainingComplete,
  attachBaselineCertificate,
  setBaselineExpiration,
} from "@/lib/staff-training-requirements.functions";
import { parseBaselineId, baselineByKey } from "@/lib/staff-training-requirements";
import { AnnualHoursSection } from "@/components/hr/annual-hours-progress";
import { useAuth } from "@/hooks/use-auth";


const STATUSES = ["not_started", "in_progress", "complete", "expired", "waived"] as const;

function maskSsn(last4: string | null) {
  return last4 ? `•••-••-${last4}` : "—";
}

/**
 * Per-staff HR section. All data here is fail-closed PII: the server fns
 * verify caller is admin / team-manager-of-staff / self before returning
 * anything. Staff viewing their own record see read-only data — edit
 * controls are hidden and the server denies writes regardless.
 */
export function StaffHrChecklistCard({
  organizationId,
  staffId,
  view = "all",
  filter = "all",
}: {
  organizationId: string;
  staffId: string;
  /** Section gate: render all sections (default), only PII, or only the
   *  checklist + supporting docs/history. Pure presentational. */
  view?: "all" | "pii" | "checklist";
  /** Visibility filter for checklist rows — applies only inside the
   *  Compliance Checklist section. "needs_action" = overdue + expiring +
   *  to-do. "current" = items that are complete and not expiring. */
  filter?: "all" | "needs_action" | "current";
}) {
  const { user } = useAuth();
  const isSelf = user?.id === staffId;
  const qc = useQueryClient();
  const fetchChecklist = useServerFn(getStaffChecklist);
  const fetchPii = useServerFn(getStaffPii);
  const upsertFn = useServerFn(upsertChecklistCompletion);
  const updatePiiFn = useServerFn(updateStaffPii);
  const listDocs = useServerFn(listHrDocuments);
  const createUpload = useServerFn(createHrDocumentUploadUrl);
  const getDocUrl = useServerFn(getHrDocumentUrl);
  const delDoc = useServerFn(deleteHrDocument);

  const piiQ = useQuery({
    queryKey: ["staff-pii", organizationId, staffId],
    queryFn: () => fetchPii({ data: { organization_id: organizationId, staff_id: staffId } }),
  });
  const checklistQ = useQuery({
    queryKey: ["staff-checklist", organizationId, staffId],
    queryFn: () =>
      fetchChecklist({ data: { organization_id: organizationId, staff_id: staffId } }),
  });
  const docsQ = useQuery({
    queryKey: ["hr-docs", organizationId, staffId],
    queryFn: () => listDocs({ data: { organization_id: organizationId, staff_id: staffId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["staff-checklist", organizationId, staffId] });
    qc.invalidateQueries({ queryKey: ["hr-docs", organizationId, staffId] });
  };

  const setStatus = useMutation({
    mutationFn: async (v: { requirement_id: string; status: typeof STATUSES[number] }) =>
      upsertFn({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          requirement_id: v.requirement_id,
          status: v.status,
          completed_date: v.status === "complete" ? new Date().toISOString().slice(0, 10) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [piiDraft, setPiiDraft] = useState<{ ssn_last4: string; date_of_birth: string; home_address: string } | null>(null);
  const startEditPii = () => {
    setPiiDraft({
      ssn_last4: piiQ.data?.ssn_last4 ?? "",
      date_of_birth: piiQ.data?.date_of_birth ?? "",
      home_address: piiQ.data?.home_address ?? "",
    });
  };
  const savePii = useMutation({
    mutationFn: async () => {
      if (!piiDraft) return;
      await updatePiiFn({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          ssn_last4: piiDraft.ssn_last4 ? piiDraft.ssn_last4 : null,
          date_of_birth: piiDraft.date_of_birth || null,
          home_address: piiDraft.home_address || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("PII saved");
      setPiiDraft(null);
      qc.invalidateQueries({ queryKey: ["staff-pii", organizationId, staffId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const uploadEvidence = async (file: File, requirementId: string | null, kind: string) => {
    try {
      const r = await createUpload({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          requirement_id: requirementId,
          document_kind: kind,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      const up = await fetch(r.upload.signed_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!up.ok) throw new Error(`Upload failed (${up.status})`);
      toast.success("Document uploaded");
      invalidate();
      return r.hr_document_id;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };

  const viewDoc = async (id: string) => {
    try {
      const r = await getDocUrl({ data: { organization_id: organizationId, hr_document_id: id } });
      window.open(r.signed_url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Fail-closed UI: if PII query failed/returned null, we are not authorized.
  if (piiQ.isLoading || checklistQ.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading HR record…
        </CardContent>
      </Card>
    );
  }
  if (piiQ.error || checklistQ.error || !piiQ.data) {
    return (
      <Card className="border-rose-200 bg-rose-50/30">
        <CardContent className="p-6 text-sm text-rose-700">
          <ShieldAlert className="mr-2 inline h-4 w-4" />
          You don't have access to this staffer's HR record. Only the organization admin, this
          staffer's team manager, and the staffer themselves may view it.
        </CardContent>
      </Card>
    );
  }

  const pii = piiQ.data;
  const showPii = view === "all" || view === "pii";
  const showChecklist = view === "all" || view === "checklist";
  return (
    <div className="space-y-4">
      {showPii && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">HR — Sensitive Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {piiDraft ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">SSN (last 4 only)</Label>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  value={piiDraft.ssn_last4}
                  onChange={(e) =>
                    setPiiDraft({ ...piiDraft, ssn_last4: e.target.value.replace(/\D/g, "") })
                  }
                  placeholder="1234"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Full SSN never stored — keep it inside the I-9/SS card upload.
                </p>
              </div>
              <div>
                <Label className="text-xs">Date of birth</Label>
                <Input
                  type="date"
                  value={piiDraft.date_of_birth}
                  onChange={(e) => setPiiDraft({ ...piiDraft, date_of_birth: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Home address</Label>
                <Input
                  value={piiDraft.home_address}
                  onChange={(e) => setPiiDraft({ ...piiDraft, home_address: e.target.value })}
                />
              </div>
              <div className="sm:col-span-3 flex gap-2">
                <Button size="sm" onClick={() => savePii.mutate()} disabled={savePii.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPiiDraft(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <Field label="SSN" value={maskSsn(pii.ssn_last4)} />
              <Field label="DOB" value={pii.date_of_birth ?? "—"} />
              <Field label="Home address" value={pii.home_address ?? "—"} />
              <Field
                label="Hourly rate"
                value={pii.hourly_rate != null ? `$${pii.hourly_rate}` : "—"}
              />
              <Field
                label="Daily rate"
                value={pii.daily_rate != null ? `$${pii.daily_rate}` : "—"}
              />
              {!isSelf && (
                <div className="sm:col-span-3">
                  <Button size="sm" variant="outline" onClick={startEditPii}>
                    Edit
                  </Button>
                </div>
              )}
              {isSelf && (
                <p className="sm:col-span-3 text-[11px] text-muted-foreground">
                  You can view your own record. Edits to completion status and PII are done by your
                  admin or team manager.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {showChecklist && (
      <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compliance Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(checklistQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No live base items yet. Confirm the HR base checklist in HIVE Exec / Approvals.
            </p>
          ) : (
            (() => {
              const rows = checklistQ.data ?? [];
              const byCat = new Map<string, typeof rows>();
              for (const r of rows) {
                const k = r.category ?? "Other";
                if (!byCat.has(k)) byCat.set(k, [] as typeof rows);
                byCat.get(k)!.push(r);
              }
              const todayMs = Date.now();
              const in60Ms = todayMs + 60 * 86400_000;
              return (
                <div className="space-y-2">
                  {Array.from(byCat.entries()).map(([cat, items]) => {
                    const applicableItems = items.filter((i) => i.applicable !== false);
                    const complete = applicableItems.filter(
                      (i) => i.completion.status === "complete",
                    ).length;
                    return (
                      <details
                        key={cat}
                        className="group rounded-lg border border-border/60"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-medium hover:bg-muted/40">
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground transition-transform group-open:rotate-90">
                              ▶
                            </span>
                            {cat}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {complete} of {applicableItems.length} ✓
                            {items.length > applicableItems.length && (
                              <span className="ml-1 italic">
                                · {items.length - applicableItems.length} N/A
                              </span>
                            )}
                          </span>
                        </summary>
                        <div className="space-y-2 border-t border-border/60 p-3">
                          {items.map((row) => {
                            const completionDoc = (docsQ.data ?? []).find(
                              (d) => d.id === row.completion.evidence_document_id,
                            );
                            const status = row.completion.status;
                            const expMs = row.completion.expires_at
                              ? new Date(row.completion.expires_at).getTime()
                              : null;
                            const isExpired =
                              status === "expired" ||
                              (expMs !== null && expMs < todayMs);
                            const isSoon =
                              expMs !== null &&
                              expMs >= todayMs &&
                              expMs <= in60Ms;
                            const isNA = row.applicable === false;
                            // Status kind drives both the visual dot and the
                            // optional Requirements-tab filter chips.
                            const statusKind: "na" | "current" | "expiring" | "overdue" | "todo" =
                              isNA
                                ? "na"
                                : status === "complete" && !isExpired
                                  ? "current"
                                  : isExpired
                                    ? "overdue"
                                    : isSoon
                                      ? "expiring"
                                      : "todo";
                            if (filter === "needs_action" && (statusKind === "current" || statusKind === "na")) {
                              return null;
                            }
                            if (filter === "current" && statusKind !== "current") {
                              return null;
                            }
                            const pillLabel =
                              statusKind === "current"
                                ? row.is_renewable
                                  ? "Current"
                                  : "Complete"
                                : statusKind === "expiring"
                                  ? "Expiring"
                                  : statusKind === "overdue"
                                    ? "Overdue"
                                    : statusKind === "na"
                                      ? "N/A"
                                      : "To do";
                            const pillTone =
                              statusKind === "current"
                                ? "bg-emerald-100 text-emerald-800"
                                : statusKind === "expiring"
                                  ? "bg-amber-100 text-amber-800"
                                  : statusKind === "overdue"
                                    ? "bg-rose-100 text-rose-800"
                                    : statusKind === "na"
                                      ? "bg-muted text-muted-foreground"
                                      : "bg-muted text-foreground/70";
                            const dot = isNA
                              ? "bg-muted-foreground/40"
                              : statusKind === "current"
                                ? "bg-emerald-500"
                                : statusKind === "expiring" || status === "in_progress"
                                  ? "bg-amber-500"
                                  : statusKind === "overdue"
                                    ? "bg-rose-500"
                                    : "bg-muted";
                            if (isNA) {
                              return (
                                <div
                                  key={row.requirement_id}
                                  className="rounded-md border border-dashed border-border/40 bg-muted/20 p-3 text-sm"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium text-muted-foreground line-through decoration-muted-foreground/40">
                                        {row.title}
                                      </div>
                                      <div className="mt-0.5 text-[11px] italic text-muted-foreground">
                                        N/A — not applicable to this staffer's type
                                      </div>
                                    </div>
                                    <Badge variant="outline" className="text-[10px] uppercase">
                                      N/A
                                    </Badge>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div
                                key={row.requirement_id}
                                className="rounded-md border border-border/40 p-3 text-sm"
                              >
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div className="flex min-w-0 items-start gap-2">
                                    <span
                                      className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`}
                                    />
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{row.title}</span>
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pillTone}`}>
                                          {pillLabel}
                                        </span>
                                      </div>
                                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                                        {row.checklist_layer && (
                                          <Badge
                                            variant="secondary"
                                            className="text-[10px]"
                                          >
                                            {row.checklist_layer}
                                          </Badge>
                                        )}
                                        {row.is_renewable &&
                                          row.renewal_interval_months && (
                                            <span>
                                              renews every {row.renewal_interval_months}{" "}
                                              mo
                                              {row.renewal_source && (
                                                <span className="text-[10px]">
                                                  {" "}
                                                  ({row.renewal_source})
                                                </span>
                                              )}
                                            </span>
                                          )}
                                        {row.source_citation && (
                                          <span>· {row.source_citation}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {isSelf ? (
                                      <Badge>{status}</Badge>
                                    ) : (
                                      <Select
                                        value={status}
                                        onValueChange={(v) =>
                                          setStatus.mutate({
                                            requirement_id: row.requirement_id,
                                            status: v as typeof STATUSES[number],
                                          })
                                        }
                                      >
                                        <SelectTrigger className="h-8 w-[140px] text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {STATUSES.map((s) => (
                                            <SelectItem
                                              key={s}
                                              value={s}
                                              className="text-xs"
                                            >
                                              {s}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                    {completionDoc && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => viewDoc(completionDoc.id)}
                                      >
                                        <Eye className="mr-1 h-3.5 w-3.5" /> Evidence
                                      </Button>
                                    )}
                                    {!isSelf && (
                                      <label
                                        className="relative z-0 inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                        title={completionDoc ? "Replace evidence" : "Upload evidence (PDF, DOCX, image)"}
                                        aria-label={completionDoc ? "Replace evidence" : "Upload evidence"}
                                      >
                                        <Upload className="h-3.5 w-3.5" />
                                        <span>{completionDoc ? "Replace" : "Upload"}</span>
                                        <input
                                          type="file"
                                          className="hidden"
                                          accept=".pdf,.doc,.docx,image/*"
                                          onChange={async (e) => {
                                            const f = e.target.files?.[0];
                                            if (!f) return;
                                            const docId = await uploadEvidence(
                                              f,
                                              row.requirement_id,
                                              row.category ?? "checklist_evidence",
                                            );
                                            if (docId) {
                                              await upsertFn({
                                                data: {
                                                  organization_id: organizationId,
                                                  staff_id: staffId,
                                                  requirement_id: row.requirement_id,
                                                  status: "in_progress",
                                                  evidence_document_id: docId,
                                                },
                                              });
                                              toast.message(
                                                "Evidence attached — confirm to mark complete",
                                              );
                                              invalidate();
                                            }
                                            e.target.value = "";
                                          }}
                                        />
                                      </label>
                                    )}
                                  </div>
                                </div>
                                {row.completion.completed_date && (
                                  <div
                                    className={
                                      "mt-1 text-[11px] " +
                                      (isExpired
                                        ? "text-rose-600"
                                        : isSoon
                                          ? "text-amber-700"
                                          : "text-muted-foreground")
                                    }
                                  >
                                    Completed {row.completion.completed_date}
                                    {row.is_renewable && row.completion.expires_at && (
                                      <>
                                        {" · expires "}
                                        {row.completion.expires_at}
                                        {isExpired
                                          ? " (overdue)"
                                          : isSoon
                                            ? " (due soon)"
                                            : ""}
                                      </>
                                    )}
                                  </div>
                                )}
                                {row.completion.training_completion_id && (
                                  <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                    <GraduationCap className="h-3 w-3" /> Signed by
                                    staff (training)
                                    {row.completion.auto_checked_at &&
                                      ` · ${new Date(row.completion.auto_checked_at).toLocaleDateString()}`}
                                  </div>
                                )}
                                {!row.completion.training_completion_id &&
                                  row.completion.evidence_document_id && (
                                    <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                      <Upload className="h-3 w-3" /> Uploaded by
                                      admin
                                    </div>
                                  )}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>


      <AnnualHoursSection
        organizationId={organizationId}
        staffId={staffId}
        canEdit={!isSelf}
      />

      <TrainingHistoryCard staffId={staffId} />


      <Card>
        <CardHeader>
          <CardTitle className="text-base">HR Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(docsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <ul className="divide-y">
              {(docsQ.data ?? []).map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate">{d.file_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {d.document_kind} · {new Date(d.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => viewDoc(d.id)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {!isSelf && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm(`Delete ${d.file_name}?`)) return;
                          try {
                            await delDoc({
                              data: { organization_id: organizationId, hr_document_id: d.id },
                            });
                            toast.success("Deleted");
                            invalidate();
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!isSelf && (
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
              <Upload className="h-3.5 w-3.5" /> Upload HR document
              <input
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  await uploadEvidence(f, null, "hr_document");
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}

/**
 * Per-staff training-completion ledger. Surfaces every signed training record
 * for this staffer with the typed-name signature, attestation, content hash,
 * IP, time zone, and UA captured at sign time. Exports to CSV for auditors.
 *
 * RLS allows the staff member to read their own completions and org
 * managers/admins to read theirs — so this card is safe to render in both
 * self and admin views.
 */
function TrainingHistoryCard({ staffId }: { staffId: string }) {
  const q = useQuery({
    queryKey: ["staff-training-history", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_completions")
        .select(
          "id, topic_kind, topic_code, topic_title, dspd_letter, attestation_statement, typed_signature, signer_full_name, signer_email, consent_statement, consent_accepted, content_version, content_hash, ip_address, user_agent, time_zone, completed_at, is_current",
        )
        .eq("user_id", staffId)
        .order("completed_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const rows = (q.data ?? []) as Array<Record<string, any>>;
  const exportCsv = () => {
    const cols = [
      "completed_at",
      "topic_kind",
      "topic_code",
      "dspd_letter",
      "topic_title",
      "signer_full_name",
      "signer_email",
      "typed_signature",
      "consent_accepted",
      "consent_statement",
      "attestation_statement",
      "content_version",
      "content_hash",
      "ip_address",
      "time_zone",
      "user_agent",
      "is_current",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      cols.join(","),
      ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training-history-${staffId}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-base inline-flex items-center gap-2">
          <GraduationCap className="h-4 w-4" /> Training History
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {rows.length} signed
          </Badge>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No signed training records yet. Completing a topic with electronic signature will add a
            row here.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className={`rounded-lg border p-3 text-sm ${
                  r.is_current ? "border-border/60" : "border-dashed border-muted-foreground/30 opacity-70"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium">
                    {r.topic_title}
                    {r.dspd_letter && (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        · §1.8(4)({r.dspd_letter.toLowerCase()})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(r.completed_at).toLocaleString()}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Signed by{" "}
                  <span className="font-medium text-foreground">
                    {r.signer_full_name || r.typed_signature}
                  </span>{" "}
                  ({r.typed_signature})
                  {r.consent_accepted ? " · ESIGN/UETA consent on file" : " · no consent recorded"}
                  {!r.is_current && " · superseded by later signing"}
                </div>
                {r.content_hash && (
                  <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                    hash: {r.content_hash}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
