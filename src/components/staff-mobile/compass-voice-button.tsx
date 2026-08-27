// Persistent Compass voice agent button (Phase 2). Renders on every staff
// screen — mobile and desktop, never in admin view. Does NOT touch the
// existing punch-pad/daily-log "Dictate note" / "Expand with Compass"
// buttons or their voice-dictation state; this is an independent surface
// that happens to share the same Web Speech API pattern. Note expansion
// uses the NECTAR draft engine (draftShiftNote). Clock-out runs a short
// on-screen + voice interview (goals, incident, behaviors) then opens
// punch pad pre-filled. Compass never auto-submits clock-out or ticks
// attestation checkboxes.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CompassClockOutInterview } from "@/components/staff-mobile/compass-clock-out-interview";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useCaseload } from "@/hooks/use-caseload";
import { useActiveShift } from "@/hooks/use-active-shift";
import { useClientCareData } from "@/hooks/use-client-care-data";
import { useShiftBehaviorSetting } from "@/hooks/use-shift-behavior-setting";
import {
  processVoiceIntent,
  createClockIn,
  type VoiceAgentResponse,
} from "@/lib/cedar-voice-agent.server";
import { draftShiftNote } from "@/lib/ai-coach.functions";
import { listClientTargetBehaviors } from "@/lib/client-target-behaviors.functions";
import { freezeOriginalTranscript } from "@/lib/original-transcript";
import { isLikelyBadCoord } from "@/lib/geo";
import {
  accumulateSpeechResults,
  beginContinuousRecognition,
  canAutoSubmitTranscript,
  COMPASS_SILENCE_TIMEOUT_MS,
  type ContinuousSpeechSession,
} from "@/lib/continuous-speech";
import {
  applyBehaviorNameSpeech,
  applyGoalSpeech,
  buildBehaviorNamesPrompt,
  buildBehaviorsPrompt,
  buildGoalsPrompt,
  buildIncidentPrompt,
  canAutoSubmitInterviewReply,
  compassHandoffToSearch,
  parseYesNo,
  speakPromptTimeoutMs,
  type CompassClockOutHandoff,
  type CompassInterviewPhase,
} from "@/lib/compass-clock-out-interview";

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

type ClockOutInterview = {
  phase: CompassInterviewPhase;
  narrative: string | null;
  selectedGoals: string[];
  baseline: boolean;
  incident: "yes" | "no" | null;
  behaviorsObserved: boolean | null;
  targetBehaviors: string[];
};

function speakCompassPrompt(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    window.setTimeout(finish, speakPromptTimeoutMs(text));
    window.speechSynthesis.speak(u);
  });
}

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

  const { data: behaviorSetting } = useShiftBehaviorSetting();
  const behaviorEnabled = behaviorSetting?.enabled ?? true;

  const processFn = useServerFn(processVoiceIntent);
  const clockInFn = useServerFn(createClockIn);
  const draftFn = useServerFn(draftShiftNote);
  const listTargetBehaviorsFn = useServerFn(listClientTargetBehaviors);
  const { data: targetBehaviorRows = [], isLoading: targetBehaviorsLoading } = useQuery({
    queryKey: ["client-target-behaviors", activeShift?.client_id],
    queryFn: () =>
      listTargetBehaviorsFn({
        data: {
          organization_id: org!.organization_id,
          client_id: activeShift!.client_id,
        },
      }),
    enabled: behaviorEnabled && !!activeShift?.client_id && !!org?.organization_id,
    staleTime: 5 * 60_000,
  });
  const targetBehaviorOptions = targetBehaviorRows.map((b) => b.behavior_name);
  const careDataLoadingRef = useRef(true);
  careDataLoadingRef.current = !!activeShift && careData.isLoading;
  const targetBehaviorsLoadingRef = useRef(false);
  targetBehaviorsLoadingRef.current = targetBehaviorsLoading;

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
  const [interview, setInterview] = useState<ClockOutInterview | null>(null);

  const sessionRef = useRef<ContinuousSpeechSession | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const listeningWantedRef = useRef(false);
  const committedRef = useRef(false);
  const priorFinalsRef = useRef("");
  const liveFinalsRef = useRef("");
  const liveDisplayRef = useRef("");
  const onFinalRef = useRef<(text: string) => void>(() => {});
  const readyToSubmitRef = useRef<(text: string) => boolean>(canAutoSubmitTranscript);
  const interviewRef = useRef<ClockOutInterview | null>(null);
  const interviewGenRef = useRef(0);
  interviewRef.current = interview;
  const activeClientGoalsRef = useRef(activeClientGoals);
  activeClientGoalsRef.current = activeClientGoals;
  const targetBehaviorOptionsRef = useRef(targetBehaviorOptions);
  targetBehaviorOptionsRef.current = targetBehaviorOptions;
  const behaviorEnabledRef = useRef(behaviorEnabled);
  behaviorEnabledRef.current = behaviorEnabled;

  useEffect(() => {
    return () => {
      listeningWantedRef.current = false;
      sessionRef.current?.stop();
      interviewGenRef.current += 1;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
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
    (onFinal: (text: string) => void, opts?: { readyToSubmit?: (text: string) => boolean }) => {
      if (typeof window === "undefined") return;
      sessionRef.current?.stop();
      sessionRef.current = null;
      clearSilenceTimer();
      onFinalRef.current = onFinal;
      readyToSubmitRef.current = opts?.readyToSubmit ?? canAutoSubmitTranscript;
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
          if (!readyToSubmitRef.current(text)) return;
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
    interviewGenRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
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
    setInterview(null);
  }, [stopListening]);

  function closeSheet() {
    setOpen(false);
    resetSheet();
  }

  function promptForInterviewPhase(phase: CompassInterviewPhase): string {
    if (phase === "goals") return buildGoalsPrompt(activeClientGoalsRef.current);
    if (phase === "incident") return buildIncidentPrompt();
    if (phase === "behaviors") return buildBehaviorsPrompt();
    if (phase === "behavior-names") {
      return buildBehaviorNamesPrompt(targetBehaviorOptionsRef.current);
    }
    return "";
  }

  function listenForInterviewPhase(phase: CompassInterviewPhase) {
    const kind = phase === "incident" || phase === "behaviors" ? "yesno" : "names";
    startListening((text) => handleInterviewSpeech(phase, text), {
      readyToSubmit: (t) => canAutoSubmitInterviewReply(t, kind),
    });
  }

  async function speakThenListenInterview(phase: CompassInterviewPhase) {
    const gen = ++interviewGenRef.current;
    stopListening();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    const waitWhile = (cond: () => boolean, ms: number) =>
      new Promise<void>((resolve) => {
        const started = Date.now();
        const tick = () => {
          if (gen !== interviewGenRef.current || !cond() || Date.now() - started >= ms) {
            resolve();
            return;
          }
          window.setTimeout(tick, 100);
        };
        tick();
      });

    if (phase === "goals") await waitWhile(() => careDataLoadingRef.current, 5000);
    if (phase === "behaviors" || phase === "behavior-names") {
      await waitWhile(() => targetBehaviorsLoadingRef.current, 4000);
    }
    if (gen !== interviewGenRef.current) return;

    const prompt = promptForInterviewPhase(phase);
    if (prompt) await speakCompassPrompt(prompt);
    if (gen !== interviewGenRef.current) return;

    if (phase === "goals" && activeClientGoalsRef.current.length === 0) {
      setInterview((s) => (s ? { ...s, baseline: true, phase: "incident" } : s));
      return;
    }
    if (phase === "behavior-names" && targetBehaviorOptionsRef.current.length === 0) {
      const cur = interviewRef.current;
      if (cur) void finishInterviewAndNavigate({ ...cur, phase: "finishing" });
      return;
    }
    listenForInterviewPhase(phase);
  }

  function startClockOutInterview(narrative: string | null) {
    if (!activeShift) return;
    setResponse(null);
    setInterview({
      phase: "goals",
      narrative,
      selectedGoals: [],
      baseline: false,
      incident: null,
      behaviorsObserved: null,
      targetBehaviors: [],
    });
  }

  async function finishInterviewAndNavigate(finalState: ClockOutInterview) {
    if (!activeShift || finalState.incident === null) return;
    const gen = interviewGenRef.current;
    setInterview({ ...finalState, phase: "finishing" });
    stopListening();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    const originalSpeech = freezeOriginalTranscript(baseTranscript, transcript);
    let note: string | undefined;
    const shorthand = (finalState.narrative ?? "").trim();
    if (shorthand.length >= 3) {
      try {
        const drafted = await draftFn({
          data: {
            shorthand: shorthand.slice(0, 4000),
            goals: finalState.selectedGoals.length > 0 ? finalState.selectedGoals : [],
            clientFirstName: activeShift.client_name.split(" ")[0] ?? activeShift.client_name,
          },
        });
        note = drafted.draft;
      } catch (e) {
        toast.error(
          (e as Error).message || "NECTAR couldn't draft this note — using what you said.",
        );
        note = shorthand.slice(0, 5000);
      }
    }
    if (gen !== interviewGenRef.current) return;

    const handoff: CompassClockOutHandoff = {
      note,
      spoken: originalSpeech || undefined,
      selectedGoals: finalState.selectedGoals,
      baseline: finalState.baseline,
      incident: finalState.incident,
      behaviorsObserved: behaviorEnabledRef.current
        ? (finalState.behaviorsObserved ?? false)
        : null,
      targetBehaviors: finalState.behaviorsObserved === true ? finalState.targetBehaviors : [],
    };
    navigate({
      to: "/dashboard/workspace/$clientId",
      params: { clientId: activeShift.client_id },
      search: compassHandoffToSearch(handoff),
    });
    closeSheet();
  }

  function handleInterviewSpeech(phase: CompassInterviewPhase, text: string) {
    const cur = interviewRef.current;
    if (!cur) return;

    if (phase === "goals") {
      const res = applyGoalSpeech(text, activeClientGoalsRef.current, {
        selectedGoals: cur.selectedGoals,
        baseline: cur.baseline,
      });
      if (res.unclear) {
        toast.error("Tap a goal on the list, or say its name.");
        listenForInterviewPhase("goals");
        return;
      }
      const next = { ...cur, selectedGoals: res.selectedGoals, baseline: res.baseline };
      if (res.advance) {
        setInterview({ ...next, phase: "incident" });
      } else {
        setInterview(next);
        listenForInterviewPhase("goals");
      }
      return;
    }

    if (phase === "incident") {
      const yn = parseYesNo(text);
      if (!yn) {
        toast.error("Please say yes or no, or tap a button.");
        listenForInterviewPhase("incident");
        return;
      }
      applyIncidentAnswer(yn);
      return;
    }

    if (phase === "behaviors") {
      const yn = parseYesNo(text);
      if (!yn) {
        toast.error("Please say yes or no, or tap a button.");
        listenForInterviewPhase("behaviors");
        return;
      }
      applyBehaviorsYesNo(yn === "yes");
      return;
    }

    if (phase === "behavior-names") {
      const res = applyBehaviorNameSpeech(
        text,
        targetBehaviorOptionsRef.current,
        cur.targetBehaviors,
      );
      if (res.unclear) {
        toast.error("Tap a behavior on the list, or say its name.");
        listenForInterviewPhase("behavior-names");
        return;
      }
      const next = { ...cur, targetBehaviors: res.targetBehaviors };
      if (res.advance) {
        void finishInterviewAndNavigate({ ...next, phase: "finishing" });
      } else {
        setInterview(next);
        listenForInterviewPhase("behavior-names");
      }
    }
  }

  function applyIncidentAnswer(v: "yes" | "no") {
    const cur = interviewRef.current;
    if (!cur) return;
    const next: ClockOutInterview = {
      ...cur,
      incident: v,
      phase: behaviorEnabledRef.current ? "behaviors" : "finishing",
    };
    if (next.phase === "finishing") void finishInterviewAndNavigate(next);
    else setInterview(next);
  }

  function applyBehaviorsYesNo(observed: boolean) {
    const cur = interviewRef.current;
    if (!cur) return;
    if (!observed) {
      void finishInterviewAndNavigate({
        ...cur,
        behaviorsObserved: false,
        targetBehaviors: [],
        phase: "finishing",
      });
      return;
    }
    if (targetBehaviorOptionsRef.current.length === 0) {
      void finishInterviewAndNavigate({
        ...cur,
        behaviorsObserved: true,
        targetBehaviors: [],
        phase: "finishing",
      });
      return;
    }
    setInterview({ ...cur, behaviorsObserved: true, phase: "behavior-names" });
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
      if (
        (res.intent === "clock_out" || res.intent === "expand_note_and_clock_out") &&
        activeShift
      ) {
        startClockOutInterview(res.intent === "expand_note_and_clock_out" ? res.narrative : null);
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
    startClockOutInterview(null);
  }

  useEffect(() => {
    if (!interview) return;
    if (interview.phase === "finishing") return;
    void speakThenListenInterview(interview.phase);
    // Speak + listen once per interview step. Chip toggles must not re-prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview?.phase]);

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
          {interview ? (
            <CompassClockOutInterview
              phase={interview.phase}
              narrativePreview={interview.narrative}
              goals={activeClientGoals}
              goalsLoading={!!activeShift && careData.isLoading}
              selectedGoals={interview.selectedGoals}
              baseline={interview.baseline}
              onToggleGoal={(goal) => {
                setInterview((s) => {
                  if (!s) return s;
                  const has = s.selectedGoals.includes(goal);
                  return {
                    ...s,
                    selectedGoals: has
                      ? s.selectedGoals.filter((g) => g !== goal)
                      : [...s.selectedGoals, goal],
                  };
                });
              }}
              onToggleBaseline={() => {
                setInterview((s) => (s ? { ...s, baseline: !s.baseline } : s));
              }}
              onGoalsContinue={() => {
                const cur = interviewRef.current;
                if (!cur) return;
                if (!cur.baseline && cur.selectedGoals.length === 0) {
                  toast.error("Select at least one goal, or baseline monitoring.");
                  return;
                }
                setInterview({ ...cur, phase: "incident" });
              }}
              incident={interview.incident}
              onIncident={applyIncidentAnswer}
              targetOptions={targetBehaviorOptions}
              selectedTargets={interview.targetBehaviors}
              behaviorsObserved={interview.behaviorsObserved}
              onBehaviorsYesNo={applyBehaviorsYesNo}
              onToggleTarget={(name) => {
                setInterview((s) => {
                  if (!s) return s;
                  const has = s.targetBehaviors.includes(name);
                  return {
                    ...s,
                    targetBehaviors: has
                      ? s.targetBehaviors.filter((n) => n !== name)
                      : [...s.targetBehaviors, name],
                  };
                });
              }}
              onTargetsContinue={() => {
                const cur = interviewRef.current;
                if (!cur) return;
                void finishInterviewAndNavigate({ ...cur, phase: "finishing" });
              }}
              listening={listening}
              transcript={transcript}
              onStopListen={() => stopListening({ submit: true })}
              onStartListen={() => {
                if (!interview) return;
                listenForInterviewPhase(interview.phase);
              }}
              finishing={interview.phase === "finishing"}
            />
          ) : (
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
              onClockOutWithNote={startClockOutInterview}
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
          )}
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
  onClockOutWithNote,
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
  onClockOutWithNote: (narrative: string | null) => void;
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
            A few clock-out questions first — goals, incident, and behaviors if your agency uses
            them. Then the punch pad opens with your answers filled in. You still attest there.
            Compass will not clock you out.
          </p>
          {!hasActiveShift && (
            <p className="text-xs text-muted-foreground">
              You don't have an active shift right now.
            </p>
          )}
          <Button
            className="w-full text-white"
            style={{ backgroundColor: CEDAR_TEAL }}
            onClick={() => onClockOutWithNote(response.narrative)}
            disabled={!hasActiveShift}
          >
            Continue to clock-out questions
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
          <p className="text-base font-medium">A few questions, then the punch pad</p>
          <p className="text-xs text-muted-foreground">
            Compass will ask about goals, incidents, and behaviors. It will not clock you out or
            tick the attestation.
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
            Continue to clock-out questions
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
