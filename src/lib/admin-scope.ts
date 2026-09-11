/**
 * Admin scope (not caseload). Persists on existing scope_assignments rows.
 *
 * Live CHECK allows: all | client | service_code | staff_group.
 * Selected mode writes BOTH client rows and staff rows together.
 * Individual staff refs use staff_group + a "staff:" prefix so we do not
 * collide with real staff_groups ids and do not need a CHECK change to ship.
 * Core can later add scope_type = 'staff'; parseAdminScope already reads it.
 */

export const ADMIN_SCOPE_MODES = ["all", "selected", "service_code"] as const;
export type AdminScopeMode = (typeof ADMIN_SCOPE_MODES)[number];

export const STAFF_SCOPE_REF_PREFIX = "staff:";

export type ScopeAssignmentRow = {
  scope_type: string;
  scope_ref_id: string | null;
};

export type ParsedAdminScope = {
  mode: AdminScopeMode;
  clientIds: string[];
  staffIds: string[];
  serviceCodes: string[];
  legacyStaffGroupIds: string[];
};

export function encodeStaffScopeRef(userId: string): string {
  return `${STAFF_SCOPE_REF_PREFIX}${userId}`;
}

export function decodeStaffScopeRef(refId: string | null | undefined): string | null {
  if (!refId || !refId.startsWith(STAFF_SCOPE_REF_PREFIX)) return null;
  const id = refId.slice(STAFF_SCOPE_REF_PREFIX.length).trim();
  return id || null;
}

export function isAdminScopeRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "program_manager" || role === "manager";
}

export function adminScopeIsLockedWholeOrg(role: string | null | undefined): boolean {
  return role === "admin";
}

export function parseAdminScope(rows: readonly ScopeAssignmentRow[]): ParsedAdminScope {
  const clientIds: string[] = [];
  const staffIds: string[] = [];
  const serviceCodes: string[] = [];
  const legacyStaffGroupIds: string[] = [];
  let sawAll = false;

  for (const row of rows) {
    const type = row.scope_type;
    const ref = row.scope_ref_id;
    if (type === "all") {
      sawAll = true;
      continue;
    }
    if (type === "client" && ref) clientIds.push(ref);
    else if (type === "service_code" && ref) serviceCodes.push(ref);
    else if (type === "staff" && ref) staffIds.push(ref);
    else if (type === "staff_group" && ref) {
      const staffId = decodeStaffScopeRef(ref);
      if (staffId) staffIds.push(staffId);
      else legacyStaffGroupIds.push(ref);
    }
  }

  if (clientIds.length || staffIds.length) {
    return { mode: "selected", clientIds, staffIds, serviceCodes: [], legacyStaffGroupIds };
  }
  if (serviceCodes.length) {
    return { mode: "service_code", clientIds: [], staffIds: [], serviceCodes, legacyStaffGroupIds };
  }
  if (sawAll || !rows.length) {
    return { mode: "all", clientIds: [], staffIds: [], serviceCodes: [], legacyStaffGroupIds };
  }
  if (legacyStaffGroupIds.length) {
    return { mode: "selected", clientIds: [], staffIds: [], serviceCodes: [], legacyStaffGroupIds };
  }
  return { mode: "all", clientIds: [], staffIds: [], serviceCodes: [], legacyStaffGroupIds };
}

export function buildAdminScopeRows(input: {
  mode: AdminScopeMode;
  clientIds?: readonly string[];
  staffIds?: readonly string[];
  serviceCodes?: readonly string[];
}): ScopeAssignmentRow[] {
  if (input.mode === "all") {
    return [{ scope_type: "all", scope_ref_id: null }];
  }
  if (input.mode === "service_code") {
    const codes = uniqueIds(input.serviceCodes);
    return codes.map((code) => ({ scope_type: "service_code", scope_ref_id: code }));
  }
  const clientIds = uniqueIds(input.clientIds);
  const staffIds = uniqueIds(input.staffIds);
  return [
    ...clientIds.map((id) => ({ scope_type: "client" as const, scope_ref_id: id })),
    ...staffIds.map((id) => ({
      scope_type: "staff_group" as const,
      scope_ref_id: encodeStaffScopeRef(id),
    })),
  ];
}

export function adminScopeSummary(scope: ParsedAdminScope): string {
  if (scope.mode === "all") return "Whole organization";
  if (scope.mode === "service_code") {
    if (!scope.serviceCodes.length) return "Service code: none selected";
    return `Service code: ${scope.serviceCodes.join(", ")}`;
  }
  const parts: string[] = [];
  if (scope.clientIds.length) {
    parts.push(`${scope.clientIds.length} client${scope.clientIds.length === 1 ? "" : "s"}`);
  }
  if (scope.staffIds.length) {
    parts.push(`${scope.staffIds.length} staff`);
  }
  if (scope.legacyStaffGroupIds.length) {
    parts.push(
      `${scope.legacyStaffGroupIds.length} staff group${scope.legacyStaffGroupIds.length === 1 ? "" : "s"}`,
    );
  }
  if (!parts.length) return "Selected clients and staff: none selected";
  return `Selected clients and staff: ${parts.join(", ")}`;
}

export type AdminScopeClientOption = {
  id: string;
  first_name: string;
  last_name: string;
};

export type AdminScopeStaffOption = {
  user_id: string;
  role: string;
  full_name: string;
};

/** Org client list for Admin scope pickers — not a care-data read. */
export async function listAdminScopeClients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  clientSearch: string,
): Promise<AdminScopeClientOption[]> {
  let q = supabase
    .from("clients")
    .select("id, first_name, last_name")
    .eq("organization_id", orgId)
    .limit(40);
  if (clientSearch.trim()) q = q.ilike("first_name", `%${clientSearch.trim()}%`);
  const { data } = await q;
  return (data ?? []) as AdminScopeClientOption[];
}

export async function listAdminScopeStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
): Promise<AdminScopeStaffOption[]> {
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", orgId)
    .eq("active", true);
  const ids = ((members ?? []) as Array<{ user_id: string; role: string }>).map((m) => m.user_id);
  if (!ids.length) return [];
  const { data: profiles } = await supabase
    .from("org_member_directory")
    .select("id, full_name")
    .in("id", ids);
  const nameById = new Map(
    ((profiles ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
      p.id,
      p.full_name ?? "Unknown",
    ]),
  );
  return ((members ?? []) as Array<{ user_id: string; role: string }>)
    .map((m) => ({
      user_id: m.user_id,
      role: m.role,
      full_name: nameById.get(m.user_id) ?? "Unknown",
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

function uniqueIds(ids: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids ?? []) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
