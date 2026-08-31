// Hire + client-assignment hooks. Hive writes the obligation list.
// Staff never pick or self-enroll. All writes are idempotent.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  generateNextInstanceInternal,
  onPcspActivatedInternal,
} from "./company-obligations.functions";
import { assignMatchingPoliciesForStaffInternal } from "./agency-policies.functions";
import {
  ABI_OBLIGATION_TITLES,
  assignmentNeedsAbi,
  assignmentNeedsMandt,
  assignmentNeedsSupportStrategies,
  clientFlagsFromExistingSchema,
  titleGroupsForHire,
} from "./obligation-auto-assign";
import { MANDT_OBLIGATION_TITLES } from "./training-class";
import {
  ensureOpenStaffObligationInternal,
  loadStaffForEnsure,
} from "./ensure-staff-obligation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

async function loadClientAssignmentFlags(
  supabase: AnySupabase,
  organizationId: string,
  clientId: string,
): Promise<ReturnType<typeof clientFlagsFromExistingSchema>> {
  const [{ data: client }, { data: bsc }, { data: targets }] = await Promise.all([
    supabase
      .from("clients")
      .select("has_abi, pcsp_signed_date, pcsp_expiration_date, pcsp_goals")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("behavior_support_clients")
      .select("features_enabled")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase
      .from("client_target_behaviors")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .limit(1),
  ]);
  const row = (client ?? {}) as {
    has_abi?: boolean | null;
    pcsp_signed_date?: string | null;
    pcsp_expiration_date?: string | null;
    pcsp_goals?: unknown;
  };
  return clientFlagsFromExistingSchema({
    ...row,
    behaviorPlanEnabled: (bsc as { features_enabled?: boolean } | null)?.features_enabled === true,
    hasTargetBehaviors: ((targets ?? []) as Array<{ id: string }>).length > 0,
  });
}

export async function onStaffHiredInternal(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
): Promise<void> {
  const staff = await loadStaffForEnsure(supabase, organizationId, staffId);
  if (!staff) return;

  for (const titles of titleGroupsForHire()) {
    await ensureOpenStaffObligationInternal(supabase, organizationId, titles, staff, {
      periodPrefix: "Hire",
    });
  }
  try {
    await assignMatchingPoliciesForStaffInternal(supabase, organizationId, staffId);
  } catch (e) {
    console.warn("[obligations] policy fan-out on hire failed:", e);
  }
}

export async function onStaffAssignmentCreatedInternal(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
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
    await generateNextInstanceInternal(supabase, organizationId, ob.id);
  }

  const flags = await loadClientAssignmentFlags(supabase, organizationId, clientId);
  const { data: prof } = await supabase
    .from("profiles")
    .select("requires_abi, requires_deescalation")
    .eq("id", staffId)
    .maybeSingle();
  const staffFlags = {
    requiresAbi: (prof as { requires_abi?: boolean } | null)?.requires_abi === true,
    requiresDeescalation:
      (prof as { requires_deescalation?: boolean } | null)?.requires_deescalation === true,
  };

  if (assignmentNeedsSupportStrategies(flags)) {
    try {
      await onPcspActivatedInternal(supabase, organizationId, clientId);
    } catch (e) {
      console.warn("[obligations] PCSP clock on assignment failed:", e);
    }
  }

  const staff = await loadStaffForEnsure(supabase, organizationId, staffId);
  if (staff && assignmentNeedsAbi(flags, staffFlags)) {
    await ensureOpenStaffObligationInternal(
      supabase,
      organizationId,
      [...ABI_OBLIGATION_TITLES],
      staff,
      { periodPrefix: "ABI" },
    );
  }
  if (staff && assignmentNeedsMandt(flags, staffFlags)) {
    await ensureOpenStaffObligationInternal(
      supabase,
      organizationId,
      [...MANDT_OBLIGATION_TITLES],
      staff,
      { periodPrefix: "Mandt" },
    );
  }
  try {
    await assignMatchingPoliciesForStaffInternal(supabase, organizationId, staffId);
  } catch (e) {
    console.warn("[obligations] policy fan-out on assignment failed:", e);
  }
}

export const onStaffHired = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        staffId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    await onStaffHiredInternal(supabase, data.organizationId, data.staffId);
    return { ok: true };
  });

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
