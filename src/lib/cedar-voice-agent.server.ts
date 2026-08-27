import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { gatewayFetch, assertBedrockConfigured } from "@/lib/ai-bedrock.server";
import { assertActiveBillingCode, assertLaunchpadPassed } from "@/lib/scheduling/shifts.functions";
import { padMemberId } from "@/lib/evv-codes";
import { isLikelyBadCoord } from "@/lib/geo";
import { roundToQuarterHourISO } from "@/lib/time-rounding";
import {
  FALLBACK_UNKNOWN,
  applyCaseloadClockInResolution,
  reconcileVoiceAgentResponse,
  type VoiceAgentResponse,
} from "@/lib/cedar-voice-intent";
import { formatCaseloadForPrompt } from "@/lib/cedar-voice-client-resolve";

export type { VoiceAgentResponse } from "@/lib/cedar-voice-intent";

// ─── Cedar voice agent — Bedrock intent routing (Phase 2) ───────────────────
// processVoiceIntent classifies a spoken transcript into a structured action.
// Same gatewayFetch calling pattern as draftShiftNote in
// ai-coach.functions.ts (JSON object back). A single utterance may be BOTH
// a shift note AND a clock-out request; reconcileVoiceAgentResponse folds
// that into expand_note_and_clock_out. Compass does not clock anyone out.

export interface VoiceAgentActiveShift {
  id: string;
  clientId: string;
  clientFirstName: string;
  serviceCode: string;
}

export interface VoiceAgentCaseloadEntry {
  id: string;
  firstName: string;
  lastName: string;
  authorizedCodes: string[] | null;
}

export interface VoiceAgentInput {
  transcript: string;
  activeShift: VoiceAgentActiveShift | null;
  caseload: VoiceAgentCaseloadEntry[];
  orgId: string;
  staffId: string;
}

const COMPASS_BEDROCK_UNAVAILABLE =
  "Compass isn't available right now — voice AI isn't configured on this deployment. An admin needs to set AWS Bedrock credentials.";

function staffFacingCompassError(e: unknown, fallback: string): string {
  const err = e as { name?: string; status?: number; message?: string } | null;
  const msg = err?.message ?? "";
  if (
    err?.status === 401 ||
    err?.name === "BedrockError" ||
    /not configured|AWS_REGION|BEDROCK_MODEL_ID|AccessDenied|UnrecognizedClient|InvalidSignature/i.test(
      msg,
    )
  ) {
    return COMPASS_BEDROCK_UNAVAILABLE;
  }
  return msg || fallback;
}

function validateVoiceIntent(input: unknown): VoiceAgentInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const transcript = typeof i.transcript === "string" ? i.transcript.trim() : "";
  if (transcript.length === 0 || transcript.length > 2000) {
    throw new Error("Transcript must be 1–2000 characters.");
  }

  const rawShift = (i.activeShift ?? null) as Record<string, unknown> | null;
  const activeShift: VoiceAgentActiveShift | null =
    rawShift && typeof rawShift === "object"
      ? {
          id: String(rawShift.id ?? ""),
          clientId: String(rawShift.clientId ?? ""),
          clientFirstName: String(rawShift.clientFirstName ?? "the client").slice(0, 80),
          serviceCode: String(rawShift.serviceCode ?? "").slice(0, 16),
        }
      : null;

  const caseload: VoiceAgentCaseloadEntry[] = Array.isArray(i.caseload)
    ? (i.caseload as unknown[]).slice(0, 300).map((c) => {
        const r = (c ?? {}) as Record<string, unknown>;
        return {
          id: String(r.id ?? ""),
          firstName: String(r.firstName ?? "").slice(0, 80),
          lastName: String(r.lastName ?? "").slice(0, 80),
          authorizedCodes: Array.isArray(r.authorizedCodes)
            ? (r.authorizedCodes as unknown[])
                .map((code) => String(code).toUpperCase().slice(0, 16))
                .slice(0, 20)
            : null,
        };
      })
    : [];

  const orgId = typeof i.orgId === "string" ? i.orgId : "";
  const staffId = typeof i.staffId === "string" ? i.staffId : "";
  if (!orgId || !staffId) {
    throw new Error("Missing organization or staff context.");
  }

  return { transcript, activeShift, caseload, orgId, staffId };
}

export const processVoiceIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateVoiceIntent)
  .handler(async ({ data }): Promise<VoiceAgentResponse> => {
    try {
      assertBedrockConfigured();
    } catch (e) {
      throw new Error(staffFacingCompassError(e, COMPASS_BEDROCK_UNAVAILABLE));
    }

    const system = `You are Compass, the AI voice agent inside Cedar — a DSPD Medicaid compliance platform for Utah disability service providers. Staff speak to you through a mic button and you figure out what they want to do and return a structured action.

Your job is to classify the staff member's intent from their spoken transcript and return a JSON response.

You do NOT clock anyone out, tick attestation/meds/GPS checkboxes, or submit a timesheet. Clock-out writes happen on the punch pad after the staff member reviews. Your job is only to classify and extract.

Rules:
- Always return valid JSON matching one of the intent types
- Combined speech is allowed and required: if the transcript contains BOTH a shift note AND a request to clock out (example: "We went to the store, he was in a good mood. Clock me out."), return "expand_note_and_clock_out". Put only the note content in "narrative" — strip the clock-out request. Do not drop the note. Do not drop the clock-out.
- "expand_note" — staff want to add content to their open shift note and did NOT ask to clock out. Extract the note content from their words. Only use this if there is an active shift.
- "expand_note_and_clock_out" — staff dictated a shift note AND asked to clock out in the same utterance. Only use this if there is an active shift.
- "clock_in" — staff want to start a shift. Identify the client by matching their spoken name against the caseload. Identify the service code from what they say or from the client's authorized codes if only one exists. If ambiguous return "clarify".
- "clock_out" — staff asked to end their current shift and did NOT dictate a note. Only valid if there is an active shift. Do NOT invent a narrative.
- "ask_compass" — staff are asking a compliance or policy question. Pass the question through.
- "clarify" — you understood the general intent but need one specific piece of information. Ask exactly one short question.
- "unknown" — you cannot determine intent. Return a helpful message.

Client matching: copy the client's exact id UUID from the caseload list — never invent an id. Match spoken first names case-insensitively. If there is only one client named "Justin" return that client's id. If there are multiple, return clarify asking which one.

Service code matching: if the staff says "SEI", "supported employment", "day supports", "HHS", "host home" etc — map to the appropriate DSPD service code. If unclear and the client has only one authorized code, use that. If still ambiguous, clarify.`;

    const caseloadText = formatCaseloadForPrompt(data.caseload);
    const activeShiftText = data.activeShift
      ? `Yes — ${data.activeShift.clientFirstName}, ${data.activeShift.serviceCode}`
      : "None";

    const user = `Transcript: ${data.transcript}

Active shift: ${activeShiftText}

Caseload: ${caseloadText || "(no clients on caseload)"}

Return JSON with one of these shapes:
{ "intent": "expand_note", "narrative": "text to add to the note" }
{ "intent": "expand_note_and_clock_out", "narrative": "note content without the clock-out request" }
{ "intent": "clock_in", "clientId": "<exact uuid from the caseload list>", "clientName": "First Last", "serviceCode": "SEI" }
{ "intent": "clock_out" }
{ "intent": "ask_compass", "question": "the question" }
{ "intent": "clarify", "question": "one short clarifying question" }
{ "intent": "unknown", "message": "explanation" }`;

    const res = await gatewayFetch(
      {
        model: "bedrock",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      },
      { signal: getRequest()?.signal },
    );

    if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
    if (res.status === 401) throw new Error(COMPASS_BEDROCK_UNAVAILABLE);
    if (!res.ok) {
      throw new Error(
        staffFacingCompassError(
          new Error(`AI error (${res.status}).`),
          "Compass couldn't process that — please try again.",
        ),
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "";

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          return FALLBACK_UNKNOWN;
        }
      } else {
        return FALLBACK_UNKNOWN;
      }
    }

    return applyCaseloadClockInResolution(
      reconcileVoiceAgentResponse(parsed, data.transcript),
      data.caseload,
      data.transcript,
    );
  });

// ─── createClockIn — Compass EVV clock-in ───────────────────────────────────
// Same timesheet write shape as punch-pad.tsx writeShift for GPS + Utah
// provider/member IDs + service code + shift entry type. GPS is required:
// the UI must not call this without a browser geolocation fix, and this
// handler refuses to insert a gps_in_bypassed stub. Geofence-variance and
// pending-forms dialogs stay on the punch pad (Sep 1); honest GPS on the
// row is the bar. State UEVV transmission is still the admin CSV export.

const CreateClockInZ = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
  serviceCode: z.string().min(1).max(16),
  gps: z.object({
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    accuracyMeters: z.number().finite(),
  }),
});

export const createClockIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateClockInZ.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    if (!context.supabase || !context.userId) {
      throw new Error("Not authenticated.");
    }

    if (isLikelyBadCoord({ lat: data.gps.latitude, lng: data.gps.longitude })) {
      throw new Error(
        "Location isn't available for this clock-in. Open the punch pad to clock in instead.",
      );
    }

    // Same gates createShift enforces before writing — a voice clock-in must
    // not be able to bypass billing authorization or the Launchpad
    // training requirement. Errors here surface verbatim to the UI.
    const [clientRes, orgRes] = await Promise.all([
      context.supabase
        .from("clients")
        .select("medicaid_id")
        .eq("id", data.clientId)
        .eq("organization_id", data.organizationId)
        .maybeSingle(),
      context.supabase
        .from("organizations")
        .select("dhhs_provider_id")
        .eq("id", data.organizationId)
        .maybeSingle(),
      assertActiveBillingCode(
        context.supabase,
        data.organizationId,
        data.clientId,
        data.serviceCode,
      ),
      assertLaunchpadPassed(context.supabase, context.userId, "clock_in"),
    ]);

    if (clientRes.error) throw new Error(clientRes.error.message);
    if (orgRes.error) throw new Error(orgRes.error.message);
    if (!clientRes.data) {
      throw new Error("Client not found in this organization.");
    }

    const memberId = padMemberId(
      (clientRes.data as { medicaid_id: string | null } | null)?.medicaid_id ?? null,
    );
    if (!memberId) {
      throw new Error(
        "This client is missing a Utah Medicaid Member ID — add one before clocking in.",
      );
    }

    const providerId = (
      (orgRes.data as { dhhs_provider_id: string | null } | null)?.dhhs_provider_id ?? ""
    ).trim();
    if (!providerId) {
      throw new Error(
        "This agency is missing a DHHS Provider ID — an admin needs to set it in Settings before clocking in.",
      );
    }

    const nowIso = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (context.supabase as any)
      .from("evv_timesheets")
      .insert({
        organization_id: data.organizationId,
        staff_id: context.userId,
        client_id: data.clientId,
        utah_medicaid_provider_id: providerId,
        utah_medicaid_member_id: memberId,
        service_type_code: data.serviceCode.toUpperCase(),
        clock_in_timestamp: nowIso,
        raw_clock_in: nowIso,
        rounded_clock_in: roundToQuarterHourISO(nowIso),
        // Workspace punch pad (the Compass fallback) uses Client_Profile_Pass.
        shift_entry_type: "Client_Profile_Pass",
        status: "Active",
        timezone_setting: "America/Denver",
        gps_in_coordinates: {
          latitude: data.gps.latitude,
          longitude: data.gps.longitude,
          accuracy_meters: data.gps.accuracyMeters,
        },
        gps_validated: true,
        gps_in_bypassed: false,
        gps_in_bypass_reason: null,
        is_out_of_bounds: false,
        created_from: "voice_agent",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
