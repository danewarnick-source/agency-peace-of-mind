import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Sparkles, Loader2, FileText,
  Users, ExternalLink, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getDoneReadout, commitSmartImportJob } from "@/lib/smart-import-commit.functions";
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

function DonePage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const search = (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  const autoRun = search?.get("commit") === "1";

  const commit = useServerFn(commitSmartImportJob);
  const readout = useServerFn(getDoneReadout);
  const generateReminders = useServerFn(generateSmartImportReminders);

  const [runState, setRunState] = useState<"idle" | "running" | "done" | "error">(autoRun ? "running" : "idle");
  const [runError, setRunError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["smart-import-done", jobId, runState],
    queryFn: () => readout({ data: { jobId } }),
    enabled: runState !== "running",
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
    </div>
  );
}
