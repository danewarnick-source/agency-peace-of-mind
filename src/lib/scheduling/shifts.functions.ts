import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDailyCode } from "./code-colors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const CreatedFromZ = z.enum(["manual", "template", "nectar", "import", "rotation"]).optional();

// Fields that may be updated on an existing shift. Excludes organization_id,
// parent_shift_id, created_from, and auto-managed columns to prevent
// cross-org tampering and segment-tree corruption.
const SHIFT_PATCH_ALLOWLIST = new Set([
  "starts_at", "ends_at",
  "staff_id", "client_id", "service_code", "job_code",
  "location_id", "is_awake_overnight",
  "status", "published",
  "notes", "override_reason", "callout_reason", "shift_type",
]);

async function assertActiveBillingCode(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  clientId: string,
  serviceCode: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("client_billing_codes")
    .select("id, service_start_date, service_end_date")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .eq("service_code", serviceCode.toUpperCase());
  if (error) throw error;
  const active = (data ?? []).find((r) => {
    if (r.service_start_date && r.service_start_date > today) return false;
    if (r.service_end_date && r.service_end_date <= today) return false;
    return true;
  });
  if (!active) {
    throw new Error(
      "No active billing code for this client and service. Add one in the client's billing profile before scheduling.",
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertLaunchpadPassed(supabase: any, staffId: string): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("has_passed_launchpad")
    .eq("id", staffId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.has_passed_launchpad) {
    throw new Error(
      "This staff member has not completed Launchpad and cannot be assigned as a sole worker.",
    );
  }
}

export const listShiftsInRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organizationId: string;
    startIso: string;
    endIso: string;
    locationId?: string;
  }) => z.object({
    organizationId: z.string().uuid(),
    startIso: z.string(),
    endIso: z.string(),
    locationId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("scheduled_shifts")
      .select(`
        id, organization_id, staff_id, client_id, service_code, job_code, code_id,
        starts_at, ends_at, status, published, notes, shift_type,
        location_id, is_awake_overnight, callout_reason, created_from,
        parent_shift_id, override_reason, created_at, updated_at
      `)
      .eq("organization_id", data.organizationId)
      .gte("starts_at", data.startIso)
      .lt("starts_at", data.endIso)
      .order("starts_at", { ascending: true });
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

const CreateShiftZ = z.object({
  organizationId: z.string().uuid(),
  staffId: z.string().uuid(),
  clientId: z.string().uuid(),
  serviceCode: z.string().min(1).max(16),
  startsAtIso: z.string(),
  endsAtIso: z.string(),
  locationId: z.string().uuid().nullable().optional(),
  isAwakeOvernight: z.boolean().optional(),
  parentShiftId: z.string().uuid().nullable().optional(),
  createdFrom: CreatedFromZ,
  notes: z.string().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  overrideReason: z.string().optional(),
});

export const createShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof CreateShiftZ>) => CreateShiftZ.parse(d))
  .handler(async ({ data, context }) => {
    // Segment validations: parent constraints, hourly-only.
    if (data.parentShiftId) {
      if (isDailyCode(data.serviceCode)) {
        throw new Error(`Service code ${data.serviceCode} is daily-unit — cannot be used on a 1:1 segment.`);
      }
      const { data: parent, error: pErr } = await context.supabase
        .from("scheduled_shifts")
        .select("id, staff_id, starts_at, ends_at, parent_shift_id")
        .eq("id", data.parentShiftId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!parent) throw new Error("Parent shift not found");
      if (parent.parent_shift_id) throw new Error("Segments cannot be nested");
      if (parent.staff_id !== data.staffId) {
        throw new Error("Segment staff must match parent shift staff");
      }
      const s = new Date(data.startsAtIso).getTime();
      const e = new Date(data.endsAtIso).getTime();
      const ps = new Date(parent.starts_at).getTime();
      const pe = new Date(parent.ends_at).getTime();
      if (s < ps || e > pe) {
        throw new Error("Segment times must fall within the parent shift window");
      }
    }

    // Billing-code authorization — enforced at write layer for all entry points
    // (Nectar proposals, auto-assign, CSV import, and UI all flow through here).
    await assertActiveBillingCode(
      context.supabase,
      data.organizationId,
      data.clientId,
      data.serviceCode,
    );

    // Launchpad gate — blocks sole-worker assignment until training is complete.
    await assertLaunchpadPassed(context.supabase, data.staffId);

    const insert = {
      organization_id: data.organizationId,
      staff_id: data.staffId,
      client_id: data.clientId,
      service_code: data.serviceCode.toUpperCase(),
      job_code: data.serviceCode.toUpperCase(), // legacy compat
      starts_at: data.startsAtIso,
      ends_at: data.endsAtIso,
      location_id: data.locationId ?? null,
      is_awake_overnight: data.isAwakeOvernight ?? null,
      parent_shift_id: data.parentShiftId ?? null,
      created_from: data.createdFrom ?? "manual",
      notes: data.notes ?? null,
      status: data.status,
      published: data.status === "published",
      shift_type: "hourly",
      override_reason: data.overrideReason ?? null,
    };
    const { data: row, error } = await context.supabase
      .from("scheduled_shifts").insert(insert).select("*").single();
    if (error) throw error;
    return row;
  });

export const updateShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; patch: Record<string, unknown> }) =>
    z.object({ id: z.string().uuid(), patch: z.record(z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => {
    // Allowlist guard — rejects writes to org-scoping, segment-tree, and audit
    // fields that must never be client-writable.
    const forbidden = Object.keys(data.patch).filter(k => !SHIFT_PATCH_ALLOWLIST.has(k));
    if (forbidden.length > 0) {
      throw new Error(`Cannot update field(s): ${forbidden.join(", ")}`);
    }

    // When billing-affecting or staff fields change, fetch the current row so
    // we can resolve the effective values and re-validate.
    const needsBillingCheck =
      "service_code" in data.patch || "job_code" in data.patch || "client_id" in data.patch;
    const needsLaunchpadCheck = "staff_id" in data.patch;

    if (needsBillingCheck || needsLaunchpadCheck) {
      const { data: current, error: fetchErr } = await context.supabase
        .from("scheduled_shifts")
        .select("organization_id, client_id, service_code, staff_id")
        .eq("id", data.id)
        .single();
      if (fetchErr) throw fetchErr;

      if (needsBillingCheck) {
        const effectiveClientId = (data.patch.client_id as string) ?? current.client_id;
        const effectiveCode =
          ((data.patch.service_code ?? data.patch.job_code) as string) ?? current.service_code;
        await assertActiveBillingCode(
          context.supabase,
          current.organization_id,
          effectiveClientId,
          effectiveCode,
        );
      }

      if (needsLaunchpadCheck) {
        await assertLaunchpadPassed(context.supabase, data.patch.staff_id as string);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await context.supabase
      .from("scheduled_shifts")
      .update(data.patch as any)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; organization_id: string }) =>
    z.object({ id: z.string().uuid(), organization_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("scheduled_shifts")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organization_id);
    if (error) throw error;
    return { ok: true };
  });

export const publishShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; organization_id: string }) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1),
      organization_id: z.string().uuid(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("scheduled_shifts")
      .update({ status: "published", published: true })
      .in("id", data.ids)
      .eq("organization_id", data.organization_id);
    if (error) throw error;
    return { ok: true, count: data.ids.length };
  });
