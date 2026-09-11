// Load StaffDutyFacts from live tables only. Missing table/column → *Known=false
// or null flags (unanswered). Never invent SEI columns or a second assignment table.

import { UNKNOWN_STAFF_DUTY_FACTS, type StaffDutyFacts } from "./duty-applicability.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function columnsMissing(message: string | undefined): boolean {
  return !!message && /does not exist|schema cache|column|could not find/i.test(message);
}

function tableMissing(message: string | undefined): boolean {
  return !!message && /does not exist|schema cache|relation|could not find/i.test(message);
}

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export async function loadStaffDutyFactsInternal(
  supabase: AnySupabase,
  organizationId: string,
  staffIds: string[],
): Promise<Map<string, StaffDutyFacts>> {
  const ids = unique(staffIds);
  const out = new Map<string, StaffDutyFacts>();
  if (!ids.length) return out;

  for (const staffId of ids) {
    out.set(staffId, { staffId, ...UNKNOWN_STAFF_DUTY_FACTS });
  }

  let members: Array<{ user_id: string; role: string | null; manager_id?: string | null }> = [];
  let managerIdKnown = true;
  {
    const full = await supabase
      .from("organization_members")
      .select("user_id, role, manager_id")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .in("user_id", ids);
    if (full.error && columnsMissing(full.error.message)) {
      managerIdKnown = false;
      const retry = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .in("user_id", ids);
      if (retry.error) throw new Error(retry.error.message);
      members = (retry.data ?? []) as Array<{ user_id: string; role: string | null }>;
    } else if (full.error) {
      throw new Error(full.error.message);
    } else {
      members = (full.data ?? []) as Array<{
        user_id: string;
        role: string | null;
        manager_id: string | null;
      }>;
    }
  }

  const assignmentsKnown = { value: false };
  const assignedByStaff = new Map<string, { clientIds: Set<string>; codes: Set<string> }>();
  {
    const { data, error } = await supabase
      .from("staff_assignments")
      .select("staff_id, client_id, service_codes")
      .eq("organization_id", organizationId)
      .in("staff_id", ids);
    if (error) {
      if (!tableMissing(error.message)) throw new Error(error.message);
    } else {
      assignmentsKnown.value = true;
      for (const row of (data ?? []) as Array<{
        staff_id: string;
        client_id: string;
        service_codes: string[] | null;
      }>) {
        const bucket = assignedByStaff.get(row.staff_id) ?? {
          clientIds: new Set<string>(),
          codes: new Set<string>(),
        };
        if (row.client_id) bucket.clientIds.add(row.client_id);
        for (const code of row.service_codes ?? []) {
          if (code) bucket.codes.add(code.toUpperCase());
        }
        assignedByStaff.set(row.staff_id, bucket);
      }
    }
  }

  const transportsKnown = { value: false };
  const transporterIds = new Set<string>();
  {
    const { data, error } = await supabase
      .from("day_program_transport")
      .select("transport_staff_id")
      .in("transport_staff_id", ids);
    if (error) {
      if (!tableMissing(error.message)) throw new Error(error.message);
    } else {
      transportsKnown.value = true;
      for (const row of (data ?? []) as Array<{ transport_staff_id: string | null }>) {
        if (row.transport_staff_id) transporterIds.add(row.transport_staff_id);
      }
    }
  }

  const abiClientIds = new Set<string>();
  const abiCaseloadKnown = { value: false };
  const allClientIds = unique([...assignedByStaff.values()].flatMap((b) => [...b.clientIds]));
  if (allClientIds.length) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, has_abi")
      .eq("organization_id", organizationId)
      .in("id", allClientIds);
    if (error) {
      if (!columnsMissing(error.message) && !tableMissing(error.message)) {
        throw new Error(error.message);
      }
    } else {
      abiCaseloadKnown.value = true;
      for (const row of (data ?? []) as Array<{ id: string; has_abi: boolean | null }>) {
        if (row.has_abi === true) abiClientIds.add(row.id);
      }
    }
  } else if (assignmentsKnown.value) {
    abiCaseloadKnown.value = true;
  }

  const behaviorClientIds = new Set<string>();
  const behaviorCaseloadKnown = { value: false };
  {
    const [{ data: bsc, error: bErr }, { data: targets, error: tErr }] = await Promise.all([
      supabase
        .from("behavior_support_clients")
        .select("client_id")
        .eq("organization_id", organizationId)
        .eq("features_enabled", true),
      supabase
        .from("client_target_behaviors")
        .select("client_id")
        .eq("organization_id", organizationId),
    ]);
    if (
      (bErr && !tableMissing(bErr.message) && !columnsMissing(bErr.message)) ||
      (tErr && !tableMissing(tErr.message) && !columnsMissing(tErr.message))
    ) {
      throw new Error((bErr ?? tErr)!.message);
    }
    if (!bErr && !tErr) {
      behaviorCaseloadKnown.value = true;
      for (const row of (bsc ?? []) as Array<{ client_id: string }>) {
        if (row.client_id) behaviorClientIds.add(row.client_id);
      }
      for (const row of (targets ?? []) as Array<{ client_id: string }>) {
        if (row.client_id) behaviorClientIds.add(row.client_id);
      }
    }
  }

  const profileById = new Map<
    string,
    { requires_abi: boolean | null; requires_deescalation: boolean | null }
  >();
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, requires_abi, requires_deescalation")
      .in("id", ids);
    if (error) {
      if (!columnsMissing(error.message)) throw new Error(error.message);
    } else {
      for (const row of (data ?? []) as Array<{
        id: string;
        requires_abi: boolean | null;
        requires_deescalation: boolean | null;
      }>) {
        profileById.set(row.id, {
          requires_abi: typeof row.requires_abi === "boolean" ? row.requires_abi : null,
          requires_deescalation:
            typeof row.requires_deescalation === "boolean" ? row.requires_deescalation : null,
        });
      }
    }
  }

  const memberByUser = new Map(members.map((m) => [m.user_id, m]));

  for (const staffId of ids) {
    const mem = memberByUser.get(staffId);
    const assigned = assignedByStaff.get(staffId);
    const clientIds = assigned ? [...assigned.clientIds] : [];
    const codes = assigned ? [...assigned.codes] : [];
    const hasAbiCaseload = clientIds.some((id) => abiClientIds.has(id));
    const hasBehaviorCaseload = clientIds.some((id) => behaviorClientIds.has(id));
    const prof = profileById.get(staffId);
    const isTransporter =
      transporterIds.has(staffId) || codes.some((c) => c.toUpperCase() === "MTP");

    out.set(staffId, {
      staffId,
      role: mem?.role ?? null,
      assignmentsKnown: assignmentsKnown.value,
      assignedClientIds: clientIds,
      assignedServiceCodes: codes,
      transportsKnown: transportsKnown.value,
      isTransporter,
      abiCaseloadKnown: abiCaseloadKnown.value,
      hasAbiCaseload,
      requiresAbi: prof?.requires_abi ?? null,
      behaviorCaseloadKnown: behaviorCaseloadKnown.value,
      hasBehaviorCaseload,
      requiresDeescalation: prof?.requires_deescalation ?? null,
      managerIdKnown,
      managerId: managerIdKnown ? (mem?.manager_id ?? null) : null,
    });
  }

  return out;
}
