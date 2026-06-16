import { createFileRoute, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, FileText, Sparkles, Download, Save, CheckCircle2, AlertTriangle, Receipt, Eye } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ensureCurrentSummaryPeriods,
  listAllSummaries,
  getSummaryWithSource,
  saveSummaryDraft,
  finalizeSummary,
  attestSummaryUpiEntered,
  type ProgressSummaryRow,
  type SummarySourceBundle,
} from "@/lib/progress-summaries.functions";
import { draftProgressSummary } from "@/lib/progress-summary-draft.functions";
import { renderSummaryPdf } from "@/lib/progress-summary-pdf";

const searchSchema = z.object({ open: z.string().uuid().optional() });

export const Route = createFileRoute("/dashboard/summaries")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Summaries — HIVE" }] }),
  component: SummariesPage,
});

function statusBadge(s: ProgressSummaryRow["status"]) {
  const map: Record<ProgressSummaryRow["status"], { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "bg-slate-200 text-slate-800" },
    draft: { label: "Drafted by Nectar", cls: "bg-blue-100 text-blue-800" },
    in_review: { label: "In review", cls: "bg-amber-100 text-amber-800" },
    finalized: { label: "Finalized", cls: "bg-green-100 text-green-800" },
    no_source: { label: "No documentation", cls: "bg-red-100 text-red-800" },
  };
  const { label, cls } = map[s];
  return <Badge className={cls}>{label}</Badge>;
}

function SummariesPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const role = org?.role;
  const isAdmin = role === "admin" || role === "super_admin" || role === "manager";

  const ensureFn = useServerFn(ensureCurrentSummaryPeriods);
  const listFn = useServerFn(listAllSummaries);
  const search = useSearch({ from: "/dashboard/summaries" });
  const [openId, setOpenId] = useState<string | null>(search.open ?? null);

  const summariesQ = useQuery({
    enabled: !!orgId && isAdmin,
    queryKey: ["summaries", orgId],
    queryFn: async () => {
      await ensureFn({ data: { organizationId: orgId! } });
      return listFn({ data: { organizationId: orgId! } });
    },
  });

  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["summaries:clients", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nameOf = (id: string) => {
    const c = (clientsQ.data ?? []).find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "Unknown";
  };

  const grouped = useMemo(() => {
    const items = summariesQ.data ?? [];
    const open = items.filter((s) => s.status !== "finalized");
    const done = items.filter((s) => s.status === "finalized");
    return { open, done };
  }, [summariesQ.data]);

  if (!orgId) return null;
  if (!isAdmin) {
    return (
      <div className="p-8">
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          Summaries are managed by admins and managers only.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><FileText className="size-6" /> Summaries</h1>
          <p className="text-sm text-muted-foreground">
            Nectar drafts each client's periodic progress summary from their approved notes. You review, edit, finalize, and download to send through your own secure email.
          </p>
        </div>
        <Button variant="outline" onClick={() => summariesQ.refetch()} disabled={summariesQ.isFetching}>
          {summariesQ.isFetching ? <Loader2 className="size-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open ({grouped.open.length})</TabsTrigger>
          <TabsTrigger value="done">Finalized ({grouped.done.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="mt-4">
          <SummaryList rows={grouped.open} nameOf={nameOf} onOpen={setOpenId} loading={summariesQ.isLoading} />
        </TabsContent>
        <TabsContent value="done" className="mt-4">
          <SummaryList rows={grouped.done} nameOf={nameOf} onOpen={setOpenId} loading={summariesQ.isLoading} />
        </TabsContent>
      </Tabs>

      {openId && (
        <SummaryReviewDialog
          summaryId={openId}
          organizationId={orgId}
          clientName={(() => {
            const row = (summariesQ.data ?? []).find((s) => s.id === openId);
            return row ? nameOf(row.client_id) : "";
          })()}
          onClose={() => { setOpenId(null); summariesQ.refetch(); }}
        />
      )}
    </div>
  );
}

function SummaryList({
  rows, nameOf, onOpen, loading,
}: {
  rows: ProgressSummaryRow[];
  nameOf: (id: string) => string;
  onOpen: (id: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return <div className="py-12 text-center text-muted-foreground"><Loader2 className="size-5 animate-spin inline mr-2" /> Loading…</div>;
  }
  if (rows.length === 0) {
    return <div className="py-12 text-center text-muted-foreground">No summaries in this view.</div>;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Services</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{nameOf(r.client_id)}</td>
                  <td className="px-3 py-2">
                    {r.summary_kind === "financial_statement" ? (
                      <span className="inline-flex items-center gap-1"><Receipt className="size-3.5" /> {r.period_label.replace(/-FS$/, "")} financial statement</span>
                    ) : (
                      <>{r.period_label}{r.requires_upi_attestation && <span className="ml-2 text-xs text-amber-700">UPI</span>}</>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.service_codes.join(", ")}</td>
                  <td className="px-3 py-2">{r.due_date}</td>
                  <td className="px-3 py-2">{statusBadge(r.status)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => onOpen(r.id)}>
                      <Eye className="size-4 mr-1" /> Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryReviewDialog({
  summaryId, organizationId, clientName, onClose,
}: {
  summaryId: string;
  organizationId: string;
  clientName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const getBundleFn = useServerFn(getSummaryWithSource);
  const draftFn = useServerFn(draftProgressSummary);
  const saveFn = useServerFn(saveSummaryDraft);
  const finalizeFn = useServerFn(finalizeSummary);
  const upiFn = useServerFn(attestSummaryUpiEntered);

  const bundleQ = useQuery({
    queryKey: ["summary", summaryId],
    queryFn: () => getBundleFn({ data: { organizationId, summaryId } }),
  });

  const [content, setContent] = useState("");
  const [finalizerName, setFinalizerName] = useState("");
  const [showFinalize, setShowFinalize] = useState(false);
  const [autoDrafted, setAutoDrafted] = useState(false);

  // When bundle arrives, hydrate textarea + finalizer name.
  useEffect(() => {
    if (!bundleQ.data) return;
    const s = bundleQ.data.summary;
    setContent(s.final_content ?? s.draft_content ?? "");
    if (!finalizerName) {
      // Default finalizer: profile full name if available, fallback to email.
      (async () => {
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .maybeSingle();
        const name = [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim();
        setFinalizerName(name || user.email || "");
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleQ.data]);

  // Auto-draft: if narrative + status 'pending', kick off the draft on first open.
  const draftMut = useMutation({
    mutationFn: () => draftFn({ data: { organizationId, summaryId } }),
    onSuccess: () => { bundleQ.refetch(); qc.invalidateQueries({ queryKey: ["summaries"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  useEffect(() => {
    if (!bundleQ.data || autoDrafted) return;
    const s = bundleQ.data.summary;
    if (s.summary_kind === "narrative" && s.status === "pending") {
      setAutoDrafted(true);
      draftMut.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleQ.data]);

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { organizationId, summaryId, content } }),
    onSuccess: () => { toast.success("Draft saved"); qc.invalidateQueries({ queryKey: ["summaries"] }); bundleQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const finalizeMut = useMutation({
    mutationFn: () => finalizeFn({ data: { organizationId, summaryId, content, finalizedByName: finalizerName.trim() } }),
    onSuccess: () => {
      toast.success("Summary finalized");
      qc.invalidateQueries({ queryKey: ["summaries"] });
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      bundleQ.refetch();
      setShowFinalize(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upiMut = useMutation({
    mutationFn: () => upiFn({ data: { organizationId, summaryId } }),
    onSuccess: () => {
      toast.success("UPI entry attested. Deadline cleared.");
      qc.invalidateQueries({ queryKey: ["summaries"] });
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      bundleQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDownload = () => {
    if (!bundleQ.data) return;
    const s = bundleQ.data.summary;
    const blob = renderSummaryPdf({
      clientName,
      periodLabel: s.period_label.replace(/-FS$/, ""),
      periodStart: s.period_start,
      periodEnd: s.period_end,
      services: s.service_codes,
      content: s.final_content ?? content,
      finalizedByName: s.finalized_by_name ?? finalizerName,
      finalizedAt: s.finalized_at ?? new Date().toISOString(),
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clientName.replace(/\s+/g, "_")}_${s.period_label}_summary.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" /> {clientName} — {bundleQ.data?.summary.period_label.replace(/-FS$/, "")}
          </DialogTitle>
          <DialogDescription>
            {bundleQ.data?.summary.summary_kind === "financial_statement"
              ? "Monthly financial statement — generate via PBA tools, then mark complete."
              : "Review Nectar's draft against the source notes on the left."}
          </DialogDescription>
        </DialogHeader>

        {bundleQ.isLoading || !bundleQ.data ? (
          <div className="py-12 text-center"><Loader2 className="size-5 animate-spin inline" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
            {/* Left: source bundle */}
            <div className="overflow-y-auto pr-2 space-y-3 border-r">
              <SourcePanel bundle={bundleQ.data} />
            </div>

            {/* Right: editor */}
            <div className="overflow-y-auto pl-2 flex flex-col gap-3">
              {bundleQ.data.summary.summary_kind === "financial_statement" ? (
                <PbaPanel
                  status={bundleQ.data.summary.status}
                  onMarkComplete={() => {
                    setContent("Monthly financial statement generated and sent to Support Coordinator.");
                    setShowFinalize(true);
                  }}
                />
              ) : bundleQ.data.summary.status === "no_source" ? (
                <NoSourceBanner />
              ) : draftMut.isPending ? (
                <div className="rounded border bg-blue-50 px-3 py-2 text-sm text-blue-800 flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Nectar is drafting from the source notes…
                </div>
              ) : null}

              {bundleQ.data.summary.summary_kind === "narrative" && (
                <>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Draft will appear here once Nectar finishes…"
                    className="min-h-[420px] font-mono text-sm"
                    disabled={bundleQ.data.summary.status === "finalized"}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => draftMut.mutate()}
                      disabled={draftMut.isPending || bundleQ.data.summary.status === "finalized"}
                    >
                      <Sparkles className="size-4 mr-1" />
                      {bundleQ.data.summary.status === "no_source" ? "Try Nectar again" : "Re-draft with Nectar"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveMut.mutate()}
                      disabled={!content.trim() || saveMut.isPending || bundleQ.data.summary.status === "finalized"}
                    >
                      <Save className="size-4 mr-1" /> Save draft
                    </Button>
                    {bundleQ.data.summary.status !== "finalized" && (
                      <Button
                        size="sm"
                        onClick={() => setShowFinalize(true)}
                        disabled={!content.trim()}
                      >
                        <CheckCircle2 className="size-4 mr-1" /> Finalize
                      </Button>
                    )}
                    {bundleQ.data.summary.status === "finalized" && (
                      <Button size="sm" onClick={handleDownload}>
                        <Download className="size-4 mr-1" /> Download PDF
                      </Button>
                    )}
                    {bundleQ.data.summary.requires_upi_attestation && bundleQ.data.summary.status === "finalized" && !bundleQ.data.summary.upi_entered_at && (
                      <Button size="sm" variant="secondary" onClick={() => upiMut.mutate()} disabled={upiMut.isPending}>
                        Mark entered in UPI
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {showFinalize && (
          <Dialog open onOpenChange={(v) => !v && setShowFinalize(false)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Finalize summary</DialogTitle>
                <DialogDescription>
                  Your name will appear on the document as "Prepared by". This clears the matching deadline.
                </DialogDescription>
              </DialogHeader>
              <Input
                value={finalizerName}
                onChange={(e) => setFinalizerName(e.target.value)}
                placeholder="Your full name"
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowFinalize(false)}>Cancel</Button>
                <Button
                  onClick={() => finalizeMut.mutate()}
                  disabled={!finalizerName.trim() || !content.trim() || finalizeMut.isPending}
                >
                  {finalizeMut.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <CheckCircle2 className="size-4 mr-1" />}
                  Finalize
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NoSourceBanner() {
  return (
    <div className="rounded border bg-red-50 px-3 py-2 text-sm text-red-800 flex gap-2">
      <AlertTriangle className="size-4 mt-0.5 shrink-0" />
      <div>
        <div className="font-semibold">No approved documentation found for this period.</div>
        <div>Write the summary manually below. Nectar will not draft from missing data.</div>
      </div>
    </div>
  );
}

function PbaPanel({ status, onMarkComplete }: { status: string; onMarkComplete: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded border bg-amber-50 px-3 py-2 text-sm text-amber-900 flex gap-2">
        <Receipt className="size-4 mt-0.5" />
        <div>
          <div className="font-semibold">Monthly financial statement (PBA)</div>
          <div>Generate the statement using the agency's PBA tooling, then mark it complete here to clear the deadline. Nectar does not draft financial statements.</div>
        </div>
      </div>
      {status !== "finalized" && (
        <Button size="sm" onClick={onMarkComplete}>
          <CheckCircle2 className="size-4 mr-1" /> Mark statement sent
        </Button>
      )}
    </div>
  );
}

function SourcePanel({ bundle }: { bundle: SummarySourceBundle }) {
  const { client, servicesInPeriod, dailyLogs, shiftReports, incidents, summary } = bundle;
  return (
    <div className="space-y-3 text-sm">
      <Card>
        <CardHeader className="py-2"><CardTitle className="text-sm">Period & client</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1">
          <div><span className="text-muted-foreground">Person:</span> {client.first_name} {client.last_name}</div>
          <div><span className="text-muted-foreground">Dates:</span> {summary.period_start} → {summary.period_end}</div>
          <div><span className="text-muted-foreground">Services in period:</span> {servicesInPeriod.map((s) => s.service_code).join(", ") || "(none)"}</div>
          <div><span className="text-muted-foreground">Goal-progress section:</span> {summary.include_goal_progress ? "required" : "not required (excluded services)"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-2"><CardTitle className="text-sm">PCSP goals ({client.pcsp_goals?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1">
          {(client.pcsp_goals?.length ?? 0) === 0
            ? <div className="text-muted-foreground">No PCSP goals on record.</div>
            : (client.pcsp_goals ?? []).map((g, i) => <div key={i}>• {g}</div>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-2"><CardTitle className="text-sm">Approved daily logs ({dailyLogs.length})</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-2 max-h-80 overflow-y-auto">
          {dailyLogs.length === 0 && <div className="text-muted-foreground">None.</div>}
          {dailyLogs.map((l) => (
            <div key={l.id} className="border-l-2 border-blue-300 pl-2">
              <div className="font-medium">{l.log_date} — {l.staff_name ?? "Staff"}</div>
              <div className="text-muted-foreground">Goals: {l.pcsp_goals_addressed.join(" | ") || "(none)"}</div>
              <div className="whitespace-pre-wrap">{l.narrative}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-2"><CardTitle className="text-sm">Submitted shift reports ({shiftReports.length})</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-2 max-h-60 overflow-y-auto">
          {shiftReports.length === 0 && <div className="text-muted-foreground">None.</div>}
          {shiftReports.filter((r) => r.narrative).map((r) => (
            <div key={r.id} className="border-l-2 border-purple-300 pl-2">
              <div className="font-medium">{r.created_at.slice(0, 10)} — {r.staff_name ?? "Staff"}</div>
              <div className="whitespace-pre-wrap">{r.narrative}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-2"><CardTitle className="text-sm">Incidents ({incidents.length})</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-2 max-h-60 overflow-y-auto">
          {incidents.length === 0 && <div className="text-muted-foreground">None.</div>}
          {incidents.map((i) => (
            <div key={i.id} className="border-l-2 border-red-300 pl-2">
              <div className="font-medium">{i.incident_date} — #{i.report_number} ({i.incident_types.join(", ")})</div>
              <div className="whitespace-pre-wrap">{i.narrative_during}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
