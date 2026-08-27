import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { gatewayFetch, assertBedrockConfigured } from "@/lib/ai-bedrock.server";
import { assertActiveBillingCode, assertLaunchpadPassed } from "@/lib/scheduling/shifts.functions";
import { padMemberId } from "@/lib/evv-codes";
import { isLikelyBadCoord } from "@/lib/geo";
import { roundToQuarterHourISO } from "@/lib/time-rounding";

// ─── Cedar voice agent — Bedrock intent routing (Phase 2) ───────────────────
// processVoiceIntent classifies a spoken transcript into a structured action.
// Same gatewayFetch calling pattern as expandShiftNote in
// voice-documentation.server.ts, but WITH response_format: json_object since
// this call needs structured JSON back, not a plain draft.

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

export type VoiceAgentResponse =
  | { intent: "expand_note"; narrative: string }
  | { intent: "clock_in"; clientId: string; clientName: string; serviceCode: string }
  | { intent: "clock_out" }
  | { intent: "ask_compass"; question: string }
  | { intent: "clarify"; question: string }
  | { intent: "unknown"; message: string };

// Left untyped-as-the-union so callers can read .message directly — it's
// still structurally a valid VoiceAgentResponse wherever it's returned.
const FALLBACK_UNKNOWN = {
  intent: "unknown" as const,
  message: "Compass couldn't understand that — please try again.",
};

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

/**
 * Coerces Bedrock's parsed JSON into the strict VoiceAgentResponse union.
 * Any missing/malformed required field for the claimed intent falls back to
 * "unknown" rather than returning a half-formed action to the UI.
 */
function normalizeVoiceAgentResponse(parsed: Record<string, unknown>): VoiceAgentResponse {
  const intent = typeof parsed.intent === "string" ? parsed.intent : "";

  if (intent === "expand_note") {
    const narrative = typeof parsed.narrative === "string" ? parsed.narrative.trim() : "";
    if (narrative) return { intent: "expand_note", narrative };
  }

  if (intent === "clock_in") {
    const clientId = typeof parsed.clientId === "string" ? parsed.clientId : "";
    const serviceCode =
      typeof parsed.serviceCode === "string" ? parsed.serviceCode.toUpperCase() : "";
    const clientName = typeof parsed.clientName === "string" ? parsed.clientName.trim() : "";
    if (clientId && serviceCode) {
      return { intent: "clock_in", clientId, clientName: clientName || "this client", serviceCode };
    }
  }

  if (intent === "clock_out") {
    return { intent: "clock_out" };
  }

  if (intent === "ask_compass") {
    const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
    if (question) return { intent: "ask_compass", question };
  }

  if (intent === "clarify") {
    const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
    if (question) return { intent: "clarify", question };
  }

  if (intent === "unknown") {
    const message = typeof parsed.message === "string" ? parsed.message.trim() : "";
    return { intent: "unknown", message: message || FALLBACK_UNKNOWN.message };
  }

  return FALLBACK_UNKNOWN;
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

Rules:
- Always return valid JSON matching one of the intent types
- "expand_note" — staff want to add content to their open shift note. Extract the note content from their words. Only use this if there is an active shift.
- "clock_in" — staff want to start a shift. Identify the client by matching their spoken name against the caseload. Identify the service code from what they say or from the client's authorized codes if only one exists. If ambiguous return "clarify".
- "clock_out" — staff want to end their current shift. Only valid if there is an active shift.
- "ask_compass" — staff are asking a compliance or policy question. Pass the question through.
- "clarify" — you understood the general intent but need one specific piece of information. Ask exactly one short question.
- "unknown" — you cannot determine intent. Return a helpful message.

Client matching: match spoken first names case-insensitively. If there is only one client named "Justin" return that client. If there are multiple, return clarify asking which one.

Service code matching: if the staff says "SEI", "supported employment", "day supports", "HHS", "host home" etc — map to the appropriate DSPD service code. If unclear and the client has only one authorized code, use that. If still ambiguous, clarify.`;

    const caseloadText = data.caseload
      .map(
        (c) =>
          `${c.firstName} ${c.lastName} (authorized: ${c.authorizedCodes?.join(", ") ?? "unknown"})`,
      )
      .join("; ");
    const activeShiftText = data.activeShift
      ? `Yes — ${data.activeShift.clientFirstName}, ${data.activeShift.serviceCode}`
      : "None";

    const user = `Transcript: ${data.transcript}

Active shift: ${activeShiftText}

Caseload: ${caseloadText || "(no clients on caseload)"}

Return JSON with one of these shapes:
{ "intent": "expand_note", "narrative": "text to add to the note" }
{ "intent": "clock_in", "clientId": "uuid", "clientName": "First Last", "serviceCode": "SEI" }
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

    return normalizeVoiceAgentResponse(parsed);
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
