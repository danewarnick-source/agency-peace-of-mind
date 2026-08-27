// Persistent Compass voice agent button (Phase 2). Renders on every staff
// screen — mobile and desktop, never in admin view. Does NOT touch the
// existing punch-pad/daily-log "Dictate note" / "Expand with Compass"
// buttons or their voice-dictation state; this is an independent surface
// that happens to share the same Web Speech API pattern. Note expansion
// uses the NECTAR draft engine (draftShiftNote) — same prompt as
// punch-pad / historical "Draft with NECTAR". Compass never auto-submits
// clock-out or ticks attestation checkboxes.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useCaseload } from "@/hooks/use-caseload";
import { useActiveShift } from "@/hooks/use-active-shift";
import { useClientCareData } from "@/hooks/use-client-care-data";
import {
  processVoiceIntent,
  createClockIn,
  type VoiceAgentResponse,
} from "@/lib/cedar-voice-agent.server";
import { draftShiftNote } from "@/lib/ai-coach.functions";
import { freezeOriginalTranscript } from "@/lib/original-transcript";
import { isLikelyBadCoord } from "@/lib/geo";
import {
  accumulateSpeechResults,
  beginContinuousRecognition,
  canAutoSubmitTranscript,
  COMPASS_SILENCE_TIMEOUT_MS,
  type ContinuousSpeechSession,
} from "@/lib/continuous-speech";

const CEDAR_TEAL = "#137182";
const MAX_CLARIFY_ROUNDS = 2;
const GPS_TIMEOUT_MS = 8_000;

const COMPASS_BEDROCK_UNAVAILABLE =
  "Compass isn't available right now — voice AI isn't configured on this deployment. An admin needs to set AWS Bedrock credentials.";

type GpsFailKind = "denied" | "timeout" | "unavailable";

function compassGpsFailMessage(kind: GpsFailKind): string {
  if (kind === "denied") {
    return "Location permission is needed to clock in with Compass. Opening the punch pad instead.";
  }
  if (kind === "timeout") {
    return "Couldn't get your location in time. Opening the punch pad so you can clock in there.";
  }
  return "Location isn't available. Opening the punch pad so you can clock in there.";
}

function staffFacingCompassMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (
    /not configured|AWS_REGION|BEDROCK_MODEL_ID|AccessDenied|UnrecognizedClient|InvalidSignature|voice AI isn't configured/i.test(
      msg,
    )
  ) {
    return COMPASS_BEDROCK_UNAVAILABLE;
  }
  return msg || "Compass couldn't process that — please try again.";
}

/** One-shot GPS on confirm tap. Fail closed — caller must send staff to punch pad. */
function getCompassClockInPosition(): Promise<{ lat: number; lng: number; acc: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        if (isLikelyBadCoord({ lat, lng }) || !Number.isFinite(acc)) {
          reject(new Error("unavailable"));
          return;
        }
        resolve({ lat, lng, acc });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new Error("denied"));
        else if (err.code === err.TIMEOUT) reject(new Error("timeout"));
        else reject(new Error("unavailable"));
      },
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 10_000 },
    );
  });
}

type PendingClockIn = { clientId: string; clientName: string; serviceCode: string };

export function CompassVoiceButton() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { data: caseload = [] } = useCaseload();
  const { data: activeShift } = useActiveShift();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Goals tagged for the active shift's client + service code — same
  // shared reader punch-pad.tsx uses for activeClientGoals.
  const careData = useClientCareData(
    activeShift?.client_id ?? null,
    activeShift?.service_type_code ?? null,
  );
  const activeClientGoals =
    careData.data?.visibility.goalsForStaff.map((g) => g.goal.trim()).filter(Boolean) ?? [];

  const processFn = useServerFn(processVoiceIntent);
  const clockInFn = useServerFn(createClockIn);
  const draftFn = useServerFn(draftShiftNote);

  // ── Support detection — same pattern as punch-pad.tsx's speechSupported.
  const [speechSupported, setSpeechSupported] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    setSpeechSupported(!!SR);
  }, []);

  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [response, setResponse] = useState<VoiceAgentResponse | null>(null);
  const [pendingClockIn, setPendingClockIn] = useState<PendingClockIn | null>(null);
  const [startingShift, setStartingShift] = useState(false);
  const [clarifyRounds, setClarifyRounds] = useState(0);
  const [baseTranscript, setBaseTranscript] = useState("");

  const sessionRef = useRef<ContinuousSpeechSession | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const listeningWantedRef = useRef(false);
  const committedRef = useRef(false);
  const priorFinalsRef = useRef("");
  const liveFinalsRef = useRef("");
  const liveDisplayRef = useRef("");
  const onFinalRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    return () => {
      listeningWantedRef.current = false;
      sessionRef.current?.stop();
    };
  }, []);

  function clearSilenceTimer() {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  const stopListening = useCallback((opts?: { submit?: boolean }) => {
    listeningWantedRef.current = false;
    clearSilenceTimer();
    sessionRef.current?.stop();
    sessionRef.current = null;
    setListening(false);
    if (opts?.submit && !committedRef.current) {
      const finalText = liveDisplayRef.current.trim();
      if (finalText) {
        committedRef.current = true;
        onFinalRef.current(finalText);
      }
    }
  }, []);

  // Starts a recording round. Mic stays open until staff taps Stop, or until
  // a long pause AFTER they have actually spoken (not on rec.start()). Used
  // for both the initial ask and each clarify-answer round.
  const startListening = useCallback(
    (onFinal: (text: string) => void) => {
      if (typeof window === "undefined") return;
      sessionRef.current?.stop();
      sessionRef.current = null;
      clearSilenceTimer();
      onFinalRef.current = onFinal;
      committedRef.current = false;
      listeningWantedRef.current = true;
      priorFinalsRef.current = "";
      liveFinalsRef.current = "";
      liveDisplayRef.current = "";
      setTranscript("");

      const armSilenceTimer = () => {
        clearSilenceTimer();
        silenceTimerRef.current = window.setTimeout(() => {
          const text = liveDisplayRef.current.trim();
          // Chrome often finalizes 1–2 words mid-sentence. Keep listening.
          if (!canAutoSubmitTranscript(text)) return;
          stopListening({ submit: true });
        }, COMPASS_SILENCE_TIMEOUT_MS);
      };

      const session = beginContinuousRecognition({
        interimResults: true,
        shouldContinue: () => listeningWantedRef.current && !committedRef.current,
        onResult: (e) => {
          const { finals, display } = accumulateSpeechResults(priorFinalsRef.current, e.results);
          liveFinalsRef.current = finals;
          liveDisplayRef.current = display;
          setTranscript(display);
          if (display.trim()) armSilenceTimer();
        },
        onSessionEnd: () => {
          priorFinalsRef.current = liveFinalsRef.current;
        },
        onFatalStop: () => {
          listeningWantedRef.current = false;
          clearSilenceTimer();
          sessionRef.current = null;
          setListening(false);
        },
      });
      if (!session) {
        listeningWantedRef.current = false;
        toast.error("Couldn't start voice input — please try again.");
        return;
      }
      sessionRef.current = session;
      setListening(true);
    },
    [stopListening],
  );

  const resetSheet = useCallback(() => {
    stopListening();
    committedRef.current = false;
    priorFinalsRef.current = "";
    liveFinalsRef.current = "";
    liveDisplayRef.current = "";
    setTranscript("");
    setProcessing(false);
    setResponse(null);
    setPendingClockIn(null);
    setClarifyRounds(0);
    setBaseTranscript("");
  }, [stopListening]);

  function closeSheet() {
    setOpen(false);
    resetSheet();
  }

  // ── Submit a transcript to the Bedrock router ──────────────────────────
  async function submitTranscript(text: string, roundsSoFar: number) {
    if (!org?.organization_id || !user?.id) return;
    setProcessing(true);
    setResponse(null);
    try {
      const res = await processFn({
        data: {
          transcript: text,
          activeShift: activeShift
            ? {
                id: activeShift.id,
                clientId: activeShift.client_id,
                clientFirstName: activeShift.client_name.split(" ")[0] ?? activeShift.client_name,
                serviceCode: activeShift.service_type_code,
              }
            : null,
          caseload: caseload.map((c) => ({
            id: c.id,
            firstName: c.first_name,
            lastName: c.last_name,
            authorizedCodes: c.authorized_dspd_codes,
          })),
          orgId: org.organization_id,
          staffId: user.id,
        },
      });

      if (res.intent === "clarify" && roundsSoFar >= MAX_CLARIFY_ROUNDS) {
        setResponse({
          intent: "unknown",
          message: "I still couldn't quite catch that — please try again with a bit more detail.",
        });
        return;
      }

      setResponse(res);
      if (res.intent === "clock_in") {
        setPendingClockIn({
          clientId: res.clientId,
          clientName: res.clientName,
          serviceCode: res.serviceCode,
        });
      }
      if (res.intent === "ask_compass") {
        navigate({ to: "/dashboard/ask-nectar", search: { q: res.question } });
        closeSheet();
      }
    } catch (e) {
      setResponse({
        intent: "unknown",
        message: staffFacingCompassMessage(e),
      });
    } finally {
      setProcessing(false);
    }
  }

  function handleFirstAsk() {
    startListening((finalText) => {
      setBaseTranscript(finalText);
      void submitTranscript(finalText, 0);
    });
  }

  function handleClarifyAnswer() {
    const nextRounds = clarifyRounds + 1;
    startListening((answerText) => {
      const combined = `${baseTranscript} ${answerText}`.trim();
      setBaseTranscript(combined);
      setClarifyRounds(nextRounds);
      void submitTranscript(combined, nextRounds);
    });
  }

  // ── Intent action handlers ──────────────────────────────────────────────
  // Same punch-pad URL for expand_note and expand_note_and_clock_out:
  // NECTAR-drafted note + original spoken transcript, verify=1. Staff still
  // check boxes and attest on the punch pad. Compass does not clock out.
  async function handleAddToShiftNote(narrative: string) {
    if (!activeShift) return;
    setProcessing(true);
    try {
      const clientFirst = activeShift.client_name.split(" ")[0] ?? activeShift.client_name;
      const originalSpeech = freezeOriginalTranscript(baseTranscript, transcript);
      const drafted = await draftFn({
        data: {
          shorthand: narrative,
          goals: activeClientGoals,
          clientFirstName: clientFirst,
        },
      });
      navigate({
        to: "/dashboard/workspace/$clientId",
        params: { clientId: activeShift.client_id },
        search: {
          tab: "clock-in",
          verify: "1",
          note: drafted.draft,
          ...(originalSpeech ? { spoken: originalSpeech.slice(0, 2000) } : {}),
        },
      });
      closeSheet();
    } catch (e) {
      toast.error((e as Error).message || "NECTAR couldn't draft this note — please try again.");
    } finally {
      setProcessing(false);
    }
  }

  function openPunchPadForClockIn(clientId: string, serviceCode: string) {
    navigate({
      to: "/dashboard/workspace/$clientId",
      params: { clientId },
      search: { tab: "clock-in", code: serviceCode },
    });
    closeSheet();
  }

  async function handleStartShift() {
    if (!pendingClockIn || !org?.organization_id) return;
    setStartingShift(true);
    try {
      let pos: { lat: number; lng: number; acc: number };
      try {
        pos = await getCompassClockInPosition();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        const kind: GpsFailKind = msg === "denied" || msg === "timeout" ? msg : "unavailable";
        toast.error(compassGpsFailMessage(kind));
        openPunchPadForClockIn(pendingClockIn.clientId, pendingClockIn.serviceCode);
        return;
      }

      await clockInFn({
        data: {
          organizationId: org.organization_id,
          clientId: pendingClockIn.clientId,
          serviceCode: pendingClockIn.serviceCode,
          gps: {
            latitude: pos.lat,
            longitude: pos.lng,
            accuracyMeters: pos.acc,
          },
        },
      });
      await qc.invalidateQueries({ queryKey: ["evv-active", user?.id] });
      await qc.invalidateQueries({ queryKey: ["active-shift", user?.id] });
      toast.success(`Clocked in with ${pendingClockIn.clientName}.`);
      closeSheet();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't clock in — please try again.");
    } finally {
      setStartingShift(false);
    }
  }

  function handleClockOutNavigate() {
    if (!activeShift) return;
    navigate({
      to: "/dashboard/workspace/$clientId",
      params: { clientId: activeShift.client_id },
      search: { tab: "clock-in", verify: "1" },
    });
    closeSheet();
  }

  // Same detection as punch-pad.tsx — if the browser has no SpeechRecognition
  // support, render nothing rather than a broken button. (Text-input
  // fallback is a Phase 3 concern.)
  if (!speechSupported) return null;

  return (
    <>
      <div className="fixed z-50 bottom-[calc(72px+env(safe-area-inset-bottom)+16px)] left-1/2 -translate-x-1/2 md:bottom-6 md:right-6 md:left-auto md:translate-x-0">
        <div className="relative h-14 w-14">
          {listening && (
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-60"
              style={{ backgroundColor: CEDAR_TEAL }}
              aria-hidden="true"
            />
          )}
          <button
            type="button"
            aria-label="Talk to Compass"
            onClick={() => setOpen(true)}
            className="relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
            style={{ backgroundColor: CEDAR_TEAL }}
          >
            {processing ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetSheet();
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[80vh] overflow-y-auto rounded-t-2xl pb-8 md:mx-auto md:max-w-md md:rounded-2xl"
        >
          <CompassSheetBody
            listening={listening}
            transcript={transcript}
            processing={processing}
            response={response}
            pendingClockIn={pendingClockIn}
            startingShift={startingShift}
            onFirstAsk={handleFirstAsk}
            onStop={() => stopListening({ submit: true })}
            onClarifyAnswer={handleClarifyAnswer}
            onAddToShiftNote={handleAddToShiftNote}
            onStartShift={handleStartShift}
            onClockOut={handleClockOutNavigate}
            onCancelClockIn={() => setPendingClockIn(null)}
            onTryAgain={() => {
              setResponse(null);
              setClarifyRounds(0);
              setBaseTranscript("");
            }}
            hasActiveShift={!!activeShift}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function CompassSheetBody({
  listening,
  transcript,
  processing,
  response,
  pendingClockIn,
  startingShift,
  onFirstAsk,
  onStop,
  onClarifyAnswer,
  onAddToShiftNote,
  onStartShift,
  onClockOut,
  onCancelClockIn,
  onTryAgain,
  hasActiveShift,
}: {
  listening: boolean;
  transcript: string;
  processing: boolean;
  response: VoiceAgentResponse | null;
  pendingClockIn: PendingClockIn | null;
  startingShift: boolean;
  onFirstAsk: () => void;
  onStop: () => void;
  onClarifyAnswer: () => void;
  onAddToShiftNote: (narrative: string) => void;
  onStartShift: () => void;
  onClockOut: () => void;
  onCancelClockIn: () => void;
  onTryAgain: () => void;
  hasActiveShift: boolean;
}) {
  // ── State B: listening ───────────────────────────────────────────────────
  if (listening) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="text-sm font-medium" style={{ color: CEDAR_TEAL }}>
          Listening…
        </p>
        <button
          type="button"
          onClick={onStop}
          className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg"
          style={{ backgroundColor: CEDAR_TEAL, boxShadow: `0 0 0 6px ${CEDAR_TEAL}33` }}
        >
          <MicOff className="h-6 w-6" />
        </button>
        <p className="min-h-[3rem] max-w-sm px-4 text-sm text-muted-foreground">
          {transcript || "Go ahead…"}
        </p>
        <p className="text-xs text-muted-foreground">Tap stop when you&apos;re done.</p>
      </div>
    );
  }

  // ── State C: response ────────────────────────────────────────────────────
  if (processing) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: CEDAR_TEAL }} />
        <p className="text-sm text-muted-foreground">Compass is thinking…</p>
      </div>
    );
  }

  if (response) {
    if (response.intent === "expand_note") {
      return (
        <div className="space-y-3 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Add to shift note
          </p>
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {response.narrative}
          </div>
          <p className="text-xs text-muted-foreground">
            NECTAR will draft this into a full note. You still review and attest.
          </p>
          <Button
            className="w-full text-white"
            style={{ backgroundColor: CEDAR_TEAL }}
            onClick={() => onAddToShiftNote(response.narrative)}
          >
            Add to shift note
          </Button>
        </div>
      );
    }

    if (response.intent === "expand_note_and_clock_out") {
      return (
        <div className="space-y-3 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Note + clock-out
          </p>
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {response.narrative}
          </div>
          <p className="text-xs text-muted-foreground">
            NECTAR will draft this note and take you to clock-out with it filled in. You still check
            the boxes and attest on the punch pad — Compass will not clock you out.
          </p>
          {!hasActiveShift && (
            <p className="text-xs text-muted-foreground">
              You don't have an active shift right now.
            </p>
          )}
          <Button
            className="w-full text-white"
            style={{ backgroundColor: CEDAR_TEAL }}
            onClick={() => onAddToShiftNote(response.narrative)}
            disabled={!hasActiveShift}
          >
            Open clock-out with note
          </Button>
        </div>
      );
    }

    if (response.intent === "clock_in") {
      if (!pendingClockIn) return null;
      return (
        <div className="space-y-3 py-4 text-center">
          <p className="text-base font-medium">
            Clock in with {pendingClockIn.clientName} for {pendingClockIn.serviceCode}?
          </p>
          <p className="text-xs text-muted-foreground">
            Your location will be saved on this timesheet.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={onCancelClockIn}
              disabled={startingShift}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 text-white"
              style={{ backgroundColor: CEDAR_TEAL }}
              onClick={onStartShift}
              disabled={startingShift}
            >
              {startingShift ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start shift
            </Button>
          </div>
        </div>
      );
    }

    if (response.intent === "clock_out") {
      return (
        <div className="space-y-3 py-4 text-center">
          <p className="text-base font-medium">Open the punch pad to clock out?</p>
          <p className="text-xs text-muted-foreground">
            You still need to review your note, check the boxes, and attest. Compass will not clock
            you out from here.
          </p>
          {!hasActiveShift && (
            <p className="text-xs text-muted-foreground">
              You don't have an active shift right now.
            </p>
          )}
          <Button
            className="w-full text-white"
            style={{ backgroundColor: CEDAR_TEAL }}
            onClick={onClockOut}
            disabled={!hasActiveShift}
          >
            Open clock-out
          </Button>
        </div>
      );
    }

    if (response.intent === "clarify") {
      return (
        <div className="space-y-4 py-4">
          <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm">
            {response.question}
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onClarifyAnswer}
              className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
              style={{ backgroundColor: CEDAR_TEAL }}
            >
              <Mic className="h-5 w-5" />
            </button>
            <p className="text-xs text-muted-foreground">Tap to answer</p>
          </div>
        </div>
      );
    }

    if (response.intent === "unknown") {
      return (
        <div className="space-y-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">{response.message}</p>
          <Button variant="outline" className="w-full" onClick={onTryAgain}>
            Try again
          </Button>
        </div>
      );
    }

    return null;
  }

  // ── State A: ready to listen ──────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <p className="text-sm text-muted-foreground">Tap to speak</p>
      <button
        type="button"
        onClick={onFirstAsk}
        className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
        style={{ backgroundColor: CEDAR_TEAL }}
      >
        <Mic className="h-6 w-6" />
      </button>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>"Add to my shift note…"</p>
        <p>"We went to the store. Clock me out."</p>
        <p>"Clock me in with Justin for SEI"</p>
      </div>
    </div>
  );
}
