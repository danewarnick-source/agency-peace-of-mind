import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RoleEnum = z.enum(["admin", "manager", "employee"]);

const CreateEmployeeInput = z.object({
  organizationId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(30),
  temporaryPassword: z.string().min(8).max(128),
  role: RoleEnum,
  department: z.string().trim().max(120).optional().or(z.literal("")),
  hireDate: z.string().optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
  trackIds: z.array(z.string().uuid()).max(50).default([]),
  requiresDeescalation: z.boolean().default(true),
  requiresAbi: z.boolean().default(true),
  staffType: z.array(z.string()).optional().default([]),
  employeeId: z.string().trim().max(80).optional().or(z.literal("")),
  workerType: z.string().trim().max(80).optional().or(z.literal("")),
  customFieldValues: z.record(z.string(), z.unknown()).optional().default({}),
});


async function assertOrgManager(actorId: string, orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("role,active")
    .eq("user_id", actorId)
    .eq("organization_id", orgId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !["admin", "manager", "super_admin"].includes(data.role)) {
    throw new Error("Forbidden: insufficient permissions for this organization");
  }
}

export const createEmployeeManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateEmployeeInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!context.userId) return { userId: "", email: "" };
    await assertOrgManager(context.userId, data.organizationId);

    const effectiveEmail = data.email.trim().toLowerCase();

    // Create auth user (email confirmed so they can immediately sign in)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: effectiveEmail,
      password: data.temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: `${data.firstName} ${data.lastName}`.trim(),
        created_via: "manual_admin",
      },
    });
    if (createErr || !created.user) throw new Error(createErr?.message || "Failed to create user");

    const newUserId = created.user.id;

    try {
      // start_date is the single source of truth for CE; mirror to hire_date
      // for legacy reads. Falls back to legacy hireDate if no startDate given.
      const startDate = data.startDate || data.hireDate || null;
      const endDate = data.endDate || null;
      if (startDate && endDate && endDate < startDate) {
        throw new Error("End date must be on or after Start date.");
      }

      // Custom field values are keyed by the field's id (as configured in
      // organizations.feature_config.staff_intake_fields.custom_fields), but
      // stored on the profile keyed by field name — profiles.custom_attributes
      // and feature_config are the only two places this data lives, no
      // custom_field_definitions/custom_field_values involved.
      const customFieldEntries = Object.entries(data.customFieldValues).filter(
        ([, v]) => v !== undefined && v !== "",
      );
      const customAttributes: Record<string, unknown> = {};
      if (customFieldEntries.length) {
        const { data: orgRow } = await supabaseAdmin
          .from("organizations")
          .select("feature_config")
          .eq("id", data.organizationId)
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const customFieldDefs = ((orgRow as any)?.feature_config?.staff_intake_fields?.custom_fields ?? []) as
          Array<{ id: string; name: string }>;
        const nameById = new Map(customFieldDefs.map((f) => [f.id, f.name]));
        for (const [fieldId, value] of customFieldEntries) {
          const name = nameById.get(fieldId);
          if (name) customAttributes[name] = value;
        }
      }

      // Upsert profile (handle_new_user trigger may have created a stub)
      const { error: profErr } = await supabaseAdmin.from("profiles").upsert({
        id: newUserId,
        email: effectiveEmail,
        full_name: `${data.firstName} ${data.lastName}`.trim(),
        first_name: data.firstName,
        last_name: data.lastName,
        phone: data.phone.trim(),
        department: data.department || null,
        employee_id: data.employeeId || null,
        worker_type: data.workerType || undefined,
        staff_type_keys: data.staffType,
        hire_date: startDate,
        start_date: startDate,
        end_date: endDate,
        must_change_password: true,
        is_active: true,
        requires_deescalation: data.requiresDeescalation,
        requires_abi: data.requiresAbi,
        custom_attributes: customAttributes,
      } as any, { onConflict: "id" });

      if (profErr) throw new Error(profErr.message);

      // The handle_new_user trigger auto-creates a personal org + admin membership.
      // Deactivate that auto membership and attach to the real organization instead.
      await supabaseAdmin.from("organization_members")
        .update({ active: false })
        .eq("user_id", newUserId)
        .neq("organization_id", data.organizationId);

      const { error: memErr } = await supabaseAdmin.from("organization_members").upsert({
        organization_id: data.organizationId,
        user_id: newUserId,
        role: data.role,
        job_title: data.department || null,
        active: true,
      }, { onConflict: "organization_id,user_id" });
      if (memErr) throw new Error(memErr.message);

      await supabaseAdmin.from("role_change_audit_log").insert({
        organization_id: data.organizationId,
        changed_by_user_id: context.userId,
        changed_by_name: "Admin (staff creation)",
        target_user_id: newUserId,
        target_user_name: `${data.firstName} ${data.lastName}`.trim(),
        previous_role: "none",
        new_role: data.role,
        change_method: "createEmployee",
      });

      // Optional: assign training tracks
      if (data.trackIds.length) {
        const rows = data.trackIds.map((tid) => ({
          track_id: tid,
          user_id: newUserId,
          organization_id: data.organizationId,
          assigned_by: context.userId,
          status: "not_started" as const,
        }));
        const { error: trackErr } = await supabaseAdmin.from("track_assignments").insert(rows);
        if (trackErr) console.warn("track assignment failed", trackErr.message);
      }

      return { userId: newUserId, email: effectiveEmail };
    } catch (e) {
      // Rollback auth user on downstream failure
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      throw e;
    }
  });

const ResetInput = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  newPassword: z.string().min(8).max(128),
});

export const adminResetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResetInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!context.userId) return { ok: false };
    await assertOrgManager(context.userId, data.organizationId);

    // Confirm target user belongs to that org
    const { data: mem } = await supabaseAdmin.from("organization_members")
      .select("id").eq("user_id", data.userId).eq("organization_id", data.organizationId).maybeSingle();
    if (!mem) throw new Error("Employee not found in this organization");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.userId);

    return { ok: true };
  });

