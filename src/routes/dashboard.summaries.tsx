import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import {
  Loader2, FileText, Sparkles, Download, Save, CheckCircle2,
  AlertTriangle, Receipt, Eye, ArrowLeft, ChevronRight,
} from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ensureCurrentSummaryPeriods,
  listAllSummaries,
  getSummaryWithSource,
  saveSummaryDraft,
  finalizeSummary,
  attestSummaryUpiEntered,
  attestSummarySentToSc,
  type ProgressSummaryRow,
  type SummarySourceBundle,
} from "@/lib/progress-summaries.functions";
import { draftProgressSummary } from "@/lib/progress-summary-draft.functions";
import { renderSummaryPdf } from "@/lib/progress-summary-pdf";
import {
  formatPeriodMonthYear,
  summaryCadenceLabel,
  summaryFilingDestination,
} from "@/lib/progress-summaries";
import { listUpiAttestations, recordUpiAttestation } from "@/lib/upi-attestations.functions";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  open: z.string().uuid().optional(),
  client: z.string().uuid().optional(),
});

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

function dueTone(due: string, row: ProgressSummaryRow): "overdue" | "week" | "ok" | "done" {
  if (row.completed_at) return "done";
  if (row.status === "finalized" && row.requires_upi_attestation && !row.upi_entered_at) return "overdue";
  if (row.status === "finalized" && !row.requires_upi_attestation && !row.sc_sent_at) return "week";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "overdue";
  if (days <= 7) return "week";
  return "ok";
}

function SummariesPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const role = org?.role;
  const isAdmin = role === "admin" || role === "program_manager" || role === "manager";
  const navigate = useNavigate({ from: "/dashboard/summaries" });
  const search = useSearch({ from: "/dashboard/summaries" });

  const ensureFn = useServerFn(ensureCurrentSummaryPeriods);
  const listFn = useServerFn(listAllSummaries);
  const [openId, setOpenId] = useState<string | null>(search.open ?? null);
  const selectedClientId = search.client ?? null;

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
        .select("id, first_name, last_name, created_at, support_coordinator_name")
        .eq("organization_id", orgId!)
        .order("last_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((c) => ({
        ...c,
        hive_start_date: null as string | null,
      }));
    },
  });

  const nameOf = (id: string) => {
    const c = (clientsQ.data ?? []).find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "Unknown";
  };

  const byClient = useMemo(() => {
    const map = new Map<string, ProgressSummaryRow[]>();
    for (const s of summariesQ.data ?? []) {
      const arr = map.get(s.client_id) ?? [];
      arr.push(s);
      map.set(s.client_id, arr);
    }
    return map;
  }, [summariesQ.data]);

  const clientCards = useMemo(() => {
    const ids = new Set<string>([
      ...(clientsQ.data ?? []).map((c) => c.id),
      ...byClient.keys(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    return [...ids]
      .map((id) => {
        const rows = byClient.get(id) ?? [];
        const open = rows.filter((r) => !r.completed_at);
        const overdue = open.filter((r) => r.due_date < today && r.status !== "finalized");
        const next = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
        const c = (clientsQ.data ?? []).find((x) => x.id === id);
        return {
          id,
          name: c ? `${c.first_name} ${c.last_name}` : nameOf(id),
          openCount: open.length,
          overdueCount: overdue.length,
          nextDue: next?.due_date ?? null,
          hasSei: rows.some((r) => r.service_codes?.includes("SEI") || r.service_codes?.includes("SJD")),
          hasQuarterly: rows.some((r) => r.period_kind === "quarterly"),
        };
      })
      .filter((c) => (byClient.get(c.id)?.length ?? 0) > 0)
      .sort((a, b) => {
        if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
        return a.name.localeCompare(b.name);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byClient, clientsQ.data]);

  useEffect(() => {
    if (search.open) setOpenId(search.open);
  }, [search.open]);

  if (!orgId) return null;
  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="rounded-xl border bg-card py-8 text-center text-muted-foreground">
          Summaries are managed by admins and managers only.
        </div>
      </div>
    );
  }

  const selectedClient = (clientsQ.data ?? []).find((c) => c.id === selectedClientId) ?? null;
  const selectedRows = selectedClientId ? (byClient.get(selectedClientId) ?? []) : [];

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="size-6" /> Summaries
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Open a person, draft goal progress with Nectar from code-tagged HIVE notes, finalize with
            attestation, download the packet, then mark sent to the Support Coordinator — or entered in UPI for SEI/SJD.
          </p>
        </div>
        <Button variant="outline" onClick={() => summariesQ.refetch()} disabled={summariesQ.isFetching}>
          {summariesQ.isFetching ? <Loader2 className="size-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      {!selectedClientId ? (
        <ClientList
          loading={summariesQ.isLoading || clientsQ.isLoading}
          cards={clientCards}
          onOpen={(id) => navigate({ search: { client: id } })}
        />
      ) : (
        <ClientWorkspace
          clientName={selectedClient ? `${selectedClient.first_name} ${selectedClient.last_name}` : nameOf(selectedClientId)}
          scName={selectedClient?.support_coordinator_name ?? null}
          rows={selectedRows}
          loading={summariesQ.isLoading}
          onBack={() => navigate({ search: {} })}
          onOpen={(id) => {
            setOpenId(id);
            navigate({ search: { client: selectedClientId, open: id } });
          }}
        />
      )}

      {openId && (
        <SummaryReviewDialog
          summaryId={openId}
          organizationId={orgId}
          orgName={org?.organization_name ?? null}
          clientName={(() => {
            const row = (summariesQ.data ?? []).find((s) => s.id === openId);
            return row ? nameOf(row.client_id) : "";
          })()}
          onClose={() => {
            setOpenId(null);
            navigate({
              search: selectedClientId ? { client: selectedClientId } : {},
            });
            summariesQ.refetch();
          }}
        />
      )}
    </div>
  );
}

function ClientList({
  cards,
  onOpen,
  loading,
}: {
  cards: Array<{
    id: string;
    name: string;
    openCount: number;
    overdueCount: number;
    nextDue: string | null;
    hasSei: boolean;
    hasQuarterly: boolean;
  }>;
  onOpen: (id: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin inline mr-2" /> Loading clients…
      </div>
    );
  }
  if (cards.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground rounded-xl border bg-card">
        No summary periods yet. Clients with active HHS/RHS/DSI/SLH/SLN/SEI (and related) codes appear here after periods close.
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      {cards.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onOpen(c.id)}
          className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        >
          <div className="min-w-0">
            <div className="font-medium truncate">{c.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
              {c.hasSei && <span>SEI monthly (UPI)</span>}
              {c.hasQuarterly && <span>Quarterly → SC</span>}
              {c.nextDue && <span>Next due {c.nextDue}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {c.overdueCount > 0 ? (
              <Badge className="bg-red-100 text-red-800">{c.overdueCount} overdue</Badge>
            ) : c.openCount > 0 ? (
              <Badge className="bg-amber-100 text-amber-900">{c.openCount} open</Badge>
            ) : (
              <Badge className="bg-green-100 text-green-800">Caught up</Badge>
            )}
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </button>
      ))}
    </div>
  );
}

function ClientWorkspace({
  clientName,
  scName,
  rows,
  loading,
  onBack,
  onOpen,
}: {
  clientName: string;
  scName: string | null;
  rows: ProgressSummaryRow[];
  loading: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const monthly = rows
    .filter((r) => r.period_kind === "monthly")
    .sort((a, b) => b.period_end.localeCompare(a.period_end));
  const quarterly = rows
    .filter((r) => r.period_kind === "quarterly")
    .sort((a, b) => b.period_end.localeCompare(a.period_end));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="size-4 mr-1" /> All clients
        </Button>
      </div>
      <div>
        <h2 className="text-xl font-semibold">{clientName}</h2>
        <p className="text-sm text-muted-foreground">
          Support Coordinator: {scName?.trim() || "Not on file"}
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="size-5 animate-spin inline" /></div>
      ) : (
        <div className="space-y-6">
          {monthly.length > 0 && (
            <PeriodSection
              title="Monthly"
              hint="SEI/SJD → UPI by the 15th · CMP/CMS/PN → Support Coordinator"
              rows={monthly}
              onOpen={onOpen}
            />
          )}
          {quarterly.length > 0 && (
            <PeriodSection
              title="Quarterly"
              hint="HHS / RHS / DSI / SLH / SLN · due 15 days after quarter end · send to Support Coordinator"
              rows={quarterly}
              onOpen={onOpen}
            />
          )}
          {monthly.length === 0 && quarterly.length === 0 && (
            <div className="rounded-xl border bg-card py-10 text-center text-muted-foreground">
              No periods for this client yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PeriodSection({
  title,
  hint,
  rows,
  onOpen,
}: {
  title: string;
  hint: string;
  rows: ProgressSummaryRow[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="rounded-xl border bg-card divide-y">
        {rows.map((r) => {
          const tone = dueTone(r.due_date, r);
          const filing = summaryFilingDestination(r.summary_kind, r.service_codes);
          return (
            <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium flex flex-wrap items-center gap-2">
                  {r.summary_kind === "financial_statement" ? (
                    <span className="inline-flex items-center gap-1">
                      <Receipt className="size-3.5" />
                      {r.period_label.replace(/-FS$/, "")} financial statement
                    </span>
                  ) : r.period_kind === "monthly" ? (
                    formatPeriodMonthYear(r.period_label.replace(/-FS$/, ""))
                  ) : (
                    r.period_label
                  )}
                  {statusBadge(r.status)}
                  {tone === "overdue" && <Badge className="bg-red-100 text-red-800">Overdue</Badge>}
                  {r.status === "finalized" && filing === "upi" && !r.upi_entered_at && (
                    <Badge className="bg-amber-100 text-amber-900">Awaiting UPI</Badge>
                  )}
                  {r.status === "finalized" && filing === "support_coordinator" && !r.sc_sent_at && (
                    <Badge className="bg-amber-100 text-amber-900">Awaiting SC send</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {r.service_codes.join(" · ") || "(no codes)"} · Due {r.due_date}
                  {" · "}
                  {summaryCadenceLabel(r.period_kind, r.service_codes).split(" · ").slice(1).join(" · ")}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => onOpen(r.id)}>
                <Eye className="size-4 mr-1" /> Open
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SummaryReviewDialog({
  summaryId, organizationId, orgName, clientName, onClose,
}: {
  summaryId: string;
  organizationId: string;
  orgName: string | null;
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
  const scFn = useServerFn(attestSummarySentToSc);

  const bundleQ = useQuery({
    queryKey: ["summary", summaryId],
    queryFn: () => getBundleFn({ data: { organizationId, summaryId } }),
  });

  const [content, setContent] = useState("");
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [generalDraft, setGeneralDraft] = useState("");
  const [finalizerName, setFinalizerName] = useState("");
  const [aiAttested, setAiAttested] = useState(false);
  const [showFinalize, setShowFinalize] = useState(false);
  const [autoDrafted, setAutoDrafted] = useState(false);

  useEffect(() => {
    if (!bundleQ.data) return;
    const s = bundleQ.data.summary;
    const raw = s.final_content ?? s.draft_content ?? "";
    setContent(raw);
    setAiAttested(!!s.ai_review_attested_at);
    // Parse goal sections from existing prose when possible.
    const parsed: Record<string, string> = {};
    for (const g of bundleQ.data.goals) {
      const re = new RegExp(
        `Goal:\\s*${g.goal.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=\\nGoal:|\\n[A-Z][A-Z ]{2,}:|$)`,
        "i",
      );
      const m = raw.match(re);
      parsed[g.id] = m?.[1]?.trim() ?? "";
    }
    setGoalDrafts(parsed);
    const gen = raw.match(/GENERAL SUMMARY\s*\n([\s\S]*?)(?=\nGOAL PROGRESS|\n[A-Z][A-Z ]{2,}:|$)/i);
    setGeneralDraft(gen?.[1]?.trim() ?? "");
    if (!finalizerName) {
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

  const assembleContent = (general: string, goalsMap: Record<string, string>, goals: SummarySourceBundle["goals"]) => {
    if (!bundleQ.data) return content;
    const s = bundleQ.data.summary;
    if (!s.include_goal_progress || goals.length === 0) {
      return content;
    }
    const provider = bundleQ.data.organization.legal_name || bundleQ.data.organization.name || orgName || "Provider";
    const sc = bundleQ.data.client.support_coordinator_name || "Not on file";
    const header = [
      `PERSON: ${clientName}`,
      `SERVICES PROVIDED THIS PERIOD: ${s.service_codes.join(", ") || "(none)"}`,
      `DATE RANGE: ${s.period_start} to ${s.period_end}`,
      `PROVIDER: ${provider}`,
      `SUPPORT COORDINATOR: ${sc}`,
      "",
      "GENERAL SUMMARY",
      general.trim() || "(write general summary)",
      "",
      "GOAL PROGRESS",
      ...goals.flatMap((g) => [
        `Goal: ${g.goal}`,
        (goalsMap[g.id] ?? "").trim() || "No documentation in this period supports progress on this goal.",
        "",
      ]),
    ].join("\n");
    return header;
  };

  const draftMut = useMutation({
    mutationFn: (goalId?: string) =>
      draftFn({ data: { organizationId, summaryId, ...(goalId ? { goalId } : {}) } }),
    onSuccess: () => { bundleQ.refetch(); qc.invalidateQueries({ queryKey: ["summaries"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!bundleQ.data || autoDrafted) return;
    const s = bundleQ.data.summary;
    if (s.summary_kind === "narrative" && s.status === "pending") {
      setAutoDrafted(true);
      draftMut.mutate(undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const goals = bundleQ.data?.goals ?? [];
      const assembled =
        goals.length > 0 && bundleQ.data?.summary.include_goal_progress
          ? assembleContent(generalDraft, goalDrafts, goals)
          : content;
      setContent(assembled);
      return saveFn({ data: { organizationId, summaryId, content: assembled } });
    },
    onSuccess: () => { toast.success("Draft saved"); qc.invalidateQueries({ queryKey: ["summaries"] }); bundleQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const finalizeMut = useMutation({
    mutationFn: async () => {
      const goals = bundleQ.data?.goals ?? [];
      const assembled =
        goals.length > 0 && bundleQ.data?.summary.include_goal_progress
          ? assembleContent(generalDraft, goalDrafts, goals)
          : content;
      setContent(assembled);
      return finalizeFn({
        data: {
          organizationId,
          summaryId,
          content: assembled,
          finalizedByName: finalizerName.trim(),
          aiReviewAttested: aiAttested,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Summary finalized — download PDF, then attest filing.");
      qc.invalidateQueries({ queryKey: ["summaries"] });
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      await bundleQ.refetch();
      setShowFinalize(false);
      // Packet download after finalize (user can re-download anytime).
      setTimeout(() => { void handleDownload(); }, 100);
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

  const scMut = useMutation({
    mutationFn: () => scFn({ data: { organizationId, summaryId } }),
    onSuccess: () => {
      toast.success("Sent to Support Coordinator attested. Deadline cleared.");
      qc.invalidateQueries({ queryKey: ["summaries"] });
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      bundleQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isSei = bundleQ.data?.summary.service_codes?.includes("SEI") ?? false;
  const isSjd = bundleQ.data?.summary.service_codes?.includes("SJD") ?? false;
  const empAttestKind = isSjd && !isSei ? "sjd_employment_monthly" : "sei_employment_monthly";
  const listUpiAttestFn = useServerFn(listUpiAttestations);
  const recordUpiAttestFn = useServerFn(recordUpiAttestation);
  const empAttestQ = useQuery({
    enabled: (isSei || isSjd) && !!bundleQ.data,
    queryKey: ["upi-attestations", organizationId, empAttestKind, bundleQ.data?.summary.client_id, bundleQ.data?.summary.period_label],
    queryFn: () => listUpiAttestFn({ data: { organizationId, kind: empAttestKind } }),
  });
  const empAttestedAt = empAttestQ.data?.find(
    (a) => a.client_id === bundleQ.data?.summary.client_id && a.period_label === bundleQ.data?.summary.period_label,
  )?.attested_at ?? null;
  const empAttestMut = useMutation({
    mutationFn: () => recordUpiAttestFn({
      data: {
        organizationId,
        clientId: bundleQ.data!.summary.client_id,
        kind: empAttestKind,
        periodLabel: bundleQ.data!.summary.period_label,
      },
    }),
    onSuccess: () => {
      toast.success("Employment data attestation recorded.");
      qc.invalidateQueries({ queryKey: ["upi-attestations"] });
      qc.invalidateQueries({ queryKey: ["deadlines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDownload = async () => {
    if (!bundleQ.data) return;
    const s = bundleQ.data.summary;
    const b = bundleQ.data;
    let logoDataUrl: string | null = null;
    if (b.organization.logo_path) {
      try {
        const { data: signed } = await supabase.storage
          .from("org-branding")
          .createSignedUrl(b.organization.logo_path, 60 * 10);
        if (signed?.signedUrl) {
          const res = await fetch(signed.signedUrl);
          const blob = await res.blob();
          logoDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      } catch {
        logoDataUrl = null;
      }
    }
    const filing = summaryFilingDestination(s.summary_kind, s.service_codes);
    const blob = renderSummaryPdf({
      clientName,
      periodLabel: s.period_label.replace(/-FS$/, ""),
      periodStart: s.period_start,
      periodEnd: s.period_end,
      services: s.service_codes,
      content: s.final_content ?? content,
      finalizedByName: s.finalized_by_name ?? finalizerName,
      finalizedAt: s.finalized_at ?? new Date().toISOString(),
      providerName: b.organization.legal_name || b.organization.name || orgName || "Provider",
      providerAddress: b.organization.address,
      providerPhone: b.organization.phone,
      supportCoordinatorName: b.client.support_coordinator_name,
      supportCoordinatorEmail: b.client.support_coordinator_email,
      staffNames: b.staffNames,
      logoDataUrl,
      aiReviewAttested: !!(s.ai_review_attested_at || aiAttested),
      filingNote:
        filing === "upi"
          ? "Filing: enter narrative in the state UPI portal, then attest in HIVE."
          : filing === "support_coordinator"
            ? "Filing: email/send this PDF to the Support Coordinator via your secure channel, then attest in HIVE."
            : null,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clientName.replace(/\s+/g, "_")}_${s.period_label}_summary.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const locked = bundleQ.data?.summary.status === "finalized";
  const filing = bundleQ.data
    ? summaryFilingDestination(bundleQ.data.summary.summary_kind, bundleQ.data.summary.service_codes)
    : "none";

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" /> {clientName} — {bundleQ.data?.summary.period_label.replace(/-FS$/, "")}
          </DialogTitle>
          <DialogDescription>
            {bundleQ.data
              ? summaryCadenceLabel(bundleQ.data.summary.period_kind, bundleQ.data.summary.service_codes)
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {bundleQ.isLoading || !bundleQ.data ? (
          <div className="py-12 text-center"><Loader2 className="size-5 animate-spin inline" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden min-h-0">
            <div className="overflow-y-auto pr-2 space-y-3 border-r min-h-0">
              <SourcePanel bundle={bundleQ.data} />
            </div>

            <div className="overflow-y-auto pl-2 flex flex-col gap-3 min-h-0">
              {bundleQ.data.summary.summary_kind === "financial_statement" ? (
                <PbaPanel
                  status={bundleQ.data.summary.status}
                  onMarkComplete={() => {
                    setContent("Monthly financial statement generated and sent to Support Coordinator.");
                    setAiAttested(true);
                    setShowFinalize(true);
                  }}
                />
              ) : bundleQ.data.summary.status === "no_source" ? (
                <NoSourceBanner />
              ) : draftMut.isPending ? (
                <div className="rounded border bg-blue-50 px-3 py-2 text-sm text-blue-800 flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Nectar is drafting from code-tagged notes…
                </div>
              ) : null}

              {bundleQ.data.summary.summary_kind === "narrative" && (
                <>
                  {bundleQ.data.summary.include_goal_progress && bundleQ.data.goals.length > 0 ? (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">General summary</Label>
                        <Textarea
                          value={generalDraft}
                          onChange={(e) => setGeneralDraft(e.target.value)}
                          className="mt-1 min-h-[100px] text-sm"
                          disabled={locked}
                          placeholder="Overall status and services this period…"
                        />
                      </div>
                      {bundleQ.data.goals.map((g) => (
                        <div key={g.id} className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium leading-snug">{g.goal}</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {g.job_codes.length
                                  ? `Codes: ${g.job_codes.join(", ")}`
                                  : "No job codes tagged — Nectar uses period services"}
                              </div>
                            </div>
                            {!locked && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={draftMut.isPending}
                                onClick={() => draftMut.mutate(g.id)}
                              >
                                <Sparkles className="size-3.5 mr-1" /> Draft
                              </Button>
                            )}
                          </div>
                          <Textarea
                            value={goalDrafts[g.id] ?? ""}
                            onChange={(e) => setGoalDrafts((prev) => ({ ...prev, [g.id]: e.target.value }))}
                            className="min-h-[88px] text-sm"
                            disabled={locked}
                            placeholder="Progress on this goal…"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Draft will appear here once Nectar finishes…"
                      className="min-h-[420px] font-mono text-sm"
                      disabled={locked}
                    />
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => draftMut.mutate(undefined)}
                      disabled={draftMut.isPending || locked}
                    >
                      <Sparkles className="size-4 mr-1" />
                      {bundleQ.data.summary.status === "no_source" ? "Try Nectar again" : "Re-draft all with Nectar"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveMut.mutate()}
                      disabled={saveMut.isPending || locked}
                    >
                      <Save className="size-4 mr-1" /> Save draft
                    </Button>
                    {!locked && (
                      <Button size="sm" onClick={() => setShowFinalize(true)}>
                        <CheckCircle2 className="size-4 mr-1" /> Finalize
                      </Button>
                    )}
                    {locked && (
                      <Button size="sm" onClick={() => void handleDownload()}>
                        <Download className="size-4 mr-1" /> Download PDF
                      </Button>
                    )}
                    {locked && filing === "upi" && !bundleQ.data.summary.upi_entered_at && (
                      <Button size="sm" variant="secondary" onClick={() => upiMut.mutate()} disabled={upiMut.isPending}>
                        Mark entered in UPI
                      </Button>
                    )}
                    {locked && filing === "support_coordinator" && !bundleQ.data.summary.sc_sent_at && (
                      <Button size="sm" variant="secondary" onClick={() => scMut.mutate()} disabled={scMut.isPending}>
                        Mark sent to Support Coordinator
                      </Button>
                    )}
                  </div>
                </>
              )}

              {(isSei || isSjd) && (
                <label className="mt-1 flex items-start gap-2 rounded-md border border-border/60 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={!!empAttestedAt}
                    disabled={!!empAttestedAt || empAttestMut.isPending}
                    onChange={(e) => { if (e.target.checked) empAttestMut.mutate(); }}
                  />
                  <span>
                    I confirm I have entered this client&apos;s employment data into UPI for{" "}
                    {formatPeriodMonthYear(bundleQ.data.summary.period_label)}.
                    {empAttestedAt && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        Attested {new Date(empAttestedAt).toLocaleDateString()}.
                      </span>
                    )}
                  </span>
                </label>
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
                  Required before the packet is locked. Your name appears as Prepared by.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="finalizer">Your full name</Label>
                  <Input
                    id="finalizer"
                    value={finalizerName}
                    onChange={(e) => setFinalizerName(e.target.value)}
                    placeholder="Your full name"
                    className="mt-1"
                  />
                </div>
                <label className="flex items-start gap-2 text-sm rounded-md border p-3 bg-muted/30">
                  <Checkbox
                    checked={aiAttested}
                    onCheckedChange={(v) => setAiAttested(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    I reviewed the Nectar draft against HIVE notes, shifts, and incidents for this period.
                    I take responsibility for the finalized summary.
                  </span>
                </label>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowFinalize(false)}>Cancel</Button>
                <Button
                  onClick={() => finalizeMut.mutate()}
                  disabled={!finalizerName.trim() || !aiAttested || finalizeMut.isPending}
                >
                  {finalizeMut.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <CheckCircle2 className="size-4 mr-1" />}
                  Finalize &amp; download PDF
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
          <div>
            Generate the statement using the agency&apos;s PBA tooling, then finalize here and attest
            sent to the Support Coordinator. Nectar does not draft financial statements.
          </div>
        </div>
      </div>
      {status !== "finalized" && (
        <Button size="sm" onClick={onMarkComplete}>
          <CheckCircle2 className="size-4 mr-1" /> Mark statement ready
        </Button>
      )}
    </div>
  );
}

function SourcePanel({ bundle }: { bundle: SummarySourceBundle }) {
  const { client, servicesInPeriod, dailyLogs, shiftReports, incidents, summary, goals, organization, staffNames, untaggedSourceCount } = bundle;
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border p-3 text-xs space-y-1">
        <div className="font-semibold text-sm mb-1">Period &amp; packet</div>
        <div><span className="text-muted-foreground">Person:</span> {client.first_name} {client.last_name}</div>
        <div><span className="text-muted-foreground">Dates:</span> {summary.period_start} → {summary.period_end}</div>
        <div><span className="text-muted-foreground">Services:</span> {servicesInPeriod.map((s) => s.service_code).join(", ") || "(none)"}</div>
        <div><span className="text-muted-foreground">Provider:</span> {organization.legal_name || organization.name || "—"}</div>
        <div><span className="text-muted-foreground">Support Coordinator:</span> {client.support_coordinator_name || "Not on file"}</div>
        <div><span className="text-muted-foreground">Staff:</span> {staffNames.join(", ") || "—"}</div>
        <div><span className="text-muted-foreground">Cadence:</span> {summaryCadenceLabel(summary.period_kind, summary.service_codes)}</div>
        {untaggedSourceCount > 0 && (
          <div className={cn("mt-1 rounded px-2 py-1", "bg-amber-50 text-amber-900")}>
            {untaggedSourceCount} source(s) untagged for service code / goal — shown for review; Nectar will not invent codes.
          </div>
        )}
      </div>

      <div className="rounded-lg border p-3 text-xs space-y-1">
        <div className="font-semibold text-sm mb-1">PCSP goals ({goals.length})</div>
        {goals.length === 0
          ? <div className="text-muted-foreground">No PCSP goals on record.</div>
          : goals.map((g) => (
            <div key={g.id}>
              • {g.goal}
              {g.job_codes.length > 0 && (
                <span className="text-muted-foreground"> ({g.job_codes.join(", ")})</span>
              )}
            </div>
          ))}
      </div>

      <div className="rounded-lg border p-3 text-xs space-y-2">
        <div className="font-semibold text-sm">Approved daily logs ({dailyLogs.length})</div>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {dailyLogs.length === 0 && <div className="text-muted-foreground">None.</div>}
          {dailyLogs.map((l) => (
            <div key={l.id} className="border-l-2 border-blue-300 pl-2">
              <div className="font-medium">{l.log_date} — {l.staff_name ?? "Staff"}</div>
              <div className="text-muted-foreground">Goals: {l.pcsp_goals_addressed.join(" | ") || "(none)"}</div>
              <div className="whitespace-pre-wrap">{l.narrative}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-3 text-xs space-y-2">
        <div className="font-semibold text-sm">Submitted shift reports ({shiftReports.length})</div>
        <div className="max-h-60 overflow-y-auto space-y-2">
          {shiftReports.length === 0 && <div className="text-muted-foreground">None.</div>}
          {shiftReports.filter((r) => r.narrative).map((r) => (
            <div key={r.id} className="border-l-2 border-violet-300 pl-2">
              <div className="font-medium">
                {r.created_at.slice(0, 10)} — {r.staff_name ?? "Staff"}
                {r.service_code ? ` · ${r.service_code}` : " · untagged"}
              </div>
              <div className="whitespace-pre-wrap">{r.narrative}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-3 text-xs space-y-2">
        <div className="font-semibold text-sm">Incidents ({incidents.length})</div>
        <div className="max-h-60 overflow-y-auto space-y-2">
          {incidents.length === 0 && <div className="text-muted-foreground">None.</div>}
          {incidents.map((i) => (
            <div key={i.id} className="border-l-2 border-red-300 pl-2">
              <div className="font-medium">{i.incident_date} — #{i.report_number} ({i.incident_types.join(", ")})</div>
              <div className="whitespace-pre-wrap">{i.narrative_during}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
