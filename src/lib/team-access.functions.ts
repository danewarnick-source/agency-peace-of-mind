import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ROLE_LABEL, type Role } from "@/lib/rbac";

const RoleEnum = z.enum(["admin", "program_manager", "manager", "employee", "committee_member"]);
const InviteRoleEnum = z.enum(["admin", "program_manager", "manager", "employee"]);

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
  role: string;
  display_role_label: string;
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
      const isHive = hSet.has(m.user_id);
      const role = m.role as Role;
      return {
        membership_id: m.id,
        user_id: m.user_id,
        email: p?.email ?? "",
        full_name: p?.full_name ?? null,
        role: m.role,
        display_role_label:
          isHive && role === "super_admin"
            ? ROLE_LABEL.super_admin
            : ROLE_LABEL[role] ?? m.role,
        grants: {
          staff: true,
          admin: m.role === "admin",
          company_executive: !!m.is_company_executive,
          hive_executive: isHive,
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
    // super_admin is never assignable here — Hive executives are managed
    // via hive_executives, not organization_members.role.
    if (data.explicit_role) {
      if ((data.explicit_role as string) === "super_admin") {
        throw new Error("super_admin is not assignable. Hive executives are granted through hive_executives.");
      }
      if (cur.role === "super_admin") {
        return { ok: true };
      }
      nextRole = data.explicit_role;
    } else if (cur.role !== "super_admin") {
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
      role: InviteRoleEnum.optional(),
      grant_admin: z.boolean().optional(),
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

    const inviteRole = data.role ?? (data.grant_admin ? "admin" : "employee");
    if ((inviteRole as string) === "super_admin") {
      throw new Error("Invitations cannot be issued for super_admin.");
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

    const safeRows: RoleChangeAuditRow[] = (rows ?? []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      changed_by_name: r.changed_by_name ?? "Unknown",
      target_user_name: r.target_user_name ?? "Unknown",
      previous_role: r.previous_role ?? "—",
      new_role: r.new_role ?? "—",
      change_method: r.change_method ?? "—",
    }));
    return { rows: safeRows, hasMore: safeRows.length === PAGE_SIZE };
  });
