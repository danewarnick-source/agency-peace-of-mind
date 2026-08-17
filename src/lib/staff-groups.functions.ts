// Server functions for Staff Groups — named subsets of staff used to target
// Company Obligations at (e.g. "All House Managers", or a synced team roster).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type StaffGroupRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  color: string | null;
  linked_team_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type StaffGroupMemberRow = {
  id: string;
  group_id: string;
  staff_id: string;
  added_at: string | null;
  staff_name: string;
  staff_position: string | null;
};

const GROUP_SELECT = "id, organization_id, name, description, color, linked_team_id, created_at, updated_at";

// ─── list groups with member counts ────────────────────────────────────────
export const listStaffGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [] as Array<StaffGroupRow & { member_count: number }>;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const { data: groups, error } = await supabase
      .from("staff_groups")
      .select(GROUP_SELECT)
      .eq("organization_id", data.organizationId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const groupIds = (groups ?? []).map((g: StaffGroupRow) => g.id);
    const counts = new Map<string, number>();
    if (groupIds.length) {
      const { data: members, error: memErr } = await supabase
        .from("staff_group_members")
        .select("group_id")
        .in("group_id", groupIds);
      if (memErr) throw new Error(memErr.message);
      for (const row of (members ?? []) as Array<{ group_id: string }>) {
        counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
      }
    }

    return (groups ?? []).map((g: StaffGroupRow) => ({ ...g, member_count: counts.get(g.id) ?? 0 }));
  });

// ─── one group + its members (joined to org_member_directory) ─────────────
export const getStaffGroupWithMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    groupId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { group: null, members: [] as StaffGroupMemberRow[] };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const { data: group, error: gErr } = await supabase
      .from("staff_groups")
      .select(GROUP_SELECT)
      .eq("id", data.groupId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!group) return { group: null, members: [] as StaffGroupMemberRow[] };

    const { data: memberRows, error: mErr } = await supabase
      .from("staff_group_members")
      .select("id, group_id, staff_id, added_at")
      .eq("group_id", data.groupId);
    if (mErr) throw new Error(mErr.message);

    const staffIds = (memberRows ?? []).map((r: { staff_id: string }) => r.staff_id);
    let dirById = new Map<string, { full_name: string | null; position: string | null }>();
    if (staffIds.length) {
      const { data: dirRows, error: dErr } = await supabase
        .from("org_member_directory")
        .select("id, full_name, position")
        .in("id", staffIds);
      if (dErr) throw new Error(dErr.message);
      dirById = new Map(
        (dirRows ?? []).map((r: { id: string; full_name: string | null; position: string | null }) => [r.id, r]),
      );
    }

    const members: StaffGroupMemberRow[] = (memberRows ?? []).map((r: {
      id: string; group_id: string; staff_id: string; added_at: string | null;
    }) => ({
      ...r,
      staff_name: dirById.get(r.staff_id)?.full_name ?? "Unknown",
      staff_position: dirById.get(r.staff_id)?.position ?? null,
    }));

    return { group, members };
  });

// ─── create ─────────────────────────────────────────────────────────────
export const createStaffGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    description: z.string().max(2000).optional().nullable(),
    color: z.string().max(40).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { group: null as StaffGroupRow | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: inserted, error } = await supabase
      .from("staff_groups")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        description: data.description ?? null,
        color: data.color ?? null,
      })
      .select(GROUP_SELECT)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { group: (inserted ?? null) as StaffGroupRow | null };
  });

// ─── update ─────────────────────────────────────────────────────────────
export const updateStaffGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    groupId: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    description: z.string().max(2000).optional().nullable(),
    color: z.string().max(40).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { group: null as StaffGroupRow | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: existing, error: exErr } = await supabase
      .from("staff_groups")
      .select("name")
      .eq("id", data.groupId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (existing?.name === ALL_STAFF_GROUP_NAME && data.name !== ALL_STAFF_GROUP_NAME) {
      throw new Error("The All Staff group can't be renamed.");
    }

    const { data: updated, error } = await supabase
      .from("staff_groups")
      .update({
        name: data.name,
        description: data.description ?? null,
        color: data.color ?? null,
      })
      .eq("id", data.groupId)
      .eq("organization_id", data.organizationId)
      .select(GROUP_SELECT)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { group: (updated ?? null) as StaffGroupRow | null };
  });

// ─── "All Staff" system-managed auto-group ─────────────────────────────────
// Looked up/created lazily rather than seeded at org creation, so it also
// self-heals for orgs created before this existed. name === 'All Staff' is
// the identity — treat it as reserved (Groups UI blocks renaming/deleting).
export const ALL_STAFF_GROUP_NAME = "All Staff";

export async function ensureAllStaffGroupInternal(
  supabase: AnySupabase,
  organizationId: string,
): Promise<string> {
  const { data: existing, error: exErr } = await supabase
    .from("staff_groups")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", ALL_STAFF_GROUP_NAME)
    .maybeSingle();
  if (exErr) throw new Error(exErr.message);
  if (existing) return existing.id as string;

  const { data: inserted, error: insErr } = await supabase
    .from("staff_groups")
    .insert({
      organization_id: organizationId,
      name: ALL_STAFF_GROUP_NAME,
      description: "System-managed group — every staff member in this organization",
      color: "#6B7280",
    })
    .select("id")
    .maybeSingle();
  if (insErr) throw new Error(insErr.message);
  if (!inserted) throw new Error("Failed to create All Staff group.");
  return inserted.id as string;
}

export const ensureAllStaffGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { id: null as string | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    const id = await ensureAllStaffGroupInternal(supabase, data.organizationId);
    return { id };
  });

/** Add a staff member to the All Staff auto-group (idempotent). Called when
 *  a new staff member is created/activated — see accept_invitation() in
 *  supabase for the primary invocation site (SQL-level, for reliability
 *  regardless of which client flow completes signup); this JS entry point
 *  covers admin-side staff creation flows that don't go through invite. */
export async function addToAllStaffGroupInternal(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
): Promise<void> {
  const groupId = await ensureAllStaffGroupInternal(supabase, organizationId);
  const { error } = await supabase
    .from("staff_group_members")
    .upsert(
      { group_id: groupId, staff_id: staffId },
      { onConflict: "group_id,staff_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

// ─── delete (cascades staff_group_members) ─────────────────────────────────
export const deleteStaffGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    groupId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: existing, error: exErr } = await supabase
      .from("staff_groups")
      .select("name")
      .eq("id", data.groupId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (existing?.name === ALL_STAFF_GROUP_NAME) {
      throw new Error("The All Staff group is system-managed and can't be deleted.");
    }

    const { error } = await supabase
      .from("staff_groups")
      .delete()
      .eq("id", data.groupId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── add member (idempotent — ignores the unique-constraint conflict) ──────
export const addGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    groupId: z.string().uuid(),
    staffId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { error } = await supabase
      .from("staff_group_members")
      .upsert(
        { group_id: data.groupId, staff_id: data.staffId },
        { onConflict: "group_id,staff_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── remove member ──────────────────────────────────────────────────────
export const removeGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    groupId: z.string().uuid(),
    staffId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: existing, error: exErr } = await supabase
      .from("staff_groups")
      .select("name")
      .eq("id", data.groupId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (existing?.name === ALL_STAFF_GROUP_NAME) {
      throw new Error("Members of the All Staff group can't be removed individually — every staff member belongs automatically.");
    }

    const { error } = await supabase
      .from("staff_group_members")
      .delete()
      .eq("group_id", data.groupId)
      .eq("staff_id", data.staffId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── sync membership from a team roster ────────────────────────────────────
// Adds every profile currently on `team_id` that isn't already a member, and
// records the link on the group so the UI can label it "synced from <team>".
export const syncGroupFromTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    groupId: z.string().uuid(),
    teamId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { added: 0 };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: teamProfiles, error: pErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("team_id", data.teamId);
    if (pErr) throw new Error(pErr.message);
    const teamStaffIds = (teamProfiles ?? []).map((p: { id: string }) => p.id);

    let added = 0;
    if (teamStaffIds.length) {
      const { data: existing, error: eErr } = await supabase
        .from("staff_group_members")
        .select("staff_id")
        .eq("group_id", data.groupId)
        .in("staff_id", teamStaffIds);
      if (eErr) throw new Error(eErr.message);
      const already = new Set((existing ?? []).map((r: { staff_id: string }) => r.staff_id));
      const toAdd = teamStaffIds.filter((id: string) => !already.has(id));
      if (toAdd.length) {
        const { error: insErr } = await supabase
          .from("staff_group_members")
          .insert(toAdd.map((staffId: string) => ({ group_id: data.groupId, staff_id: staffId })));
        if (insErr) throw new Error(insErr.message);
        added = toAdd.length;
      }
    }

    const { error: linkErr } = await supabase
      .from("staff_groups")
      .update({ linked_team_id: data.teamId })
      .eq("id", data.groupId)
      .eq("organization_id", data.organizationId);
    if (linkErr) throw new Error(linkErr.message);

    return { added };
  });

// ─── resolve group membership → deduplicated, role-filtered staff list ────
// Shared with company-obligations.functions.ts (snapshotAssignees) — takes
// an already-authenticated request-scoped `supabase` client rather than
// re-deriving one, since it always runs inside another handler's call.
export type ResolvedStaffMember = { staff_id: string; staff_name: string; staff_role: string };

export async function resolveGroupMembersInternal(
  supabase: AnySupabase,
  organizationId: string,
  groupIds: string[],
  assigneeRole: string,
): Promise<ResolvedStaffMember[]> {
  if (!groupIds.length) return [];

  const { data: memberRows, error } = await supabase
    .from("staff_group_members")
    .select("staff_id")
    .in("group_id", groupIds);
  if (error) throw new Error(error.message);
  const staffIds = Array.from(
    new Set(
      ((memberRows ?? []) as unknown as Array<{ staff_id: string }>).map((r) => r.staff_id),
    ),
  );
  if (!staffIds.length) return [];

  const [{ data: dirRows, error: dErr }, { data: roleRows, error: rErr }] = await Promise.all([
    supabase.from("org_member_directory").select("id, full_name").in("id", staffIds),
    supabase.from("organization_members").select("user_id, role")
      .eq("organization_id", organizationId).eq("active", true).in("user_id", staffIds),
  ]);
  if (dErr) throw new Error(dErr.message);
  if (rErr) throw new Error(rErr.message);

  const nameById = new Map<string, string>(
    ((dirRows ?? []) as unknown as Array<{ id: string | null; full_name: string | null }>)
      .filter((r) => !!r.id)
      .map((r) => [r.id as string, r.full_name ?? "Unknown"] as [string, string]),
  );
  const roleById = new Map<string, string>(
    ((roleRows ?? []) as unknown as Array<{ user_id: string; role: string }>)
      .map((r) => [r.user_id, r.role] as [string, string]),
  );

  const out: ResolvedStaffMember[] = [];
  for (const staffId of staffIds) {
    const role = roleById.get(staffId);
    if (!role) continue; // not an active org member — drop
    if (assigneeRole === "managers_only" && !["manager", "super_admin"].includes(role)) continue;
    if (assigneeRole === "admin_only" && !["admin", "super_admin"].includes(role)) continue;
    out.push({ staff_id: staffId, staff_name: nameById.get(staffId) ?? "Unknown", staff_role: role });
  }
  return out;
}

// Public server-fn wrapper for resolveGroupMembers, per the spec's signature.
export const resolveGroupMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    organizationId: z.string().uuid(),
    groupIds: z.array(z.string().uuid()).max(200),
    assigneeRole: z.enum(["any_assigned", "managers_only", "admin_only"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [] as ResolvedStaffMember[];
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    return resolveGroupMembersInternal(supabase, data.organizationId, data.groupIds, data.assigneeRole);
  });
