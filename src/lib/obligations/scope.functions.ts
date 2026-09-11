// Employees Leads group / Scope writes (Compliance revamp Step 3).
// Localized — do not fold into staff-groups.functions (Step 5 / Groups tab).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { columnMissing, loadOrgScopeSnapshot, type OrgScopeSnapshot } from "./scope.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export const loadEmployeeScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<OrgScopeSnapshot> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) {
      return {
        available: false,
        groups: [],
        members: [],
        scopeByStaffId: {},
        leadsByGroupId: {},
      };
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    return loadOrgScopeSnapshot(supabase, data.organizationId);
  });

export const setEmployeeScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        staffId: z.string().uuid(),
        scopeGroupId: z.string().uuid().nullable(),
        leadGroupId: z.string().uuid().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; reason?: string }> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { ok: false, reason: "no_session" };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: target, error: tErr } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.staffId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!target) throw new Error("Staffer is not a member of this organization.");

    const { data: groups, error: gErr } = await supabase
      .from("staff_groups")
      .select("id")
      .eq("organization_id", data.organizationId);
    if (gErr) throw new Error(gErr.message);
    const orgGroupIds = new Set(((groups ?? []) as Array<{ id: string }>).map((g) => g.id));

    if (data.scopeGroupId && !orgGroupIds.has(data.scopeGroupId)) {
      throw new Error("Scope group is not in this organization.");
    }
    if (data.leadGroupId && !orgGroupIds.has(data.leadGroupId)) {
      throw new Error("Leads group is not in this organization.");
    }

    const { error: pErr } = await supabase
      .from("profiles")
      .update({ scope_group_id: data.scopeGroupId })
      .eq("id", data.staffId);
    if (pErr) {
      if (columnMissing(pErr.message)) return { ok: false, reason: "not_live" };
      throw new Error(pErr.message);
    }

    const groupIdList = Array.from(orgGroupIds);
    if (groupIdList.length) {
      const { error: clearErr } = await supabase
        .from("staff_group_members")
        .update({ is_lead: false })
        .eq("staff_id", data.staffId)
        .in("group_id", groupIdList);
      if (clearErr) {
        if (columnMissing(clearErr.message)) return { ok: false, reason: "not_live" };
        throw new Error(clearErr.message);
      }
    }

    const ensureMember = async (groupId: string, isLead: boolean) => {
      const { data: existing, error: eErr } = await supabase
        .from("staff_group_members")
        .select("id")
        .eq("group_id", groupId)
        .eq("staff_id", data.staffId)
        .maybeSingle();
      if (eErr) throw new Error(eErr.message);
      if (existing) {
        const { error: uErr } = await supabase
          .from("staff_group_members")
          .update({ is_lead: isLead })
          .eq("id", existing.id);
        if (uErr) {
          if (columnMissing(uErr.message)) return { ok: false as const, reason: "not_live" };
          throw new Error(uErr.message);
        }
        return { ok: true as const };
      }
      const { error: iErr } = await supabase.from("staff_group_members").insert({
        group_id: groupId,
        staff_id: data.staffId,
        is_lead: isLead,
      });
      if (iErr) {
        if (columnMissing(iErr.message)) return { ok: false as const, reason: "not_live" };
        throw new Error(iErr.message);
      }
      return { ok: true as const };
    };

    if (data.scopeGroupId) {
      const ensured = await ensureMember(data.scopeGroupId, data.leadGroupId === data.scopeGroupId);
      if (!ensured.ok) return ensured;
    }
    if (data.leadGroupId && data.leadGroupId !== data.scopeGroupId) {
      const ensured = await ensureMember(data.leadGroupId, true);
      if (!ensured.ok) return ensured;
    }

    return { ok: true };
  });
