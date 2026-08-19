// Server functions for the permission system rebuild: role_permissions
// mutation, user_permission_overrides mutation, effective-permission
// server-side resolution, and the staff-facing permission request flow.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { requirePermission } from "@/lib/require-permission";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ALL_PERMISSIONS, PERMISSION_LABEL, type Permission } from "@/lib/rbac";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const EDITABLE_ROLES = ["admin", "manager", "employee", "committee_member"] as const;
const EditableRoleEnum = z.enum(EDITABLE_ROLES);
const PermissionEnum = z.custom<Permission>(
  (v) => typeof v === "string" && (ALL_PERMISSIONS as string[]).includes(v),
  { message: "Unknown permission" },
);

async function requirePermissionManager(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
): Promise<void> {
  // manage_permissions is only meaningfully editable by org owners (admin) —
  // matches the "Owner-only access" rule for every mutation in this file.
  await requireOrgMembership(supabase, userId, organizationId, "admin");
}

async function fetchName(supabase: AnySupabase, userId: string): Promise<string> {
  const { data } = await supabase
    .from("org_member_directory")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? "Unknown";
}

async function writeAuditLog(entry: {
  organizationId: string;
  changedByUserId: string;
  changedByName: string;
  changeType:
    | "role_permission_updated"
    | "individual_override_granted"
    | "individual_override_denied"
    | "individual_override_removed"
    | "individual_override_expired";
  targetUserId?: string | null;
  targetUserName?: string | null;
  role?: string | null;
  permission: string;
  previousValue?: boolean | null;
  newValue?: boolean | null;
  reason?: string | null;
}): Promise<void> {
  await supabaseAdmin.from("permission_audit_log").insert({
    organization_id: entry.organizationId,
    changed_by_user_id: entry.changedByUserId,
    changed_by_name: entry.changedByName,
    change_type: entry.changeType,
    target_user_id: entry.targetUserId ?? null,
    target_user_name: entry.targetUserName ?? null,
    role: entry.role ?? null,
    permission: entry.permission,
    previous_value: entry.previousValue ?? null,
    new_value: entry.newValue ?? null,
    reason: entry.reason ?? null,
  });
}

// ─── setRolePermission ──────────────────────────────────────────────────
export const setRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        role: EditableRoleEnum,
        permission: PermissionEnum,
        enabled: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not authenticated");
    await requirePermissionManager(supabase, userId, data.organizationId);

    const { data: existing } = await supabase
      .from("role_permissions")
      .select("enabled")
      .eq("organization_id", data.organizationId)
      .eq("role", data.role)
      .eq("permission", data.permission)
      .maybeSingle();

    const { error } = await supabase.from("role_permissions").upsert(
      {
        organization_id: data.organizationId,
        role: data.role,
        permission: data.permission,
        enabled: data.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,role,permission" },
    );
    if (error) throw new Error(error.message);

    const changedByName = await fetchName(supabase, userId);
    await writeAuditLog({
      organizationId: data.organizationId,
      changedByUserId: userId,
      changedByName,
      changeType: "role_permission_updated",
      role: data.role,
      permission: data.permission,
      previousValue: existing?.enabled ?? null,
      newValue: data.enabled,
    });

    return { success: true };
  });

// ─── resetRoleToDefaults ────────────────────────────────────────────────
export const resetRoleToDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        role: EditableRoleEnum,
        permissions: z.array(z.object({ permission: PermissionEnum, enabled: z.boolean() })),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not authenticated");
    await requirePermissionManager(supabase, userId, data.organizationId);

    const { data: existingRows } = await supabase
      .from("role_permissions")
      .select("permission, enabled")
      .eq("organization_id", data.organizationId)
      .eq("role", data.role);
    const existingMap = new Map<string, boolean>(
      (existingRows ?? []).map((r: { permission: string; enabled: boolean }) => [r.permission, r.enabled]),
    );

    const rows = data.permissions.map((p) => ({
      organization_id: data.organizationId,
      role: data.role,
      permission: p.permission,
      enabled: p.enabled,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("role_permissions")
      .upsert(rows, { onConflict: "organization_id,role,permission" });
    if (error) throw new Error(error.message);

    const changedByName = await fetchName(supabase, userId);
    const changed = data.permissions.filter((p) => existingMap.get(p.permission) !== p.enabled);
    for (const p of changed) {
      await writeAuditLog({
        organizationId: data.organizationId,
        changedByUserId: userId,
        changedByName,
        changeType: "role_permission_updated",
        role: data.role,
        permission: p.permission,
        previousValue: existingMap.get(p.permission) ?? null,
        newValue: p.enabled,
        reason: "Reset role to defaults",
      });
    }

    return { success: true };
  });

// ─── setUserPermissionOverride ──────────────────────────────────────────
export const setUserPermissionOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        targetUserId: z.string().uuid(),
        permission: PermissionEnum,
        granted: z.boolean(),
        reason: z.string().min(10),
        expiresAt: z.string().datetime().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not authenticated");
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");

    const changedByName = await fetchName(supabase, userId);
    const targetName = await fetchName(supabase, data.targetUserId);

    const { data: row, error } = await supabase
      .from("user_permission_overrides")
      .upsert(
        {
          organization_id: data.organizationId,
          user_id: data.targetUserId,
          permission: data.permission,
          granted: data.granted,
          granted_by: userId,
          granted_by_name: changedByName,
          reason: data.reason,
          expires_at: data.expiresAt ?? null,
        },
        { onConflict: "organization_id,user_id,permission" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);

    await writeAuditLog({
      organizationId: data.organizationId,
      changedByUserId: userId,
      changedByName,
      changeType: data.granted ? "individual_override_granted" : "individual_override_denied",
      targetUserId: data.targetUserId,
      targetUserName: targetName,
      permission: data.permission,
      newValue: data.granted,
      reason: data.reason,
    });

    return row;
  });

// ─── removeUserPermissionOverride ───────────────────────────────────────
export const removeUserPermissionOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        targetUserId: z.string().uuid(),
        permission: PermissionEnum,
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not authenticated");
    await requireOrgMembership(supabase, userId, data.organizationId, "admin");

    const { data: existing } = await supabase
      .from("user_permission_overrides")
      .select("granted")
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.targetUserId)
      .eq("permission", data.permission)
      .maybeSingle();

    const { error } = await supabase
      .from("user_permission_overrides")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.targetUserId)
      .eq("permission", data.permission);
    if (error) throw new Error(error.message);

    const changedByName = await fetchName(supabase, userId);
    const targetName = await fetchName(supabase, data.targetUserId);
    await writeAuditLog({
      organizationId: data.organizationId,
      changedByUserId: userId,
      changedByName,
      changeType: "individual_override_removed",
      targetUserId: data.targetUserId,
      targetUserName: targetName,
      permission: data.permission,
      previousValue: existing?.granted ?? null,
      newValue: null,
    });

    return { success: true };
  });

// ─── listEffectivePermissions ───────────────────────────────────────────
export const listEffectivePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ organizationId: z.string().uuid(), userId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !callerId) throw new Error("Not authenticated");
    await requireOrgMembership(supabase, callerId, data.organizationId, "employee");

    const { data: member } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId)
      .eq("active", true)
      .maybeSingle();
    if (!member) return { role: null, resolved: {} };

    // Expired-override cleanup: delete and log once, then continue resolving
    // against the now-clean override set.
    const nowIso = new Date().toISOString();
    const { data: expired } = await supabase
      .from("user_permission_overrides")
      .select("permission, granted")
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId)
      .not("expires_at", "is", null)
      .lt("expires_at", nowIso);

    if (expired?.length) {
      const targetName = await fetchName(supabase, data.userId);
      for (const row of expired as Array<{ permission: string; granted: boolean }>) {
        await supabaseAdmin
          .from("user_permission_overrides")
          .delete()
          .eq("organization_id", data.organizationId)
          .eq("user_id", data.userId)
          .eq("permission", row.permission);
        await writeAuditLog({
          organizationId: data.organizationId,
          changedByUserId: data.userId,
          changedByName: "System (expiry)",
          changeType: "individual_override_expired",
          targetUserId: data.userId,
          targetUserName: targetName,
          permission: row.permission,
          previousValue: row.granted,
          newValue: null,
        });
      }
    }

    const { data: roleConfig } = await supabase
      .from("role_permissions")
      .select("permission, enabled")
      .eq("organization_id", data.organizationId)
      .eq("role", member.role);

    const { data: overrides } = await supabase
      .from("user_permission_overrides")
      .select("permission, granted, granted_by_name, reason, expires_at")
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId);

    const resolved: Record<string, {
      granted: boolean;
      source: "role" | "individual_grant" | "individual_deny";
      overrideDetails?: { by: string; reason: string; expires_at?: string };
    }> = {};

    ALL_PERMISSIONS.forEach((perm) => {
      const override = (overrides ?? []).find((o: { permission: string }) => o.permission === perm);
      if (override) {
        resolved[perm] = {
          granted: override.granted,
          source: override.granted ? "individual_grant" : "individual_deny",
          overrideDetails: {
            by: override.granted_by_name,
            reason: override.reason,
            expires_at: override.expires_at ?? undefined,
          },
        };
      } else {
        const roleRow = (roleConfig ?? []).find((r: { permission: string }) => r.permission === perm);
        resolved[perm] = { granted: !!roleRow?.enabled, source: "role" };
      }
    });

    return { role: member.role, resolved };
  });

// ─── requestPermission ───────────────────────────────────────────────────
export const requestPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        permission: PermissionEnum,
        reason: z.string().min(1),
        pageRequested: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not authenticated");
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const requesterName = await fetchName(supabase, userId);
    const label = PERMISSION_LABEL[data.permission] ?? data.permission;

    const { error } = await supabase.from("notifications").insert({
      organization_id: data.organizationId,
      recipient_role: "admin",
      type: "permission_requested",
      urgency: "normal",
      title: `${requesterName} is requesting access`,
      body: `${requesterName} is requesting the "${label}" permission.${
        data.pageRequested ? ` They were blocked on ${data.pageRequested}.` : ""
      } Reason: ${data.reason}`,
      link_to: `/dashboard/employees/${userId}?tab=permissions&override_perm=${encodeURIComponent(data.permission)}`,
      related_id: userId,
      related_type: "permission_request",
    });
    if (error) throw new Error(error.message);

    return { success: true };
  });

// ─── setScopeAssignments ─────────────────────────────────────────────────
const ScopeTypeEnum = z.enum(["all", "service_code", "staff_group", "client"]);

export const setScopeAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        targetUserId: z.string().uuid(),
        scopeType: ScopeTypeEnum,
        refIds: z.array(z.string()).default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not authenticated");
    await requirePermission(supabase, userId, data.organizationId, "manage_permissions");

    const { error: delErr } = await supabase
      .from("scope_assignments")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.targetUserId);
    if (delErr) throw new Error(delErr.message);

    const rows =
      data.scopeType === "all"
        ? [{
            organization_id: data.organizationId,
            user_id: data.targetUserId,
            scope_type: "all" as const,
            scope_ref_id: null,
          }]
        : data.refIds.map((refId) => ({
            organization_id: data.organizationId,
            user_id: data.targetUserId,
            scope_type: data.scopeType,
            scope_ref_id: refId,
          }));

    if (rows.length) {
      const { error } = await supabase.from("scope_assignments").insert(rows);
      if (error) throw new Error(error.message);
    }

    return { scopeType: data.scopeType, refIds: data.scopeType === "all" ? [] : data.refIds };
  });
