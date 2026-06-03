import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

/**
 * Saved reports + schedules.
 *
 * Tier 3 Stage 3:
 *   - list/save now ACCEPT `organizationId` and verify manager+ membership
 *     against THAT org. The legacy `resolveAdminOrg()` FIRST_MEMBERSHIP
 *     resolver is gone.
 *   - togglePinReport / deleteSavedReport / upsertReportSchedule /
 *     unscheduleReport gain a defense-in-depth membership guard via
 *     record→org lookup (RLS is still the backstop).
 */

export interface SavedReport {
  id: string;
  name: string;
  prompt: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  schedule: ReportSchedule | null;
}

export interface ReportSchedule {
  id: string;
  cadence: "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  hour: number;
  deliver_email: boolean;
  recipients: string[];
  deliver_save: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  active: boolean;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function orgForSavedReport(supabase: any, savedReportId: string): Promise<string> {
  const { data, error } = await supabase
    .from("nectar_saved_reports")
    .select("organization_id")
    .eq("id", savedReportId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.organization_id) throw new Error("Saved report not found.");
  return data.organization_id as string;
}

export const listSavedReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as Record<string, unknown>;
    return { organizationId: requireUuid(i.organizationId, "organizationId") };
  })
  .handler(async ({ data, context }): Promise<SavedReport[]> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const { data: reports, error } = await supabase
      .from("nectar_saved_reports")
      .select("id, name, prompt, pinned, created_at, updated_at")
      .eq("organization_id", data.organizationId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    if (!reports || reports.length === 0) return [];
    const ids = reports.map((r: any) => r.id);
    const { data: schedules } = await supabase
      .from("nectar_report_schedules")
      .select("*")
      .in("saved_report_id", ids);
    const byReport = new Map<string, ReportSchedule>();
    for (const s of (schedules ?? []) as any[]) {
      byReport.set(s.saved_report_id, {
        id: s.id, cadence: s.cadence, day_of_week: s.day_of_week, day_of_month: s.day_of_month,
        hour: s.hour, deliver_email: s.deliver_email, recipients: s.recipients ?? [],
        deliver_save: s.deliver_save, next_run_at: s.next_run_at, last_run_at: s.last_run_at, active: s.active,
      });
    }
    return reports.map((r: any) => ({ ...r, schedule: byReport.get(r.id) ?? null }));
  });

function validateSaveInput(input: unknown): { organizationId: string; name: string; prompt: string; pinned?: boolean } {
  const i = (input ?? {}) as Record<string, unknown>;
  const organizationId = requireUuid(i.organizationId, "organizationId");
  const name = typeof i.name === "string" ? i.name.trim() : "";
  const prompt = typeof i.prompt === "string" ? i.prompt.trim() : "";
  if (name.length < 1 || name.length > 120) throw new Error("Name must be 1–120 characters.");
  if (prompt.length < 3 || prompt.length > 2000) throw new Error("Prompt must be 3–2000 characters.");
  return { organizationId, name, prompt, pinned: !!i.pinned };
}

export const saveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateSaveInput)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const { data: inserted, error } = await supabase
      .from("nectar_saved_reports")
      .insert({ organization_id: data.organizationId, owner_user_id: userId, name: data.name, prompt: data.prompt, pinned: !!data.pinned })
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id };
  });

function validateIdInput(input: unknown): { id: string } {
  const i = (input ?? {}) as Record<string, unknown>;
  return { id: requireUuid(i.id, "id") };
}

export const togglePinReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as Record<string, unknown>;
    return { id: requireUuid(i.id, "id"), pinned: !!i.pinned };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await orgForSavedReport(supabase, data.id);
    await requireOrgMembership(supabase, userId, orgId, "manager");
    const { error } = await supabase
      .from("nectar_saved_reports")
      .update({ pinned: data.pinned })
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteSavedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateIdInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await orgForSavedReport(supabase, data.id);
    await requireOrgMembership(supabase, userId, orgId, "manager");
    const { error } = await supabase
      .from("nectar_saved_reports")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw error;
    return { ok: true };
  });

// ── Schedules ──────────────────────────────────────────────────────────────

function computeNextRunAt(s: {
  cadence: "weekly" | "monthly"; day_of_week: number | null; day_of_month: number | null; hour: number;
}, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  if (s.cadence === "weekly") {
    const target = ((s.day_of_week ?? 1) % 7 + 7) % 7;
    const cur = d.getDay();
    let add = (target - cur + 7) % 7;
    d.setHours(s.hour, 0, 0, 0);
    if (add === 0 && d <= from) add = 7;
    d.setDate(d.getDate() + add);
    return d;
  }
  const dom = Math.min(Math.max(s.day_of_month ?? 1, 1), 28);
  d.setDate(dom);
  d.setHours(s.hour, 0, 0, 0);
  if (d <= from) d.setMonth(d.getMonth() + 1);
  return d;
}

function validateScheduleInput(input: unknown): {
  saved_report_id: string;
  cadence: "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  hour: number;
  deliver_email: boolean;
  recipients: string[];
  deliver_save: boolean;
} {
  const i = (input ?? {}) as Record<string, unknown>;
  const id = requireUuid(i.saved_report_id, "saved_report_id");
  const cadence = i.cadence === "monthly" ? "monthly" : "weekly";
  const hour = Math.min(Math.max(typeof i.hour === "number" ? i.hour : 8, 0), 23);
  const recipients = Array.isArray(i.recipients)
    ? i.recipients.filter((v): v is string => typeof v === "string" && /.+@.+\..+/.test(v)).slice(0, 10)
    : [];
  return {
    saved_report_id: id,
    cadence,
    day_of_week: cadence === "weekly" ? Math.min(Math.max(Number(i.day_of_week ?? 1), 0), 6) : null,
    day_of_month: cadence === "monthly" ? Math.min(Math.max(Number(i.day_of_month ?? 1), 1), 28) : null,
    hour,
    deliver_email: i.deliver_email !== false,
    recipients,
    deliver_save: i.deliver_save !== false,
  };
}

export const upsertReportSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateScheduleInput)
  .handler(async ({ data, context }): Promise<{ id: string; next_run_at: string }> => {
    const { supabase, userId } = context;
    const orgId = await orgForSavedReport(supabase, data.saved_report_id);
    await requireOrgMembership(supabase, userId, orgId, "manager");
    const next = computeNextRunAt(data);
    const { data: existing } = await supabase
      .from("nectar_report_schedules")
      .select("id")
      .eq("saved_report_id", data.saved_report_id)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase
        .from("nectar_report_schedules")
        .update({
          cadence: data.cadence, day_of_week: data.day_of_week, day_of_month: data.day_of_month,
          hour: data.hour, deliver_email: data.deliver_email, recipients: data.recipients,
          deliver_save: data.deliver_save, active: true, next_run_at: next.toISOString(),
        })
        .eq("id", existing.id);
      if (error) throw error;
      return { id: existing.id, next_run_at: next.toISOString() };
    }
    const { data: inserted, error } = await supabase
      .from("nectar_report_schedules")
      .insert({
        saved_report_id: data.saved_report_id, cadence: data.cadence,
        day_of_week: data.day_of_week, day_of_month: data.day_of_month,
        hour: data.hour, deliver_email: data.deliver_email, recipients: data.recipients,
        deliver_save: data.deliver_save, active: true, next_run_at: next.toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id, next_run_at: next.toISOString() };
  });

export const unscheduleReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateIdInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await orgForSavedReport(supabase, data.id);
    await requireOrgMembership(supabase, userId, orgId, "manager");
    const { error } = await supabase
      .from("nectar_report_schedules")
      .update({ active: false })
      .eq("saved_report_id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export { computeNextRunAt };
