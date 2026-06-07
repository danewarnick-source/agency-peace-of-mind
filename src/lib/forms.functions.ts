// Server functions for the Custom Forms feature.
// All calls are authenticated; admins/managers manage forms, staff fill them.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { FormField, FormSettings, Schedule, Frequency } from "./forms-utils";
import { periodKeyFor } from "./forms-utils";

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
    if (data.id) {
      const { data: updated, error } = await supabase
        .from("forms").update(payload).eq("id", data.id).select().maybeSingle();
      if (error) throw new Error(error.message);
      return { form: updated };
    }
    const { data: inserted, error } = await supabase
      .from("forms").insert(payload).select().maybeSingle();
    if (error) throw new Error(error.message);
    return { form: inserted };
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
    const { data: ins, error } = await supabase.from("form_submissions").insert({
      organization_id: form.organization_id,
      form_id: form.id,
      submitted_by: submittedBy,
      client_id: data.clientId,
      answers: data.answers,
      period_key: periodKey,
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
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: system }, { role: "user", content: data.description }],
        response_format: { type: "json_object" },
      }),
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
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: system }, { role: "user", content: userMsg }],
        response_format: { type: "json_object" },
      }),
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
