// Hire + client-assignment hooks. Hive writes the obligation list.
// Staff never pick or self-enroll. All writes are idempotent.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { generateNextInstanceInternal } from "./company-obligations.functions";
import { assignMatchingPoliciesForStaffInternal } from "./agency-policies.functions";
import {
  ensureOpenStaffObligationByKeyInternal,
  loadStaffForEnsure,
} from "./ensure-staff-obligation";
import { loadOrgFacts } from "./obligations/applicability";
import {
  dutyKeyForObligation,
  evaluateStaffDuties,
  planDutyReevaluation,
} from "./obligations/duty-applicability";
import { loadStaffDutyFactsInternal } from "./obligations/load-staff-duty-facts.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export async function reevaluateStaffDutiesInternal(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
): Promise<void> {
  const staff = await loadStaffForEnsure(supabase, organizationId, staffId);
  if (!staff) return;

  const [orgFacts, factsByStaff, { data: obligations, error: obErr }] = await Promise.all([
    loadOrgFacts(supabase, organizationId),
    loadStaffDutyFactsInternal(supabase, organizationId, [staffId]),
    supabase
      .from("company_obligations")
      .select("id, title, key, scope, disposition")
      .eq("organization_id", organizationId)
      .eq("active", true),
  ]);
  if (obErr) throw new Error(obErr.message);

  const facts = factsByStaff.get(staffId);
  if (!facts) return;

  const staffObs = (
    (obligations ?? []) as Array<{
      id: string;
      title: string;
      key?: string | null;
      scope?: string | null;
      disposition?: string | null;
    }>
  ).filter((ob) => ob.scope === "staff" || ob.scope === "staff_per_client" || !ob.scope);

  const keyed = staffObs
    .map((ob) => ({ ob, key: dutyKeyForObligation(ob) }))
    .filter((row): row is { ob: (typeof staffObs)[number]; key: string } => !!row.key);
  if (!keyed.length) return;

  const duties = evaluateStaffDuties({
    dutyKeys: [...new Set(keyed.map((r) => r.key))],
    staff: facts,
    orgFacts,
  });

  const { data: instances, error: iErr } = await supabase
    .from("company_obligation_instances")
    .select("id, obligation_id, status, completed_at, upload_path, attestation_signed_at")
    .eq("organization_id", organizationId)
    .eq("assignee_staff_id", staffId);
  if (iErr) throw new Error(iErr.message);

  const obIdToKey = new Map(keyed.map((r) => [r.ob.id, r.key]));
  const openDutyKeys = new Set<string>();
  const evidenceDutyKeys = new Set<string>();
  for (const row of (instances ?? []) as Array<{
    obligation_id: string;
    status: string;
    completed_at: string | null;
    upload_path: string | null;
    attestation_signed_at: string | null;
  }>) {
    const key = obIdToKey.get(row.obligation_id);
    if (!key) continue;
    if (row.status === "pending" || row.status === "overdue") openDutyKeys.add(key);
    if (
      row.status === "completed" ||
      row.status === "waived" ||
      row.completed_at ||
      row.upload_path ||
      row.attestation_signed_at
    ) {
      evidenceDutyKeys.add(key);
    }
  }

  const plan = planDutyReevaluation({
    staff: facts,
    duties,
    openDutyKeys,
    evidenceDutyKeys,
    evaluationComplete: facts.assignmentsKnown,
  });

  for (const key of plan.openKeys) {
    await ensureOpenStaffObligationByKeyInternal(supabase, organizationId, key, staff, {
      periodPrefix: "Assigned",
    });
  }
}

export async function reevaluateStaffAssignedToClientInternal(
  supabase: AnySupabase,
  organizationId: string,
  clientId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("staff_assignments")
    .select("staff_id")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  const staffIds = [
    ...new Set(
      ((data ?? []) as Array<{ staff_id: string | null }>)
        .map((r) => r.staff_id)
        .filter((id): id is string => !!id),
    ),
  ];
  for (const staffId of staffIds) {
    await reevaluateStaffDutiesInternal(supabase, organizationId, staffId);
  }
}

export async function onStaffHiredInternal(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
): Promise<void> {
  await reevaluateStaffDutiesInternal(supabase, organizationId, staffId);
  try {
    await assignMatchingPoliciesForStaffInternal(supabase, organizationId, staffId);
  } catch (e) {
    console.warn("[obligations] policy fan-out on hire failed:", e);
  }
}

export async function onStaffAssignmentRemovedInternal(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
): Promise<void> {
  await reevaluateStaffDutiesInternal(supabase, organizationId, staffId);
  try {
    await assignMatchingPoliciesForStaffInternal(supabase, organizationId, staffId);
  } catch (e) {
    console.warn("[obligations] policy fan-out on assignment remove failed:", e);
  }
}

export async function onSupervisorChangedInternal(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
  managerId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("organization_members")
    .update({ manager_id: managerId })
    .eq("organization_id", organizationId)
    .eq("user_id", staffId);
  if (error) throw new Error(error.message);
  await reevaluateStaffDutiesInternal(supabase, organizationId, staffId);
}

export async function onStaffAssignmentCreatedInternal(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
  _clientId: string,
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

  try {
    await assignMatchingPoliciesForStaffInternal(supabase, organizationId, staffId);
  } catch (e) {
    console.warn("[obligations] policy fan-out on assignment failed:", e);
  }
  await reevaluateStaffDutiesInternal(supabase, organizationId, staffId);
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

export const onStaffAssignmentRemoved = createServerFn({ method: "POST" })
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
    await onStaffAssignmentRemovedInternal(supabase, data.organizationId, data.staffId);
    return { ok: true };
  });

export const setStaffSupervisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        staffId: z.string().uuid(),
        managerId: z.string().uuid().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    await onSupervisorChangedInternal(supabase, data.organizationId, data.staffId, data.managerId);
    return { ok: true };
  });

export const onClientDutyFactsChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        clientId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    await reevaluateStaffAssignedToClientInternal(supabase, data.organizationId, data.clientId);
    return { ok: true };
  });
