import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, History, RotateCcw, Trash2, Eye, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequirePermission } from "@/components/rbac-guard";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { listImportJobs, discardImportJob } from "@/lib/smart-import-history.functions";

export const Route = createFileRoute("/dashboard/smart-import/history")({
  head: () => ({ meta: [{ title: "Smart Import — History" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <HistoryPage />
    </RequirePermission>
  ),
});

type Job = {
  id: string;
  status: string;
  mode: string | null;
  source: string | null;
  created_at: string;
  committed_at: string | null;
  submitted_at: string | null;
  created_by: string;
  notes: string | null;
  documents: number;
  subjects_total: number;
  subjects_committed: number;
  sample_subjects: Array<{ id: string; record_id: string | null; type: string }>;
  created_by_name: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  extracting: "Extracting",
  in_review: "In review",
  submitted_for_setup: "Awaiting customer sign-off",
  committed: "Committed",
  discarded: "Discarded",
};

function statusTone(s: string): string {
  if (s === "committed") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (s === "discarded") return "bg-muted text-muted-foreground";
  if (s === "submitted_for_setup") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-primary/10 text-primary";
}

function HistoryPage() {
  const { data: org } = useCurrentOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listImportJobs);
  const discard = useServerFn(discardImportJob);
  const [confirming, setConfirming] = useState<Job | null>(null);

  const q = useQuery({
    queryKey: ["smart-import-history", org?.organization_id],
    enabled: !!org?.organization_id,
    queryFn: () => list({ data: { organizationId: org!.organization_id } }),
  });

  const discardM = useMutation({
    mutationFn: (jobId: string) => discard({ data: { jobId } }),
    onSuccess: (res) => {
      toast.success(`Discarded — ${res.files_removed ?? 0} file(s) purged.`);
      setConfirming(null);
      qc.invalidateQueries({ queryKey: ["smart-import-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/dashboard/smart-import" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Smart Import
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Import history</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Resume an uncommitted job, discard one cleanly, or review a committed job&apos;s audit and (if needed) undo its setup.
        </p>
      </div>

      {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
      {q.isError && <div className="text-sm text-destructive">Failed to load history.</div>}

      {q.data && q.data.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No imports yet. Run one from Smart Import.
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Mode</th>
              <th className="px-3 py-2 text-left">Docs</th>
              <th className="px-3 py-2 text-left">People</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Created by</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {((q.data ?? []) as Job[]).map((j) => (
              <tr key={j.id} className="border-t border-border align-top">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(j.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 capitalize">{j.mode ?? "—"}</td>
                <td className="px-3 py-2">{j.documents}</td>
                <td className="px-3 py-2">
                  {j.subjects_total}
                  {j.subjects_committed > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">({j.subjects_committed} live)</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge className={statusTone(j.status)}>{STATUS_LABEL[j.status] ?? j.status}</Badge>
                </td>
                <td className="px-3 py-2 text-xs">{j.created_by_name}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {(j.status === "draft" || j.status === "in_review" || j.status === "extracting") && (
                      <>
                        <Button size="sm" variant="default"
                          onClick={() => navigate({ to: "/dashboard/smart-import/$jobId/review", params: { jobId: j.id } })}>
                          <RotateCcw className="mr-1 h-3 w-3" /> Resume
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirming(j)}>
                          <Trash2 className="mr-1 h-3 w-3" /> Discard
                        </Button>
                      </>
                    )}
                    {j.status === "submitted_for_setup" && (
                      <Badge variant="outline" className="text-amber-600">Awaiting customer sign-off</Badge>
                    )}
                    {j.status === "committed" && (
                      <Button size="sm" variant="outline"
                        onClick={() => navigate({ to: "/dashboard/smart-import/$jobId/done", params: { jobId: j.id } })}>
                        <Eye className="mr-1 h-3 w-3" /> View audit
                      </Button>
                    )}
                    {j.status === "discarded" && (
                      <span className="text-xs text-muted-foreground">read-only</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Discard this import?
            </DialogTitle>
            <DialogDescription>
              This will purge all staged extractions, assignments, and uploaded files for this job.
              Committed records are not affected. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {confirming && (
            <div className="rounded-md border border-border p-3 text-sm">
              <div><strong>{confirming.documents}</strong> file(s), <strong>{confirming.subjects_total}</strong> person/people queued</div>
              <div className="text-xs text-muted-foreground">Created {new Date(confirming.created_at).toLocaleString()}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button variant="destructive" disabled={discardM.isPending}
              onClick={() => confirming && discardM.mutate(confirming.id)}>
              {discardM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Discard import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-500" />
        Imported records edit, add, and delete via the existing client and employee screens — being import-created locks nothing.
      </div>
    </div>
  );
}
