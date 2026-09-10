import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { onStaffHiredInternal } from "@/lib/staff-assignment-hooks.functions";
import { resolveAccountUsername } from "@/lib/account-username";

const RoleEnum = z.enum(["admin", "program_manager", "manager", "employee", "committee_member"]);

export const CreateEmployeeInput = z.object({
  organizationId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
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
  username: z.string().trim().max(254).optional().or(z.literal("")),
});

export type HireEmployeeInput = z.infer<typeof CreateEmployeeInput>;


async function assertOrgManager(actorId: string, orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("role,active")
    .eq("user_id", actorId)
    .eq("organization_id", orgId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !["admin", "program_manager", "manager"].includes(data.role)) {
    throw new Error("Forbidden: insufficient permissions for this organization");
  }
}

/** Shared hire path for Add employee and roster upload. Never sends email. */
export async function hireEmployeeInternal(
  data: HireEmployeeInput,
  actorUserId: string,
  createdVia: "manual_admin" | "smart_import" = "manual_admin",
): Promise<{ userId: string; email: string; created: boolean }> {
  const effectiveEmail = data.email.trim().toLowerCase();
  const startDate = data.startDate || data.hireDate || null;
  const endDate = data.endDate || null;
  if (startDate && endDate && endDate < startDate) {
    throw new Error("End date must be on or after Start date.");
  }

  const { data: existingProf } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", effectiveEmail)
    .maybeSingle();

  if (existingProf?.id && createdVia === "manual_admin") {
    throw new Error("An account with this email already exists.");
  }

  let newUserId = existingProf?.id ?? "";
  let created = false;

  if (!newUserId) {
    const { data: createdUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: effectiveEmail,
      password: data.temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: `${data.firstName} ${data.lastName}`.trim(),
        created_via: createdVia,
      },
    });
    if (createErr || !createdUser.user) {
      const msg = createErr?.message || "Failed to create user";
      if (/already/i.test(msg)) {
        const { data: again } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("email", effectiveEmail)
          .maybeSingle();
        if (again?.id) {
          newUserId = again.id;
        } else {
          throw new Error(msg);
        }
      } else {
        throw new Error(msg);
      }
    } else {
      newUserId = createdUser.user.id;
      created = true;
    }
  }

  try {
    const customFieldEntries = Object.entries(data.customFieldValues ?? {}).filter(
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

    const profileRow: Record<string, unknown> = {
      id: newUserId,
      email: effectiveEmail,
      full_name: `${data.firstName} ${data.lastName}`.trim(),
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone?.trim() || null,
      department: data.department || null,
      employee_id: data.employeeId || null,
      staff_type_keys: data.staffType,
      hire_date: startDate,
      start_date: startDate,
      end_date: endDate,
      is_active: true,
      requires_deescalation: data.requiresDeescalation,
      requires_abi: data.requiresAbi,
    };
    if (data.workerType) profileRow.worker_type = data.workerType;
    if (created) {
      profileRow.must_change_password = true;
      profileRow.username = resolveAccountUsername({
        username: data.username,
        email: effectiveEmail,
      });
    } else if (data.username?.trim()) {
      profileRow.username = resolveAccountUsername({
        username: data.username,
        email: effectiveEmail,
      });
    }
    if (Object.keys(customAttributes).length) profileRow.custom_attributes = customAttributes;

    const { error: profErr } = await supabaseAdmin.from("profiles").upsert(
      profileRow as any,
      { onConflict: "id" },
    );

    if (profErr) throw new Error(profErr.message);

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
      changed_by_user_id: actorUserId,
      changed_by_name: createdVia === "smart_import" ? "Admin (smart import)" : "Admin (staff creation)",
      target_user_id: newUserId,
      target_user_name: `${data.firstName} ${data.lastName}`.trim(),
      previous_role: "none",
      new_role: data.role,
      change_method: createdVia === "smart_import" ? "smartImportEmployee" : "createEmployee",
    });

    if (data.trackIds.length) {
      const rows = data.trackIds.map((tid) => ({
        track_id: tid,
        user_id: newUserId,
        organization_id: data.organizationId,
        assigned_by: actorUserId,
        status: "not_started" as const,
      }));
      const { error: trackErr } = await supabaseAdmin.from("track_assignments").insert(rows);
      if (trackErr) console.warn("track assignment failed", trackErr.message);
    }

    try {
      await onStaffHiredInternal(supabaseAdmin, data.organizationId, newUserId);
    } catch (hireErr) {
      console.warn("[obligations] hire auto-assign failed:", hireErr);
    }

    return { userId: newUserId, email: effectiveEmail, created };
  } catch (e) {
    if (created) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
    }
    throw e;
  }
}

export const createEmployeeManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateEmployeeInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!context.userId) return { userId: "", email: "" };
    await assertOrgManager(context.userId, data.organizationId);
    const hired = await hireEmployeeInternal(data, context.userId, "manual_admin");
    return { userId: hired.userId, email: hired.email };
  });

const RosterApplyInput = z.object({
  organizationId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  role: RoleEnum,
  department: z.string().trim().max(120).optional().or(z.literal("")),
  hireDate: z.string().optional().or(z.literal("")),
  username: z.string().trim().max(254).optional().or(z.literal("")),
  usernameProvided: z.boolean().optional().default(false),
  mode: z.enum(["add_new", "add_and_update", "update_only"]),
  temporaryPassword: z.string().min(8).max(128).optional().or(z.literal("")),
});

export type RosterApplyResult = {
  userId: string;
  email: string;
  action: "created" | "updated" | "skipped";
  reason: string | null;
};

async function updateExistingRosterMember(
  data: z.infer<typeof RosterApplyInput>,
  userId: string,
  inOrg: boolean,
): Promise<void> {
  const email = data.email.trim().toLowerCase();
  const profilePatch: Record<string, unknown> = {
    first_name: data.firstName,
    last_name: data.lastName,
    full_name: `${data.firstName} ${data.lastName}`.trim(),
  };
  if (data.phone?.trim()) profilePatch.phone = data.phone.trim();
  if (data.department?.trim()) profilePatch.department = data.department.trim();
  if (data.hireDate) {
    profilePatch.hire_date = data.hireDate;
    profilePatch.start_date = data.hireDate;
  }
  if (data.usernameProvided && data.username?.trim()) {
    profilePatch.username = resolveAccountUsername({
      username: data.username,
      email,
    });
  }
  const { error: profErr } = await supabaseAdmin
    .from("profiles")
    .update(profilePatch as any)
    .eq("id", userId);
  if (profErr) throw new Error(profErr.message);

  if (inOrg) {
    const { error: memErr } = await supabaseAdmin
      .from("organization_members")
      .update({
        role: data.role,
        job_title: data.department || null,
      })
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId);
    if (memErr) throw new Error(memErr.message);
    return;
  }

  const { error: memErr } = await supabaseAdmin.from("organization_members").upsert({
    organization_id: data.organizationId,
    user_id: userId,
    role: data.role,
    job_title: data.department || null,
    active: true,
  }, { onConflict: "organization_id,user_id" });
  if (memErr) throw new Error(memErr.message);
}

/** Template upload: create / update / skip. Never sends email or hire-pack on update. */
export const applyEmployeeRosterRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RosterApplyInput.parse(d))
  .handler(async ({ data, context }): Promise<RosterApplyResult> => {
    const empty: RosterApplyResult = { userId: "", email: data.email.trim().toLowerCase(), action: "skipped", reason: "Not signed in." };
    if (!context.userId) return empty;
    await assertOrgManager(context.userId, data.organizationId);

    const email = data.email.trim().toLowerCase();
    const { data: existingProf } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    let inOrg = false;
    if (existingProf?.id) {
      const { data: mem } = await supabaseAdmin
        .from("organization_members")
        .select("id")
        .eq("user_id", existingProf.id)
        .eq("organization_id", data.organizationId)
        .maybeSingle();
      inOrg = !!mem;
    }

    if (existingProf?.id) {
      if (data.mode === "add_new") {
        return { userId: existingProf.id, email, action: "skipped", reason: "Already on file." };
      }
      if (data.mode === "update_only" && !inOrg) {
        return { userId: existingProf.id, email, action: "skipped", reason: "Not on this roster." };
      }
      await updateExistingRosterMember(data, existingProf.id, inOrg);
      return { userId: existingProf.id, email, action: "updated", reason: null };
    }

    if (data.mode === "update_only") {
      return { userId: "", email, action: "skipped", reason: "Not on this roster." };
    }

    const password = data.temporaryPassword?.trim();
    if (!password) throw new Error("A temporary password is required to create a new employee.");
    try {
      const hired = await hireEmployeeInternal(
        {
          organizationId: data.organizationId,
          firstName: data.firstName,
          lastName: data.lastName,
          email,
          phone: data.phone ?? "",
          temporaryPassword: password,
          role: data.role,
          department: data.department ?? "",
          hireDate: data.hireDate ?? "",
          startDate: data.hireDate ?? "",
          username: data.username ?? "",
          trackIds: [],
          requiresDeescalation: false,
          requiresAbi: false,
          staffType: [],
          customFieldValues: {},
        },
        context.userId,
        "manual_admin",
      );
      return { userId: hired.userId, email: hired.email, action: hired.created ? "created" : "updated", reason: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/already exists/i.test(msg)) {
        if (data.mode === "add_new") {
          return { userId: "", email, action: "skipped", reason: "Already on file." };
        }
        const { data: again } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("email", email)
          .maybeSingle();
        if (again?.id) {
          const { data: mem } = await supabaseAdmin
            .from("organization_members")
            .select("id")
            .eq("user_id", again.id)
            .eq("organization_id", data.organizationId)
            .maybeSingle();
          await updateExistingRosterMember(data, again.id, !!mem);
          return { userId: again.id, email, action: "updated", reason: null };
        }
      }
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

/* ------------------------------------------------------------------ */
/* Bulk hire-date maintenance                                          */
/* ------------------------------------------------------------------ */

const OrgInput = z.object({ organizationId: z.string().uuid() });

export interface StaffHireDateRow {
  userId: string;
  name: string;
  email: string | null;
  role: string;
  department: string | null;
  hireDate: string | null;
}

export const listStaffHireDates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OrgInput.parse(d))
  .handler(async ({ data, context }): Promise<StaffHireDateRow[]> => {
    if (!context.userId) return [];
    await assertOrgManager(context.userId, data.organizationId);

    const { data: members, error } = await supabaseAdmin
      .from("organization_members")
      .select("user_id, role, job_title")
      .eq("organization_id", data.organizationId)
      .eq("active", true);
    if (error) throw new Error(error.message);

    const ids = (members ?? []).map((m) => m.user_id);
    if (!ids.length) return [];

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, first_name, last_name, email, department, hire_date, start_date, is_active")
      .in("id", ids);

    const byId = new Map((profiles ?? []).map((p) => [p.id, p as any]));

    return (members ?? [])
      .map((m) => {
        const p = byId.get(m.user_id);
        if (p && p.is_active === false) return null;
        const name =
          (p?.full_name as string | null) ||
          [p?.first_name, p?.last_name].filter(Boolean).join(" ") ||
          (p?.email as string | null) ||
          "Unknown";
        return {
          userId: m.user_id,
          name,
          email: (p?.email as string | null) ?? null,
          role: m.role as string,
          department: (p?.department as string | null) ?? (m.job_title as string | null) ?? null,
          hireDate: ((p?.start_date ?? p?.hire_date) as string | null) ?? null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.name.localeCompare(b!.name)) as StaffHireDateRow[];
  });

const BulkHireDateInput = z.object({
  organizationId: z.string().uuid(),
  updates: z
    .array(
      z.object({
        userId: z.string().uuid(),
        hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .min(1)
    .max(500),
});

export const bulkSetStaffHireDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkHireDateInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!context.userId) return { updated: 0 };
    await assertOrgManager(context.userId, data.organizationId);

    const { data: members, error } = await supabaseAdmin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organizationId)
      .eq("active", true)
      .in("user_id", data.updates.map((u) => u.userId));
    if (error) throw new Error(error.message);
    const allowed = new Set((members ?? []).map((m) => m.user_id));

    let updated = 0;
    for (const u of data.updates) {
      if (!allowed.has(u.userId)) continue;
      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ hire_date: u.hireDate, start_date: u.hireDate } as any)
        .eq("id", u.userId);
      if (upErr) throw new Error(upErr.message);
      try {
        await onStaffHiredInternal(supabaseAdmin, data.organizationId, u.userId);
      } catch (hireErr) {
        console.warn("[obligations] hire-date auto-assign failed:", hireErr);
      }
      updated += 1;
    }
    return { updated };
  });


