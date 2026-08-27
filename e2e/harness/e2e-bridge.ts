import { TOMMY_BEHAVIORS, TOMMY_ID } from "./fixtures";

export type GpsMode = "ok" | "denied" | "timeout" | "unavailable";

export type E2EScenario =
  | "clock-in"
  | "gps-denied"
  | "gps-timeout"
  | "clock-out"
  | "launchpad-blocked"
  | "admin";

export type NavCall = {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string | undefined>;
};

export type ClockInCall = {
  organizationId: string;
  clientId: string;
  serviceCode: string;
  gps: { latitude: number; longitude: number; accuracyMeters: number };
};

export type E2EBridge = {
  scenario: E2EScenario;
  gpsMode: GpsMode;
  hasPassedLaunchpad: boolean;
  navigations: NavCall[];
  clockInCalls: ClockInCall[];
  timesheetWrites: number;
  targetBehaviors: string[];
  hasActiveShift: boolean;
};

declare global {
  interface Window {
    __e2e: E2EBridge;
    __e2eSpeak: (text: string, opts?: { isFinal?: boolean }) => void;
    __e2eSetNavigate: (fn: (args: NavCall) => void) => void;
  }
}

const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");

function scenarioFromQuery(): E2EScenario {
  const raw = params.get("scenario") ?? "clock-in";
  const allowed: E2EScenario[] = [
    "clock-in",
    "gps-denied",
    "gps-timeout",
    "clock-out",
    "launchpad-blocked",
    "admin",
  ];
  return (allowed as string[]).includes(raw) ? (raw as E2EScenario) : "clock-in";
}

export function createBridge(): E2EBridge {
  const scenario = scenarioFromQuery();
  const gpsMode: GpsMode =
    scenario === "gps-denied" ? "denied" : scenario === "gps-timeout" ? "timeout" : "ok";
  return {
    scenario,
    gpsMode,
    hasPassedLaunchpad: scenario !== "launchpad-blocked",
    navigations: [],
    clockInCalls: [],
    timesheetWrites: 0,
    targetBehaviors: TOMMY_BEHAVIORS,
    hasActiveShift: scenario === "clock-out",
  };
}

export function installSpeechAndGps(bridge: E2EBridge) {
  class FakeSpeechRecognition {
    continuous = false;
    interimResults = false;
    lang = "";
    onresult: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      (window as unknown as { __e2eRec: FakeSpeechRecognition }).__e2eRec = this;
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.stop();
    }
  }

  const w = window as unknown as {
    SpeechRecognition: typeof FakeSpeechRecognition;
    webkitSpeechRecognition: typeof FakeSpeechRecognition;
  };
  w.SpeechRecognition = FakeSpeechRecognition;
  w.webkitSpeechRecognition = FakeSpeechRecognition;

  window.__e2eSpeak = (text: string, opts?: { isFinal?: boolean }) => {
    const rec = (window as unknown as { __e2eRec?: FakeSpeechRecognition }).__e2eRec;
    const result = { isFinal: opts?.isFinal !== false, 0: { transcript: text } };
    rec?.onresult?.({ resultIndex: 0, results: { 0: result, length: 1 } });
  };

  const geo = {
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
    getCurrentPosition(
      success: (pos: GeolocationPosition) => void,
      error?: (err: GeolocationPositionError) => void,
    ) {
      if (bridge.gpsMode === "denied") {
        error?.({
          code: 1,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: "denied",
        } as GeolocationPositionError);
        return;
      }
      if (bridge.gpsMode === "timeout") {
        error?.({
          code: 3,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: "timeout",
        } as GeolocationPositionError);
        return;
      }
      if (bridge.gpsMode === "unavailable") {
        error?.({
          code: 2,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: "unavailable",
        } as GeolocationPositionError);
        return;
      }
      success({
        coords: {
          latitude: 40.7608,
          longitude: -111.891,
          accuracy: 12,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON() {
            return this;
          },
        },
        timestamp: Date.now(),
        toJSON() {
          return this;
        },
      } as GeolocationPosition);
    },
    watchPosition(
      success: (pos: GeolocationPosition) => void,
      error?: (err: GeolocationPositionError) => void,
    ) {
      this.getCurrentPosition(success, error);
      return 1;
    },
    clearWatch() {},
  };

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: geo,
  });

  const synth = {
    cancel() {},
    speak(u: SpeechSynthesisUtterance) {
      u.onend?.(new Event("end") as SpeechSynthesisEvent);
    },
    getVoices() {
      return [];
    },
    paused: false,
    pending: false,
    speaking: false,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: synth,
  });

  void TOMMY_ID;
}
