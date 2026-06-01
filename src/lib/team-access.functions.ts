import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    throw new Error("Not authorized to manage team access");
  }
  return { isHiveExec: !!isExec };
}

export const listTeamAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TeamMemberAccess[]> => {
    const { supabase, userId } = context;
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
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isHiveExec } = await assertCanManage(supabase, userId, data.organization_id);

    // Toggle Company Admin via role column (preserve super_admin if set).
    const { data: cur, error: e0 } = await supabase
      .from("organization_members")
      .select("role")
      .eq("id", data.membership_id)
      .single();
    if (e0) throw e0;
    let nextRole = cur.role;
    if (cur.role !== "super_admin") {
      nextRole = data.grants.admin ? "admin" : "employee";
    }
    const { error: e1 } = await supabase
      .from("organization_members")
      .update({ role: nextRole })
      .eq("id", data.membership_id);
    if (e1) throw e1;

    // Company Executive — db function enforces caller is admin/super/hive exec.
    const { error: e2 } = await supabase.rpc("set_company_executive", {
      _membership_id: data.membership_id,
      _grant: data.grants.company_executive,
    });
    if (e2) throw e2;

    // HIVE Executive — only HIVE execs may grant; ignore if caller isn't HIVE exec
    // and the value didn't change.
    if (isHiveExec) {
      const { error: e3 } = await supabase.rpc("set_hive_executive", {
        _user_id: data.target_user_id,
        _grant: data.grants.hive_executive,
      });
      if (e3) throw e3;
    } else if (data.grants.hive_executive) {
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
    await assertCanManage(supabase, userId, data.organization_id);

    const { data: existing } = await supabase
      .from("invitations")
      .select("id")
      .eq("organization_id", data.organization_id)
      .eq("email", data.email)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) throw new Error("A pending invitation already exists for this email");

    const { error } = await supabase.from("invitations").insert({
      organization_id: data.organization_id,
      email: data.email,
      role: data.grant_admin ? "admin" : "employee",
      invited_by: userId,
    });
    if (error) throw error;
    return { ok: true };
  });
