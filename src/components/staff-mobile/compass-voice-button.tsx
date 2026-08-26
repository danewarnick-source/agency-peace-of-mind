// Persistent Compass voice agent button (Phase 2). Renders on every staff
// screen — mobile and desktop, never in admin view. Does NOT touch the
// existing punch-pad/daily-log "Dictate note" / "Expand with Compass"
// buttons or their voice-dictation state; this is an independent surface
// that happens to share the same Web Speech API pattern and the same
// expandShiftNote server function for the note-expansion intent.
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
import { expandShiftNote } from "@/lib/voice-documentation.server";

const CEDAR_TEAL = "#137182";
const MAX_CLARIFY_ROUNDS = 2;
const SILENCE_TIMEOUT_MS = 1500;

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
  const expandFn = useServerFn(expandShiftNote);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);

  function clearSilenceTimer() {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    try {
      recognitionRef.current?.stop?.();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    setListening(false);
  }, []);

  // Starts a recording round. onFinal receives the final transcript once the
  // staff stops talking (1.5s silence) or taps stop. Used for both the
  // initial ask and each clarify-answer round.
  const startListening = useCallback(
    (onFinal: (text: string) => void) => {
      if (typeof window === "undefined") return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!SR) {
        toast.error("Voice input isn't supported on this browser.");
        return;
      }
      try {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";
        let liveText = "";
        const armSilenceTimer = () => {
          clearSilenceTimer();
          silenceTimerRef.current = window.setTimeout(() => {
            stopListening();
            const finalText = liveText.trim();
            if (finalText) onFinal(finalText);
          }, SILENCE_TIMEOUT_MS);
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rec.onresult = (e: any) => {
          let finalText = "";
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const chunk = e.results[i][0].transcript;
            if (e.results[i].isFinal) finalText += chunk + " ";
            else interim += chunk;
          }
          if (finalText) liveText = (liveText ? liveText.trim() + " " : "") + finalText.trim();
          setTranscript((liveText ? liveText.trim() + " " : "") + interim);
          armSilenceTimer();
        };
        rec.onerror = () => stopListening();
        rec.onend = () => setListening(false);
        recognitionRef.current = rec;
        setTranscript("");
        rec.start();
        setListening(true);
        armSilenceTimer();
      } catch {
        toast.error("Couldn't start voice input — please try again.");
      }
    },
    [stopListening],
  );

  const resetSheet = useCallback(() => {
    stopListening();
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
        message: (e as Error).message || "Compass couldn't process that — please try again.",
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
  async function handleAddToShiftNote(narrative: string) {
    if (!activeShift) return;
    setProcessing(true);
    try {
      const clientFirst = activeShift.client_name.split(" ")[0] ?? activeShift.client_name;
      const expanded = await expandFn({
        data: {
          narrative,
          goals: activeClientGoals,
          serviceCode: activeShift.service_type_code,
          clientFirstName: clientFirst,
        },
      });
      navigate({
        to: "/dashboard/workspace/$clientId",
        params: { clientId: activeShift.client_id },
        search: { tab: "clock-in", verify: "1", note: expanded },
      });
      closeSheet();
    } catch (e) {
      toast.error((e as Error).message || "Compass couldn't expand this note — please try again.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleStartShift() {
    if (!pendingClockIn || !org?.organization_id) return;
    setStartingShift(true);
    try {
      await clockInFn({
        data: {
          organizationId: org.organization_id,
          clientId: pendingClockIn.clientId,
          serviceCode: pendingClockIn.serviceCode,
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
            onStop={stopListening}
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
            Compass will expand this into a full note.
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

    if (response.intent === "clock_in") {
      if (!pendingClockIn) return null;
      return (
        <div className="space-y-3 py-4 text-center">
          <p className="text-base font-medium">
            Clock in with {pendingClockIn.clientName} for {pendingClockIn.serviceCode}?
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
          <p className="text-base font-medium">Clock out of your current shift?</p>
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
            Clock out
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
        <p>"Clock me in with Justin for SEI"</p>
        <p>"What obligations do I have due?"</p>
      </div>
    </div>
  );
}
