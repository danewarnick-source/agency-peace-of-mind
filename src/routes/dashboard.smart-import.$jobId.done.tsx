import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Sparkles, Loader2, FileText,
  Users, ExternalLink, Undo2, RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getDoneReadout, commitSmartImportJob, recommitSmartImportJob } from "@/lib/smart-import-commit.functions";
import { generateSmartImportReminders } from "@/lib/smart-import-reminders.functions";
import { previewUndoImport, undoCommittedImport } from "@/lib/smart-import-history.functions";

export const Route = createFileRoute("/dashboard/smart-import/$jobId/done")({
  head: () => ({ meta: [{ title: "Smart Import — Done" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <DonePage />
    </RequirePermission>
  ),
});

function describeUndo(r: unknown): string {
  const x = r as { kind: string; display_name?: string; module?: string; field?: string; field_key?: string; tag?: string; staff_id?: string; client_id?: string };
  switch (x.kind) {
    case "client_record": return `Delete client profile: ${x.display_name}`;
    case "feature_flag": return `Disable ${x.module} on ${x.display_name}`;
    case "bsp_draft": return `Remove draft behavior plan for ${x.display_name}`;
    case "custom_field": return `Clear custom field "${x.field_key}" on ${x.display_name}`;
    case "filed_scrap": return `Remove filed note ${x.tag} from ${x.display_name}`;
    case "assignment": return `Remove staff↔client assignment`;
    case "profile_field": return `Clear profile.${x.field} on ${x.display_name}`;
    default: return x.kind;
  }
}

function DonePage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const search = (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  // TanStack's typed search serializes "1" as the JSON string `"1"`, so the
  // URL ends up `?commit=%221%22`. Strip surrounding quotes before comparing.
  const rawCommit = (search?.get("commit") ?? "").replace(/^"|"$/g, "");
  const autoRun = rawCommit === "1";

  const commit = useServerFn(commitSmartImportJob);
  const readout = useServerFn(getDoneReadout);
  const generateReminders = useServerFn(generateSmartImportReminders);
  const preview = useServerFn(previewUndoImport);
  const undoFn = useServerFn(undoCommittedImport);

  const [runState, setRunState] = useState<"idle" | "running" | "done" | "error">(autoRun ? "running" : "idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);

  const q = useQuery({
    queryKey: ["smart-import-done", jobId, runState],
    queryFn: () => readout({ data: { jobId } }),
    enabled: runState !== "running",
  });

  const previewQ = useQuery({
    queryKey: ["smart-import-undo-preview", jobId],
    queryFn: () => preview({ data: { jobId } }),
    enabled: undoOpen,
  });

  const undoM = useMutation({
    mutationFn: () => undoFn({ data: { jobId } }),
    onSuccess: (res) => {
      toast.success(`Undone — ${res.removed.length} item(s) removed${res.skipped.length ? `, ${res.skipped.length} preserved` : ""}.`);
      setUndoOpen(false);
      q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!autoRun || runState !== "running") return;
    let cancelled = false;
    (async () => {
      try {
        await commit({ data: { jobId } });
        // After commit, seed persistent reminders for any leftovers/gaps.
        try { await generateReminders({ data: {} }); } catch { /* non-fatal */ }
        if (!cancelled) setRunState("done");
      } catch (e) {
        if (!cancelled) {
          setRunError((e as Error).message);
          setRunState("error");
        }
      } finally {
        // Drop the ?commit=1 from the URL so a refresh doesn't re-run.
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.delete("commit");
          window.history.replaceState({}, "", url.toString());
        }
      }
    })();
    return () => { cancelled = true; };
  }, [autoRun, runState, commit, jobId]);

  if (runState === "running") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <div className="mt-3 text-lg font-semibold">Setting up profiles…</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Creating records, wiring assignments, and provisioning modules. This is idempotent — safe to retry.
        </p>
      </div>
    );
  }

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (q.isError || !q.data) return <div className="text-sm text-destructive">Failed to load readout.</div>;

  const { job, subjects, audit } = q.data;
  const committedCount = subjects.filter((s) => s.committed).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/dashboard/smart-import" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Smart Import
        </Link>
        <Badge variant="outline" className="gap-1 capitalize"><Sparkles className="h-3 w-3" /> {job.status.replace("_", " ")}</Badge>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-300/40 bg-emerald-50/40 p-5 dark:bg-emerald-950/20 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <div className="text-lg font-semibold">
              {runState === "error" ? "Setup completed with issues" : "Setup complete"}
            </div>
          </div>
          <p className="mt-1 text-sm">
            {committedCount} of {subjects.length} {job.mode === "client" ? "client" : "staff"} profile{subjects.length === 1 ? "" : "s"} live.
            Gaps below are advisory — reminders queued, never blocking.
          </p>
          {runError && <p className="mt-1 text-xs text-destructive">{runError}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to={job.mode === "client" ? "/dashboard/clients" : "/dashboard/employees"}>
              <Users className="mr-2 h-4 w-4" /> Open {job.mode === "client" ? "clients" : "employees"}
            </Link>
          </Button>
          <Button onClick={() => navigate({ to: "/dashboard/smart-import" })}>
            Import another
          </Button>
          {job.status === "committed" && (
            <Button variant="outline" onClick={() => setUndoOpen(true)} className="text-destructive">
              <Undo2 className="mr-2 h-4 w-4" /> Undo this import&apos;s setup
            </Button>
          )}
        </div>
      </div>

      {/* Readiness / gap readout per subject */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Readiness readout</div>
        </div>
        <div className="space-y-2">
          {subjects.map((s) => (
            <div key={s.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{s.display_name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground capitalize">{s.subject_type}</div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {s.committed ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">live</Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600">not committed</Badge>
                  )}
                  <span className="text-muted-foreground">{s.requirements_met}/{s.requirements_total} requirements met</span>
                </div>
              </div>
              {s.gaps.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {s.gaps.map((g, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3 w-3" /><span>{g}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.record_id && (
                <div className="mt-2 text-xs">
                  <Link
                    to={s.subject_type === "client" ? "/dashboard/clients" : "/dashboard/employees"}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Open profile <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          ))}
          {subjects.length === 0 && <div className="text-sm text-muted-foreground">No subjects in this job.</div>}
        </div>
      </div>

      {/* Audit trail */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 text-sm font-semibold">Audit trail</div>
        <div className="max-h-[400px] space-y-1 overflow-auto text-xs">
          {audit.map((a: { id: string; item: string; action: string; traces_to: string | null; created_at: string }) => (
            <div key={a.id} className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-2 py-1.5">
              <div className="min-w-0">
                <div className="truncate">{a.item}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {a.action} · traces to {a.traces_to ?? "—"} · {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
          {audit.length === 0 && <div className="text-muted-foreground">No audit rows yet.</div>}
        </div>
      </div>

      <Dialog open={undoOpen} onOpenChange={setUndoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-destructive" /> Undo this import&apos;s setup?
            </DialogTitle>
            <DialogDescription>
              Removes only what the import created, via existing delete paths. Fields edited by a person after the import are preserved.
            </DialogDescription>
          </DialogHeader>

          {previewQ.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Building plan…</div>}
          {previewQ.data && (
            <div className="max-h-80 space-y-3 overflow-auto text-sm">
              <div>
                <div className="mb-1 font-semibold">Will remove ({previewQ.data.removes.length})</div>
                {previewQ.data.removes.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Nothing to remove — manual edits cover everything.</div>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {previewQ.data.removes.map((r, i: number) => (
                      <li key={i} className="rounded border border-border px-2 py-1">{describeUndo(r)}</li>
                    ))}
                  </ul>
                )}
              </div>
              {previewQ.data.skips.length > 0 && (
                <div>
                  <div className="mb-1 font-semibold text-amber-700 dark:text-amber-400">Preserved ({previewQ.data.skips.length})</div>
                  <ul className="space-y-1 text-xs">
                    {previewQ.data.skips.map((s, i: number) => (
                      <li key={i} className="rounded border border-amber-300/40 bg-amber-50/30 px-2 py-1 dark:bg-amber-950/20">
                        {"reason" in s ? s.reason : "Edited after commit"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setUndoOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={undoM.isPending || !previewQ.data} onClick={() => undoM.mutate()}>
              {undoM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
              Confirm undo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

