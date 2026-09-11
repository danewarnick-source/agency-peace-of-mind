// Compliance scope (revamp Step 3).
// resolveScope is the only path for "who is in this user's scope".
// Missing scope_group_id → org-wide (Step 2 fallback). Do not expand
// This Week sources here — Step 5 facts stay untouched.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type ScopeMemberRow = {
  group_id: string;
  staff_id: string;
  is_lead: boolean;
};

export type ResolveScopeInput = {
  organizationId: string;
  userId: string;
  /** profiles.scope_group_id — null/undefined = missing → org-wide unless lead. */
  scopeGroupId: string | null | undefined;
  members: ScopeMemberRow[];
};

export type ResolvedScope = {
  organizationId: string;
  userId: string;
  scopeGroupId: string | null;
  leadGroupIds: string[];
  /** Staff user ids visible in this scope. Empty when isOrgWide. */
  staffUserIds: string[];
  /** True when scope_group_id is missing and the user leads no group. */
  isOrgWide: boolean;
};

export type ScopeIndex = {
  leadsByGroupId: Record<string, string[]>;
  scopeByStaffId: Record<string, string | null>;
};

export type OrgScopeSnapshot = {
  available: boolean;
  groups: Array<{ id: string; name: string }>;
  members: ScopeMemberRow[];
  scopeByStaffId: Record<string, string | null>;
  leadsByGroupId: Record<string, string[]>;
};

const NONE = "none";

export const SCOPE_NONE_VALUE = NONE;

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function columnMissing(message: string | undefined): boolean {
  return !!message && /does not exist|schema cache|column|scope_group_id|is_lead/i.test(message);
}

export function buildScopeIndex(
  scopeByStaffId: Record<string, string | null>,
  members: ScopeMemberRow[],
): ScopeIndex {
  const leadsByGroupId: Record<string, string[]> = {};
  for (const row of members) {
    if (!row.is_lead) continue;
    const list = leadsByGroupId[row.group_id] ?? [];
    list.push(row.staff_id);
    leadsByGroupId[row.group_id] = list;
  }
  for (const groupId of Object.keys(leadsByGroupId)) {
    leadsByGroupId[groupId] = uniqueIds(leadsByGroupId[groupId] ?? []).sort();
  }
  return { leadsByGroupId, scopeByStaffId };
}

/** Lead of a scope group (stable sort). Null → caller uses Step 2 admin_level. */
export function pickScopeAdminRecipient(
  scopeGroupId: string | null | undefined,
  leadsByGroupId: Record<string, string[]>,
): string | null {
  if (!scopeGroupId) return null;
  const leads = leadsByGroupId[scopeGroupId];
  return leads?.[0] ?? null;
}

export function resolveScope(input: ResolveScopeInput): ResolvedScope {
  const scopeGroupId = input.scopeGroupId ?? null;
  const leadGroupIds = uniqueIds(
    input.members.filter((m) => m.is_lead && m.staff_id === input.userId).map((m) => m.group_id),
  ).sort();

  if (!scopeGroupId && leadGroupIds.length === 0) {
    return {
      organizationId: input.organizationId,
      userId: input.userId,
      scopeGroupId: null,
      leadGroupIds: [],
      staffUserIds: [],
      isOrgWide: true,
    };
  }

  const groupIds = new Set<string>(leadGroupIds);
  if (scopeGroupId) groupIds.add(scopeGroupId);

  const staffUserIds = uniqueIds(
    input.members.filter((m) => groupIds.has(m.group_id)).map((m) => m.staff_id),
  );
  if (!staffUserIds.includes(input.userId)) staffUserIds.push(input.userId);

  return {
    organizationId: input.organizationId,
    userId: input.userId,
    scopeGroupId,
    leadGroupIds,
    staffUserIds,
    isOrgWide: false,
  };
}

export function staffInScope(
  scope: ResolvedScope,
  staffUserId: string | null | undefined,
): boolean {
  if (scope.isOrgWide) return true;
  if (!staffUserId) return true;
  return scope.staffUserIds.includes(staffUserId);
}

/** null = do not filter (org-wide). */
export function evvStaffIdsForScope(scope: ResolvedScope): string[] | null {
  if (scope.isOrgWide) return null;
  return scope.staffUserIds;
}

export function emptyOrgScopeSnapshot(): OrgScopeSnapshot {
  return {
    available: false,
    groups: [],
    members: [],
    scopeByStaffId: {},
    leadsByGroupId: {},
  };
}

export async function loadOrgScopeSnapshot(
  supabase: AnySupabase,
  organizationId: string,
): Promise<OrgScopeSnapshot> {
  const { data: groups, error: gErr } = await supabase
    .from("staff_groups")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (gErr) {
    if (columnMissing(gErr.message)) return emptyOrgScopeSnapshot();
    throw new Error(gErr.message);
  }
  const groupRows = (groups ?? []) as Array<{ id: string; name: string }>;
  const groupIds = groupRows.map((g) => g.id);

  let members: ScopeMemberRow[] = [];
  if (groupIds.length) {
    const { data: memberRows, error: mErr } = await supabase
      .from("staff_group_members")
      .select("group_id, staff_id, is_lead")
      .in("group_id", groupIds);
    if (mErr) {
      if (columnMissing(mErr.message)) {
        const fallback = await supabase
          .from("staff_group_members")
          .select("group_id, staff_id")
          .in("group_id", groupIds);
        if (fallback.error) {
          if (columnMissing(fallback.error.message)) return emptyOrgScopeSnapshot();
          throw new Error(fallback.error.message);
        }
        members = ((fallback.data ?? []) as Array<{ group_id: string; staff_id: string }>).map(
          (r) => ({ group_id: r.group_id, staff_id: r.staff_id, is_lead: false }),
        );
      } else {
        throw new Error(mErr.message);
      }
    } else {
      members = (
        (memberRows ?? []) as Array<{
          group_id: string;
          staff_id: string;
          is_lead?: boolean | null;
        }>
      ).map((r) => ({
        group_id: r.group_id,
        staff_id: r.staff_id,
        is_lead: r.is_lead === true,
      }));
    }
  }

  const { data: orgMembers, error: omErr } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (omErr) throw new Error(omErr.message);
  const userIds = ((orgMembers ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);

  const scopeByStaffId: Record<string, string | null> = {};
  let available = true;
  if (userIds.length) {
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, scope_group_id")
      .in("id", userIds);
    if (pErr) {
      if (columnMissing(pErr.message)) {
        available = false;
      } else {
        throw new Error(pErr.message);
      }
    } else {
      for (const p of (profiles ?? []) as Array<{ id: string; scope_group_id: string | null }>) {
        scopeByStaffId[p.id] = p.scope_group_id ?? null;
      }
    }
  }

  const index = buildScopeIndex(scopeByStaffId, members);
  return {
    available,
    groups: groupRows,
    members,
    scopeByStaffId: index.scopeByStaffId,
    leadsByGroupId: index.leadsByGroupId,
  };
}

export function resolveScopeFromSnapshot(
  organizationId: string,
  userId: string,
  snapshot: OrgScopeSnapshot,
): ResolvedScope {
  return resolveScope({
    organizationId,
    userId,
    scopeGroupId: snapshot.scopeByStaffId[userId] ?? null,
    members: snapshot.members,
  });
}

export type EmployeeScopeDraft = {
  scopeGroupId: string | null;
  leadGroupId: string | null;
};

export function employeeScopeFromSnapshot(
  staffId: string,
  snapshot: OrgScopeSnapshot,
): EmployeeScopeDraft {
  const lead = snapshot.members.find((m) => m.staff_id === staffId && m.is_lead)?.group_id ?? null;
  return {
    scopeGroupId: snapshot.scopeByStaffId[staffId] ?? null,
    leadGroupId: lead,
  };
}
