import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, FileText, Loader2,
  Search, Trash2, Users, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  listPendingClientSubjects,
  discardImportSubject,
} from "@/lib/smart-import-review.functions";
import { FinalizeClientEditor } from "@/components/clients/finalize-client-editor";
import { clientPendingStatusLabel } from "@/lib/smart-import-status";


export const Route = createFileRoute("/dashboard/clients/pending")({
  head: () => ({ meta: [{ title: "Pending Clients" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <PendingClientsPage />
    </RequirePermission>
  ),
});

function PendingClientsPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const list = useServerFn(listPendingClientSubjects);
  const discardFn = useServerFn(discardImportSubject);

  const q = useQuery({
    enabled: !!org,
    queryKey: ["pending-client-subjects", org?.organization_id],
    queryFn: () => list({ data: { organizationId: org!.organization_id } }),
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ready" | "blocked">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<{ id: string; name: string } | null>(null);

  const discardM = useMutation({
    mutationFn: (subjectId: string) => discardFn({ data: { subjectId } }),
    onSuccess: () => {
      toast.success("Discarded.");
      setDiscardTarget(null);
      qc.invalidateQueries({ queryKey: ["pending-client-subjects"] });
      qc.invalidateQueries({ queryKey: ["clients-uncommitted-imports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = q.data?.items ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "ready" && !it.readyToFinalize) return false;
      if (filter === "blocked" && it.readyToFinalize) return false;
      if (s && !it.display_name.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [items, search, filter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link to="/dashboard/clients" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Client Directory
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Pending Clients</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Imported client subjects that haven&apos;t joined your directory yet. Fix any
          required fields, then finalize — or discard records that shouldn&apos;t exist.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {(["all", "blocked", "ready"] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={filter === k ? "default" : "outline"}
              onClick={() => setFilter(k)}
              className="capitalize"
            >
              {k}
            </Button>
          ))}
        </div>
        <Badge variant="outline" className="ml-auto">{filtered.length} of {items.length}</Badge>
      </div>

      {q.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      )}

      {!q.isLoading && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <div className="mt-2 text-base font-semibold">All imported clients are finalized.</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing is waiting in import limbo right now.
          </p>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link to="/dashboard/clients"><Users className="mr-2 h-4 w-4" /> Open Client Directory</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((it) => {
          const importDate = it.import_date ? new Date(it.import_date).toLocaleDateString() : "—";
          return (
            <div key={it.subjectId} className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold">{it.display_name}</div>
                    {it.readyToFinalize ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Ready to finalize</Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                        Needs info
                      </Badge>
                    )}
                    {it.matched_record_id && (
                      <Badge variant="outline" className="text-xs">Possible duplicate</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Imported {importDate}</span>
                    <span>Status: {it.review_status}</span>
                    {it.source && <span>Source: {it.source.replace("_", " ")}</span>}
                  </div>
                  {it.blockingIssues.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs">
                      {it.blockingIssues.slice(0, 4).map((b) => (
                        <li key={b.key} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="mt-0.5 h-3 w-3" /><span>{b.message}</span>
                        </li>
                      ))}
                      {it.blockingIssues.length > 4 && (
                        <li className="text-[11px] text-muted-foreground">+ {it.blockingIssues.length - 4} more</li>
                      )}
                    </ul>
                  )}
                  {it.commit_error && it.blockingIssues.length === 0 && (
                    <div className="mt-2 text-xs text-destructive">{it.commit_error}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/dashboard/smart-import/$jobId/review" params={{ jobId: it.jobId }}>
                      Open in review
                    </Link>
                  </Button>
                  <Button size="sm" onClick={() => setEditingId(it.subjectId)}>
                    <Wrench className="mr-2 h-3.5 w-3.5" /> {it.readyToFinalize ? "Finalize" : "Complete & finalize"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setDiscardTarget({ id: it.subjectId, name: it.display_name })}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Discard
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <FinalizeClientEditor
        open={!!editingId}
        onOpenChange={(v) => !v && setEditingId(null)}
        subjectId={editingId}
        onFinalized={() => {
          qc.invalidateQueries({ queryKey: ["pending-client-subjects"] });
          qc.invalidateQueries({ queryKey: ["clients-uncommitted-imports"] });
        }}
      />

      <Dialog open={!!discardTarget} onOpenChange={(v) => !v && setDiscardTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" /> Discard pending client?
            </DialogTitle>
            <DialogDescription>
              <strong>{discardTarget?.name}</strong> will be archived from the workspace. The
              import history and audit trail are retained (Medicaid retention).
              This client will never appear in the active roster.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={discardM.isPending}
              onClick={() => discardTarget && discardM.mutate(discardTarget.id)}
            >
              {discardM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Confirm discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
