// Server functions for the Custom Forms feature.
// All calls are authenticated; admins/managers manage forms, staff fill them.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { FormField, FormSettings, Schedule, Frequency } from "./forms-utils";
import { periodKeyFor } from "./forms-utils";

import { gatewayFetch } from "@/lib/ai-bedrock.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function adminGuard(role: string | undefined) {
  if (!role || !["admin", "manager", "super_admin"].includes(role)) {
    throw new Error("Forbidden: admin access required.");
  }
}

async function getMembership(supabase: AnySupabase, userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, manager_id")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("No active organization membership.");
  return data as { organization_id: string; role: string; manager_id: string | null };
}

// ─── ADMIN: list forms ─────────────────────────────────────────────────────
export const listForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const { data, error } = await supabase
      .from("forms")
      .select("*")
      .eq("organization_id", m.organization_id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { forms: data ?? [] };
  });

// ─── ADMIN: get one form (any status, for editing) ─────────────────────────
export const getForm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ formId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    const { data: form, error } = await supabase.from("forms").select("*").eq("id", data.formId).maybeSingle();
    if (error || !form) throw new Error("Form not found.");
    if (form.organization_id !== m.organization_id) throw new Error("Forbidden.");
    // Staff can only fetch via getStaffForm; this is admin-scoped.
    adminGuard(m.role);
    return { form };
  });

// ─── ADMIN: create or update a form ────────────────────────────────────────
const formInput = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  category: z.string().min(1).max(40),
  fields: z.array(z.any()).max(200),
  frequency: z.enum(["as_needed","daily","weekly","monthly","quarterly","annually"]),
  schedule: z.record(z.any()).default({}),
  assigned_groups: z.array(z.string().min(1).max(80)).max(40).default([]),
  assigned_users: z.array(z.string().uuid()).max(500).default([]),
  all_clients: z.boolean().default(true),
  assigned_clients: z.array(z.string().uuid()).max(2000).default([]),
  settings: z.record(z.any()).default({}),
});

export const saveForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => formInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const payload = {
      organization_id: m.organization_id,
      name: data.name,
      description: data.description ?? null,
      category: data.category,
      fields: data.fields,
      frequency: data.frequency,
      schedule: data.schedule,
      assigned_groups: data.assigned_groups,
      assigned_users: data.assigned_users,
      all_clients: data.all_clients,
      assigned_clients: data.all_clients ? [] : data.assigned_clients,
      settings: data.settings,
      created_by: userId,
    };
    type SavedForm = { id: string; name: string; settings: Record<string, unknown> | null; category: string };
    let savedForm: SavedForm | null = null;
    if (data.id) {
      const { data: updated, error } = await supabase
        .from("forms").update(payload).eq("id", data.id).select().maybeSingle();
      if (error) throw new Error(error.message);
      savedForm = (updated ?? null) as SavedForm | null;
    } else {
      const { data: inserted, error } = await supabase
        .from("forms").insert(payload).select().maybeSingle();
      if (error) throw new Error(error.message);
      savedForm = (inserted ?? null) as SavedForm | null;
    }

    // Sync company-required intake checklist item.
    // Companies may declare an intake form as required for client intake; that
    // creates a `company_required` nectar_requirements row (scope='hr_client_intake')
    // that surfaces on the client intake checklist next to SOW/practice items,
    // but is clearly labeled as the company's own requirement (not authoritative).
    // Toggling it off deactivates ONLY the company_required row keyed to this form.
    if (savedForm?.id && savedForm.category === "intake") {
      const s = (savedForm.settings ?? {}) as Record<string, unknown>;
      const required = s.required_for_intake === true;
      const purpose = typeof s.purpose === "string" ? s.purpose : "";
      const subcategory = typeof s.subcategory === "string" ? s.subcategory : null;
      const reqKey = `company_required:form:${savedForm.id}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const { data: existing } = await sb
        .from("nectar_requirements")
        .select("id")
        .eq("organization_id", m.organization_id)
        .eq("requirement_key", reqKey)
        .maybeSingle();

      if (required) {
        const metadata = {
          scope: "hr_client_intake",
          checklist_layer: "company_required",
          source_form_id: savedForm.id,
          subcategory,
          purpose,
          evidence_type: "form_submission",
        };
        if (existing?.id) {
          await sb.from("nectar_requirements").update({
            title: savedForm.name,
            description: purpose || null,
            metadata,
            approval_state: "provider_confirmed",
            review_status: "confirmed",
          }).eq("id", existing.id);
        } else {
          await sb.from("nectar_requirements").insert({
            organization_id: m.organization_id,
            origin: "manual",
            requirement_key: reqKey,
            title: savedForm.name,
            description: purpose || null,
            category: "intake",
            metadata,
            approval_state: "provider_confirmed",
            review_status: "confirmed",
            verified: true,
          });
        }
      } else if (existing?.id) {
        // Hard-delete the company_required row (it was added solely by the
        // company toggling required=ON; turning it off removes it). Cascades
        // any client_intake_completion rows tied to it.
        await sb.from("nectar_requirements").delete().eq("id", existing.id);
      }
    }

    // ─── Sync staff-mandate checklist requirement (scope='hr_staff_checklist')
    // When a form is set to routing_behavior='staff_mandate', mint a
    // company-required nectar_requirements row in the staff-checklist scope
    // so the auto-check trigger can flip staff_checklist_completion on submit.
    // If the behavior is switched away, hard-delete that staff-scope row
    // (which cascades any staff_checklist_completion rows tied to it).
    if (savedForm?.id) {
      const s = (savedForm.settings ?? {}) as Record<string, unknown>;
      const behavior = typeof s.routing_behavior === "string" ? s.routing_behavior : "";
      const isStaffMandate = behavior === "staff_mandate";
      const mandateScope = s.mandate_scope === "per_staff_per_client"
        ? "per_staff_per_client" : "per_staff";
      const purpose = typeof s.usage_purpose === "string"
        ? s.usage_purpose
        : (typeof s.purpose === "string" ? s.purpose : "");
      const reqKey = `company_required:form:${savedForm.id}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb2 = supabase as any;
      const { data: existingStaff } = await sb2
        .from("nectar_requirements")
        .select("id, metadata")
        .eq("organization_id", m.organization_id)
        .eq("requirement_key", reqKey)
        .contains("metadata", { scope: "hr_staff_checklist" })
        .maybeSingle();

      if (isStaffMandate) {
        const metadata = {
          scope: "hr_staff_checklist",
          checklist_layer: "company_required",
          source_form_id: savedForm.id,
          mandate_scope: mandateScope,
          purpose,
          evidence_type: "form_submission",
        };
        if (existingStaff?.id) {
          await sb2.from("nectar_requirements").update({
            title: savedForm.name,
            description: purpose || null,
            metadata,
            approval_state: "provider_confirmed",
            review_status: "confirmed",
          }).eq("id", existingStaff.id);
        } else {
          await sb2.from("nectar_requirements").insert({
            organization_id: m.organization_id,
            origin: "manual",
            requirement_key: reqKey,
            title: savedForm.name,
            description: purpose || null,
            category: "hr",
            metadata,
            approval_state: "provider_confirmed",
            review_status: "confirmed",
            verified: true,
          });
        }
      } else if (existingStaff?.id) {
        await sb2.from("nectar_requirements").delete().eq("id", existingStaff.id);
      }
    }

    return { form: savedForm ? { id: savedForm.id, name: savedForm.name } : null };
  });

// ─── ADMIN: archive a form ─────────────────────────────────────────────────
export const archiveForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ formId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const { error } = await supabase.from("forms").update({ status: "archived" })
      .eq("id", data.formId).eq("organization_id", m.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── ADMIN: seed canonical intake forms (idempotent) ──────────────────────
// Inserts the five starter intake forms for the caller's org IFF the org has
// zero category='intake' forms. Safe to call repeatedly — re-running on an
// org that already has any intake forms returns { seeded: 0 } and inserts
// nothing. Surfaces five published forms ordered by settings.subcategory.
const INTAKE_FORM_SEEDS: ReadonlyArray<{
  name: string;
  description: string;
  subcategory: string;
  fields: ReadonlyArray<{
    id: string;
    type: "short_text" | "paragraph" | "date" | "dropdown" | "yes_no";
    label: string;
    required?: boolean;
    options?: string[];
  }>;
}> = [
  {
    name: "Client Application & Demographics",
    description: "Identifying information, contacts, diagnosis, and guardian status.",
    subcategory: "application",
    fields: [
      { id: "full_name", type: "short_text", label: "Full name", required: true },
      { id: "date_of_birth", type: "date", label: "Date of birth", required: true },
      { id: "medicaid_id", type: "short_text", label: "Medicaid ID", required: true },
      { id: "ssn_last4", type: "short_text", label: "SSN (last 4)" },
      { id: "home_address", type: "short_text", label: "Home address", required: true },
      { id: "phone", type: "short_text", label: "Phone" },
      { id: "emergency_contact_name", type: "short_text", label: "Emergency contact name", required: true },
      { id: "emergency_contact_phone", type: "short_text", label: "Emergency contact phone", required: true },
      { id: "primary_diagnosis", type: "short_text", label: "Primary diagnosis" },
      { id: "guardian_status", type: "dropdown", label: "Guardian status", required: true, options: ["self", "parent", "legal_guardian"] },
    ],
  },
  {
    name: "Independence & Self-Determination",
    description: "Preferences, routines, supports, and rights restrictions screen.",
    subcategory: "independence",
    fields: [
      { id: "preferred_communication", type: "short_text", label: "Preferred communication" },
      { id: "daily_routine_preferences", type: "paragraph", label: "Daily routine preferences" },
      { id: "decision_making_supports", type: "paragraph", label: "Decision-making supports" },
      { id: "community_goals", type: "paragraph", label: "Community goals" },
      { id: "rights_restrictions_present", type: "dropdown", label: "Rights restrictions present?", required: true, options: ["yes", "no"] },
    ],
  },
  {
    name: "Consents & Authorizations",
    description: "Consent to services, ROI, photo/media, and emergency medical authorization.",
    subcategory: "consent",
    fields: [
      { id: "consent_to_services", type: "yes_no", label: "Consent to services", required: true },
      { id: "release_of_information", type: "yes_no", label: "Release of information", required: true },
      { id: "photo_media_consent", type: "dropdown", label: "Photo / media consent", required: true, options: ["yes", "no"] },
      { id: "emergency_medical_consent", type: "yes_no", label: "Emergency medical consent", required: true },
      { id: "signature_name", type: "short_text", label: "Signature (printed name)", required: true },
      { id: "signature_date", type: "date", label: "Signature date", required: true },
    ],
  },
  {
    name: "Policies & Procedures Attestation",
    description: "Acknowledges review of client rights, grievance process, and abuse/neglect reporting.",
    subcategory: "pnp_attestation",
    fields: [
      { id: "reviewed_client_rights", type: "yes_no", label: "Reviewed client rights", required: true },
      { id: "reviewed_grievance_process", type: "yes_no", label: "Reviewed grievance process", required: true },
      { id: "reviewed_abuse_neglect_reporting", type: "yes_no", label: "Reviewed abuse / neglect reporting", required: true },
      { id: "attestation_signature", type: "short_text", label: "Attestation signature (printed name)", required: true },
      { id: "attestation_date", type: "date", label: "Attestation date", required: true },
    ],
  },
  {
    name: "Additional Intake Notes",
    description: "Free-form notes and attachments received during intake.",
    subcategory: "other",
    fields: [
      { id: "notes", type: "paragraph", label: "Notes" },
      { id: "attachments_received", type: "paragraph", label: "Attachments received" },
    ],
  },
];

export const seedIntakeForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);

    // Idempotency gate: any existing intake form (any status) blocks seeding.
    const { count, error: countErr } = await supabase
      .from("forms")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", m.organization_id)
      .eq("category", "intake");
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) return { seeded: 0, skipped: true };

    const nowIso = new Date().toISOString();
    const rows = INTAKE_FORM_SEEDS.map((seed) => ({
      organization_id: m.organization_id,
      name: seed.name,
      description: seed.description,
      category: "intake",
      status: "published",
      all_clients: true,
      assigned_clients: [],
      assigned_groups: [],
      assigned_users: [],
      frequency: "once",
      schedule: {},
      fields: seed.fields,
      settings: { subcategory: seed.subcategory },
      created_by: userId,
      published_at: nowIso,
    }));

    const { data: inserted, error: insErr } = await supabase
      .from("forms")
      .insert(rows)
      .select("id");
    if (insErr) throw new Error(insErr.message);
    return { seeded: inserted?.length ?? 0, skipped: false };
  });


// ─── ADMIN: count ties before hard-delete ──────────────────────────────────
// Server-side recount so the destructive confirmation can show real numbers
// and require type-to-confirm when ties exist.
export const getFormDeleteImpact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ formId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);

    const { data: form, error: fe } = await supabase
      .from("forms").select("id, name, category, organization_id")
      .eq("id", data.formId).maybeSingle();
    if (fe || !form) throw new Error("Form not found.");
    if (form.organization_id !== m.organization_id) throw new Error("Forbidden.");

    const { count: submissionCount } = await supabase
      .from("form_submissions").select("id", { count: "exact", head: true })
      .eq("form_id", form.id);

    const { data: subClientRows } = await supabase
      .from("form_submissions").select("client_id").eq("form_id", form.id)
      .not("client_id", "is", null).limit(1);
    const hasClientSubmissions = (subClientRows ?? []).length > 0;

    const reqKey = `company_required:form:${form.id}`;
    const { data: linkedReq } = await supabase
      .from("nectar_requirements").select("id, title")
      .eq("organization_id", m.organization_id)
      .eq("requirement_key", reqKey).maybeSingle();

    let intakeCompletionCount = 0;
    if (linkedReq?.id) {
      const { count: c } = await supabase
        .from("client_intake_completion")
        .select("id", { count: "exact", head: true })
        .eq("requirement_id", linkedReq.id);
      intakeCompletionCount = c ?? 0;
    }

    const { count: notifCount } = await supabase
      .from("form_notifications").select("id", { count: "exact", head: true })
      .eq("form_id", form.id);

    return {
      formId: form.id,
      formName: form.name,
      submissionCount: submissionCount ?? 0,
      hasClientSubmissions,
      hasLinkedChecklistItem: !!linkedReq?.id,
      linkedChecklistItemTitle: linkedReq?.title ?? null,
      intakeCompletionCount,
      notificationCount: notifCount ?? 0,
    };
  });

// ─── ADMIN: HARD DELETE a form (irreversible) ──────────────────────────────
// Tiered: if any ties exist, caller MUST pass confirmName matching the form
// name exactly. FK cascades clean form_submissions and form_notifications;
// the linked company-required nectar_requirements row is deleted explicitly
// (which cascades client_intake_completion). Role + org are enforced
// server-side; tie counts are recounted server-side.
export const deleteForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    formId: z.string().uuid(),
    confirmName: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);

    const { data: form, error: fe } = await supabase
      .from("forms").select("id, name, organization_id")
      .eq("id", data.formId).maybeSingle();
    if (fe || !form) throw new Error("Form not found.");
    if (form.organization_id !== m.organization_id) throw new Error("Forbidden.");

    const { count: submissionCount } = await supabase
      .from("form_submissions").select("id", { count: "exact", head: true })
      .eq("form_id", form.id);

    const reqKey = `company_required:form:${form.id}`;
    const { data: linkedReq } = await supabase
      .from("nectar_requirements").select("id")
      .eq("organization_id", m.organization_id)
      .eq("requirement_key", reqKey).maybeSingle();

    const hasTies = (submissionCount ?? 0) > 0 || !!linkedReq?.id;
    if (hasTies) {
      if (!data.confirmName || data.confirmName.trim() !== form.name.trim()) {
        throw new Error("This form has attached records. Type the form name exactly to confirm permanent deletion.");
      }
    }

    // Remove linked company-required checklist item first (cascades
    // client_intake_completion via FK). Abort the whole delete on failure.
    if (linkedReq?.id) {
      const { error: delReqErr } = await supabase
        .from("nectar_requirements").delete().eq("id", linkedReq.id);
      if (delReqErr) throw new Error(`Failed to remove linked checklist item: ${delReqErr.message}`);
    }

    // Delete the form. FK cascade removes form_submissions and form_notifications.
    const { error: delErr } = await supabase
      .from("forms").delete().eq("id", form.id).eq("organization_id", m.organization_id);
    if (delErr) throw new Error(delErr.message);

    return {
      ok: true,
      deleted: {
        formId: form.id,
        submissionCount: submissionCount ?? 0,
        removedChecklistItem: !!linkedReq?.id,
      },
    };
  });

// ─── ADMIN: publish a form, persist notification text, deliver to assignees
export const publishForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    formId: z.string().uuid(),
    title: z.string().min(1).max(160),
    body: z.string().min(1).max(4000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);

    const { data: form, error: fe } = await supabase
      .from("forms").select("*").eq("id", data.formId)
      .eq("organization_id", m.organization_id).maybeSingle();
    if (fe || !form) throw new Error("Form not found.");

    // Mark published
    await supabase.from("forms").update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", form.id);

    // Resolve audience → user ids
    const targetUserIds = new Set<string>(form.assigned_users ?? []);
    if ((form.assigned_groups ?? []).includes("all_staff")) {
      const { data: members } = await supabase
        .from("organization_members").select("user_id")
        .eq("organization_id", m.organization_id).eq("active", true);
      for (const u of members ?? []) targetUserIds.add(u.user_id);
    } else if ((form.assigned_groups ?? []).length) {
      const { data: profiles } = await supabase
        .from("profiles").select("id, staff_type_keys")
        .overlaps("staff_type_keys", form.assigned_groups);
      for (const p of profiles ?? []) targetUserIds.add(p.id);
    }

    // Persist notification text
    await supabase.from("form_notifications").insert({
      organization_id: m.organization_id,
      form_id: form.id,
      title: data.title,
      body: data.body,
      created_by: userId,
    });

    // Fan-out to notifications table
    if (targetUserIds.size > 0) {
      const rows = Array.from(targetUserIds).map((uid) => ({
        organization_id: m.organization_id,
        recipient_role: "staff",
        recipient_user_id: uid,
        type: "form_assigned",
        urgency: "normal",
        title: data.title,
        body: data.body,
        link_to: "/dashboard/forms",
        related_id: form.id,
        related_type: "form",
      }));
      await supabase.from("notifications").insert(rows);
    }
    return { ok: true, delivered: targetUserIds.size };
  });

// ─── STAFF: list forms assigned to me + my submissions for current periods
export const listMyForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    // RLS already filters; just SELECT
    const { data: forms, error } = await supabase
      .from("forms").select("*").eq("status", "published");
    if (error) throw new Error(error.message);
    const formIds = (forms ?? []).map((f: { id: string }) => f.id);
    let subs: Array<{ form_id: string; period_key: string | null; submitted_at: string; id: string }> = [];
    if (formIds.length) {
      const { data: s } = await supabase
        .from("form_submissions")
        .select("id, form_id, period_key, submitted_at")
        .eq("submitted_by", userId)
        .in("form_id", formIds);
      subs = s ?? [];
    }
    return { forms: forms ?? [], submissions: subs };
  });

// ─── STAFF: get a form to fill ─────────────────────────────────────────────
export const getStaffForm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ formId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: AnySupabase };
    const { data: form, error } = await supabase
      .from("forms").select("*").eq("id", data.formId).eq("status", "published").maybeSingle();
    if (error || !form) throw new Error("Form not found.");
    return { form };
  });

// ─── STAFF: submit ─────────────────────────────────────────────────────────
export const submitForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    formId: z.string().uuid(),
    clientId: z.string().uuid(),
    answers: z.record(z.any()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    const { data: form, error: fe } = await supabase
      .from("forms").select("id, organization_id, frequency, settings, all_clients, assigned_clients").eq("id", data.formId).maybeSingle();
    if (fe || !form) throw new Error("Form not found.");
    // Verify the form is assigned to this client
    if (!form.all_clients && !(form.assigned_clients ?? []).includes(data.clientId)) {
      throw new Error("This form is not assigned to that individual.");
    }
    // Verify the staff has this client on their caseload (defense-in-depth; UI already filters)
    const { data: sa } = await supabase
      .from("staff_assignments").select("client_id")
      .eq("organization_id", form.organization_id)
      .eq("staff_id", userId).eq("client_id", data.clientId).limit(1).maybeSingle();
    if (!sa) throw new Error("This individual is not on your caseload.");
    const periodKey = periodKeyFor(form.frequency as Frequency);
    const settings = (form.settings ?? {}) as FormSettings;
    const submittedBy = settings.anonymous ? null : userId;

    // Stage 4: best-effort active-shift linkage for per-shift tracking forms.
    // READ-ONLY against evv_timesheets. Never blocks the submission.
    let resolvedShiftId: string | null = null;
    if (settings.routing_behavior === "per_shift_per_client_tracked") {
      try {
        const { data: activeShift } = await supabase
          .from("evv_timesheets")
          .select("id, client_id, service_type_code")
          .eq("staff_id", userId)
          .is("clock_out_timestamp", null)
          .order("clock_in_timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (activeShift && activeShift.client_id === data.clientId) {
          const codeMode = settings.tracking_code_mode ?? "all";
          const codeOk =
            codeMode === "all" ||
            (Array.isArray(settings.tracking_billing_codes) &&
              !!activeShift.service_type_code &&
              settings.tracking_billing_codes.includes(activeShift.service_type_code));
          if (codeOk) resolvedShiftId = activeShift.id as string;
        }
      } catch {
        // Best-effort only — fall back to NULL shift_id.
        resolvedShiftId = null;
      }
    }

    const { data: ins, error } = await supabase.from("form_submissions").insert({
      organization_id: form.organization_id,
      form_id: form.id,
      submitted_by: submittedBy,
      client_id: data.clientId,
      answers: data.answers,
      period_key: periodKey,
      shift_id: resolvedShiftId,
    }).select().maybeSingle();
    if (error) throw new Error(error.message);

    void m;

    // Fan-out at submission time per form settings (share_users, share_manager, share_emails).
    try {
      const shareUserIds = new Set<string>(Array.isArray(settings.share_users) ? settings.share_users : []);
      if (settings.share_manager) {
        const mine = await supabase
          .from("organization_members").select("manager_id")
          .eq("user_id", userId).eq("organization_id", form.organization_id)
          .maybeSingle();
        const mgr = mine.data?.manager_id;
        if (mgr) shareUserIds.add(mgr);
      }
      // Best-effort lookup of admins for share_emails (in-app notify only).
      if (Array.isArray(settings.share_emails) && settings.share_emails.length) {
        const { data: p } = await supabase
          .from("profiles").select("id, email").in("email", settings.share_emails);
        for (const row of p ?? []) if (row.id) shareUserIds.add(row.id);
      }
      if (shareUserIds.size) {
        const submitterName = (await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle()).data?.full_name ?? "A staff member";
        const formName = (await supabase.from("forms").select("name").eq("id", form.id).maybeSingle()).data?.name ?? "a form";
        const rows = Array.from(shareUserIds).map((uid) => ({
          organization_id: form.organization_id,
          recipient_role: "staff" as const,
          recipient_user_id: uid,
          type: "form_submitted",
          urgency: "normal",
          title: `New submission: ${formName}`,
          body: `${submitterName} submitted "${formName}".`,
          link_to: `/dashboard/forms/${form.id}/submissions`,
          related_id: form.id,
          related_type: "form",
        }));
        await supabase.from("notifications").insert(rows);
      }
    } catch {
      // Fan-out is best-effort; never block the staff submission on it.
    }

    return { submission: ins };
  });

// ─── ADMIN/MANAGER: submit an INTAKE form (role-gated, no caseload check) ──
// Separate path from staff submitForm. Strictly limited to category='intake'
// forms so it can never be used to bypass the staff assignment rule for
// ordinary forms. Does NOT modify submitForm.
export const submitIntakeForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    formId: z.string().uuid(),
    clientId: z.string().uuid(),
    answers: z.record(z.any()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    // Role gate: admin/manager/super_admin only.
    adminGuard(m.role);

    const { data: form, error: fe } = await supabase
      .from("forms")
      .select("id, organization_id, category, frequency, settings, all_clients, assigned_clients")
      .eq("id", data.formId)
      .maybeSingle();
    if (fe || !form) throw new Error("Form not found.");

    // Org scope.
    if (form.organization_id !== m.organization_id) {
      throw new Error("Forbidden: form is not in your organization.");
    }
    // Category gate — intake only.
    if (form.category !== "intake") {
      throw new Error("submitIntakeForm only accepts intake-category forms.");
    }
    // Verify client belongs to the same org.
    const { data: client, error: ce } = await supabase
      .from("clients").select("id, organization_id")
      .eq("id", data.clientId).maybeSingle();
    if (ce || !client) throw new Error("Client not found.");
    if (client.organization_id !== m.organization_id) {
      throw new Error("Forbidden: client is not in your organization.");
    }
    // Form-to-client assignment (intake forms typically all_clients=true; honor explicit assignment if set).
    if (!form.all_clients && !(form.assigned_clients ?? []).includes(data.clientId)) {
      throw new Error("This intake form is not assigned to that individual.");
    }

    const periodKey = periodKeyFor(form.frequency as Frequency);
    const { data: ins, error } = await supabase.from("form_submissions").insert({
      organization_id: form.organization_id,
      form_id: form.id,
      submitted_by: userId,
      client_id: data.clientId,
      answers: data.answers,
      period_key: periodKey,
    }).select().maybeSingle();
    if (error) throw new Error(error.message);
    return { submission: ins };
  });

// ─── STAFF/ADMIN: submit a STAFF MANDATE form ─────────────────────────────
// Staff-mandate forms credit the TARGET staffer (not necessarily the
// submitter). The trigger reads `answers.__target_staff_id` to decide whose
// staff_checklist_completion row flips to 'complete'. Self-submit defaults
// to submitted_by. Admins/managers may submit on-behalf for any staffer in
// the same org. No client_id (the mandate is per-staff, not per-client at
// this stage). The form must have routing_behavior='staff_mandate'.
export const submitStaffMandateForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    formId: z.string().uuid(),
    answers: z.record(z.any()),
    targetStaffId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);

    const { data: form, error: fe } = await supabase
      .from("forms")
      .select("id, organization_id, status, frequency, settings, assigned_groups, assigned_users")
      .eq("id", data.formId)
      .maybeSingle();
    if (fe || !form) throw new Error("Form not found.");
    if (form.organization_id !== m.organization_id) throw new Error("Forbidden.");
    if (form.status !== "published") throw new Error("Form is not published.");
    const settings = (form.settings ?? {}) as FormSettings;
    if (settings.routing_behavior !== "staff_mandate") {
      throw new Error("submitStaffMandateForm only accepts staff_mandate forms.");
    }

    // Resolve target staffer.
    let targetStaffId = data.targetStaffId ?? userId;
    if (targetStaffId !== userId) {
      // On-behalf submission requires admin/manager/super_admin.
      adminGuard(m.role);
      // Verify target is a member of the same org.
      const { data: tm } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", m.organization_id)
        .eq("user_id", targetStaffId)
        .eq("active", true)
        .maybeSingle();
      if (!tm) throw new Error("Target staffer is not in your organization.");
    }

    // Stash the resolved target on the submission so the trigger can read it.
    const answers = { ...(data.answers ?? {}), __target_staff_id: targetStaffId };
    const periodKey = periodKeyFor(form.frequency as Frequency);

    // Use admin client: server-side has already enforced org + role + form
    // behavior. RLS on form_submissions only permits "assigned staff" inserts,
    // which would block legitimate admin on-behalf submissions.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ins, error } = await supabaseAdmin.from("form_submissions").insert({
      organization_id: form.organization_id,
      form_id: form.id,
      submitted_by: userId,
      client_id: null,
      answers,
      period_key: periodKey,
    }).select().maybeSingle();
    if (error) throw new Error(error.message);
    return { submission: ins };
  });

// ─── ADMIN: detect unmet staff_mandate forms for a staffer (read-only) ─────
// Returns the list of published staff_mandate forms whose mapped
// hr_staff_checklist requirement has NO satisfying staff_checklist_completion
// row for `staffId` (status NOT IN complete/waived). Used by checkpoints
// (assignment, future clock-in) to WARN — never to block. Caller is admin
// scope; uses the user-scoped client (RLS applies to forms/requirements/SCC,
// all of which admins can read).
//
// For per_staff mandates the clientId is ignored (the question is "is this
// staffer's standing record complete?"). For mandates configured to specific
// clients via all_clients=false / assigned_clients, we exclude forms not
// assigned to clientId when it is provided. per_staff_per_client scope is
// reserved for a later stage; treated as per_staff here.
export const getUnmetStaffMandates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    staffId: z.string().uuid(),
    clientId: z.string().uuid().optional(),
    // Stage 4: NEW (staff, client) assignments being added in this save.
    // When provided, the gate ALSO checks per-(staff,client) Client-Specific
    // Training completion for each clientId and merges unmet items into the
    // same list (default enforcement = WARN). Empty/omitted = legacy behavior.
    clientIds: z.array(z.string().uuid()).max(100).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);

    const unmet: Array<{ form_id: string; name: string; mandate_scope: string; enforcement: "warn" | "block" }> = [];

    // 1. All published staff_mandate forms in this org.
    const { data: forms, error: fe } = await supabase
      .from("forms")
      .select("id, name, settings, all_clients, assigned_clients")
      .eq("organization_id", m.organization_id)
      .eq("status", "published");
    if (fe) throw new Error(fe.message);
    const mandateForms = ((forms ?? []) as Array<{
      id: string; name: string; settings: Record<string, unknown> | null;
      all_clients: boolean; assigned_clients: string[] | null;
    }>).filter((f) => (f.settings ?? {})["routing_behavior"] === "staff_mandate");

    // 2. If clientId provided, drop forms not assigned to that client.
    const scoped = mandateForms.filter((f) => {
      if (!data.clientId) return true;
      if (f.all_clients) return true;
      return (f.assigned_clients ?? []).includes(data.clientId);
    });

    // Map form id → enforcement ('warn' default | 'block') from form settings.
    const enforcementByForm = new Map<string, "warn" | "block">();
    for (const f of scoped) {
      const enf = (f.settings ?? {})["mandate_enforcement"];
      enforcementByForm.set(f.id, enf === "block" ? "block" : "warn");
    }

    if (scoped.length) {
      // 3. Look up the matching hr_staff_checklist requirements (one per form).
      const reqKeys = scoped.map((f) => `company_required:form:${f.id}`);
      const { data: reqs } = await supabase
        .from("nectar_requirements")
        .select("id, requirement_key, metadata")
        .eq("organization_id", m.organization_id)
        .in("requirement_key", reqKeys)
        .eq("approval_state", "provider_confirmed");
      const reqByForm = new Map<string, { id: string; mandate_scope: string }>();
      for (const r of (reqs ?? []) as Array<{ id: string; requirement_key: string; metadata: Record<string, unknown> | null }>) {
        const md = r.metadata ?? {};
        if (md["scope"] !== "hr_staff_checklist") continue;
        const formId = r.requirement_key.replace("company_required:form:", "");
        reqByForm.set(formId, {
          id: r.id,
          mandate_scope: (md["mandate_scope"] as string) || "per_staff",
        });
      }

      const reqIds = Array.from(reqByForm.values()).map((r) => r.id);
      if (reqIds.length) {
        // 4. Pull this staffer's GENERAL (client_id IS NULL) completion rows
        //    for those requirements. Per-client rows (Stage 1) must not
        //    accidentally satisfy a general staff-mandate.
        const { data: comps } = await supabase
          .from("staff_checklist_completion")
          .select("requirement_id, status")
          .eq("organization_id", m.organization_id)
          .eq("staff_id", data.staffId)
          .is("client_id", null)
          .in("requirement_id", reqIds);
        const satisfied = new Set<string>();
        for (const c of (comps ?? []) as Array<{ requirement_id: string; status: string }>) {
          if (["complete", "waived", "not_applicable"].includes(c.status)) {
            satisfied.add(c.requirement_id);
          }
        }

        // 5. Forms whose requirement is NOT satisfied.
        for (const f of scoped) {
          const req = reqByForm.get(f.id);
          if (!req) continue;
          if (satisfied.has(req.id)) continue;
          unmet.push({
            form_id: f.id,
            name: f.name,
            mandate_scope: req.mandate_scope,
            enforcement: enforcementByForm.get(f.id) ?? "warn",
          });
        }
      }
    }

    // ─── Stage 4: Client-Specific Training per (staff, client) ──────────────
    // For each NEW (staff, client) assignment in `clientIds`, if the client
    // has a PUBLISHED client_specific_training and there is NO satisfying
    // per-client staff_checklist_completion row (status IN complete/waived/
    // not_applicable) keyed by the org's system anchor requirement
    // (origin='system', requirement_key='client_specific_training'), flag it.
    // Default enforcement = WARN (non-blocking). No setting needed this stage.
    const cstClientIds = data.clientIds ?? [];
    if (cstClientIds.length) {
      const { data: trainings } = await supabase
        .from("client_specific_trainings")
        .select("id, client_id, status")
        .eq("organization_id", m.organization_id)
        .eq("status", "published")
        .in("client_id", cstClientIds);
      const publishedByClient = new Map<string, { id: string }>();
      for (const t of (trainings ?? []) as Array<{ id: string; client_id: string; status: string }>) {
        publishedByClient.set(t.client_id, { id: t.id });
      }

      if (publishedByClient.size) {
        // System anchor requirement — created lazily on first staff
        // completion (Stage 2b). If absent, no completions exist → all
        // published-training clients are unmet.
        const { data: anchor } = await supabase
          .from("nectar_requirements")
          .select("id")
          .eq("organization_id", m.organization_id)
          .eq("origin", "system")
          .eq("requirement_key", "client_specific_training")
          .limit(1)
          .maybeSingle();

        const satisfiedClientIds = new Set<string>();
        if (anchor?.id) {
          const { data: perClientComps } = await supabase
            .from("staff_checklist_completion")
            .select("client_id, status")
            .eq("organization_id", m.organization_id)
            .eq("staff_id", data.staffId)
            .eq("requirement_id", anchor.id)
            .in("client_id", Array.from(publishedByClient.keys()));
          for (const c of (perClientComps ?? []) as Array<{ client_id: string | null; status: string }>) {
            if (c.client_id && ["complete", "waived", "not_applicable"].includes(c.status)) {
              satisfiedClientIds.add(c.client_id);
            }
          }
        }

        const unmetClientIds = Array.from(publishedByClient.keys()).filter((cid) => !satisfiedClientIds.has(cid));
        if (unmetClientIds.length) {
          const { data: clientRows } = await supabase
            .from("clients")
            .select("id, first_name, last_name")
            .in("id", unmetClientIds);
          const nameByClient = new Map<string, string>();
          for (const c of (clientRows ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
            const nm = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "client";
            nameByClient.set(c.id, nm);
          }
          for (const cid of unmetClientIds) {
            const training = publishedByClient.get(cid)!;
            unmet.push({
              form_id: training.id, // training uuid — used as React key + notification ref
              name: `Client-Specific Training: ${nameByClient.get(cid) ?? "client"}`,
              mandate_scope: "per_staff_per_client",
              enforcement: "warn", // Stage 4 default
            });
          }
        }
      }
    }

    return { unmet };
  });

// ─── ADMIN: record a staff-mandate override (proceed-anyway) ───────────────
// Called from the assignment checkpoint AFTER the staff_assignments write
// succeeds. Inserts an admin-facing notification naming the staffer + unmet
// form(s) + client(s). Best-effort; never throws to the caller in a way that
// should roll back the assignment.
//
// Dedupe: skip insertion if an identical notification (same staff_id +
// type + organization_id) was created in the last 5 minutes — this avoids
// runaway noise when an admin re-saves the same caseload back-to-back.
//
// Path chosen: NOTIFICATIONS-ONLY. shift_completeness_flags.shift_id is
// NOT NULL and there is no shift at assignment time; we deliberately do
// NOT relax that schema or fabricate a fake shift.
export const recordStaffMandateOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    staffId: z.string().uuid(),
    clientIds: z.array(z.string().uuid()).min(1).max(50),
    unmetFormIds: z.array(z.string().uuid()).min(1).max(50),
    unmetFormNames: z.array(z.string().min(1).max(300)).min(1).max(50),
    // When set, this override was forced past a 'block' enforcement; the
    // typed reason is REQUIRED and is stored verbatim in the notification
    // body so admins can read it. Server enforces admin/super_admin role
    // for block overrides (managers cannot override a hard block).
    overrideKind: z.enum(["warn_proceed", "block_override"]).optional(),
    overrideReason: z.string().trim().min(1).max(1000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);

    const isBlockOverride = data.overrideKind === "block_override";
    if (isBlockOverride) {
      // Stricter gate: only admin/super_admin (not manager) may override
      // a hard-block mandate, and a typed reason is required.
      if (!["admin", "super_admin"].includes(m.role)) {
        throw new Error("Only admins or owners may override a blocking staff mandate.");
      }
      if (!data.overrideReason || !data.overrideReason.trim()) {
        throw new Error("A typed reason is required to override a blocking mandate.");
      }
    }

    // Dedupe window: 5 minutes per (staff, type, org). Block overrides are
    // NOT deduped — every forced override must be recorded with its reason.
    if (!isBlockOverride) {
      const since = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data: recent } = await supabase
        .from("notifications")
        .select("id")
        .eq("organization_id", m.organization_id)
        .eq("type", "staff_mandate_missing")
        .eq("related_id", data.staffId)
        .gte("created_at", since)
        .limit(1);
      if (recent && recent.length > 0) {
        return { wrote: false, reason: "deduped", notificationId: null as string | null };
      }
    }

    // Resolve staffer + client + overriding-user display names (best-effort).
    const [{ data: staffProfile }, { data: clientRows }, { data: actorProfile }] = await Promise.all([
      supabase.from("profiles").select("id, first_name, last_name, email").eq("id", data.staffId).maybeSingle(),
      supabase.from("clients").select("id, first_name, last_name").in("id", data.clientIds),
      supabase.from("profiles").select("id, first_name, last_name, email").eq("id", userId).maybeSingle(),
    ]);
    const staffName = staffProfile
      ? [staffProfile.first_name, staffProfile.last_name].filter(Boolean).join(" ").trim() || staffProfile.email || "Staffer"
      : "Staffer";
    const actorName = actorProfile
      ? [actorProfile.first_name, actorProfile.last_name].filter(Boolean).join(" ").trim() || actorProfile.email || "Admin"
      : "Admin";
    const clientNames = ((clientRows ?? []) as Array<{ first_name: string | null; last_name: string | null }>)
      .map((c) => [c.first_name, c.last_name].filter(Boolean).join(" ").trim())
      .filter(Boolean);
    const clientLabel = clientNames.length ? clientNames.join(", ") : `${data.clientIds.length} client(s)`;
    const formLabel = data.unmetFormNames.join("; ");

    const title = isBlockOverride
      ? `BLOCK override: ${staffName}`
      : `Mandate override: ${staffName}`;
    const body = isBlockOverride
      ? `${actorName} overrode a BLOCKING required form to assign ${staffName} to ${clientLabel}. ` +
        `Incomplete form(s): ${formLabel}. Reason: "${data.overrideReason}"`
      : `${staffName} was assigned to ${clientLabel} with incomplete required form(s): ${formLabel}. ` +
        `${actorName} proceeded past the warning.`;

    const { data: ins, error: insErr } = await supabase
      .from("notifications")
      .insert({
        organization_id: m.organization_id,
        recipient_role: "admin",
        type: "staff_mandate_missing",
        urgency: "urgent",
        title,
        body,
        link_to: `/dashboard/employees/${data.staffId}`,
        related_id: data.staffId,
        related_type: isBlockOverride ? "staff_mandate_block_override" : "staff_mandate_override",
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { wrote: true, reason: "inserted", notificationId: ins?.id ?? null };
  });





// ─── STAFF: bell — unread form notifications for me ────────────────────────
export const getMyFormNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const { data, error } = await supabase
      .from("notifications")
      .select("id, title, body, related_id, read_at, created_at, type")
      .eq("recipient_user_id", userId)
      .in("type", ["form_assigned", "form_reminder", "form_due"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { notifications: data ?? [] };
  });

export const markFormNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!data.ids.length) return { ok: true };
    await supabase.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", data.ids).eq("recipient_user_id", userId);
    return { ok: true };
  });

// ─── ADMIN: submissions table for a form ───────────────────────────────────
export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ formId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const { data: subs, error } = await supabase
      .from("form_submissions").select("*")
      .eq("form_id", data.formId)
      .eq("organization_id", m.organization_id)
      .order("submitted_at", { ascending: false });
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((subs ?? []).map((s: { submitted_by: string | null }) => s.submitted_by).filter(Boolean) as string[]));
    let profiles: Array<{ id: string; full_name: string | null; email: string | null }> = [];
    if (userIds.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      profiles = p ?? [];
    }
    return { submissions: subs ?? [], profiles };
  });

// ─── ADMIN: staff directory + staff_types for Assign modal ────────────────
export const getAssignDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const { data: members } = await supabase
      .from("organization_members").select("user_id, role, job_title")
      .eq("organization_id", m.organization_id).eq("active", true);
    const uids = (members ?? []).map((m: { user_id: string }) => m.user_id);
    let profiles: Array<{ id: string; full_name: string | null; email: string | null; staff_type_keys: string[] }> = [];
    if (uids.length) {
      const { data: p } = await supabase
        .from("profiles").select("id, full_name, email, staff_type_keys").in("id", uids);
      profiles = p ?? [];
    }
    const { data: staffTypes } = await supabase
      .from("staff_types").select("key, label")
      .eq("organization_id", m.organization_id);
    const { data: clients } = await supabase
      .from("clients").select("id, first_name, last_name")
      .eq("organization_id", m.organization_id)
      .order("last_name", { ascending: true });
    return { members: members ?? [], profiles, staffTypes: staffTypes ?? [], clients: clients ?? [] };
  });

// ─── STAFF: forms assigned to me + this client (rule: form assigned to staff
// AND assigned to client AND client on staff's caseload). Returns forms plus
// my submissions for the current period.
export const listClientForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    // Confirm client is on my caseload
    const { data: sa } = await supabase
      .from("staff_assignments").select("organization_id")
      .eq("staff_id", userId).eq("client_id", data.clientId).limit(1).maybeSingle();
    if (!sa) return { forms: [], submissions: [] };
    // RLS already restricts forms to those assigned to me + published; filter
    // additionally to those assigned to this client (or all_clients).
    const { data: forms, error } = await supabase
      .from("forms").select("*")
      .eq("status", "published")
      .eq("organization_id", sa.organization_id)
      .or(`all_clients.eq.true,assigned_clients.cs.{${data.clientId}}`);
    if (error) throw new Error(error.message);
    const formIds = (forms ?? []).map((f: { id: string }) => f.id);
    let subs: Array<{ id: string; form_id: string; period_key: string | null; submitted_at: string; client_id: string | null }> = [];
    if (formIds.length) {
      const { data: s } = await supabase
        .from("form_submissions")
        .select("id, form_id, period_key, submitted_at, client_id")
        .eq("submitted_by", userId)
        .eq("client_id", data.clientId)
        .in("form_id", formIds);
      subs = s ?? [];
    }
    return { forms: forms ?? [], submissions: subs };
  });

// ─── ADMIN/MANAGER: intake-runner — published `intake` forms for this client,
// plus any existing form_submissions tied to (form, client). Reuses the same
// forms table / form_submissions store as the rest of the engine. Read-only;
// does not create or advance submissions.
export const listIntakeFormsForClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);

    const { data: forms, error } = await supabase
      .from("forms")
      .select("id, name, description, category, settings, all_clients, assigned_clients, updated_at, created_at")
      .eq("organization_id", m.organization_id)
      .eq("status", "published")
      .eq("category", "intake")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const eligible = (forms ?? []).filter(
      (f: { all_clients: boolean; assigned_clients: string[] | null }) =>
        f.all_clients || (f.assigned_clients ?? []).includes(data.clientId),
    );

    const formIds = eligible.map((f: { id: string }) => f.id);
    let submissions: Array<{
      id: string;
      form_id: string;
      status: string;
      submitted_at: string;
      submitted_by: string | null;
    }> = [];
    if (formIds.length) {
      const { data: subs, error: subErr } = await supabase
        .from("form_submissions")
        .select("id, form_id, status, submitted_at, submitted_by")
        .eq("organization_id", m.organization_id)
        .eq("client_id", data.clientId)
        .in("form_id", formIds)
        .order("submitted_at", { ascending: false });
      if (subErr) throw new Error(subErr.message);
      submissions = subs ?? [];
    }
    return { forms: eligible, submissions };
  });

// ─── ADMIN/MANAGER: per-shift tracking forms for a client (Stage 3, display).
// Returns published forms with routing_behavior='per_shift_per_client_tracked'
// targeted at this client (all_clients OR assigned_clients includes clientId),
// plus their existing form_submissions for the client. READ-ONLY.
export const listClientTrackingForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);

    const { data: forms, error } = await supabase
      .from("forms")
      .select("id, name, description, fields, settings, all_clients, assigned_clients, updated_at")
      .eq("organization_id", m.organization_id)
      .eq("status", "published")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const eligible = (forms ?? []).filter((f: {
      settings: FormSettings | null;
      all_clients: boolean;
      assigned_clients: string[] | null;
    }) => {
      const beh = (f.settings ?? {}).routing_behavior;
      if (beh !== "per_shift_per_client_tracked") return false;
      return f.all_clients || (f.assigned_clients ?? []).includes(data.clientId);
    });

    const formIds = eligible.map((f: { id: string }) => f.id);
    let submissions: Array<{
      id: string;
      form_id: string;
      submitted_at: string;
      submitted_by: string | null;
      answers: Record<string, any>;
      shift_id: string | null;
    }> = [];
    const submitterNames: Record<string, string> = {};
    if (formIds.length) {
      const { data: subs, error: subErr } = await supabase
        .from("form_submissions")
        .select("id, form_id, submitted_at, submitted_by, answers, shift_id")
        .eq("organization_id", m.organization_id)
        .eq("client_id", data.clientId)
        .in("form_id", formIds)
        .order("submitted_at", { ascending: false });
      if (subErr) throw new Error(subErr.message);
      submissions = subs ?? [];
      const submitterIds = Array.from(
        new Set(submissions.map((s) => s.submitted_by).filter((x): x is string => !!x)),
      );
      if (submitterIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", submitterIds);
        for (const p of (profs ?? []) as Array<{ user_id: string; first_name: string | null; last_name: string | null }>) {
          const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
          submitterNames[p.user_id] = name || "Unknown";
        }
      }
    }
    return { forms: eligible, submissions, submitterNames };
  });

// ─── Stage 5: pending tracking forms for punch-pad guards (READ-ONLY) ─────
// Tiers:
//  - "clockout": list required_before_clockout tracking forms targeted to
//    `clientId` + matching `serviceCode` that have NO submission for this
//    exact shift_id. Caller passes the ACTIVE shift's id/client/code.
//  - "clockin": list required_before_next_clockin tracking forms from the
//    staffer's PRIOR closed shifts (any prior shift, code-matched per form)
//    that have NO submission with shift_id=that_shift. Used before starting
//    a NEW shift to surface unfinished prior-shift requirements.
// Reads `evv_timesheets`, `forms`, `form_submissions` only. No writes.
export const getPendingTrackingForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tier: z.enum(["clockout", "clockin"]),
      // clockout context (required for tier=clockout)
      shiftId: z.string().uuid().optional(),
      clientId: z.string().uuid().optional(),
      serviceCode: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const m = await getMembership(supabase, userId);

    // Pull this org's published tracking forms once.
    const { data: forms, error } = await supabase
      .from("forms")
      .select("id, name, settings, all_clients, assigned_clients")
      .eq("organization_id", m.organization_id)
      .eq("status", "published");
    if (error) throw new Error(error.message);

    type FormRow = {
      id: string;
      name: string;
      settings: FormSettings | null;
      all_clients: boolean;
      assigned_clients: string[] | null;
    };
    const tracking = (forms ?? []).filter(
      (f: FormRow) => (f.settings ?? {}).routing_behavior === "per_shift_per_client_tracked",
    ) as FormRow[];

    function targetsClient(f: FormRow, clientId: string): boolean {
      return f.all_clients || (f.assigned_clients ?? []).includes(clientId);
    }
    function codeMatches(f: FormRow, code: string | null | undefined): boolean {
      const s = f.settings ?? {};
      const mode = s.tracking_code_mode ?? "all";
      if (mode === "all") return true;
      const list = s.tracking_billing_codes ?? [];
      return !!code && list.includes(code);
    }

    if (data.tier === "clockout") {
      if (!data.shiftId || !data.clientId) return { pending: [] };
      const required = tracking.filter(
        (f) =>
          (f.settings ?? {}).tracking_enforcement === "required_before_clockout" &&
          targetsClient(f, data.clientId!) &&
          codeMatches(f, data.serviceCode ?? null),
      );
      if (!required.length) return { pending: [] };
      const { data: subs } = await supabase
        .from("form_submissions")
        .select("form_id, shift_id")
        .eq("organization_id", m.organization_id)
        .eq("shift_id", data.shiftId)
        .in("form_id", required.map((f) => f.id));
      const satisfied = new Set((subs ?? []).map((s: { form_id: string }) => s.form_id));
      const pending = required
        .filter((f) => !satisfied.has(f.id))
        .map((f) => ({
          formId: f.id,
          formName: f.name,
          clientId: data.clientId!,
          shiftId: data.shiftId!,
        }));
      return { pending };
    }

    // tier === "clockin": scan recent prior closed shifts for this staffer.
    const required = tracking.filter(
      (f) => (f.settings ?? {}).tracking_enforcement === "required_before_next_clockin",
    );
    if (!required.length) return { pending: [] };

    const { data: priorShifts } = await supabase
      .from("evv_timesheets")
      .select("id, client_id, service_type_code, clock_in_timestamp")
      .eq("staff_id", userId)
      .not("clock_out_timestamp", "is", null)
      .order("clock_in_timestamp", { ascending: false })
      .limit(20);
    if (!priorShifts || priorShifts.length === 0) return { pending: [] };

    const shiftIds = priorShifts.map((s: { id: string }) => s.id);
    const { data: subs } = await supabase
      .from("form_submissions")
      .select("form_id, shift_id")
      .eq("organization_id", m.organization_id)
      .in("shift_id", shiftIds)
      .in("form_id", required.map((f) => f.id));
    const satisfiedKey = new Set(
      (subs ?? []).map((s: { form_id: string; shift_id: string | null }) => `${s.form_id}::${s.shift_id}`),
    );

    const pending: Array<{ formId: string; formName: string; clientId: string; shiftId: string }> = [];
    for (const shift of priorShifts as Array<{ id: string; client_id: string; service_type_code: string | null }>) {
      for (const f of required) {
        if (!targetsClient(f, shift.client_id)) continue;
        if (!codeMatches(f, shift.service_type_code)) continue;
        if (satisfiedKey.has(`${f.id}::${shift.id}`)) continue;
        pending.push({ formId: f.id, formName: f.name, clientId: shift.client_id, shiftId: shift.id });
      }
    }
    return { pending };
  });

// ─── NECTAR: draft a form from a description ──────────────────────────────

export const nectarDraftForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    description: z.string().min(5).max(8000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as { userId: string; supabase: AnySupabase };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");
    const system = `You are NECTAR, drafting a CUSTOM FORM for a HIPAA-conscious DSPD agency. Output STRICT JSON only — no markdown.
Schema:
{
  "name": "<short form name>",
  "description": "<one short sentence>",
  "category": "<one of: general, timesheets, training, incidents, clients, hr, daily_logs, compliance, billing, scheduling>",
  "frequency": "<one of: as_needed, daily, weekly, monthly, quarterly, annually>",
  "fields": [
    {"type":"section","label":"Section title","instructions":"..."},
    {"type":"short_text"|"paragraph"|"dropdown"|"checkboxes"|"yes_no"|"number"|"date"|"time"|"rating"|"signature"|"photo"|"file"|"location"|"email"|"phone",
     "label":"Question", "help":"optional", "placeholder":"optional", "required":true|false,
     "options":["A","B"] /* only for dropdown/checkboxes */,
     "config": { "display":"box"|"slider", "min":0, "max":10, "step":1, "scale":5 } /* number or rating */ }
  ]
}
Rules: 6–16 fields total. Use real interactive types — never a blank text box where a date/dropdown/rating fits. Mark obviously-required fields required. Keep labels under 80 chars. Never invent PHI; structure-only.`;
    const res = await gatewayFetch({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: system }, { role: "user", content: data.description }],
        response_format: { type: "json_object" },
      });
    if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
    if (res.status === 402) throw new Error("AI workspace credits exhausted.");
    if (!res.ok) throw new Error(`Nectar draft failed (${res.status}).`);
    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { name?: string; description?: string; category?: string; frequency?: string; fields?: unknown };
    try { parsed = JSON.parse(raw); } catch { throw new Error("Nectar returned non-JSON."); }
    const fields = Array.isArray(parsed.fields)
      ? (parsed.fields as Array<Record<string, unknown>>).slice(0, 40).map((f) => {
          const out: FormField = {
            id: `f_${Math.random().toString(36).slice(2, 10)}`,
            type: (typeof f.type === "string" ? f.type : "short_text") as FormField["type"],
            label: String(f.label ?? "Question").slice(0, 160),
            help: typeof f.help === "string" ? f.help.slice(0, 240) : undefined,
            placeholder: typeof f.placeholder === "string" ? f.placeholder.slice(0, 120) : undefined,
            required: Boolean(f.required),
            instructions: typeof f.instructions === "string" ? f.instructions.slice(0, 600) : undefined,
            options: Array.isArray(f.options) ? (f.options as unknown[]).map(String).slice(0, 20) : undefined,
            config: (typeof f.config === "object" && f.config !== null) ? (f.config as FormField["config"]) : undefined,
          };
          return out;
        })
      : [];
    return {
      draft: {
        name: String(parsed.name ?? "Untitled form").slice(0, 160),
        description: String(parsed.description ?? "").slice(0, 600),
        category: String(parsed.category ?? "general"),
        frequency: String(parsed.frequency ?? "as_needed"),
        fields,
      },
    };
  });

// ─── NECTAR: draft a form by extracting structure from a PDF ──────────────
// Accepts a base64-encoded PDF. Reuses the same draft shape as nectarDraftForm
// so the builder applies it identically. Output lands as a DRAFT — never
// auto-published; human review + existing publish gate apply.
export const nectarDraftFormFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    pdfBase64: z.string().min(100).max(15_000_000),
    filename: z.string().max(240).optional(),
    hint: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as { userId: string; supabase: AnySupabase };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");

    const system = `You are NECTAR. You are given a PDF of an EXISTING paper/digital form used by a DSPD agency. Extract the form's STRUCTURE (sections, questions, input types) and re-express it as a HIVE custom form. Output STRICT JSON only — no markdown.

Schema:
{
  "name": "<short form name inferred from PDF title>",
  "description": "<one short sentence about purpose>",
  "category": "<one of: general, timesheets, training, incidents, clients, hr, daily_logs, compliance, billing, scheduling, intake>",
  "frequency": "<one of: as_needed, daily, weekly, monthly, quarterly, annually>",
  "low_confidence": true|false,
  "confidence_notes": "<one short sentence; mention if PDF appears scanned/OCR-only or hard to parse>",
  "fields": [
    {"type":"section","label":"Section title","instructions":"optional"},
    {"type":"short_text"|"paragraph"|"dropdown"|"checkboxes"|"yes_no"|"number"|"date"|"time"|"rating"|"signature"|"photo"|"file"|"location"|"email"|"phone",
     "label":"Question label as it appears on the form",
     "help":"optional", "placeholder":"optional", "required":true|false,
     "options":["A","B"], "config": { "display":"box"|"slider","min":0,"max":10,"step":1,"scale":5 } }
  ]
}

Mapping rules (extraction, NOT visual cloning):
- Headings / section dividers → "section".
- Single-line blank → "short_text". Multi-line / "Explain" / "Notes" → "paragraph".
- Date blanks (MM/DD/YYYY, "Date:", "DOB") → "date". Time → "time".
- Yes/No or Y/N for one question → "yes_no".
- Group of checkboxes with multiple selectable items → "checkboxes" with options.
- Radio buttons / "Select one" → "dropdown" with options.
- Numeric only → "number". "Signature" / "Sign here" → "signature".
- Email / Phone / Address → email/phone/location. Attach photo/upload → photo/file.
- Likert / star scale → "rating".
- Preserve document order; group under preceding section heading.

Quality rules:
- Use real interactive types — never a blank text where date/dropdown/checkboxes/signature fits.
- Mark required when marked with *, "(required)", "REQUIRED", or obvious intent.
- Keep labels under 80 chars; preserve original wording.
- Up to 60 fields. Skip pure layout/decoration.
- If PDF looks scanned/handwritten/poor quality, set low_confidence=true and return best-effort.
- Never invent fields not on the form. Never invent PHI.`;

    const userText = `Extract the form structure from this PDF into the JSON schema above.${data.hint ? `\n\nHint from the uploader: ${data.hint}` : ""}${data.filename ? `\n\nFilename: ${data.filename}` : ""}`;
    const res = await gatewayFetch({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${data.pdfBase64}` } },
          ] },
        ],
        response_format: { type: "json_object" },
      });
    if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
    if (res.status === 402) throw new Error("AI workspace credits exhausted.");
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Nectar PDF draft failed (${res.status}). ${txt.slice(0, 200)}`);
    }
    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: {
      name?: string; description?: string; category?: string; frequency?: string;
      low_confidence?: boolean; confidence_notes?: string; fields?: unknown;
    };
    try { parsed = JSON.parse(raw); } catch { throw new Error("Nectar returned non-JSON."); }
    const fields = Array.isArray(parsed.fields)
      ? (parsed.fields as Array<Record<string, unknown>>).slice(0, 60).map((f) => {
          const out: FormField = {
            id: `f_${Math.random().toString(36).slice(2, 10)}`,
            type: (typeof f.type === "string" ? f.type : "short_text") as FormField["type"],
            label: String(f.label ?? "Question").slice(0, 160),
            help: typeof f.help === "string" ? f.help.slice(0, 240) : undefined,
            placeholder: typeof f.placeholder === "string" ? f.placeholder.slice(0, 120) : undefined,
            required: Boolean(f.required),
            instructions: typeof f.instructions === "string" ? f.instructions.slice(0, 600) : undefined,
            options: Array.isArray(f.options) ? (f.options as unknown[]).map(String).slice(0, 40) : undefined,
            config: (typeof f.config === "object" && f.config !== null) ? (f.config as FormField["config"]) : undefined,
          };
          return out;
        })
      : [];
    const lowConfidence = Boolean(parsed.low_confidence) || fields.length < 3;
    return {
      draft: {
        name: String(parsed.name ?? data.filename?.replace(/\.pdf$/i, "") ?? "Untitled form").slice(0, 160),
        description: String(parsed.description ?? "").slice(0, 600),
        category: String(parsed.category ?? "general"),
        frequency: String(parsed.frequency ?? "as_needed"),
        fields,
      },
      lowConfidence,
      confidenceNotes: typeof parsed.confidence_notes === "string" ? parsed.confidence_notes.slice(0, 400) : "",
    };
  });

// ─── NECTAR: draft a publish notification ──────────────────────────────────
export const nectarDraftNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().min(1).max(160),
    description: z.string().max(2000).optional(),
    frequency: z.string(),
    schedule: z.record(z.any()).default({}),
    fields: z.array(z.any()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as { userId: string; supabase: AnySupabase };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");
    const required = (data.fields as FormField[]).filter((f) => f.required).map((f) => f.label);
    const system = `You are NECTAR, drafting a friendly, plain-language in-app notification telling agency staff that a new form has been assigned to them. Output STRICT JSON: { "title": "...", "body": "..." }. The body is 3–6 short sentences. Cover: what the form is for, how often + when it's due (use the provided cadence and schedule), where to find it ("in your Forms list"), and step-by-step what's needed (mention required questions if listed). No markdown. Title ≤80 chars. Body ≤900 chars.`;
    const userMsg = `Form name: ${data.name}
Description: ${data.description ?? "(none)"}
Frequency: ${data.frequency}
Schedule JSON: ${JSON.stringify(data.schedule)}
Required fields: ${required.length ? required.join("; ") : "(none)"}
Total questions: ${data.fields.length}`;
    const res = await gatewayFetch({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: system }, { role: "user", content: userMsg }],
        response_format: { type: "json_object" },
      });
    if (!res.ok) throw new Error(`Nectar notification draft failed (${res.status}).`);
    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { title?: string; body?: string };
    try { parsed = JSON.parse(raw); } catch { throw new Error("Nectar returned non-JSON."); }
    return {
      draft: {
        title: String(parsed.title ?? `New form assigned: ${data.name}`).slice(0, 160),
        body: String(parsed.body ?? "A new form has been assigned to you. Open your Forms list to complete it.").slice(0, 4000),
      },
    };
  });

// ─── NECTAR: propose a routing behavior from the admin's purpose text ─────
// Capture-only. Does NOT mutate the form, does NOT pick the behavior. The
// admin sees the proposal in the builder and either accepts or overrides it;
// only the admin's chosen behavior is persisted (via the normal saveForm
// path under settings.routing_behavior).
export const nectarProposeRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    purpose: z.string().min(5).max(2000),
    formName: z.string().max(160).optional(),
    fieldLabels: z.array(z.string().max(200)).max(60).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as { userId: string; supabase: AnySupabase };
    const m = await getMembership(supabase, userId);
    adminGuard(m.role);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");

    const allowed = [
      "general_submission",
      "notify_only",
      "client_intake_required",
      "one_time_attestation",
      "staff_mandate",
      "per_shift_per_client_tracked",
    ] as const;

    const system = `You are NECTAR, the agency's compliance copilot. The admin is declaring how a custom form will be used. Propose ONE routing behavior from the allowed set and a one-line rationale. Output STRICT JSON ONLY, no markdown.

Allowed behaviors (pick exactly one):
- "general_submission": just filed; no notifications, no checklist, no gate.
- "notify_only": filed + notifies chosen people on submit.
- "client_intake_required": satisfies a client-intake checklist item for that client.
- "one_time_attestation": each staff completes once; filed as a signed record.
- "staff_mandate": every staff must complete BEFORE working with a client.
- "per_shift_per_client_tracked": recurring per-client data viewed as a series (this overlaps with the client tracking / behavior support module).

Schema: {"behavior": "<one of the allowed values>", "rationale": "<<= 160 chars, plain English, why this fits>"}

Rules: propose only based on the purpose text and field labels. Never invent. If the purpose is vague, fall back to "general_submission". Keep the rationale specific and short.`;

    const userMsg = JSON.stringify({
      formName: data.formName ?? "",
      purpose: data.purpose,
      fieldLabels: data.fieldLabels ?? [],
    });

    const res = await gatewayFetch({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: system }, { role: "user", content: userMsg }],
        response_format: { type: "json_object" },
      });
    if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
    if (res.status === 402) throw new Error("AI workspace credits exhausted.");
    if (!res.ok) throw new Error(`Nectar routing proposal failed (${res.status}).`);

    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { behavior?: string; rationale?: string };
    try { parsed = JSON.parse(raw); } catch { throw new Error("Nectar returned non-JSON."); }

    const behavior = (allowed as readonly string[]).includes(String(parsed.behavior))
      ? (parsed.behavior as typeof allowed[number])
      : "general_submission";
    const rationale = String(parsed.rationale ?? "Defaulted to general submission — purpose text was too vague to classify.").slice(0, 240);

    return { proposal: { behavior, rationale, at: new Date().toISOString() } };
  });
