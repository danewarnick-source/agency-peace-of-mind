import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { draftShiftNote } from "@/lib/ai-coach.functions";

// ─── Compass / punch-pad note expansion ─────────────────────────────────────
// Thin wrapper around draftShiftNote (NECTAR). Punch-pad "Expand with Compass"
// and daily-log expand keep this function name so callers do not change;
// there is one prompt, not two.

interface ExpandInput {
  narrative: string;
  goals: string[];
  serviceCode: string;
  clientFirstName: string;
}

function validateExpand(input: unknown): ExpandInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const narrative = typeof i.narrative === "string" ? i.narrative.trim() : "";
  const goals = Array.isArray(i.goals)
    ? (i.goals as unknown[]).map((g) => String(g)).slice(0, 25)
    : [];
  const serviceCode = typeof i.serviceCode === "string" ? i.serviceCode.slice(0, 16) : "";
  const clientFirstName =
    typeof i.clientFirstName === "string" ? i.clientFirstName.slice(0, 80) : "the client";
  if (narrative.length === 0 || narrative.length > 8000) {
    throw new Error("Narrative must be 1–8000 characters.");
  }
  return { narrative, goals, serviceCode, clientFirstName };
}

export const expandShiftNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateExpand)
  .handler(async ({ data }): Promise<string> => {
    const shorthand = data.narrative.slice(0, 4000);
    if (shorthand.length < 3) {
      throw new Error("Shorthand must be 3–4000 characters.");
    }
    // serviceCode is accepted for caller compatibility; NECTAR's draft prompt
    // is service-agnostic (same engine as historical Draft with NECTAR).
    void data.serviceCode;
    const { draft } = await draftShiftNote({
      data: {
        shorthand,
        goals: data.goals,
        clientFirstName: data.clientFirstName,
      },
    });
    return draft;
  });
