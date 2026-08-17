import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RoleEnum = z.enum(["super_admin", "admin", "manager", "employee", "committee_member"]);

async function logRoleChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    organizationId: string;
    changedByUserId: string;
    targetUserId: string | null;
    targetUserName?: string;
    previousRole: string;
    newRole: string;
    changeMethod: string;
  },
) {
  const [{ data: changedBy }, { data: target }] = await Promise.all([
    supabase.from("org_member_directory").select("full_name").eq("id", params.changedByUserId).maybeSingle(),
    params.targetUserId
      ? supabase.from("org_member_directory").select("full_name").eq("id", params.targetUserId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  await supabaseAdmin.from("role_change_audit_log").insert({
    organization_id: params.organizationId,
    changed_by_user_id: params.changedByUserId,
    changed_by_name: changedBy?.full_name ?? "Unknown",
    target_user_id: params.targetUserId,
    target_user_name: target?.full_name ?? params.targetUserName ?? "Unknown",
    previous_role: params.previousRole,
    new_role: params.newRole,
    change_method: params.changeMethod,
  });
}

export interface TeamMemberAccess {
  membership_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  grants: {
    staff: boolean;
    admin: boolean;
    company_executive: boolean;
    hive_executive: boolean;
  };
}

async function assertCanManage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
): Promise<{ isHiveExec: boolean }> {
  const [{ data: isAdmin, error: e1 }, { data: isExec, error: e2 }] = await Promise.all([
    supabase.rpc("has_org_role", { _org: orgId, _user: userId, _role: "admin" }),
    supabase.rpc("is_hive_executive", { _user: userId }),
  ]);
  if (e1 || e2) throw new Error(e1?.message || e2?.message || "Auth check failed");
  if (!isAdmin && !isExec) {
    console.error(
      `[SECURITY] Unauthorized role management attempt — user ${userId} ` +
      `attempted to manage roles in org ${orgId} without admin privileges`,
    );
    try {
      await supabaseAdmin.from("role_change_audit_log").insert({
        organization_id: orgId,
        changed_by_user_id: userId,
        changed_by_name: "Unknown",
        target_user_id: userId,
        target_user_name: "N/A",
        previous_role: "N/A",
        new_role: "unauthorized_attempt",
        change_method: "unauthorized_attempt",
      });
    } catch {
      // Best-effort — never let audit logging failure mask the real error.
    }
    throw new Error("Unauthorized: Only organization admins can manage team roles.");
  }
  return { isHiveExec: !!isExec };
}

export const listTeamAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TeamMemberAccess[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    await assertCanManage(supabase, userId, data.organization_id);

    const { data: members, error } = await supabase
      .from("organization_members")
      .select("id, user_id, role, is_company_executive, active")
      .eq("organization_id", data.organization_id)
      .eq("active", true);
    if (error) throw error;
    const userIds = (members ?? []).map((m) => m.user_id);
    if (!userIds.length) return [];

    const [{ data: profiles }, { data: hiveExecs }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name").in("id", userIds),
      supabase.from("hive_executives").select("user_id, active").in("user_id", userIds),
    ]);
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const hSet = new Set((hiveExecs ?? []).filter((h) => h.active).map((h) => h.user_id));

    return (members ?? []).map((m) => {
      const p = pMap.get(m.user_id);
      return {
        membership_id: m.id,
        user_id: m.user_id,
        email: p?.email ?? "",
        full_name: p?.full_name ?? null,
        grants: {
          staff: true,
          admin: m.role === "admin" || m.role === "super_admin",
          company_executive: !!m.is_company_executive,
          hive_executive: hSet.has(m.user_id),
        },
      };
    });
  });

export const setMemberGrants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      membership_id: z.string().uuid(),
      target_user_id: z.string().uuid(),
      grants: z.object({
        admin: z.boolean(),
        company_executive: z.boolean(),
        hive_executive: z.boolean(),
      }).optional(),
      // Set the organization_members.role column directly instead of via the
      // admin boolean above — used by pages that expose the full role list
      // (manager, committee_member, etc), not just the admin/employee toggle.
      explicit_role: RoleEnum.optional(),
    }).refine((d) => d.grants || d.explicit_role, {
      message: "Either grants or explicit_role is required",
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false };
    const { isHiveExec } = await assertCanManage(supabase, userId, data.organization_id);

    const { data: cur, error: e0 } = await supabase
      .from("organization_members")
      .select("role")
      .eq("id", data.membership_id)
      .single();
    if (e0) throw e0;

    let nextRole = cur.role;
    if (data.explicit_role) {
      if (data.explicit_role === "super_admin" && !isHiveExec) {
        throw new Error("Only HIVE executives can assign the super_admin role.");
      }
      nextRole = data.explicit_role;
    } else if (cur.role !== "super_admin") {
      // Toggle Company Admin via role column (preserve super_admin if set).
      nextRole = data.grants!.admin ? "admin" : "employee";
    }

    if (nextRole !== cur.role) {
      const { error: e1 } = await supabase
        .from("organization_members")
        .update({ role: nextRole })
        .eq("id", data.membership_id);
      if (e1) throw e1;

      await logRoleChange(supabase, {
        organizationId: data.organization_id,
        changedByUserId: userId,
        targetUserId: data.target_user_id,
        previousRole: cur.role,
        newRole: nextRole,
        changeMethod: "setMemberGrants",
      });
    }

    if (data.explicit_role) {
      return { ok: true };
    }

    const grants = data.grants!;

    // Company Executive — db function enforces caller is admin/super/hive exec.
    const { error: e2 } = await supabase.rpc("set_company_executive", {
      _membership_id: data.membership_id,
      _grant: grants.company_executive,
    });
    if (e2) throw e2;

    // HIVE Executive — only HIVE execs may grant; ignore if caller isn't HIVE exec
    // and the value didn't change.
    if (isHiveExec) {
      const { error: e3 } = await supabase.rpc("set_hive_executive", {
        _user_id: data.target_user_id,
        _grant: grants.hive_executive,
      });
      if (e3) throw e3;
    } else if (grants.hive_executive) {
      throw new Error("Only HIVE executives may grant the HIVE Executive role");
    }

    return { ok: true };
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      email: z.string().trim().toLowerCase().email().max(255),
      grant_admin: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false };
    await assertCanManage(supabase, userId, data.organization_id);

    const { data: existing } = await supabase
      .from("invitations")
      .select("id")
      .eq("organization_id", data.organization_id)
      .eq("email", data.email)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) throw new Error("A pending invitation already exists for this email");

    const inviteRole = data.grant_admin ? "admin" : "employee";
    // Defense-in-depth — the DB also enforces this via invitations_role_check.
    // No invitation can ever be issued for super_admin/manager/committee_member;
    // elevation to those roles happens after the person joins, via setMemberGrants.
    if (!["admin", "employee"].includes(inviteRole)) {
      throw new Error("Invitations can only be issued for admin or employee roles.");
    }

    const { error } = await supabase.from("invitations").insert({
      organization_id: data.organization_id,
      email: data.email,
      role: inviteRole,
      invited_by: userId,
    });
    if (error) throw error;

    await logRoleChange(supabase, {
      organizationId: data.organization_id,
      changedByUserId: userId,
      targetUserId: null,
      targetUserName: data.email,
      previousRole: "none",
      newRole: inviteRole,
      changeMethod: "invitation",
    });

    return { ok: true };
  });

export interface RoleChangeAuditRow {
  id: string;
  created_at: string;
  changed_by_name: string;
  target_user_name: string;
  previous_role: string;
  new_role: string;
  change_method: string;
}

const PAGE_SIZE = 50;

export const listRoleChangeAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      page: z.number().int().min(0).default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ rows: RoleChangeAuditRow[]; hasMore: boolean }> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { rows: [], hasMore: false };
    await assertCanManage(supabase, userId, data.organization_id);

    const from = data.page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: rows, error } = await supabase
      .from("role_change_audit_log")
      .select("id, created_at, changed_by_name, target_user_name, previous_role, new_role, change_method")
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;

    return { rows: rows ?? [], hasMore: (rows ?? []).length === PAGE_SIZE };
  });
