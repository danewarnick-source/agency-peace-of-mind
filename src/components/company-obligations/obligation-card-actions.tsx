// Inline admin action row for the bottom of an Company Obligation card.
// Which action is shown depends on scope + evidence_type:
//  - org-level obligations are always the admin's own responsibility, so the
//    admin completes them directly (attestation / upload / form).
//  - staff-scoped obligations where any one person satisfies the group are
//    also completed directly by the admin (same as org-level).
//  - staff-scoped obligations requiring everyone's own completion split by
//    evidence type: admin can file uploads on behalf of staff who already
//    have docs on file, but attestations/forms are first-person and can only
//    be nudged via notification.
//  - staff_per_client obligations are tracked/reminded only — no direct
//    admin completion action.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Upload } from "lucide-react";
import {
  recordCompletion,
  remindOutstandingAssignees,
  type ObligationInstanceRow,
} from "@/lib/company-obligations.functions";
import type { ObligationWithInstance } from "./obligation-card";
import { useOutstandingRoster, RosterMultiSelect, type RosterEntry } from "./outstanding-roster";


function useAdminName(orgId: string, active: boolean) {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["org-member-name", orgId, user?.id],
    enabled: !!user && active,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_directory").select("full_name").eq("id", user!.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as { full_name: string | null } | null;
    },
  });
  return data?.full_name ?? "an admin";
}

/** Org-level (or "any one person satisfies") direct completion: admin
 *  attests, uploads, or opens the linked form themselves. */
function DirectCompletionActions({
  orgId,
  obligation,
  instance,
}: {
  orgId: string;
  obligation: ObligationWithInstance;
  instance: ObligationInstanceRow;
}) {
  const qc = useQueryClient();
  const recordFn = useServerFn(recordCompletion);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const needsUpload = obligation.evidence_type === "upload" || obligation.evidence_type === "upload_and_attestation";
  const needsAttestation = obligation.evidence_type === "attestation" || obligation.evidence_type === "upload_and_attestation";
  const canSubmit = (!needsUpload || !!file) && (!needsAttestation || checked);

  const reset = () => {
    setOpen(false);
    setChecked(false);
    setFile(null);
  };

  const submit = async () => {
    setBusy(true);
    try {
      let uploadPath: string | null = null;
      let uploadFilename: string | null = null;
      if (needsUpload && file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${orgId}/${obligation.id}/${instance.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("obligation-evidence").upload(path, file);
        if (upErr) throw new Error(upErr.message);
        uploadPath = path;
        uploadFilename = file.name;
      }
      await recordFn({
        data: {
          organizationId: orgId,
          instanceId: instance.id,
          evidenceTypeUsed: obligation.evidence_type,
          uploadPath,
          uploadFilename,
          attestationSignedAt: needsAttestation ? new Date().toISOString() : null,
          attestationTextSnapshot: needsAttestation ? obligation.attestation_text : null,
          isManualEntry: false,
        },
      });
      toast.success("Completed");
      reset();
      qc.invalidateQueries({ queryKey: ["company-obligations", orgId] });
      qc.invalidateQueries({ queryKey: ["obligation-instance-detail", instance.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (obligation.evidence_type === "form") {
    return (
      <a href={`/dashboard/forms/${obligation.linked_form_id}/fill?obligation_instance=${instance.id}`}>
        <Button size="sm" variant="outline">Complete form →</Button>
      </a>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {obligation.evidence_type === "attestation" ? "Sign off" : "Upload evidence"}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      {needsUpload && (
        <label className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">
          <Upload className="h-3.5 w-3.5" />
          {file ? file.name : "Choose file…"}
          <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      )}
      {needsAttestation && (
        <>
          <div className="rounded-md border border-border bg-background p-2.5 text-sm">
            {obligation.attestation_text || "No attestation text configured for this obligation."}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
            I confirm the above statement is accurate.
          </label>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>Cancel</Button>
        <Button size="sm" disabled={!canSubmit || busy} onClick={submit}>
          {needsAttestation && !needsUpload ? "Submit attestation" : "Submit"}
        </Button>
      </div>
    </div>
  );
}

/** Admin files an upload on behalf of one or many not-yet-submitted staff
 *  members (e.g. certs already on file). Per-person obligations keep one
 *  instance per staff member, so each selected person is recorded against
 *  their own instance. */
function FileForStaffPanel({
  orgId,
  obligation,
  roster,
  label,
}: {
  orgId: string;
  obligation: ObligationWithInstance;
  roster: RosterEntry[];
  label: string;
}) {
  const qc = useQueryClient();
  const recordFn = useServerFn(recordCompletion);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const adminName = useAdminName(orgId, open);

  const reset = () => {
    setOpen(false);
    setSelected(new Set());
    setFile(null);
  };

  const targets = roster.filter((r) => selected.has(`${r.instance_id}:${r.staff_id}`));

  const submit = async () => {
    if (!targets.length || !file) return;
    setBusy(true);
    const failures: string[] = [];
    let ok = 0;
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      for (const t of targets) {
        try {
          const path = `${orgId}/${obligation.id}/${t.instance_id}/${crypto.randomUUID()}-${safeName}`;
          const { error: upErr } = await supabase.storage.from("obligation-evidence").upload(path, file);
          if (upErr) throw new Error(upErr.message);
          await recordFn({
            data: {
              organizationId: orgId,
              instanceId: t.instance_id,
              evidenceTypeUsed: "upload",
              uploadPath: path,
              uploadFilename: file.name,
              isManualEntry: true,
              staffId: t.staff_id,
              staffName: t.staff_name,
              manualEntryByName: adminName,
            },
          });
          ok += 1;
        } catch (e) {
          failures.push(`${t.staff_name}: ${(e as Error).message}`);
        }
      }
      if (ok) toast.success(`Filed for ${ok} staff member${ok === 1 ? "" : "s"}`);
      if (failures.length) toast.error(`Failed for ${failures.length}: ${failures[0]}`);
      if (ok) reset();
      qc.invalidateQueries({ queryKey: ["company-obligations", orgId] });
      qc.invalidateQueries({ queryKey: ["obligation-instance-detail"] });
      qc.invalidateQueries({ queryKey: ["obligation-outstanding-roster", obligation.id] });
      qc.invalidateQueries({ queryKey: ["obligation-per-client-detail", obligation.id] });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" disabled={!roster.length} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      <RosterMultiSelect roster={roster} selected={selected} onChange={setSelected} />
      <label className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">
        <Upload className="h-3.5 w-3.5" />
        {file ? file.name : "Choose file…"}
        <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {targets.length > 1 && (
        <p className="text-xs text-muted-foreground">
          The same document will be filed for each of the {targets.length} selected staff members.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>Cancel</Button>
        <Button size="sm" disabled={!targets.length || !file || busy} onClick={submit}>
          {busy
            ? "Filing…"
            : targets.length
              ? `File for ${targets.length} staff`
              : "Submit"}
        </Button>
      </div>
    </div>
  );
}

/** Compact variant of FileForStaffPanel for a single, already-known
 *  staff+client instance (staff_per_client scope) — no staff picker, the
 *  instance already knows which staff member it belongs to. */
function FileForInstanceButton({
  orgId,
  obligation,
  instanceId,
  staffId,
  staffName,
  clientName,
}: {
  orgId: string;
  obligation: ObligationWithInstance;
  instanceId: string;
  staffId: string;
  staffName: string;
  clientName: string | null;
}) {
  const qc = useQueryClient();
  const recordFn = useServerFn(recordCompletion);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const adminName = useAdminName(orgId, open);

  const reset = () => {
    setOpen(false);
    setFile(null);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${orgId}/${obligation.id}/${instanceId}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("obligation-evidence").upload(path, file);
      if (upErr) throw new Error(upErr.message);
      await recordFn({
        data: {
          organizationId: orgId,
          instanceId,
          evidenceTypeUsed: "upload",
          uploadPath: path,
          uploadFilename: file.name,
          isManualEntry: true,
          staffId,
          staffName,
          manualEntryByName: adminName,
        },
      });
      toast.success(`Filed for ${staffName}`);
      reset();
      qc.invalidateQueries({ queryKey: ["company-obligations", orgId] });
      qc.invalidateQueries({ queryKey: ["obligation-per-client-detail", obligation.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setOpen(true)}>
        File evidence
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      <p className="text-xs text-muted-foreground">
        Uploading evidence for: {staffName}{clientName ? ` — ${clientName}` : ""}
      </p>
      <label className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">
        <Upload className="h-3.5 w-3.5" />
        {file ? file.name : "Choose file…"}
        <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>Cancel</Button>
        <Button size="sm" disabled={!file || busy} onClick={submit}>
          {`File for ${staffName}`}
        </Button>
      </div>
    </div>
  );
}

function NotifyOutstandingButton({
  orgId,
  instanceIds,
  outstandingCount,
  label,
}: {
  orgId: string;
  instanceIds: string[];
  outstandingCount: number;
  label: string;
}) {
  const remindFn = useServerFn(remindOutstandingAssignees);
  const [notified, setNotified] = useState(false);
  const remind = useMutation({
    mutationFn: async () => {
      let reminded = 0;
      for (const instanceId of instanceIds) {
        const res = await remindFn({ data: { organizationId: orgId, instanceId } });
        reminded += res.reminded;
      }
      return { reminded };
    },
    onSuccess: (res) => {
      setNotified(true);
      toast.success(`Notified ${res.reminded} staff member${res.reminded === 1 ? "" : "s"}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      disabled={!outstandingCount || remind.isPending || notified}
      onClick={() => remind.mutate()}
    >
      {notified ? `Notified ${outstandingCount} today` : (
        <>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          {label} {outstandingCount} outstanding →
        </>
      )}
    </Button>
  );
}

/** scope='staff' + requires_individual_completion=true: split behavior by
 *  evidence type — upload can be filed for staff, attestation/form can only
 *  be nudged, upload_and_attestation gets both. */
function StaffRequiredActions({
  orgId,
  obligation,
  onManualOpen,
}: {
  orgId: string;
  obligation: ObligationWithInstance;
  onManualOpen: () => void;
}) {
  // Per-person obligations spread their assignees across many instances, so
  // the roster is gathered obligation-wide rather than from one instance.
  const { data: roster = [] } = useOutstandingRoster(obligation.id);
  const openInstanceIds = useMemo(
    () => Array.from(new Set(roster.map((r) => r.instance_id))),
    [roster],
  );

  const needsUpload = obligation.evidence_type === "upload" || obligation.evidence_type === "upload_and_attestation";
  const needsAttestation = obligation.evidence_type === "attestation" || obligation.evidence_type === "form" || obligation.evidence_type === "upload_and_attestation";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {needsUpload && (
          <FileForStaffPanel
            orgId={orgId}
            obligation={obligation}
            roster={roster}
            label={
              obligation.evidence_type === "upload_and_attestation"
                ? `File document for staff (${roster.length}) →`
                : `File document for staff (${roster.length})`
            }
          />
        )}
        {needsAttestation && (
          <NotifyOutstandingButton
            orgId={orgId}
            instanceIds={openInstanceIds}
            outstandingCount={roster.length}
            label={obligation.evidence_type === "upload_and_attestation" ? "Notify staff to attest" : "Notify"}
          />
        )}
      </div>
      {needsAttestation && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={onManualOpen}
        >
          Record manually for a specific staff member →
        </button>
      )}
    </div>
  );
}

type PerClientInstanceRow = { id: string; status: string; due_at: string; client_id: string | null; client_name: string | null };
type PerClientCompletionRow = { instance_id: string };
type PerClientAssigneeRow = { instance_id: string; staff_id: string; staff_name: string };

function formatDueShort(dueAt: string): string {
  const due = new Date(dueAt);
  return due < new Date()
    ? "Overdue"
    : `Due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function PerClientActions({ orgId, obligation }: { orgId: string; obligation: ObligationWithInstance }) {
  const { data } = useQuery({
    queryKey: ["obligation-per-client-detail", obligation.id],
    queryFn: async () => {
      const { data: instances, error: iErr } = await supabase
        .from("company_obligation_instances")
        .select("id, status, due_at, client_id, client_name")
        .eq("obligation_id", obligation.id);
      if (iErr) throw new Error(iErr.message);
      const instanceIds = (instances ?? []).map((i: { id: string }) => i.id);
      const [{ data: completions, error: cErr }, { data: assignees, error: asErr }] = instanceIds.length
        ? await Promise.all([
            supabase.from("company_obligation_completions").select("instance_id").in("instance_id", instanceIds),
            supabase.from("company_obligation_instance_assignees").select("instance_id, staff_id, staff_name").in("instance_id", instanceIds),
          ])
        : [{ data: [], error: null }, { data: [], error: null }];
      if (cErr) throw new Error(cErr.message);
      if (asErr) throw new Error(asErr.message);
      return {
        instances: (instances ?? []) as PerClientInstanceRow[],
        completions: (completions ?? []) as PerClientCompletionRow[],
        assignees: (assignees ?? []) as PerClientAssigneeRow[],
      };
    },
  });

  const remindFn = useServerFn(remindOutstandingAssignees);
  const [notified, setNotified] = useState(false);
  const [showOutstanding, setShowOutstanding] = useState(false);
  const remind = useMutation({
    mutationFn: async (openInstanceIds: string[]) => {
      let total = 0;
      for (const instanceId of openInstanceIds) {
        const res = await remindFn({ data: { organizationId: orgId, instanceId } });
        total += res.reminded;
      }
      return total;
    },
    onSuccess: (total) => {
      setNotified(true);
      toast.success(`Notified ${total} staff member${total === 1 ? "" : "s"}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data || !data.instances.length) return null;
  const { instances, completions, assignees } = data;
  const assigneeByInstance = new Map(assignees.map((a) => [a.instance_id, a]));
  const completedInstanceIds = new Set(completions.map((c) => c.instance_id));
  const doneCount = instances.filter((i) => i.status === "completed" || completedInstanceIds.has(i.id)).length;
  const openInstances = instances.filter((i) => i.status === "pending" || i.status === "overdue");
  if (!openInstances.length) return null;

  const outstandingLabel = openInstances
    .map((i) => {
      const a = assigneeByInstance.get(i.id);
      return `${a?.staff_name ?? "Unknown"} (${i.client_name ?? "Unknown client"})`;
    })
    .join(", ");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{doneCount} of {instances.length} completed</span>
        <Button
          size="sm"
          variant="outline"
          disabled={remind.isPending || notified}
          onClick={() => remind.mutate(openInstances.map((i) => i.id))}
          title={`Notify ${openInstances.length} outstanding: ${outstandingLabel}`}
        >
          {notified ? "Notified today" : `Notify ${openInstances.length} outstanding →`}
        </Button>
        <button
          type="button"
          className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setShowOutstanding((v) => !v)}
        >
          {showOutstanding ? "Hide list" : "Who's outstanding?"}
        </button>
      </div>
      {roster.length > 0 && (
        <FileForStaffPanel
          orgId={orgId}
          obligation={obligation}
          roster={roster}
          label={`File document for staff (${roster.length})`}
        />
      )}
      {showOutstanding && (
        <ul className="space-y-1 rounded-md border border-border bg-muted/20 p-2 text-xs">
          {openInstances.map((i) => {
            const a = assigneeByInstance.get(i.id);
            const staffName = a?.staff_name ?? "Unknown staff";
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {staffName} (for {i.client_name ?? "Unknown client"})
                  {i.status === "overdue" ? (
                    <span className="text-destructive"> — Overdue</span>
                  ) : (
                    <span> — {formatDueShort(i.due_at)}</span>
                  )}
                </span>
                {a && (
                  <FileForInstanceButton
                    orgId={orgId}
                    obligation={obligation}
                    instanceId={i.id}
                    staffId={a.staff_id}
                    staffName={a.staff_name}
                    clientName={i.client_name}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ObligationCardActions({
  orgId,
  obligation,
  onManualOpen,
  onLogEvent,
}: {
  orgId: string;
  obligation: ObligationWithInstance;
  onManualOpen: () => void;
  onLogEvent: () => void;
}) {
  if (obligation.cadence === "per_event" && !obligation.current_instance) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <Button size="sm" variant="outline" onClick={onLogEvent}>Log event</Button>
      </div>
    );
  }

  if (obligation.scope === "staff_per_client") {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <PerClientActions orgId={orgId} obligation={obligation} />
      </div>
    );
  }

  const instance = obligation.current_instance;
  if (!instance || (instance.status !== "pending" && instance.status !== "overdue")) return null;

  if (obligation.scope === "org" || !obligation.requires_individual_completion) {
    return (
      <div className="mt-3 space-y-2 border-t border-border pt-3">
        {obligation.scope !== "org" && (
          <p className="text-xs text-muted-foreground">Completing this satisfies the obligation for all assigned staff.</p>
        )}
        <DirectCompletionActions orgId={orgId} obligation={obligation} instance={instance} />
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <StaffRequiredActions orgId={orgId} obligation={obligation} onManualOpen={onManualOpen} />
    </div>
  );
}
