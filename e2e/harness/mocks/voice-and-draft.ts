import { reconcileVoiceAgentResponse, type VoiceAgentResponse } from "@/lib/cedar-voice-intent";
import { NECTAR_DRAFT } from "../fixtures";

type FnArg = { data?: Record<string, unknown> };

export const processVoiceIntent = async (arg: FnArg): Promise<VoiceAgentResponse> => {
  const transcript = String(arg.data?.transcript ?? "");
  window.__e2e.processCalls.push({ transcript });
  const forced = window.__e2e.clockInResponse;
  const t = transcript.toLowerCase();

  let parsed: Record<string, unknown>;
  if (forced && (/clock(?:\s+me)?\s+in/.test(t) || /start(?:\s+my)?\s+shift/.test(t))) {
    parsed = forced;
  } else if (/clock(?:\s+me)?\s+in/.test(t) || /start(?:\s+my)?\s+shift/.test(t)) {
    parsed = forced ?? {
      intent: "clock_in",
      clientId: "Tommy Jones",
      clientName: "Tommy Jones",
      serviceCode: "SEI",
    };
  } else if (/clock(?:\s+me)?\s+out/.test(t) || /end(?:\s+my)?\s+shift/.test(t)) {
    parsed = { intent: "clock_out" };
  } else if (/add to (?:my )?shift note|shift note/.test(t)) {
    parsed = { intent: "expand_note", narrative: transcript };
  } else {
    parsed = { intent: "unknown", message: "Compass couldn't understand that — please try again." };
  }

  return reconcileVoiceAgentResponse(parsed, transcript);
};

export const createClockIn = async (arg: FnArg) => {
  const data = (arg.data ?? {}) as {
    organizationId: string;
    clientId: string;
    serviceCode: string;
    gps: { latitude: number; longitude: number; accuracyMeters: number };
  };
  if (!window.__e2e.hasPassedLaunchpad) {
    throw new Error(
      "This staff member has not completed Launchpad and cannot be assigned as a sole worker.",
    );
  }
  window.__e2e.clockInCalls.push(data);
  window.__e2e.timesheetWrites += 1;
  return { id: "timesheet-mock-1" };
};

export const draftShiftNote = async (arg: FnArg) => {
  const data = (arg.data ?? {}) as {
    shorthand: string;
    goals: string[];
    clientFirstName: string;
  };
  window.__e2e.draftCalls.push({
    shorthand: data.shorthand,
    goals: data.goals ?? [],
    clientFirstName: data.clientFirstName,
  });
  return { draft: `NECTAR DRAFT: ${NECTAR_DRAFT}`, wordCount: NECTAR_DRAFT.split(/\s+/).length };
};

export const listClientTargetBehaviors = async () => {
  return (window.__e2e.targetBehaviors ?? []).map((behavior_name, i) => ({
    id: `tb-${i}`,
    behavior_name,
  }));
};
