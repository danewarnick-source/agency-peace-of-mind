/**
 * Chrome Web Speech helpers for punch-pad / daily-log Dictate.
 *
 * Chrome marks short phrases `isFinal` after a brief pause even while the
 * person is still talking, then often fires `onend`. These helpers
 * accumulate the whole utterance, ignore `no-speech`, and restart while
 * the UI still wants the mic open.
 */

const RESTART_DELAY_MS = 150;

export function speechErrorCode(event: unknown): string {
  if (typeof event === "string") return event;
  if (event && typeof event === "object" && "error" in event) {
    const code = (event as { error?: unknown }).error;
    return typeof code === "string" ? code : "";
  }
  return "";
}

/** `no-speech` is non-fatal. `aborted` means we called stop(). */
export function isIgnorableSpeechError(event: unknown): boolean {
  const code = speechErrorCode(event);
  return code === "no-speech" || code === "aborted";
}

export function joinTranscriptParts(...parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function countSpokenWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export type SpeechResultLike = {
  isFinal: boolean;
  0?: { transcript?: string };
};

/**
 * Rebuild the current session from the full results list (index 0), then
 * prefix any finals carried over from a previous recognition session.
 * Never replace the accumulated transcript with only the latest fragment.
 */
export function accumulateSpeechResults(
  priorFinals: string,
  results: ArrayLike<SpeechResultLike>,
): { finals: string; display: string } {
  let sessionFinal = "";
  let interim = "";
  for (let i = 0; i < results.length; i++) {
    const chunk = results[i]?.[0]?.transcript ?? "";
    if (!chunk) continue;
    if (results[i].isFinal) sessionFinal += chunk + " ";
    else interim += chunk;
  }
  const finals = joinTranscriptParts(priorFinals, sessionFinal);
  return { finals, display: joinTranscriptParts(finals, interim) };
}

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type ContinuousSpeechSession = {
  stop: () => void;
};

/**
 * Start a recognition loop that stays open until `stop()` or a fatal error.
 * `onend` restarts while `shouldContinue()` is true. `no-speech` is ignored.
 */
export function beginContinuousRecognition(opts: {
  interimResults: boolean;
  shouldContinue: () => boolean;
  onResult: (ev: { resultIndex: number; results: ArrayLike<SpeechResultLike> }) => void;
  onFatalStop: () => void;
  /** Called after a session ends and before a restart (snapshot finals). */
  onSessionEnd?: () => void;
}): ContinuousSpeechSession | null {
  const SR = getSpeechRecognitionCtor();
  if (!SR) return null;

  let current: SpeechRec | null = null;
  let stopped = false;
  let restartTimer: number | null = null;

  const clearRestartTimer = () => {
    if (restartTimer !== null) {
      window.clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  const startRec = () => {
    if (stopped || !opts.shouldContinue()) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = opts.interimResults;
    rec.lang = "en-US";
    rec.onresult = (ev) =>
      opts.onResult(ev as { resultIndex: number; results: ArrayLike<SpeechResultLike> });
    rec.onerror = (ev) => {
      if (isIgnorableSpeechError(ev)) return;
      stopped = true;
      clearRestartTimer();
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      current = null;
      opts.onFatalStop();
    };
    rec.onend = () => {
      if (stopped || current !== rec) return;
      if (!opts.shouldContinue()) return;
      opts.onSessionEnd?.();
      clearRestartTimer();
      restartTimer = window.setTimeout(() => {
        restartTimer = null;
        if (stopped || !opts.shouldContinue()) return;
        try {
          startRec();
        } catch {
          stopped = true;
          opts.onFatalStop();
        }
      }, RESTART_DELAY_MS);
    };
    rec.start();
    current = rec;
  };

  try {
    startRec();
  } catch {
    return null;
  }

  return {
    stop: () => {
      stopped = true;
      clearRestartTimer();
      try {
        current?.stop?.();
      } catch {
        /* ignore */
      }
      current = null;
    },
  };
}
