/**
 * Stubs for detection types not yet implemented. They keep the useComplianceGate
 * contract stable so surfaces can register today; real detectors land later
 * without any surface changes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StubInput = z
  .object({
    organizationId: z.string().uuid(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

type StubResult = { flags: Array<{ ruleId: string; requirementId: string; matchedCodes: string[]; humanExplanation: string; source: { title: string; verbatim: string; citation: string | null } }> };
const empty = (): StubResult => ({ flags: [] });

export const checkStaffPrerequisite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => StubInput.parse(d))
  .handler(async () => empty());

export const checkDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => StubInput.parse(d))
  .handler(async () => empty());

export const checkActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => StubInput.parse(d))
  .handler(async () => empty());
