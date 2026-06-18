import { useMemo, useState, useRef, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { MarEmarTab } from "@/components/workspace/mar-emar-tab";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
  ArrowLeft, FileText, Pill, Calendar, CalendarRange, ClipboardList, AlertTriangle, Phone, Stethoscope, Box, Flame, Repeat, BookOpen, Eraser, CheckCircle2, Loader2, Home,
} from "lucide-react";
import { HhsMonthlyAttendanceTab } from "@/components/workspace/hhs-monthly-attendance-tab";

import { toast } from "sonner";
import { evaluateShiftNote } from "@/lib/ai-coach.functions";
import { saveDailyRecord, setAttendance, savePrnForm, saveIncidentReport, listAttendance } from "@/lib/hhs.functions";
import { useClientFeature } from "@/lib/client-features";
import { NoteTriggerPrompt } from "@/components/residential/note-trigger-prompt";
import {
  ShiftMedAttestation,
  emptyMedAttestation,
  type MedAttestationValue,
} from "@/components/medications/shift-med-attestation";

const hhsSearch = z.object({ tab: z.string().optional() });
export const Route = createFileRoute("/dashboard/hhs-hub/$clientId")({
  head: () => ({ meta: [{ title: "Host Home Client Hub — HIVE" }] }),
  validateSearch: hhsSearch,
  component: HhsClientHub,
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
}

function HhsClientHub() {
  const { clientId } = Route.useParams();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const { tab: tabParam } = Route.useSearch();
  const navigate = useNavigate();


  const { data: client, isLoading } = useQuery({
    enabled: !!clientId,
    queryKey: ["hhs-client", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, pcsp_goals, physical_address, special_directions, profile_photo_url, geofence_radius_feet, authorized_dspd_codes, feature_config" as any)
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

      {/* CLINICAL PROFILE — sticky safety strip. Always visible while the host
          scrolls through documentation tabs (med pass, daily note, etc). */}
      <div className="sticky top-0 z-20 -mx-3 sm:mx-0">
        <Card className="rounded-none border-x-0 border-red-300 bg-red-50/95 backdrop-blur-sm shadow-sm sm:rounded-xl sm:border-x dark:bg-red-950/40">
          <CardContent className="space-y-1.5 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <Stethoscope className="h-4 w-4 text-red-700" />
                Clinical Profile · {fullName}
              </span>
              <Badge className="bg-amber-500 text-[10px]">HHS</Badge>
            </div>
            <div className="leading-snug">
              <strong>Medical Concerns / Allergies:</strong> See client chart — re-verify before any med pass.
            </div>
            <div className="leading-snug text-amber-800 dark:text-amber-200">
              <AlertTriangle className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
              <strong>Choking / Swallow Reflex:</strong> Confirm upright posture and crushed-med policy per care plan.
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[11px]"
                onClick={() =>
                  navigate({
                    to: "/dashboard/clients/$clientId",
                    params: { clientId },
                    search: { tab: "documents" },
                  })
                }
              >
                <FileText className="mr-1 h-3.5 w-3.5" /> Emergency Med Auth
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[11px]"
                onClick={() =>
                  navigate({
                    to: "/dashboard/clients/$clientId",
                    params: { clientId },
                    search: { tab: "documents" },
                  })
                }
              >
                <FileText className="mr-1 h-3.5 w-3.5" /> Advanced Directives
              </Button>
            </div>
          </CardContent>
        </Card>
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
          <DailyNoteTab orgId={orgId} client={client} />
        </TabsContent>
        {emarEnabled && (
          <TabsContent value="emar" className="mt-3">
            <MarEmarTab
              clientId={client.id}
              clientName={`${client.first_name} ${client.last_name}`}
            />
          </TabsContent>
        )}
        <TabsContent value="att" className="mt-3">
          <AttendanceTab orgId={orgId} clientId={client.id} />
        </TabsContent>
        <TabsContent value="month" className="mt-3">
          <HhsMonthlyAttendanceTab orgId={orgId} clientId={client.id} clientName={fullName} />
        </TabsContent>
        <TabsContent value="prn" className="mt-3">
          <PrnFormsTab orgId={orgId} clientId={client.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ Daily Note + NECTAR Coach + AI Interlock Gates ============
const INCIDENT_RX = /\b(fell|fall|fainted|seizure|injur(y|ed|ies)|bleed|blood|hospital|ER|emergency|crisis|aggress|hit\s+(?:them|him|her)|self[- ]harm|elop(e|ed|ement)|abuse|neglect)\b/i;
const MEDICAL_RX = /\b(appointment|appt|doctor|dr\.|dentist|dental|clinic|specialist|checkup|check[- ]up|seen by|visited (?:the )?(?:doctor|md|clinic|hospital))\b/i;
const today = () => new Date().toISOString().slice(0, 10);

function DailyNoteTab({ orgId, client }: { orgId: string; client: ClientFull }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [coach, setCoach] = useState<{ status: string; feedback: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiFlagCount, setAiFlagCount] = useState(0);
  const [aiIterations, setAiIterations] = useState(0);
  const [allowException, setAllowException] = useState(false);
  const [interlock, setInterlock] = useState<{ kind: "incident" | "medical"; msg: string } | null>(null);
  const [showNarrativeError, setShowNarrativeError] = useState(false);
  const [success, setSuccess] = useState(false);
  // Nectar deterministic trigger gating — default true (no triggers fired).
  const [triggersResolved, setTriggersResolved] = useState(true);
  // Final attestation — "I attest this note accurately reflects today's support".
  const [finalAttest, setFinalAttest] = useState(false);
  const [medAttestation, setMedAttestation] = useState<MedAttestationValue>(emptyMedAttestation);

  // Shift window for the daily-note attestation = the local calendar day.
  const dayWindow = useMemo(() => {
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(s); e.setDate(e.getDate() + 1);
    return { start: s.toISOString(), end: e.toISOString() };
  }, []);

  // Signature canvas
  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasSigRef  = useRef(false);

  const evalFn = useServerFn(evaluateShiftNote);
  const saveFn = useServerFn(saveDailyRecord);
  const pcsp   = client.pcsp_goals ?? [];

  const MIN_WORDS = 50;
  const words     = note.trim().split(/\s+/).filter(Boolean).length;
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
    const t = today();
    if (INCIDENT_RX.test(note)) {
      const { count } = await supabase
        .from("hhs_incident_reports" as never)
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("occurred_at", `${t}T00:00:00Z`);
      if (!count || count === 0) {
        setInterlock({ kind: "incident", msg: "⚠️ NECTAR Compliance Lock: Your daily summary describes a critical event or injury. State regulations mandate an incident intake log. Please complete the Incident Report in the PRN Forms tab before saving." });
        return false;
      }
    }
    if (MEDICAL_RX.test(note)) {
      const { count } = await supabase
        .from("hhs_medical_logs" as never)
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("appointment_at", `${t}T00:00:00Z`);
      if (!count || count === 0) {
        setInterlock({ kind: "medical", msg: "⚠️ NECTAR Compliance Lock: Your note references a medical appointment. Please complete the Medical Appointment Log in the PRN Forms tab first." });
        return false;
      }
    }
    return true;
  };

  async function handleSubmit(opts?: { exception?: boolean }) {
    if (!hasGoal) { toast.error("Select at least one PCSP goal."); return; }
    if (!narrativeOk) { setShowNarrativeError(true); return; }
    if (!triggersResolved) {
      toast.error("Resolve Nectar's note triggers before submitting.");
      return;
    }
    if (!finalAttest) {
      toast.error("Please attest the note accurately reflects today's support.");
      return;
    }
    if (!medAttestation.resolved) {
      toast.error("Complete the medication observation attestation before saving.");
      return;
    }
    if (!hasSigRef.current) { toast.error("Please sign the daily note before saving."); return; }


    const isException = !!opts?.exception;
    let verdict = coach;
    let iters   = aiIterations;

    if (!isException && (!verdict || verdict.status !== "Verified")) {
      setAiBusy(true);
      try {
        const result = await evalFn({ data: { narrative: note, goals, clientFirstName: client.first_name } });
        verdict = result; setCoach(result);
        iters += 1; setAiIterations(iters);
        if (result.status === "Flagged") {
          const next = aiFlagCount + 1; setAiFlagCount(next);
          if (next >= 2) setAllowException(true);
          setAiBusy(false); return;
        }
      } catch (e) {
        toast.error((e as Error).message || "NECTAR coach unavailable."); setAiBusy(false); return;
      }
      setAiBusy(false);
    }

    const ok = await checkInterlocks();
    if (!ok) return;

    const signature = canvasRef.current?.toDataURL("image/png") ?? null;

    try {
      await saveFn({
        data: {
          organizationId: orgId,
          clientId: client.id,
          recordDate: today(),
          narrative: note,
          pcspGoalsAddressed: goals,
          aiStatus: isException ? "Exception" : (verdict?.status ?? null),
          aiFeedback: isException
            ? "🔴 Submitted with Exception Flag — pending admin review."
            : (verdict?.feedback ?? null),
          signatureDataUrl: signature,
        },
      });
      // Persist the medication observation attestation (non-blocking).
      if (medAttestation.observed !== null && medAttestation.signatureDataUrl) {
        const { error: medErr } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("shift_medication_attestations" as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({
            organization_id: orgId,
            client_id: client.id,
            staff_id: user?.id,
            shift_id: null,
            hhs_daily_record_id: null,
            observed: medAttestation.observed,
            reason: medAttestation.observed === false ? medAttestation.reason.trim() : null,
            signature_data_url: medAttestation.signatureDataUrl,
            shift_window_start: dayWindow.start,
            shift_window_end: dayWindow.end,
          } as any);
        if (medErr && !/relation .* does not exist|schema cache/i.test(medErr.message)) {
          toast.error(`Medication attestation not saved: ${medErr.message}`);
        }
      }
      setSuccess(true);
      toast.success("Daily progress note saved.");
      setNote(""); setGoals([]); setCoach(null); setAiIterations(0);
      setAiFlagCount(0); setAllowException(false); setShowNarrativeError(false);
      setMedAttestation(emptyMedAttestation);
      hasSigRef.current = false; clearCanvas();
    } catch (e) {
      toast.error((e as Error).message || "Could not save note.");
    }
  }

  if (success) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">✅ Daily Note Submitted</p>
          <p className="text-sm text-muted-foreground">Your progress note and signature have been saved and submitted for administrative approval.</p>
          <Button onClick={() => setSuccess(false)}>Submit Another Note</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">📝 24-Hour Daily Progress Note</CardTitle></CardHeader>
      <CardContent className="space-y-4">

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
                      if (coach) setCoach(null);
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
              if (coach) setCoach(null);
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
              ⚠️ Your narrative must be at least {MIN_WORDS} words to meet DSPD Medicaid documentation requirements.
            </div>
          )}
        </div>

        {/* Nectar deterministic trigger prompt — runs on-device, blocks submit. */}
        <NoteTriggerPrompt
          text={note}
          clientId={client.id}
          date={today()}
          onOpenForm={(kind) => {
            navigate({
              to: ".",
              search: { tab: kind === "incident" ? "incident" : "prn" },
              replace: true,
            });
          }}
          onAllResolved={setTriggersResolved}
        />

        {/* NECTAR Coach */}
        {(aiBusy || coach) && (
          <div className={`rounded-lg border-2 px-4 py-3 ${coach?.status === "Verified" ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
            <div className="mb-1 flex items-center gap-2 text-sm font-bold">
              💡 NECTAR Documentation Coach
              {aiBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            {coach && (
              <p className={`text-xs leading-relaxed ${coach.status === "Verified" ? "text-emerald-800 dark:text-emerald-200" : "text-amber-900 dark:text-amber-100"}`}>
                {coach.status === "Verified" ? "🟢 NECTAR CLEARED — " : "⚠️ "}{coach.feedback}
              </p>
            )}
            {coach?.status === "Flagged" && (
              <p className="mt-1 text-[11px] text-muted-foreground">Edit your narrative and re-submit. Iteration {aiIterations}.</p>
            )}
          </div>
        )}

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

        {/* Final attestation — required, parity with punch-pad clock-out form. */}
        <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-xs">
          <Checkbox checked={finalAttest} onCheckedChange={(c) => setFinalAttest(!!c)} />
          <span>I attest this note accurately reflects today's support.</span>
        </label>

        {/* Medication observation attestation — blocks save if active meds exist */}
        <ShiftMedAttestation
          organizationId={orgId}
          clientId={client.id}
          clientName={client.first_name}
          windowStart={dayWindow.start}
          windowEnd={dayWindow.end}
          emarHref={`/dashboard/hhs-hub/${client.id}?tab=mar`}
          value={medAttestation}
          onChange={setMedAttestation}
        />

        {/* Action buttons */}
        <div className="space-y-2"
          onMouseEnter={() => { if (!narrativeOk) setShowNarrativeError(true); }}
          onClick={() => { if (!narrativeOk) setShowNarrativeError(true); }}>
          <Button
            className="h-12 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            onClick={() => handleSubmit()}
            disabled={!hasGoal || !narrativeOk || aiBusy || !triggersResolved || !finalAttest}>
            {aiBusy
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />NECTAR reviewing your note…</>
              : coach?.status === "Flagged"
              ? "🔁 Re-Check with NECTAR Coach"
              : <><CheckCircle2 className="mr-2 h-4 w-4" />Save Daily Note</>}
          </Button>
          {allowException && coach?.status === "Flagged" && (
            <Button variant="outline" className="w-full border-rose-500/50 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
              onClick={() => handleSubmit({ exception: true })} disabled={aiBusy}>
              🚩 Submit with Exception Flag
            </Button>
          )}
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


// ============ Attendance — 31-day grid + court-proof attestation ============
function AttendanceTab({ orgId, clientId }: { orgId: string; clientId: string }) {
  const { user } = useAuth();
  const fn = useServerFn(setAttendance);
  const listFn = useServerFn(listAttendance);
  const qc = useQueryClient();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDay = now.getDate();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const { data: rows = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["hhs-att-month", orgId, clientId, fmt(monthStart)],
    queryFn: () => listFn({ data: { organizationId: orgId, monthStart: fmt(monthStart), monthEnd: fmt(monthEnd) } }),
  });
  const byDate = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    (rows as Array<Record<string, unknown>>)
      .filter((r) => String(r.client_id) === clientId)
      .forEach((r) => m.set(String(r.record_date), r));
    return m;
  }, [rows, clientId]);

  const [selected, setSelected] = useState<number | null>(todayDay);
  const [action, setAction] = useState<"Present" | "Away" | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [initials, setInitials] = useState("");
  const [awayCategory, setAwayCategory] = useState<"Hospitalization" | "Family Leave" | "Unapproved Absence">("Hospitalization");

  const fullName = (user?.user_metadata?.full_name ?? user?.email ?? "").toString().trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const expectedInitials = (parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "");
  const initialsValid = initials.trim().toUpperCase() === expectedInitials.toUpperCase() && expectedInitials.length === 2;

  const selectedDate = selected ? new Date(year, month, selected) : null;
  const isToday = selected === todayDay;
  const isFuture = !!selected && selected > todayDay;

  const mut = useMutation({
    mutationFn: async () => {
      if (!selectedDate || !action) throw new Error("Pick a date and an action.");
      return fn({
        data: {
          organizationId: orgId,
          clientId,
          recordDate: fmt(selectedDate),
          presenceStatus: action,
          awayReason: action === "Away" ? awayCategory : null,
          awayCategory: action === "Away" ? awayCategory : null,
          staffInitials: action === "Present" ? initials.trim().toUpperCase() : null,
          attestationAccepted: action === "Present" ? agreed : false,
        },
      });
    },
    onSuccess: () => {
      toast.success("Attendance recorded with court-admissible audit trail.");
      setAction(null); setAgreed(false); setInitials("");
      qc.invalidateQueries({ queryKey: ["hhs-att-month"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">📅 {now.toLocaleString(undefined, { month: "long", year: "numeric" })} — Court-Proof Attendance</CardTitle>
        <p className="text-xs text-muted-foreground">Tap a date tile. Future dates are locked. Light-green = signed present; amber = away.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-7 gap-1.5">
          {["S","M","T","W","T","F","S"].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-medium text-muted-foreground">{d}</div>
          ))}
          {Array.from({ length: monthStart.getDay() }).map((_, i) => <div key={`pad-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const rec = byDate.get(fmt(new Date(year, month, day)));
            const status = rec ? String(rec.presence_status) : null;
            const initialsStamp = rec ? String((rec as Record<string, unknown>).staff_initials_signature ?? "") : "";
            const future = day > todayDay;
            const isSel = selected === day;
            const cls = future
              ? "bg-muted/40 text-muted-foreground/40 cursor-not-allowed"
              : status === "Present"
                ? "bg-green-200 dark:bg-green-900/40 text-green-900 dark:text-green-100 border-green-400"
                : status === "Away"
                  ? "bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border-amber-400"
                  : "bg-background hover:bg-muted";
            return (
              <button
                key={day}
                disabled={future}
                onClick={() => { setSelected(day); setAction(null); setAgreed(false); setInitials(""); }}
                className={`relative h-12 rounded border text-xs font-medium transition ${cls} ${isSel ? "ring-2 ring-primary" : ""}`}
                title={status ? `Day ${day}: ${status}${initialsStamp ? ` (${initialsStamp})` : ""}` : `Day ${day}`}
              >
                <div>{day}</div>
                {status === "Present" && initialsStamp && (
                  <div className="absolute bottom-0.5 right-1 text-[9px] font-bold">{initialsStamp}</div>
                )}
                {status === "Present" && <div className="absolute top-0.5 left-1 text-[9px]">✓</div>}
                {status === "Away" && <div className="absolute top-0.5 left-1 text-[9px]">AWAY</div>}
              </button>
            );
          })}
        </div>

        {selected && !isFuture && (
          <div className="rounded-lg border-2 border-dashed p-4 space-y-3">
            <div className="font-semibold text-sm">
              ✍️ Daily Attendance & Billing Verification — {selectedDate?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              {!isToday && <Badge variant="outline" className="ml-2">backfill</Badge>}
            </div>
            <RadioGroup value={action ?? ""} onValueChange={(v) => setAction(v as "Present" | "Away")} className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="Present" /> 🟢 Client Present Overnight (billable)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="Away" /> 🟡 Client Away / Leave (unbillable)
              </label>
            </RadioGroup>

            {action === "Present" && (
              <div className="space-y-2 rounded border border-red-300 bg-red-50/40 dark:bg-red-950/20 p-3">
                <p className="text-xs leading-relaxed">
                  <strong>⚠️ LEGAL ATTESTATION:</strong> I hereby certify and formally attest under penalty of Medicaid fraud and perjury that the information recorded for this calendar date is true, accurate, and complete. I verify that the client slept overnight under my direct supervision in a certified Host Home setting, and I understand that falsification of this billing data is subject to state and federal criminal prosecution.
                </p>
                <label className="flex items-start gap-2 text-xs">
                  <Checkbox checked={agreed} onCheckedChange={(c) => setAgreed(!!c)} />
                  <span>I have read and agree to this legal attestation statement.</span>
                </label>
                <div>
                  <Label className="text-xs">Type your initials ({expectedInitials || "—"})</Label>
                  <Input value={initials} onChange={(e) => setInitials(e.target.value)} maxLength={4} className="h-9 w-24 font-bold tracking-widest" />
                  {initials && !initialsValid && (
                    <p className="text-[11px] text-destructive mt-1">Initials must match your profile name ({expectedInitials}).</p>
                  )}
                </div>
              </div>
            )}

            {action === "Away" && (
              <div className="space-y-2 rounded border border-amber-300 bg-amber-50/40 dark:bg-amber-950/20 p-3">
                <Label className="text-xs">Reason for absence</Label>
                <Select value={awayCategory} onValueChange={(v) => setAwayCategory(v as typeof awayCategory)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hospitalization">Hospitalization</SelectItem>
                    <SelectItem value="Family Leave">Family Leave</SelectItem>
                    <SelectItem value="Unapproved Absence">Unapproved Absence</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">This day will be flagged as unbillable.</p>
              </div>
            )}

            <Button
              onClick={() => mut.mutate()}
              disabled={
                mut.isPending ||
                !action ||
                (action === "Present" && (!agreed || !initialsValid)) ||
                (action === "Away" && !awayCategory)
              }
            >
              {mut.isPending ? "Saving…" : action === "Present" ? "Sign & Save (Billable)" : "Save Absence"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ PRN Forms ============
type PrnKind = "medical" | "summary" | "inventory" | "drill" | "transfer" | "incident";

function PrnFormsTab({ orgId, clientId }: { orgId: string; clientId: string }) {
  const [open, setOpen] = useState<PrnKind | null>(null);
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
        <PrnFormDialog kind={open} orgId={orgId} clientId={clientId} onClose={() => setOpen(null)} />
      )}
      {open === "incident" && (
        <IncidentFormDialog orgId={orgId} clientId={clientId} onClose={() => setOpen(null)} />
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
