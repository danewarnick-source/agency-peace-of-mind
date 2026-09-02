import { useMemo, useState, useRef, useEffect } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useMyAssignments, allowedCodesFor } from "@/hooks/use-my-assignments";
import { isDailyServiceCode } from "@/lib/service-billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, FileText, Pill, Calendar, CalendarRange, ClipboardList, AlertTriangle, Phone, Stethoscope, Box, Flame, Repeat, BookOpen, Eraser, CheckCircle2, Loader2,
} from "lucide-react";
import { HhsMonthlyAttendanceTab } from "@/components/workspace/hhs-monthly-attendance-tab";
import { HhsAttendanceCalendar } from "@/components/hhs/hhs-attendance-calendar";
import { HhsMarOverviewCalendar } from "@/components/hhs/hhs-mar-overview-calendar";

import { toast } from "sonner";
import { evaluateShiftNote } from "@/lib/ai-coach.functions";
import { saveDailyRecord, savePrnForm, saveIncidentReport } from "@/lib/hhs.functions";
import { denverYmd } from "@/lib/denver-date";
import { invalidateStaffCaseloadWork } from "@/lib/staff-caseload-cache";
import { useClientFeature } from "@/lib/client-features";
import { NoteTriggerPrompt } from "@/components/residential/note-trigger-prompt";
import { DailyNoteMedsBlock, type DailyNoteMedication } from "@/components/medications/daily-note-meds-block";
import { type PendingMedDose } from "@/components/medications/shift-med-due-check";
import { NectarShiftNoteDraft } from "@/components/nectar/nectar-shift-note-draft";
import { NectarCompletenessErrors } from "@/components/nectar/nectar-completeness-errors";
import { NECTAR_DRAFT_MIN_WORDS, countNoteWords } from "@/lib/nectar-note-gate";
import {
  type CompletenessItem,
  COMPLETENESS_PASS_FEEDBACK,
  localWordCountCheck,
} from "@/lib/nectar-completeness";

const hhsSearch = z.object({
  tab: z.string().optional(),
  open: z.string().optional(),
});
export const Route = createFileRoute("/dashboard/hhs-hub/$clientId")({
  head: () => ({ meta: [{ title: "Host Home Client Hub — Provider Interface" }] }),
  validateSearch: hhsSearch,
  component: HhsClientHubRoute,
});

interface ClientFull {
  id: string;
  first_name: string;
  last_name: string;
  pcsp_goals: string[] | null;
  physical_address: string | null;
  special_directions: string | null;
  profile_photo_url: string | null;
  geofence_radius_feet: number | null;
  authorized_dspd_codes: string[] | null;
  feature_config: Record<string, boolean> | null;
  allergies: string[] | null;
  dysphagia: boolean | null;
  swallowing_alerts: string[] | null;
}

function HhsClientHubRoute() {
  const { clientId } = Route.useParams();
  return <HhsClientHub clientId={clientId} />;
}

export function HhsClientHub({ clientId }: { clientId: string }) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const { tab: tabParam, open: openParam } = useSearch({ strict: false }) as {
    tab?: string;
    open?: string;
  };
  const navigate = useNavigate();


  const { data: client, isLoading } = useQuery({
    enabled: !!clientId,
    queryKey: ["hhs-client", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, pcsp_goals, physical_address, special_directions, profile_photo_url, geofence_radius_feet, authorized_dspd_codes, feature_config, allergies, dysphagia, swallowing_alerts" as any)
        .eq("id", clientId)
        .maybeSingle();
      return data as ClientFull | null;
    },
  });

  const { data: meds = [] } = useQuery({
    enabled: !!clientId,
    queryKey: ["hhs-meds", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_medications")
        .select("*")
        .eq("client_id", clientId)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: assignments } = useMyAssignments();
  const allowedCodes = useMemo(() => {
    if (!client) return [];
    const all = Array.isArray(client.authorized_dspd_codes) ? client.authorized_dspd_codes : [];
    return allowedCodesFor(assignments, client.id, all);
  }, [client, assignments]);
  const allowedDaily = useMemo(
    () => allowedCodes.filter(isDailyServiceCode),
    [allowedCodes],
  );

  useEffect(() => {
    if (!isLoading && client && assignments && !allowedDaily.length) {
      toast.error("You are not assigned to any daily services for this individual.");
      navigate({ to: "/dashboard" });
    }
  }, [isLoading, client, assignments, allowedDaily.length, navigate]);

  const { enabled: emarEnabled } = useClientFeature(client ?? null, "emar");

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!client || !orgId) return <p className="p-6 text-sm text-muted-foreground">Client unavailable.</p>;

  const fullName = `${client.first_name} ${client.last_name}`.trim();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 px-3 sm:px-0">
      {/* Compact back link — kept small so the safety card + tabs sit higher */}
      <Link
        to="/dashboard"
        className="inline-flex h-8 items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to caseload
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-base font-semibold">{fullName}</h1>
        <Badge className="bg-amber-500 text-[10px]">HHS</Badge>
      </div>

      {client.special_directions && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
              Special Directions & Clinical Alerts
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-xs text-amber-700 dark:text-amber-300">
              {client.special_directions}
            </p>
          </div>
        </div>
      )}

      <Tabs
        value={tabParam ?? "note"}
        onValueChange={(val) => navigate({ to: ".", search: { tab: val }, replace: true })}
      >
        <TabsList className={`grid h-auto w-full ${emarEnabled ? "grid-cols-5" : "grid-cols-4"} gap-1 p-1`}>
          <TabsTrigger value="note" className="h-11 text-[11px] sm:text-sm"><FileText className="mr-1 h-4 w-4" />Daily Note</TabsTrigger>
          {emarEnabled && (
            <TabsTrigger value="emar" className="h-11 text-[11px] sm:text-sm"><Pill className="mr-1 h-4 w-4" />MAR</TabsTrigger>
          )}
          <TabsTrigger value="att" className="h-11 text-[11px] sm:text-sm"><Calendar className="mr-1 h-4 w-4" />Attendance</TabsTrigger>
          <TabsTrigger value="month" className="h-11 text-[11px] sm:text-sm"><CalendarRange className="mr-1 h-4 w-4" />Monthly</TabsTrigger>
          <TabsTrigger value="prn" className="h-11 text-[11px] sm:text-sm"><ClipboardList className="mr-1 h-4 w-4" />PRN Forms</TabsTrigger>
        </TabsList>

        <TabsContent value="note" className="mt-3">
          <DailyNoteTab
            orgId={orgId}
            client={client}
            medications={(meds as DailyNoteMedication[]) ?? []}
          />
        </TabsContent>
        {emarEnabled && (
          <TabsContent value="emar" className="mt-3">
            <HhsMarOverviewCalendar orgId={orgId} clientId={client.id} />
          </TabsContent>
        )}
        <TabsContent value="att" className="mt-3">
          <HhsAttendanceCalendar orgId={orgId} clientId={client.id} />
        </TabsContent>
        <TabsContent value="month" className="mt-3">
          <HhsMonthlyAttendanceTab orgId={orgId} clientId={client.id} clientName={fullName} />
        </TabsContent>
        <TabsContent value="prn" className="mt-3">
          <PrnFormsTab
            orgId={orgId}
            clientId={client.id}
            initialKind={openParam === "incident" ? "incident" : null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ Daily Note + NECTAR submit completeness + interlock gates ============
const MEDICAL_RX = /\b(appointment|appt|doctor|dr\.|dentist|dental|clinic|specialist|checkup|check[- ]up|seen by|visited (?:the )?(?:doctor|md|clinic|hospital))\b/i;
const today = () => denverYmd();

function DailyNoteTab({
  orgId,
  client,
  medications,
}: {
  orgId: string;
  client: ClientFull;
  medications: DailyNoteMedication[];
}) {
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [completenessErrors, setCompletenessErrors] = useState<CompletenessItem[]>([]);
  const [interlock, setInterlock] = useState<{ kind: "incident" | "medical"; msg: string } | null>(null);
  const [showNarrativeError, setShowNarrativeError] = useState(false);
  // Nectar deterministic trigger gating — default true (no triggers fired).
  const [triggersResolved, setTriggersResolved] = useState(true);
  // Final attestation — "I attest this note accurately reflects today's support".
  const [finalAttest, setFinalAttest] = useState(false);
  const [medDosesResolved, setMedDosesResolved] = useState(true);
  const [pendingMedDoses, setPendingMedDoses] = useState<PendingMedDose[]>([]);
  const [nectarUsed, setNectarUsed] = useState(false);
  const [nectarAssistChecked, setNectarAssistChecked] = useState(false);
  const [recordDate, setRecordDate] = useState(() => denverYmd());
  const [incidentAnswer, setIncidentAnswer] = useState<"yes" | "no" | null>(null);

  // Signature canvas
  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasSigRef  = useRef(false);

  const qc = useQueryClient();
  const evalFn = useServerFn(evaluateShiftNote);
  const saveFn = useServerFn(saveDailyRecord);
  const pcsp   = client.pcsp_goals ?? [];

  const MIN_WORDS = NECTAR_DRAFT_MIN_WORDS;
  const words     = countNoteWords(note);
  const narrativeOk = words >= MIN_WORDS;
  const hasGoal     = goals.length > 0;

  useEffect(() => {
    setTimeout(() => clearCanvas(), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    return { x: ((e.clientX - rect.left) / rect.width) * c.width, y: ((e.clientY - rect.top) / rect.height) * c.height };
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

  const checkInterlocks = async (): Promise<boolean> => {
    if (MEDICAL_RX.test(note)) {
      const { count } = await supabase
        .from("hhs_medical_logs" as never)
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("appointment_at", `${recordDate}T00:00:00Z`);
      if (!count || count === 0) {
        setInterlock({ kind: "medical", msg: "Your note references a medical appointment. Complete the Medical Appointment Log in PRN Forms first." });
        return false;
      }
    }
    return true;
  };

  async function handleSubmit() {
    if (!hasGoal) { toast.error("Select at least one PCSP goal."); return; }
    if (!narrativeOk) {
      setShowNarrativeError(true);
      setCompletenessErrors([localWordCountCheck(note)]);
      return;
    }
    if (!triggersResolved) {
      toast.error("Resolve Nectar's note triggers before submitting.");
      return;
    }
    if (!finalAttest) {
      toast.error("Please attest the note accurately reflects today's support.");
      return;
    }
    if (nectarUsed && !nectarAssistChecked) {
      toast.error("You used NECTAR on this note — attest that you reviewed the draft.");
      return;
    }
    if (!medDosesResolved) {
      toast.error("Confirm medications on this daily note before submitting.");
      return;
    }
    if (!incidentAnswer) {
      toast.error("Answer whether any incidents required an incident report.");
      return;
    }
    if (!hasSigRef.current) { toast.error("Please sign the daily note before saving."); return; }

    let aiFeedback = COMPLETENESS_PASS_FEEDBACK;
    setAiBusy(true);
    try {
      const result = await evalFn({
        data: { narrative: note, goals, clientFirstName: client.first_name, serviceCode: "HHS" },
      });
      if (result.status !== "Verified") {
        setCompletenessErrors(result.checks.filter((c) => !c.passed));
        return;
      }
      setCompletenessErrors([]);
      aiFeedback = result.feedback || COMPLETENESS_PASS_FEEDBACK;
    } catch (e) {
      setCompletenessErrors([
        {
          key: "support_provided",
          passed: false,
          message: (e as Error).message || "NECTAR could not check this note. Tap Save Daily Note again.",
        },
      ]);
      return;
    } finally {
      setAiBusy(false);
    }

    const ok = await checkInterlocks();
    if (!ok) return;

    const signature = canvasRef.current?.toDataURL("image/png") ?? null;

    if (pendingMedDoses.length > 0) {
      try {
        const { logMedicationPass } = await import("@/lib/emar-pass.functions");
        for (const dose of pendingMedDoses) {
          await logMedicationPass({ data: dose });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Medication log failed: ${msg}`);
        return;
      }
    }

    try {
      const denverToday = denverYmd();
      await saveFn({
        data: {
          organizationId: orgId,
          clientId: client.id,
          recordDate,
          narrative: note,
          pcspGoalsAddressed: goals,
          aiStatus: "Verified",
          aiFeedback,
          signatureDataUrl: signature,
          backdated: recordDate < denverToday,
          originalDueDate: recordDate < denverToday ? recordDate : null,
          submittedLate: recordDate < denverToday,
          incidentRequired: incidentAnswer === "yes",
        },
      });
      toast.success("Daily progress note saved.");
      await invalidateStaffCaseloadWork(qc);
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error((e as Error).message || "Could not save note.");
    }
  }

  return (
    <Card data-tour="staff.daily-note">
      <CardHeader><CardTitle className="text-base">24-Hour Daily Progress Note</CardTitle></CardHeader>
      <CardContent className="space-y-4">

        <div>
          <Label htmlFor="hhs-note-date">Note date</Label>
          <Input
            id="hhs-note-date"
            type="date"
            value={recordDate}
            max={denverYmd()}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              setRecordDate(v);
            }}
            className="mt-1 h-12 w-full max-w-sm text-base"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Defaults to today in America/Denver. Saving writes this date.
          </p>
        </div>

        {/* PCSP Goals — phone-friendly tap rows (≥44px), full-width, easy to check */}
        <div>
          <Label>PCSP Goals Addressed Today</Label>
          <div className="mt-2 space-y-1.5">
            {pcsp.length === 0 && <p className="text-xs text-muted-foreground">No PCSP goals on file.</p>}
            {pcsp.map((g) => {
              const checked = goals.includes(g);
              return (
                <label
                  key={g}
                  className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                    checked
                      ? "border-accent/40 bg-accent/10"
                      : "border-border bg-card hover:bg-secondary/60"
                  }`}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    onCheckedChange={(c) => {
                      setGoals(c ? [...goals, g] : goals.filter((x) => x !== g));
                      if (completenessErrors.length) setCompletenessErrors([]);
                    }}
                  />
                  <span className="min-w-0 flex-1 leading-snug">{g}</span>
                </label>
              );
            })}
          </div>
        </div>


        {/* Narrative */}
        <div>
          <Label>Narrative Summary</Label>
          <Textarea
            rows={7}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (showNarrativeError) setShowNarrativeError(false);
              if (completenessErrors.length) setCompletenessErrors([]);
            }}
            placeholder="Describe support provided, behaviors observed, goal progress, ADLs, community activities…"
            className="mt-1"
          />
          <div className="mt-1.5 flex items-center justify-between text-xs">
            <span className={narrativeOk ? "text-emerald-600" : "text-amber-600"}>
              {narrativeOk ? `✓ Minimum met` : `${Math.max(0, MIN_WORDS - words)} more words required`}
            </span>
            <span className="font-mono text-muted-foreground">{words} / {MIN_WORDS} words</span>
          </div>
          {showNarrativeError && !narrativeOk && (
            <div className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              Your narrative must be at least {MIN_WORDS} words and describe how you supported the person.
            </div>
          )}
        </div>

        {/* Nectar deterministic trigger prompt — runs on-device, blocks submit. */}
        <NectarShiftNoteDraft
          narrative={note}
          goals={goals}
          clientFirstName={client.first_name}
          onApplyDraft={(draft) => {
            setNote(draft);
            if (completenessErrors.length) setCompletenessErrors([]);
          }}
          onUsed={() => setNectarUsed(true)}
        />
        <NectarCompletenessErrors checks={completenessErrors} />

        <NoteTriggerPrompt
          text={note}
          clientId={client.id}
          date={recordDate}
          incidentAttest={incidentAnswer}
          onOpenForm={(kind) => {
            navigate({
              to: ".",
              search: kind === "incident" ? { tab: "prn", open: "incident" } : { tab: "prn" },
              replace: true,
            });
          }}
          onAllResolved={setTriggersResolved}
        />

        {/* Signature */}
        <div>
          <Label>Caregiver Signature</Label>
          <div className="mt-1 overflow-hidden rounded-xl border-2 border-slate-300 bg-white p-1 shadow-inner dark:border-slate-700">
            <canvas
              ref={canvasRef} width={600} height={140}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove}
              onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
              className="block w-full touch-none rounded-lg bg-white"
              style={{ height: 140 }}
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

        {nectarUsed && (
          <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
            <Checkbox checked={nectarAssistChecked} onCheckedChange={(c) => setNectarAssistChecked(!!c)} />
            <span>I used NECTAR to help draft this note. I reviewed the draft and confirm it is accurate.</span>
          </label>
        )}

        {/* Final attestation — required, parity with punch-pad clock-out form. */}
        <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-xs">
          <Checkbox checked={finalAttest} onCheckedChange={(c) => setFinalAttest(!!c)} />
          <span>I attest this note and the time information on it are accurate.</span>
        </label>

        <div className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-semibold">Incidents</p>
          <p className="text-xs text-muted-foreground">
            Were there any incidents that required an incident report on this date?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={incidentAnswer === "no" ? "default" : "outline"}
              className="h-12"
              onClick={() => setIncidentAnswer("no")}
            >
              No
            </Button>
            <Button
              type="button"
              variant={incidentAnswer === "yes" ? "default" : "outline"}
              className="h-12"
              onClick={() => setIncidentAnswer("yes")}
            >
              Yes
            </Button>
          </div>
          {incidentAnswer === "no" ? (
            <p className="text-xs text-muted-foreground">
              No means you attest there were no incidents worthy of an incident report this day.
            </p>
          ) : null}
          {incidentAnswer === "yes" ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full"
              onClick={() =>
                navigate({ to: ".", search: { tab: "prn", open: "incident" }, replace: true })
              }
            >
              Open incident report form
            </Button>
          ) : null}
        </div>

        <DailyNoteMedsBlock
          clientId={client.id}
          clientName={client.first_name}
          medications={medications}
          recordDate={recordDate}
          onPendingDosesChange={setPendingMedDoses}
          onResolvedChange={setMedDosesResolved}
        />


        {/* Action buttons */}
        <div className="space-y-2"
          onMouseEnter={() => { if (!narrativeOk) setShowNarrativeError(true); }}
          onClick={() => { if (!narrativeOk) setShowNarrativeError(true); }}>
          <Button
            className="h-12 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            onClick={() => handleSubmit()}
            disabled={!hasGoal || !narrativeOk || aiBusy || !triggersResolved || !finalAttest || (nectarUsed && !nectarAssistChecked) || !medDosesResolved || !incidentAnswer}>
            {aiBusy
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking note…</>
              : <><CheckCircle2 className="mr-2 h-4 w-4" />Save Daily Note</>}
          </Button>
        </div>
      </CardContent>

      <Dialog open={!!interlock} onOpenChange={(o) => !o && setInterlock(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-amber-700">🚨 NECTAR Compliance Lock</DialogTitle></DialogHeader>
          <p className="text-sm">{interlock?.msg}</p>
          <DialogFooter>
            <Button onClick={() => {
              setInterlock(null);
              navigate({ to: ".", search: { tab: "prn" }, replace: true });
            }}>Go to PRN Forms</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


// ============ PRN Forms ============
type PrnKind = "medical" | "summary" | "inventory" | "drill" | "transfer" | "incident";

function PrnFormsTab({
  orgId,
  clientId,
  initialKind,
}: {
  orgId: string;
  clientId: string;
  initialKind?: PrnKind | null;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<PrnKind | null>(initialKind ?? null);
  useEffect(() => {
    if (initialKind) setOpen(initialKind);
  }, [initialKind]);
  const closeForm = () => {
    setOpen(null);
    navigate({ to: ".", search: { tab: "prn" }, replace: true });
  };
  const items: { kind: PrnKind; icon: React.ReactNode; title: string; desc: string }[] = [
    { kind: "medical", icon: <Stethoscope className="h-5 w-5" />, title: "🩺 Medical & Specialist Appointment Log", desc: "Record an appointment visit and orders." },
    { kind: "summary", icon: <BookOpen className="h-5 w-5" />, title: "📈 Comprehensive Monthly Review Summary", desc: "Monthly PCSP narrative and community outings." },
    { kind: "inventory", icon: <Box className="h-5 w-5" />, title: "💎 $50+ Valuables Inventory", desc: "Register or remove client high-value belongings." },
    { kind: "drill", icon: <Flame className="h-5 w-5" />, title: "🔥 Quarterly Evacuation Drill Record", desc: "Log fire / earthquake / weather drills." },
    { kind: "transfer", icon: <Repeat className="h-5 w-5" />, title: "🔄 Cross-Agency Transfer Log", desc: "Communication log to school, day program, respite." },
    { kind: "incident", icon: <AlertTriangle className="h-5 w-5 text-destructive" />, title: "🚨 Form C — Critical Incident Report", desc: "INTERNAL intake for admin review (NOT direct UPI)." },
  ];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">📋 PRN / As-Needed Forms</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.map((it) => (
          <button
            key={it.kind}
            onClick={() => setOpen(it.kind)}
            className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 transition"
          >
            <div className="mt-0.5">{it.icon}</div>
            <div className="flex-1">
              <div className="font-medium text-sm">{it.title}</div>
              <div className="text-xs text-muted-foreground">{it.desc}</div>
            </div>
          </button>
        ))}
      </CardContent>

      {open && open !== "incident" && (
        <PrnFormDialog kind={open} orgId={orgId} clientId={clientId} onClose={closeForm} />
      )}
      {open === "incident" && (
        <IncidentFormDialog orgId={orgId} clientId={clientId} onClose={closeForm} />
      )}
    </Card>
  );
}

function PrnFormDialog({ kind, orgId, clientId, onClose }: { kind: Exclude<PrnKind, "incident">; orgId: string; clientId: string; onClose: () => void }) {
  const fn = useServerFn(savePrnForm);
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      if (kind === "medical") {
        payload.appointment_at = new Date(form.appointment_at || new Date().toISOString()).toISOString();
        payload.facility_name = form.facility_name ?? "";
        payload.reason = form.reason ?? "";
        payload.orders_changes = form.orders_changes ?? null;
        payload.follow_up_date = form.follow_up_date || null;
      } else if (kind === "summary") {
        payload.target_month = (form.target_month || new Date().toISOString().slice(0, 7)) + "-01";
        payload.pcsp_progress_narrative = form.pcsp_progress_narrative ?? "";
        payload.community_outings = form.community_outings
          ? form.community_outings.split("\n").filter(Boolean).map((t) => ({ activity: t }))
          : [];
      } else if (kind === "inventory") {
        payload.asset_description = form.asset_description ?? "";
        payload.estimated_value = parseFloat(form.estimated_value || "0");
        payload.added_on = form.added_on || new Date().toISOString().slice(0, 10);
      } else if (kind === "drill") {
        payload.drill_executed_at = new Date(form.drill_executed_at || new Date().toISOString()).toISOString();
        payload.simulation_type = form.simulation_type || "Fire";
        payload.evacuation_duration_seconds = parseInt(form.evacuation_duration_seconds || "0", 10);
      } else if (kind === "transfer") {
        payload.receiving_party = form.receiving_party ?? "";
        payload.party_type = form.party_type || "School";
        payload.communication_summary = form.communication_summary ?? "";
      }
      return fn({ data: { kind, organizationId: orgId, clientId, payload } });
    },
    onSuccess: () => {
      toast.success("Form saved.");
      qc.invalidateQueries({ queryKey: ["hhs-prn"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="capitalize">{kind} form</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {kind === "medical" && (
            <>
              <div><Label>Appointment Date/Time</Label><Input type="datetime-local" onChange={(e) => set("appointment_at", e.target.value)} /></div>
              <div><Label>Provider / Facility</Label><Input onChange={(e) => set("facility_name", e.target.value)} /></div>
              <div><Label>Reason for Visit</Label><Input onChange={(e) => set("reason", e.target.value)} /></div>
              <div><Label>Physician Orders / Care Plan Changes</Label><Textarea rows={3} onChange={(e) => set("orders_changes", e.target.value)} /></div>
              <div><Label>Follow-up Date</Label><Input type="date" onChange={(e) => set("follow_up_date", e.target.value)} /></div>
            </>
          )}
          {kind === "summary" && (
            <>
              <div><Label>Target Month</Label><Input type="month" onChange={(e) => set("target_month", e.target.value)} /></div>
              <div><Label>PCSP Progress Narrative</Label><Textarea rows={5} onChange={(e) => set("pcsp_progress_narrative", e.target.value)} /></div>
              <div><Label>Community Outings (one per line)</Label><Textarea rows={3} onChange={(e) => set("community_outings", e.target.value)} /></div>
            </>
          )}
          {kind === "inventory" && (
            <>
              <div><Label>Asset Description</Label><Input onChange={(e) => set("asset_description", e.target.value)} /></div>
              <div><Label>Estimated Value (USD)</Label><Input type="number" step="0.01" onChange={(e) => set("estimated_value", e.target.value)} /></div>
              <div><Label>Date Added</Label><Input type="date" onChange={(e) => set("added_on", e.target.value)} /></div>
            </>
          )}
          {kind === "drill" && (
            <>
              <div><Label>Drill Date/Time</Label><Input type="datetime-local" onChange={(e) => set("drill_executed_at", e.target.value)} /></div>
              <div>
                <Label>Simulation Type</Label>
                <Select onValueChange={(v) => set("simulation_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fire">Fire</SelectItem>
                    <SelectItem value="Earthquake">Earthquake</SelectItem>
                    <SelectItem value="Severe Weather">Severe Weather</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Total Evacuation Duration (seconds)</Label><Input type="number" onChange={(e) => set("evacuation_duration_seconds", e.target.value)} /></div>
            </>
          )}
          {kind === "transfer" && (
            <>
              <div><Label>Receiving Party Name</Label><Input onChange={(e) => set("receiving_party", e.target.value)} /></div>
              <div>
                <Label>Party Type</Label>
                <Select onValueChange={(v) => set("party_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="School">School</SelectItem>
                    <SelectItem value="Day Program">Day Program</SelectItem>
                    <SelectItem value="Respite">Respite</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Communication Summary</Label><Textarea rows={4} onChange={(e) => set("communication_summary", e.target.value)} /></div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncidentFormDialog({ orgId, clientId, onClose }: { orgId: string; clientId: string; onClose: () => void }) {
  const fn = useServerFn(saveIncidentReport);
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("12:00");
  const [address, setAddress] = useState("");
  const [individuals, setIndividuals] = useState<string[]>([]);
  const [individualDraft, setIndividualDraft] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [otherType, setOtherType] = useState("");
  const [guardianYes, setGuardianYes] = useState<"yes" | "no" | null>(null);
  const [desc, setDesc] = useState("");
  const [before, setBefore] = useState("");
  const [during, setDuring] = useState("");
  const [after, setAfter] = useState("");
  const [protective, setProtective] = useState("");
  const [method, setMethod] = useState("Telephone");
  const [contactAt, setContactAt] = useState("");
  const [response, setResponse] = useState("");

  const trigger = cats.some((c) => ["Abuse", "Neglect", "Exploitation", "Maltreatment"].includes(c));
  const includesOther = cats.includes("Other");

  const addIndividual = () => {
    const v = individualDraft.trim();
    if (!v) return;
    setIndividuals((arr) => [...arr, v]);
    setIndividualDraft("");
  };

  const mut = useMutation({
    mutationFn: async () => {
      const occurredAt = new Date(`${date}T${time}:00`).toISOString();
      return fn({
        data: {
          organizationId: orgId,
          clientId,
          occurredAt,
          incidentAddress: address || null,
          individualsInvolved: individuals,
          incidentCategories: cats,
          incidentTypeOther: includesOther ? otherType : null,
          description: desc,
          narrativeBefore: before || null,
          narrativeDuring: during || null,
          narrativeAfter: after || null,
          guardianNotified: guardianYes === null ? null : guardianYes === "yes",
          guardianContactMethod: method,
          guardianContactAt: contactAt ? new Date(contactAt).toISOString() : null,
          guardianResponse: response,
          protectiveActions: trigger ? protective : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Incident filed for admin review.");
      qc.invalidateQueries({ queryKey: ["hhs-med-error-incidents"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const categories = ["Injury", "Behavior Crisis", "Property Damage", "Medical Emergency", "Medication Error", "Abuse", "Neglect", "Exploitation", "Maltreatment", "Other"];
  const blockSubmit =
    mut.isPending ||
    !desc ||
    cats.length === 0 ||
    guardianYes === null ||
    (includesOther && !otherType.trim()) ||
    (trigger && !protective);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">🚨 Form C — Critical Incident Report</DialogTitle>
          <p className="text-xs text-amber-700">INTERNAL ASSISTANCE INTAKE for administration review. NOT a direct UPI state submission.</p>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Date of Incident</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Time (military)</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          <div><Label>Address of Incident</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Physical location of event" /></div>

          <div>
            <Label>Individuals Involved</Label>
            <div className="flex gap-2 mt-1">
              <Input value={individualDraft} onChange={(e) => setIndividualDraft(e.target.value)} placeholder="Add name…" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addIndividual())} />
              <Button type="button" size="sm" onClick={addIndividual}>Add</Button>
            </div>
            {individuals.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {individuals.map((n, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => setIndividuals((arr) => arr.filter((_, idx) => idx !== i))}>
                    {n} ✕
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Incident Type</Label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {categories.map((c) => (
                <label key={c} className="flex items-center gap-1 text-xs">
                  <Checkbox checked={cats.includes(c)} onCheckedChange={(v) => setCats(v ? [...cats, c] : cats.filter((x) => x !== c))} />
                  {c}
                </label>
              ))}
            </div>
            {includesOther && (
              <div className="mt-2">
                <Label>Specify Incident Type Classification *</Label>
                <Input value={otherType} onChange={(e) => setOtherType(e.target.value)} />
              </div>
            )}
          </div>

          <div className="rounded border bg-muted/30 p-3 space-y-2">
            <Label>Was the client's parent/legal guardian successfully notified of this event? *</Label>
            <RadioGroup value={guardianYes ?? ""} onValueChange={(v) => setGuardianYes(v as "yes" | "no")} className="flex gap-4">
              <label className="flex items-center gap-1 text-sm"><RadioGroupItem value="yes" /> Yes</label>
              <label className="flex items-center gap-1 text-sm"><RadioGroupItem value="no" /> No</label>
            </RadioGroup>
          </div>

          <div>
            <Label>Brief Incident Description</Label>
            <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div>
              <Label>🔍 1. What was happening BEFORE the incident? (Preceding triggers or environmental context)</Label>
              <Textarea rows={3} value={before} onChange={(e) => setBefore(e.target.value)} />
            </div>
            <div>
              <Label>⚠️ 2. What occurred DURING the incident? (Factual, objective sequence of events)</Label>
              <Textarea rows={3} value={during} onChange={(e) => setDuring(e.target.value)} />
            </div>
            <div>
              <Label>🩹 3. What steps were taken AFTER the incident? (First aid, behavioral interventions, de-escalation, immediate resolution status)</Label>
              <Textarea rows={3} value={after} onChange={(e) => setAfter(e.target.value)} />
            </div>
          </div>

          {trigger && (
            <div className="rounded border border-red-400 bg-red-50 dark:bg-red-950/30 p-3">
              <Label className="text-red-700">⚠️ Immediate Protective Actions Taken to Keep Client Safe *</Label>
              <Textarea rows={3} value={protective} onChange={(e) => setProtective(e.target.value)} />
            </div>
          )}

          <div className="rounded border bg-muted/30 p-3 space-y-2">
            <div className="text-sm font-semibold flex items-center gap-1"><Phone className="h-4 w-4" />Guardian Notification Details</div>
            <div>
              <Label>Contact Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Telephone">Telephone</SelectItem>
                  <SelectItem value="Email">Email</SelectItem>
                  <SelectItem value="Face-to-Face">Face-to-Face</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Contact Date/Time</Label><Input type="datetime-local" value={contactAt} onChange={(e) => setContactAt(e.target.value)} /></div>
            <div><Label>Guardian Response Summary</Label><Textarea rows={2} value={response} onChange={(e) => setResponse(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={blockSubmit}>Submit for Admin Review</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
