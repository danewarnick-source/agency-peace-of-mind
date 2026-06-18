import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useCaseload } from "@/hooks/use-caseload";
import { useEffectiveView } from "@/hooks/use-effective-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ClipboardCheck, User, Eraser, Loader2, CheckCircle2,
  FileSignature, CalendarDays, AlertTriangle, CalendarClock,
  Pen, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  evaluateShiftNote, scanNoteForTriggers,
  type CoachResult, type ScanResult,
} from "@/lib/ai-coach.functions";
import { useServerFn } from "@tanstack/react-start";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { NectarFocusBanner } from "@/components/nectar/nectar-focus-banner";

export const Route = createFileRoute("/dashboard/daily-logs")({
  head: () => ({ meta: [{ title: "Daily Logs — HIVE" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
  component: DailyLogsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type CaseloadClient = {
  id: string;
  first_name: string;
  last_name: string;
  pcsp_goals: string[];
  job_code?: string[] | null;
  medicaid_id?: string | null;
};

type RejectedLog = {
  id: string;
  client_id: string;
  log_date: string;
  narrative: string;
  status: string;
  denial_reason: string | null;
  clients: { first_name: string; last_name: string } | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_WORDS = 50;
const LOOKBACK_DAYS = 30;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function pastDates(days: number): string[] {
  const result: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(d.toISOString().split("T")[0]);
  }
  return result;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ─── Page router ──────────────────────────────────────────────────────────────

function DailyLogsPage() {
  const { effective } = useEffectiveView();
  return effective === "admin" ? <AdminAuditQueue /> : <StaffDailyJournal />;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF VIEW
// ─────────────────────────────────────────────────────────────────────────────

function StaffDailyJournal() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { data: caseload, isLoading } = useCaseload();
  const [activeClient, setActiveClient] = useState<CaseloadClient | null>(null);
  const [backdateFor, setBackdateFor] = useState<{ client: CaseloadClient; date: string } | null>(null);

  const allowedIds = useMemo(
    () => new Set((caseload ?? []).map((c) => c.id)),
    [caseload],
  );

  const hhsClients = useMemo(
    () =>
      (caseload ?? []).filter(
        (c) =>
          allowedIds.has(c.id) &&
          Array.isArray(c.job_code) &&
          c.job_code.includes("HHS"),
      ) as unknown as CaseloadClient[],
    [caseload, allowedIds],
  );

  // ── Missing entries — past 30 days ──────────────────────────────────────────
  const { data: submittedDates = [] } = useQuery({
    enabled: !!user?.id && !!org?.organization_id && hhsClients.length > 0,
    queryKey: ["dl-submitted-dates", user?.id, org?.organization_id],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - LOOKBACK_DAYS);
      const { data } = await supabase
        .from("daily_logs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("log_date, client_id" as any)
        .eq("user_id", user!.id)
        .gte("log_date", since.toISOString().split("T")[0])
        .neq("status", "rejected");
      return (data ?? []) as unknown as { log_date: string; client_id: string }[];
    },
  });

  // ── Rejected logs — need resubmission ──────────────────────────────────────
  const { data: rejectedLogs = [] } = useQuery({
    enabled: !!user?.id && !!org?.organization_id,
    queryKey: ["dl-rejected", user?.id],
    queryFn: async (): Promise<RejectedLog[]> => {
      const { data, error } = await supabase
        .from("daily_logs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, client_id, log_date, narrative, status, denial_reason, clients:client_id(first_name, last_name)" as any)
        .eq("user_id", user!.id)
        .eq("status", "rejected")
        .order("log_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RejectedLog[];
    },
  });

  // Build missing entries map: client → missing dates
  const missingEntries = useMemo(() => {
    const allDates = pastDates(LOOKBACK_DAYS);
    const submitted = new Set(
      submittedDates.map((r) => `${r.client_id}::${r.log_date}`)
    );
    const missing: { client: CaseloadClient; date: string }[] = [];
    for (const client of hhsClients) {
      for (const date of allDates) {
        if (!submitted.has(`${client.id}::${date}`)) {
          missing.push({ client, date });
        }
      }
    }
    return missing.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  }, [hhsClients, submittedDates]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <NectarFocusBanner />
      <StaffPageHeader
        eyebrow="Host Home · Daily Compliance Journal"
        eyebrowIcon={ClipboardCheck}
        title="Daily Logs"
        subtitle="Select a client to submit today's PCSP narrative and signature."
      />


      {/* Rejected logs — needs resubmission */}
      {rejectedLogs.length > 0 && (
        <div className="rounded-xl border-2 border-rose-500/40 bg-rose-50 p-4 dark:bg-rose-950/20">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" />
            {rejectedLogs.length} Daily Log{rejectedLogs.length > 1 ? "s" : ""} Returned for Correction
          </p>
          <div className="space-y-2">
            {rejectedLogs.map((r) => {
              const cn = r.clients
                ? `${r.clients.first_name} ${r.clients.last_name}`.trim()
                : "Unknown client";
              const client = hhsClients.find((c) => c.id === r.client_id) ?? null;
              return (
                <div key={r.id} className="rounded-lg border border-rose-500/30 bg-white p-3 dark:bg-rose-950/30">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{cn} — {fmtDate(r.log_date)}</p>
                      {r.denial_reason && (
                        <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                          Admin note: {r.denial_reason}
                        </p>
                      )}
                    </div>
                    {client && (
                      <Button size="sm" variant="outline"
                        className="border-rose-500/50 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                        onClick={() => setBackdateFor({ client, date: r.log_date })}>
                        <Pen className="mr-1.5 h-3.5 w-3.5" /> Resubmit Correction
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Missing entries — grouped by client, full-width rows */}
      {missingEntries.length > 0 && (
        <div className="w-full max-w-full overflow-hidden rounded-xl border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/20">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">
              {missingEntries.length} Missing Entr{missingEntries.length === 1 ? "y" : "ies"} — Last {LOOKBACK_DAYS} Days
            </span>
          </p>
          <p className="mb-3 text-[11px] text-amber-600/80 dark:text-amber-400/80">
            Backdated submissions are accepted. A late note is always better than no note.
          </p>

          {(() => {
            // Group missing entries by client, preserving most-recent-first order within each group.
            const groups = new Map<string, { client: CaseloadClient; dates: string[] }>();
            for (const { client, date } of missingEntries) {
              const g = groups.get(client.id) ?? { client, dates: [] };
              g.dates.push(date);
              groups.set(client.id, g);
            }
            return (
              <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
                {Array.from(groups.values()).map(({ client, dates }) => (
                  <div key={client.id} className="w-full min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        <User className="h-3.5 w-3.5" />
                      </span>
                      <p className="min-w-0 truncate text-sm font-semibold text-amber-900 dark:text-amber-100">
                        {client.first_name} {client.last_name}
                      </p>
                      <span className="ml-auto shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        {dates.length} missing
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {dates.map((date) => (
                        <li key={`${client.id}-${date}`} className="w-full min-w-0">
                          <button
                            type="button"
                            onClick={() => setBackdateFor({ client, date })}
                            className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-white px-3 py-3 text-left transition hover:border-amber-500/60 hover:bg-amber-50 active:scale-[0.99] dark:bg-amber-950/30"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                              {fmtDate(date)}
                            </span>
                            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                              <Pen className="h-3 w-3" />
                              Complete log
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Client grid */}
      {isLoading ? (
        <div className="grid place-items-center py-12 text-sm text-muted-foreground">Loading caseload…</div>
      ) : !hhsClients.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No HHS clients currently assigned to your caseload. Please contact an Administrator.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {hhsClients.map((c) => {
            if (!allowedIds.has(c.id)) return null;
            const todayStr = new Date().toISOString().split("T")[0];
            const todaySubmitted = submittedDates.some(
              (r) => r.client_id === c.id && r.log_date === todayStr
            );
            return (
              <button
                key={c.id}
                onClick={() => setActiveClient(c)}
                className="group flex w-full min-w-0 items-start gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary hover:shadow-md"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium leading-tight">
                    {c.first_name} {c.last_name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.pcsp_goals?.length ?? 0} PCSP goal{(c.pcsp_goals?.length ?? 0) === 1 ? "" : "s"}
                  </p>
                  {todaySubmitted ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> Today's log submitted
                    </p>
                  ) : (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                      <ClipboardCheck className="h-3 w-3" /> Open daily journal
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Today's log dialog */}
      <DailyLogDialog
        client={activeClient}
        date={null}
        onClose={() => setActiveClient(null)}
      />

      {/* Backdated / correction dialog */}
      <DailyLogDialog
        client={backdateFor?.client ?? null}
        date={backdateFor?.date ?? null}
        onClose={() => setBackdateFor(null)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DAILY LOG DIALOG — shared by today + backdated + resubmission
// ─────────────────────────────────────────────────────────────────────────────

function DailyLogDialog({
  client, date, onClose,
}: {
  client: CaseloadClient | null;
  date: string | null; // null = today
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();

  const [goals, setGoals]       = useState<string[]>([]);
  const [narrative, setNarrative] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [aiBusy, setAiBusy]     = useState(false);
  const [aiCoach, setAiCoach]   = useState<CoachResult | null>(null);
  const [aiIterations, setAiIterations] = useState(0);
  const [aiFlagCount, setAiFlagCount]   = useState(0);
  const [allowException, setAllowException] = useState(false);
  const [showNarrativeError, setShowNarrativeError] = useState(false);

  // Incident trigger state
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentDeferred, setIncidentDeferred]   = useState(false);
  const [deferUsed, setDeferUsed]                 = useState(false);

  // Success state
  const [success, setSuccess] = useState<{ backdated: boolean } | null>(null);

  // Signature
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const drawingRef  = useRef(false);
  const hasSigRef   = useRef(false);

  const coachFn = useServerFn(evaluateShiftNote);
  const scanFn  = useServerFn(scanNoteForTriggers);

  const isBackdated = !!date;
  const logDate = date ?? new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (client) {
      setGoals([]);
      setNarrative("");
      setAiCoach(null);
      setAiIterations(0);
      setAiFlagCount(0);
      setAllowException(false);
      setShowNarrativeError(false);
      setScanResult(null);
      setShowIncidentModal(false);
      setIncidentDeferred(false);
      setDeferUsed(false);
      setSuccess(null);
      hasSigRef.current = false;
      setTimeout(() => clearCanvas(), 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, date]);

  const words = wordCount(narrative);
  const narrativeOk = words >= MIN_WORDS;
  const hasGoal = goals.length > 0;
  const canSubmit = hasGoal && narrativeOk && hasSigRef.current && !submitting && !aiBusy;

  function toggleGoal(g: string) {
    setGoals((p) => p.includes(g) ? p.filter((x) => x !== g) : [...p, g]);
    if (aiCoach) setAiCoach(null);
  }

  // ── Signature canvas ─────────────────────────────────────────────────────────
  function getCtx() { return canvasRef.current?.getContext("2d") ?? null; }
  function clearCanvas() {
    const c = canvasRef.current; const ctx = getCtx();
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2; ctx.lineCap = "round";
    hasSigRef.current = false;
  }
  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  }
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx(); if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = pointerPos(e); ctx.beginPath(); ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = getCtx(); if (!ctx) return;
    const { x, y } = pointerPos(e); ctx.lineTo(x, y); ctx.stroke();
    hasSigRef.current = true;
  }
  function onPointerUp() { drawingRef.current = false; }

  // ── Write to DB ──────────────────────────────────────────────────────────────
  async function writeLog(opts: {
    aiStatus: "Verified" | "Exception";
    aiFeedback: string;
    aiIterations: number;
    scanResult: ScanResult | null;
  }) {
    if (!user || !org || !client) return;
    const signature = canvasRef.current?.toDataURL("image/png") ?? null;
    const today = new Date().toISOString().split("T")[0];
    const backdated = logDate !== today;

    const payload = {
      organization_id:        org.organization_id,
      user_id:                user.id,
      client_id:              client.id,
      log_date:               logDate,
      pcsp_goals_addressed:   goals,
      narrative:              narrative.trim(),
      signature_data_url:     signature,
      status:                 "pending_approval",
      word_count:             words,
      backdated,
      original_due_date:      backdated ? logDate : null,
      submitted_late:         backdated,
      ai_compliance_status:   opts.aiStatus,
      ai_compliance_feedback: opts.aiFeedback,
      ai_coaching_iterations: opts.aiIterations,
      requires_followup_form: !!(opts.scanResult?.hasIncidentTrigger || opts.scanResult?.hasMedicalTrigger),
      followup_form_types: [
        ...(opts.scanResult?.hasIncidentTrigger ? ["incident_report"] : []),
        ...(opts.scanResult?.hasMedicalTrigger  ? ["medical_appointment"] : []),
        ...(opts.scanResult?.hasEmarTrigger     ? ["emar_exception"] : []),
      ],
      ai_trigger_reasons: opts.scanResult?.triggerTypes ?? [],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("daily_logs").insert(payload as any);
    if (error) throw error;

    qc.invalidateQueries({ queryKey: ["dl-submitted-dates"] });
    qc.invalidateQueries({ queryKey: ["dl-rejected"] });
    qc.invalidateQueries({ queryKey: ["daily-logs-admin"] });
    qc.invalidateQueries({ queryKey: ["cmd-logs-pending"] });

    setSuccess({ backdated });
  }

  // ── Submit flow ──────────────────────────────────────────────────────────────
  async function handleSubmit(opts?: { exception?: boolean }) {
    if (!client || !canSubmit) return;
    if (!hasGoal) { toast.error("Select at least one PCSP goal."); return; }
    if (!narrativeOk) { setShowNarrativeError(true); return; }

    const isException = !!opts?.exception;
    let verdict: CoachResult | null = aiCoach;
    let iters = aiIterations;

    // ── Quality coach pass ──────────────────────────────────────────────────
    if (!isException && (!verdict || verdict.status !== "Verified")) {
      setAiBusy(true);
      try {
        const clientFirst = client.first_name;
        const result = await coachFn({
          data: { narrative: narrative.trim(), goals, clientFirstName: clientFirst },
        });
        verdict = result;
        setAiCoach(result);
        iters += 1;
        setAiIterations(iters);

        if (result.status === "Flagged") {
          const next = aiFlagCount + 1;
          setAiFlagCount(next);
          if (next >= 2) setAllowException(true);
          setAiBusy(false);
          return;
        }
      } catch (e) {
        toast.error((e as Error).message || "NECTAR coach unavailable — please try again.");
        setAiBusy(false);
        return;
      }
      setAiBusy(false);
    }

    const aiStatus: "Verified" | "Exception" = isException ? "Exception" : "Verified";
    const aiFeedback = isException
      ? "🔴 Submitted with Exception Flag — NECTAR coaching not satisfied; pending admin review."
      : verdict?.feedback ?? "Verified by NECTAR Documentation Coach.";

    // ── Content scanner pass (runs after quality pass) ──────────────────────
    setAiBusy(true);
    let scan: ScanResult | null = null;
    try {
      scan = await scanFn({
        data: { narrative: narrative.trim(), clientFirstName: client.first_name },
      });
      setScanResult(scan);
    } catch {
      // Scanner failure is non-blocking — log continues
      scan = null;
    }
    setAiBusy(false);

    // ── Incident trigger gate ───────────────────────────────────────────────
    if (scan?.hasIncidentTrigger && !incidentDeferred) {
      setShowIncidentModal(true);
      // Store the finalized AI results so we can use them after modal
      return;
    }

    // ── Write to DB ─────────────────────────────────────────────────────────
    setSubmitting(true);
    try {
      await writeLog({ aiStatus, aiFeedback, aiIterations: iters, scanResult: scan });
    } catch (e) {
      toast.error((e as Error).message || "Could not submit log.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProceedAfterIncident() {
    setShowIncidentModal(false);
    if (!deferUsed) {
      setDeferUsed(true);
      setIncidentDeferred(true);
    }
    // Re-run submit with the deferred flag set
    setSubmitting(true);
    try {
      await writeLog({
        aiStatus: aiCoach?.status === "Verified" ? "Verified" : "Exception",
        aiFeedback: aiCoach?.feedback ?? "Verified by NECTAR Documentation Coach.",
        aiIterations: aiIterations,
        scanResult,
      });
    } catch (e) {
      toast.error((e as Error).message || "Could not submit log.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog open={!!client} onOpenChange={(o) => { if (!o && !submitting && !aiBusy) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => { if (submitting || aiBusy) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (submitting || aiBusy) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>
              {isBackdated ? "📅 Backdated Daily Log" : "Host Home Daily Compliance Journal"}
            </DialogTitle>
            <DialogDescription>
              {client
                ? `${client.first_name} ${client.last_name} — ${fmtDate(logDate)}${isBackdated ? " (backdated entry)" : ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {/* Success state */}
          {success ? (
            <div className="space-y-4 py-4">
              <div className={`rounded-xl p-5 text-center ${success.backdated ? "bg-blue-50 dark:bg-blue-950/30" : "bg-emerald-50 dark:bg-emerald-950/30"}`}>
                <CheckCircle2 className={`mx-auto mb-3 h-12 w-12 ${success.backdated ? "text-blue-500" : "text-emerald-500"}`} />
                <p className={`text-lg font-bold ${success.backdated ? "text-blue-700 dark:text-blue-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                  {success.backdated ? "📅 Backdated Log Submitted" : "✅ Daily Log Submitted"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {success.backdated
                    ? "Your backdated entry has been submitted and is pending admin review. The late submission has been disclosed transparently."
                    : "Your daily log has been submitted for administrative approval. Thank you for completing your documentation."}
                </p>
                {scanResult?.hasIncidentTrigger && (
                  <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    ⚠️ A Critical Event Report is required based on your note. Please complete it from the Forms section.
                  </div>
                )}
              </div>
              <Button className="w-full" onClick={onClose}>Close</Button>
            </div>
          ) : client ? (
            <div className="space-y-6">

              {/* Backdated notice */}
              {isBackdated && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-50 p-3 text-xs dark:bg-blue-950/30">
                  📅 <strong>Backdated entry</strong> — you are submitting a log for a past service date.
                  This will be transparently disclosed to your administrator with a "Backdated" label.
                  A late, complete note is always better than a missing one.
                </div>
              )}

              {/* PCSP goals */}
              <div>
                <Label className="mb-2 block text-sm font-medium">PCSP Goals Addressed Today</Label>
                {(client.pcsp_goals?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(client.pcsp_goals ?? []).map((g) => {
                      const on = goals.includes(g);
                      return (
                        <button key={g} type="button" onClick={() => toggleGoal(g)}
                          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-[0.97] ${
                            on
                              ? "border-teal-600 bg-teal-600 text-white shadow-sm hover:bg-teal-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-teal-950/40"
                          }`}>
                          {on ? "✓ " : ""}{g}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                    No PCSP goals on file. Add them in the Clients tab first.
                  </p>
                )}
              </div>

              {/* Narrative */}
              <div>
                <Label htmlFor="narrative" className="mb-2 block text-sm font-medium">
                  📝 Daily Summary Narrative
                </Label>
                <Textarea
                  id="narrative"
                  value={narrative}
                  onChange={(e) => {
                    setNarrative(e.target.value);
                    if (showNarrativeError) setShowNarrativeError(false);
                    if (aiCoach) setAiCoach(null);
                    setScanResult(null);
                  }}
                  placeholder="Describe today's care, activities, mood, meals, incidents, and goal progress in detail…"
                  rows={6}
                  className="resize-none"
                />
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className={narrativeOk ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                    {narrativeOk ? "✓ Minimum met" : `${Math.max(0, MIN_WORDS - words)} more words required`}
                  </span>
                  <span className="font-mono text-muted-foreground">{words} / {MIN_WORDS} words</span>
                </div>
                {showNarrativeError && !narrativeOk && (
                  <div className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                    ⚠️ Your narrative must be at least {MIN_WORDS} words to satisfy DSPD Medicaid documentation requirements.
                  </div>
                )}
              </div>

              {/* NECTAR Documentation Coach feedback */}
              {(aiBusy || aiCoach) && (
                <div className={`rounded-lg border-2 px-4 py-3 ${
                  aiCoach?.status === "Verified"
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-amber-500/40 bg-amber-500/10"
                }`}>
                  <div className="mb-1 flex items-center gap-2 text-sm font-bold">
                    💡 NECTAR Documentation Coach
                    {aiBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  {aiCoach && (
                    <p className={`text-xs leading-relaxed ${
                      aiCoach.status === "Verified"
                        ? "text-emerald-800 dark:text-emerald-200"
                        : "text-amber-900 dark:text-amber-100"
                    }`}>
                      {aiCoach.status === "Verified" ? "🟢 NECTAR CLEARED — " : "⚠️ "}
                      {aiCoach.feedback}
                    </p>
                  )}
                  {aiCoach?.status === "Flagged" && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Edit your narrative above based on the tip, then re-submit. Iteration {aiIterations}.
                    </p>
                  )}
                </div>
              )}

              {/* Signature */}
              <div>
                <Label className="mb-2 block text-sm font-medium">Caregiver Signature</Label>
                <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white p-1 shadow-inner dark:border-slate-700">
                  <canvas
                    ref={canvasRef} width={600} height={160}
                    onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
                    className="block w-full touch-none rounded-lg bg-white"
                    style={{ height: 160 }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Sign with your finger or mouse to attest this entry.</span>
                  <button type="button" onClick={clearCanvas}
                    className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-900 hover:underline dark:hover:text-slate-100">
                    <Eraser className="h-3 w-3" /> Clear
                  </button>
                </div>
              </div>

              {/* Submit buttons */}
              <div className="space-y-2">
                <div
                  onMouseEnter={() => { if (!narrativeOk) setShowNarrativeError(true); }}
                  onClick={() => { if (!narrativeOk) setShowNarrativeError(true); }}
                >
                  <Button onClick={() => handleSubmit()} disabled={!canSubmit}
                    className="h-12 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
                    {(submitting || aiBusy)
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {aiBusy ? "NECTAR reviewing your note…" : "Submitting…"}</>
                      : aiCoach?.status === "Flagged"
                      ? "🔁 Re-Check with NECTAR Coach"
                      : <><CheckCircle2 className="mr-2 h-4 w-4" /> Submit Daily Host Home Log</>}
                  </Button>
                </div>
                {allowException && aiCoach?.status === "Flagged" && (
                  <Button variant="outline" onClick={() => handleSubmit({ exception: true })}
                    disabled={submitting || aiBusy}
                    className="w-full border-rose-500/50 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300">
                    🚩 Submit with Exception Flag
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Incident trigger blocking modal */}
      <Dialog open={showIncidentModal} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <ShieldAlert className="h-5 w-5" /> Critical Event Report Required
            </DialogTitle>
            <DialogDescription>
              Based on your daily note, a Critical Event Report is required for{" "}
              <strong>{client?.first_name} {client?.last_name}</strong>.
            </DialogDescription>
          </DialogHeader>
          {scanResult?.triggerSummary && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p className="font-medium text-amber-800 dark:text-amber-200">Detected:</p>
              <p className="mt-1 text-amber-700 dark:text-amber-300">{scanResult.triggerSummary}</p>
            </div>
          )}
          {scanResult?.triggerTypes && scanResult.triggerTypes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {scanResult.triggerTypes.map((t) => (
                <Badge key={t} className="bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">{t}</Badge>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            State regulations require a Critical Event Report to be filed and submitted to the state
            database within 24 hours of the incident. Your administrator will be notified immediately.
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => {
                setShowIncidentModal(false);
                onClose();
                // Navigate to incident report form
                window.location.href = "/dashboard/hhs-hub/" + (client?.id ?? "");
              }}>
              🚨 File Critical Event Report Now
            </Button>
            {!deferUsed ? (
              <Button variant="outline" className="w-full"
                onClick={() => {
                  setShowIncidentModal(false);
                  setDeferUsed(true);
                  setIncidentDeferred(true);
                  // Proceed with log submission after 1-hour defer
                  handleProceedAfterIncident();
                }}>
                ⏱ Remind me in 1 hour — submit log now
              </Button>
            ) : (
              <Button variant="outline" className="w-full text-muted-foreground"
                onClick={handleProceedAfterIncident}>
                Submit log anyway (Critical Event Report still required)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN AUDIT QUEUE
// ─────────────────────────────────────────────────────────────────────────────

type AdminLog = {
  id: string;
  organization_id: string;
  user_id: string;
  client_id: string;
  log_date: string;
  pcsp_goals_addressed: string[];
  narrative: string;
  signature_data_url: string | null;
  submitted_at: string;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  denial_reason: string | null;
  backdated: boolean;
  submitted_late: boolean;
  ai_compliance_status: string | null;
  profiles: { full_name: string | null; email: string | null; agency_name: string | null } | null;
  clients: { first_name: string | null; last_name: string | null; medicaid_id: string | null } | null;
};

function AdminAuditQueue() {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [active, setActive] = useState<AdminLog | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  const { data: logs = [], isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["daily-logs-admin", org?.organization_id, filter],
    queryFn: async (): Promise<AdminLog[]> => {
      let query = supabase
        .from("daily_logs")
        .select(`id, organization_id, user_id, client_id, log_date, pcsp_goals_addressed,
          narrative, signature_data_url, submitted_at, status, approved_at, approved_by,
          denial_reason, backdated, submitted_late, ai_compliance_status,
          profiles:user_id (full_name, email, agency_name),
          clients:client_id (first_name, last_name, medicaid_id)`)
        .eq("organization_id", org!.organization_id)
        .order("log_date", { ascending: false })
        .order("submitted_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("status", filter === "pending" ? "pending_approval" : filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AdminLog[];
    },
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_logs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user!.id } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Daily log approved for billing.");
      qc.invalidateQueries({ queryKey: ["daily-logs-admin"] });
      setActive(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [denialReason, setDenialReason] = useState("");
  const denyMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from("daily_logs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: "rejected", denial_reason: reason, denied_by: user!.id, denied_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Log returned to caregiver for correction.");
      qc.invalidateQueries({ queryKey: ["daily-logs-admin"] });
      setActive(null);
      setDenialReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, AdminLog[]>();
    (logs ?? []).forEach((l) => {
      const key = l.log_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs]);

  const statusBadge = (l: AdminLog) => {
    if (l.status === "approved")
      return <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200">Approved</Badge>;
    if (l.status === "rejected")
      return <Badge className="bg-rose-100 text-rose-900 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-200">Returned</Badge>;
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-200">Pending</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileSignature className="h-6 w-6 text-muted-foreground" /> Host Home Daily Log Audit Queue
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily journals submitted by caregivers. Review, approve, or return for correction.
          </p>
        </div>
        <div className="flex gap-1.5">
          {(["all","pending","approved","rejected"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}>
              {f === "all" ? "All" : f === "pending" ? "Pending" : f === "approved" ? "Approved" : "Returned"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading audit queue…</Card>
      ) : !grouped.length ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          No daily logs in this category.
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, rows]) => (
            <Card key={date} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-2.5">
                <h3 className="text-sm font-semibold">
                  {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
                    weekday: "long", month: "long", day: "numeric", year: "numeric",
                  })}
                </h3>
                <span className="text-xs text-muted-foreground">{rows.length} log{rows.length === 1 ? "" : "s"}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Caregiver</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Goals</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} onClick={() => { setActive(r); setDenialReason(""); }}
                      className="cursor-pointer hover:bg-muted/40">
                      <TableCell className="font-medium">
                        {r.profiles?.full_name ?? r.profiles?.email ?? "—"}
                      </TableCell>
                      <TableCell>
                        {r.clients ? `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim() : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.pcsp_goals_addressed?.length ?? 0}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.submitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {r.backdated && <Badge className="bg-purple-100 text-purple-800 text-[10px] dark:bg-purple-500/15 dark:text-purple-200">Backdated</Badge>}
                          {r.submitted_late && !r.backdated && <Badge className="bg-blue-100 text-blue-800 text-[10px] dark:bg-blue-500/15 dark:text-blue-200">Late</Badge>}
                          {r.ai_compliance_status === "Exception" && <Badge className="bg-amber-100 text-amber-800 text-[10px]">NECTAR Exception</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{statusBadge(r)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ))}
        </div>
      )}

      {/* Detail sheet */}
      <Sheet open={!!active} onOpenChange={(o) => { if (!o) { setActive(null); setDenialReason(""); } }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Daily Host Home Log</SheetTitle>
            <SheetDescription>
              {active && `${active.profiles?.full_name ?? active.profiles?.email ?? "—"} · ${new Date(active.log_date + "T00:00:00").toLocaleDateString()}`}
            </SheetDescription>
          </SheetHeader>
          {active && (
            <div className="mt-5 space-y-5">
              {/* Client */}
              <Card className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Client</p>
                <p className="text-sm font-medium">
                  {active.clients ? `${active.clients.first_name ?? ""} ${active.clients.last_name ?? ""}`.trim() : "—"}
                </p>
                {active.clients?.medicaid_id && (
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">Medicaid {active.clients.medicaid_id}</p>
                )}
              </Card>

              {/* Flags */}
              {(active.backdated || active.submitted_late || active.ai_compliance_status === "Exception") && (
                <div className="space-y-2">
                  {active.backdated && (
                    <div className="rounded-lg border border-purple-500/30 bg-purple-50 p-3 text-xs dark:bg-purple-950/30">
                      📅 <strong>Backdated entry</strong> — submitted after the service date. Disclosed transparently.
                    </div>
                  )}
                  {active.submitted_late && !active.backdated && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-50 p-3 text-xs dark:bg-blue-950/30">
                      🕐 <strong>Late submission</strong> — submitted after the expected due date.
                    </div>
                  )}
                  {active.ai_compliance_status === "Exception" && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-xs dark:bg-amber-950/30">
                      ⚠️ <strong>NECTAR Exception Flag</strong> — NECTAR coaching was not satisfied before submission. Review narrative carefully.
                    </div>
                  )}
                </div>
              )}

              {/* Goals */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">PCSP Goals Addressed</p>
                <div className="flex flex-wrap gap-1.5">
                  {active.pcsp_goals_addressed?.length
                    ? active.pcsp_goals_addressed.map((g) => (
                        <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>
                      ))
                    : <span className="text-xs text-muted-foreground">None recorded</span>}
                </div>
              </div>

              {/* Narrative */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Narrative</p>
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm">{active.narrative}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Word count: {wordCount(active.narrative)}
                </p>
              </div>

              {/* Timestamp */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Submitted</p>
                <p className="font-mono text-xs">{new Date(active.submitted_at).toISOString()}</p>
              </div>

              {/* Signature */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Caregiver Signature</p>
                {active.signature_data_url ? (
                  <img src={active.signature_data_url} alt="Caregiver signature"
                    className="w-full rounded-lg border border-border bg-white" />
                ) : (
                  <p className="text-xs text-muted-foreground">No signature captured.</p>
                )}
              </div>

              {/* Denial reason on file */}
              {active.denial_reason && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-rose-600">Denial Reason on File</p>
                  <p className="rounded-lg border border-rose-500/30 bg-rose-50 p-3 text-sm dark:bg-rose-950/30">{active.denial_reason}</p>
                </div>
              )}

              {/* Approval status */}
              {active.status === "approved" ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <p className="font-medium">✅ Approved for billing</p>
                  {active.approved_at && (
                    <p className="mt-1 text-xs">{new Date(active.approved_at).toLocaleString()}</p>
                  )}
                </div>
              ) : active.status === "rejected" ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-rose-500/40 bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-500/10 dark:text-rose-200">
                    🔴 Returned to caregiver for correction.
                  </div>
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => approveMut.mutate(active.id)} disabled={approveMut.isPending}>
                    {approveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Approve Resubmission
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => approveMut.mutate(active.id)} disabled={approveMut.isPending}>
                    {approveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    ✅ Approve Log for Billing
                  </Button>
                  <div className="space-y-2">
                    <Label className="text-xs">Denial reason (required to return)</Label>
                    <Textarea rows={3} value={denialReason} onChange={(e) => setDenialReason(e.target.value)}
                      placeholder="Explain what needs to be corrected or added…" className="text-xs" />
                    <Button variant="outline" className="w-full border-rose-500/50 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                      onClick={() => denyMut.mutate({ id: active.id, reason: denialReason })}
                      disabled={denyMut.isPending || denialReason.trim().length < 5}>
                      {denyMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      🔴 Return to Caregiver for Correction
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
