// Hook fired when a staff member is assigned to a client (a new
// staff_assignments row). Generates any staff_per_client Company
// Obligation instances (e.g. client-specific training) that now apply,
// so the deadline starts ticking from the moment of assignment rather
// than waiting for the next scheduled generator sweep.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  generateNextInstanceInternal,
  onPcspActivatedInternal,
} from "./company-obligations.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export async function onStaffAssignmentCreatedInternal(
  supabase: AnySupabase,
  organizationId: string,
  _staffId: string,
  clientId: string,
  serviceCodes: string[],
): Promise<void> {
  const { data: obligations, error } = await supabase
    .from("company_obligations")
    .select("id, target_service_codes")
    .eq("organization_id", organizationId)
    .eq("scope", "staff_per_client")
    .eq("active", true);
  if (error) throw new Error(error.message);

  const haveUpper = new Set((serviceCodes ?? []).map((c) => c.toUpperCase()));
  for (const ob of (obligations ?? []) as Array<{
    id: string;
    target_service_codes: string[] | null;
  }>) {
    const targets = ob.target_service_codes ?? [];
    const matches = targets.length === 0 || targets.some((c) => haveUpper.has(c.toUpperCase()));
    if (!matches) continue;
    // Re-derives every qualifying (staff, client) pair for this obligation
    // and skips any that already have an open instance — safe to call for
    // every new assignment without double-generating.
    await generateNextInstanceInternal(supabase, organizationId, ob.id);
  }
  try {
    await onPcspActivatedInternal(supabase, organizationId, clientId);
  } catch (e) {
    console.warn("[obligations] PCSP clock on assignment failed:", e);
  }
}

export const onStaffAssignmentCreated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        staffId: z.string().uuid(),
        clientId: z.string().uuid(),
        serviceCodes: z.array(z.string()).default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    await onStaffAssignmentCreatedInternal(
      supabase,
      data.organizationId,
      data.staffId,
      data.clientId,
      data.serviceCodes,
    );
    return { ok: true };
  });
