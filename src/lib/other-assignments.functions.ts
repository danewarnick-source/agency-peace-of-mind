/**
 * "Other Trainings" / ad-hoc per-staff assignments.
 *
 * Admins/managers assign extra trainings, tasks, or requirements to a specific
 * staffer. NECTAR may PROPOSE (confirmed=false), but a human admin/manager
 * must CONFIRM before it becomes visible/actionable for the staffer.
 *
 * Staff can mark non-admin-confirmation items in_progress/complete themselves.
 * Items requiring admin confirmation are completed via a separate admin path.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

export type OtherAssignmentType = "training" | "task" | "requirement";
export type OtherAssignmentStatus = "not_started" | "in_progress" | "completed";
export type OtherAssignmentProposer = "admin" | "manager" | "nectar";

export interface OtherAssignment {
  id: string;
  organization_id: string;
  staff_id: string;
  assignment_type: OtherAssignmentType;
  title: string;
  description: string | null;
  due_date: string | null;
  is_safety_critical: boolean;
  status: OtherAssignmentStatus;
  completed_at: string | null;
  completion_source: string | null;
  requires_admin_confirmation: boolean;
  proposed_by: OtherAssignmentProposer;
  proposal_rationale: string | null;
  confirmed: boolean;
  confirmed_at: string | null;
  confirmed_by: string | null;
  assigned_by: string | null;
  assigned_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  staff_name?: string | null;
}

const orgOnly = z.object({ organization_id: z.string().uuid() });
const orgStaff = z.object({
  organization_id: z.string().uuid(),
  staff_id: z.string().uuid(),
});

/** Staff: list MY assignments (confirmed only — surfaced via RLS). */
export const listMyOtherAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("staff_other_assignments")
      .select("*")
      .eq("staff_id", userId)
      .eq("confirmed", true)
      .order("is_safety_critical", { ascending: false })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as OtherAssignment[];
  });

/** Admin/Manager: list assignments for one staffer. */
export const listStaffOtherAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; staff_id: string }) =>
    orgStaff.parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOrgMembership(
      context.supabase,
      context.userId,
      data.organization_id,
      "manager",
    );
    const { data: rows, error } = await context.supabase
      .from("staff_other_assignments")
      .select("*")
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .order("confirmed", { ascending: true })
      .order("is_safety_critical", { ascending: false })
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (rows ?? []) as OtherAssignment[];
  });

/** Admin/Manager: rollup of all org assignments (for HR Admin view). */
export const listOrgOtherAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    await requireOrgMembership(
      context.supabase,
      context.userId,
      data.organization_id,
      "manager",
    );
    const { data: rows, error } = await context.supabase
      .from("staff_other_assignments")
      .select("*")
      .eq("organization_id", data.organization_id)
      .order("is_safety_critical", { ascending: false })
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw error;
    // Enrich with names
    const ids = Array.from(new Set((rows ?? []).map((r) => r.staff_id)));
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("org_member_directory")
        .select("id, full_name, email")
        .in("id", ids);
      nameMap = new Map(
        (profs ?? []).map((p) => [
          p.id as string,
          (p.full_name as string | null) ||
            (p.email as string | null) ||
            "—",
        ]),
      );
    }
    return (rows ?? []).map((r) => ({
      ...r,
      staff_name: nameMap.get(r.staff_id) ?? null,
    })) as OtherAssignment[];
  });

const createInput = z.object({
  organization_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  assignment_type: z.enum(["training", "task", "requirement"]),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  due_date: z.string().optional().nullable(),
  is_safety_critical: z.boolean().optional(),
  requires_admin_confirmation: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

/** Admin/Manager: assign directly (confirmed=true). */
export const assignOtherItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof createInput>) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireOrgMembership(
      context.supabase,
      context.userId,
      data.organization_id,
      "manager",
    );
    if (context.userId === data.staff_id) {
      throw new Error("Cannot self-assign");
    }
    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("staff_other_assignments")
      .insert({
        organization_id: data.organization_id,
        staff_id: data.staff_id,
        assignment_type: data.assignment_type,
        title: data.title,
        description: data.description ?? null,
        due_date: data.due_date || null,
        is_safety_critical: data.is_safety_critical ?? false,
        requires_admin_confirmation: data.requires_admin_confirmation ?? false,
        notes: data.notes ?? null,
        proposed_by: "admin",
        proposed_by_user: context.userId,
        confirmed: true,
        confirmed_at: now,
        confirmed_by: context.userId,
        assigned_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row as OtherAssignment;
  });

const proposeInput = createInput.extend({
  proposal_rationale: z.string().max(1000).optional().nullable(),
});

/** NECTAR / admin: PROPOSE an assignment (confirmed=false until confirmed). */
export const proposeOtherAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof proposeInput>) => proposeInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireOrgMembership(
      context.supabase,
      context.userId,
      data.organization_id,
      "manager",
    );
    const { data: row, error } = await context.supabase
      .from("staff_other_assignments")
      .insert({
        organization_id: data.organization_id,
        staff_id: data.staff_id,
        assignment_type: data.assignment_type,
        title: data.title,
        description: data.description ?? null,
        due_date: data.due_date || null,
        is_safety_critical: data.is_safety_critical ?? false,
        requires_admin_confirmation: data.requires_admin_confirmation ?? false,
        notes: data.notes ?? null,
        proposed_by: "nectar",
        proposed_by_user: context.userId,
        proposal_rationale: data.proposal_rationale ?? null,
        confirmed: false,
        assigned_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row as OtherAssignment;
  });

/** Admin/Manager: confirm a NECTAR proposal. */
export const confirmProposedAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; assignment_id: string }) =>
    z
      .object({
        organization_id: z.string().uuid(),
        assignment_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOrgMembership(
      context.supabase,
      context.userId,
      data.organization_id,
      "manager",
    );
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("staff_other_assignments")
      .update({
        confirmed: true,
        confirmed_at: now,
        confirmed_by: context.userId,
      })
      .eq("id", data.assignment_id)
      .eq("organization_id", data.organization_id);
    if (error) throw error;
    return { ok: true };
  });

/** Admin/Manager: reject (delete) a proposal. */
export const rejectProposedAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; assignment_id: string }) =>
    z
      .object({
        organization_id: z.string().uuid(),
        assignment_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOrgMembership(
      context.supabase,
      context.userId,
      data.organization_id,
      "manager",
    );
    const { error } = await context.supabase
      .from("staff_other_assignments")
      .delete()
      .eq("id", data.assignment_id)
      .eq("organization_id", data.organization_id)
      .eq("confirmed", false);
    if (error) throw error;
    return { ok: true };
  });

/** Admin/Manager: delete an assignment outright. */
export const deleteOtherAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; assignment_id: string }) =>
    z
      .object({
        organization_id: z.string().uuid(),
        assignment_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOrgMembership(
      context.supabase,
      context.userId,
      data.organization_id,
      "manager",
    );
    const { error } = await context.supabase
      .from("staff_other_assignments")
      .delete()
      .eq("id", data.assignment_id)
      .eq("organization_id", data.organization_id);
    if (error) throw error;
    return { ok: true };
  });

/** Staff: progress own item. Allowed transitions: not_started -> in_progress;
 * in_progress -> completed (only when requires_admin_confirmation = false). */
export const updateMyAssignmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      assignment_id: string;
      status: OtherAssignmentStatus;
    }) =>
      z
        .object({
          assignment_id: z.string().uuid(),
          status: z.enum(["not_started", "in_progress", "completed"]),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: rErr } = await supabase
      .from("staff_other_assignments")
      .select("id, staff_id, status, requires_admin_confirmation, confirmed")
      .eq("id", data.assignment_id)
      .maybeSingle();
    if (rErr || !row) throw new Error("Assignment not found");
    if (row.staff_id !== userId) throw new Error("Not your assignment");
    if (!row.confirmed) throw new Error("Not yet confirmed");
    if (data.status === "completed" && row.requires_admin_confirmation) {
      throw new Error(
        "This task requires admin confirmation to mark complete",
      );
    }
    const patch =
      data.status === "completed"
        ? {
            status: data.status,
            completed_at: new Date().toISOString(),
            completion_source: "self",
          }
        : { status: data.status };
    const { error } = await supabase
      .from("staff_other_assignments")
      .update(patch)
      .eq("id", data.assignment_id);
    if (error) throw error;
    return { ok: true };
  });

/** Admin/Manager: mark an assignment complete (for admin-confirmation tasks or
 * to record off-system completion). */
export const adminCompleteAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      organization_id: string;
      assignment_id: string;
      note?: string | null;
    }) =>
      z
        .object({
          organization_id: z.string().uuid(),
          assignment_id: z.string().uuid(),
          note: z.string().max(1000).optional().nullable(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOrgMembership(
      context.supabase,
      context.userId,
      data.organization_id,
      "manager",
    );
    const { error } = await context.supabase
      .from("staff_other_assignments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completion_source: "admin",
        completion_provenance: {
          confirmed_by: context.userId,
          note: data.note ?? null,
          at: new Date().toISOString(),
        },
      })
      .eq("id", data.assignment_id)
      .eq("organization_id", data.organization_id);
    if (error) throw error;
    return { ok: true };
  });

/** Lightweight summary for staffer (used by My Trainings card + nudges). */
export const getMyOtherAssignmentsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("staff_other_assignments")
      .select("id, status, is_safety_critical, due_date, title")
      .eq("staff_id", userId)
      .eq("confirmed", true);
    if (error) throw error;
    const rows = data ?? [];
    const total = rows.length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const open = rows.filter((r) => r.status !== "completed");
    const safetyCriticalOpen = open.filter((r) => r.is_safety_critical);
    return {
      total,
      completed,
      open_count: open.length,
      safety_critical_open_count: safetyCriticalOpen.length,
      open_items: open.map((r) => ({
        id: r.id as string,
        title: r.title as string,
        is_safety_critical: r.is_safety_critical as boolean,
        due_date: (r.due_date as string | null) ?? null,
      })),
    };
  });
