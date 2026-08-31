/**
 * Admin class roster submit + Hive Exec Classes tab.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  cleanRosterRows,
  isTrainingClassType,
  quoteTrainingClass,
  trainingClassIsExternal,
  validateRosterRows,
  type TrainingClassType,
} from "@/lib/training-class";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type TrainingClassRosterView = {
  name: string;
  email: string;
  phone: string;
  staffUserId: string | null;
};

export type TrainingClassRow = {
  id: string;
  organizationId: string;
  providerName: string;
  trainingType: TrainingClassType;
  isExternal: boolean;
  status: "upcoming" | "completed" | "cancelled";
  paymentStatus: string;
  seatCount: number;
  unitPriceCents: number;
  amountCents: number;
  submittedAt: string;
  completedAt: string | null;
  roster: TrainingClassRosterView[];
};

async function ensureHiveExecutive(sb: AnySupabase, userId: string): Promise<void> {
  const { data, error } = await sb
    .from("hive_executives")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access denied — Hive Executive permission required.");
}

function mapClass(
  row: Record<string, unknown>,
  roster: TrainingClassRosterView[],
): TrainingClassRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    providerName: String(row.provider_name ?? "Provider"),
    trainingType: row.training_type as TrainingClassType,
    isExternal: row.is_external === true,
    status: row.status as TrainingClassRow["status"],
    paymentStatus: String(row.payment_status ?? "pending"),
    seatCount: Number(row.seat_count ?? roster.length),
    unitPriceCents: Number(row.unit_price_cents ?? 0),
    amountCents: Number(row.amount_cents ?? 0),
    submittedAt: String(row.submitted_at ?? row.created_at ?? ""),
    completedAt: (row.completed_at as string | null) ?? null,
    roster,
  };
}

async function loadPaidExternalClasses(): Promise<TrainingClassRow[]> {
  const admin = supabaseAdmin as AnySupabase;
  const { data: classes, error } = await admin
    .from("training_classes")
    .select(
      "id, organization_id, training_type, is_external, status, payment_status, seat_count, unit_price_cents, amount_cents, submitted_at, completed_at, provider_name, created_at",
    )
    .in("payment_status", ["paid", "waived"])
    .eq("is_external", true)
    .order("submitted_at", { ascending: false });
  if (error) {
    if (/training_classes|schema cache|does not exist/i.test(error.message ?? "")) return [];
    throw new Error(error.message);
  }
  const classRows = (classes ?? []) as Array<Record<string, unknown>>;
  if (!classRows.length) return [];

  const ids = classRows.map((c) => String(c.id));
  const { data: roster, error: rosErr } = await admin
    .from("training_class_roster")
    .select("class_id, staff_name, staff_email, staff_phone, staff_user_id, sort_order")
    .in("class_id", ids)
    .order("sort_order", { ascending: true });
  if (rosErr) throw new Error(rosErr.message);

  const byClass = new Map<string, TrainingClassRosterView[]>();
  for (const r of (roster ?? []) as Array<{
    class_id: string;
    staff_name: string;
    staff_email: string;
    staff_phone: string | null;
    staff_user_id: string | null;
  }>) {
    const list = byClass.get(r.class_id) ?? [];
    list.push({
      name: r.staff_name,
      email: r.staff_email,
      phone: r.staff_phone ?? "",
      staffUserId: r.staff_user_id,
    });
    byClass.set(r.class_id, list);
  }

  return classRows.map((c) => mapClass(c, byClass.get(String(c.id)) ?? []));
}

export const listTrainingClassesForExec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrainingClassRow[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    await ensureHiveExecutive(supabase as AnySupabase, userId);
    return loadPaidExternalClasses();
  });

export const listRecentTrainingClassAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrainingClassRow[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    await ensureHiveExecutive(supabase as AnySupabase, userId);
    const all = await loadPaidExternalClasses();
    return all.filter((c) => c.status === "upcoming").slice(0, 8);
  });

export const markTrainingClassComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ class_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not signed in.");
    const sb = supabase as AnySupabase;
    await ensureHiveExecutive(sb, userId);

    const admin = supabaseAdmin as AnySupabase;
    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from("training_classes")
      .update({ status: "completed", completed_at: nowIso, updated_at: nowIso })
      .eq("id", data.class_id)
      .eq("is_external", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getOrgTrainingClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TrainingClassRow[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    const sb = supabase as AnySupabase;
    const { data: mem, error: memErr } = await sb
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (memErr) throw new Error(memErr.message);
    if (!mem || !["admin", "program_manager", "manager"].includes(String(mem.role))) {
      throw new Error("Only an admin can view class rosters.");
    }

    const { data: classes, error } = await sb
      .from("training_classes")
      .select(
        "id, organization_id, training_type, is_external, status, payment_status, seat_count, unit_price_cents, amount_cents, submitted_at, completed_at, provider_name, created_at",
      )
      .eq("organization_id", data.organizationId)
      .in("payment_status", ["paid", "waived", "pending"])
      .order("submitted_at", { ascending: false });
    if (error) {
      if (/training_classes|schema cache|does not exist/i.test(error.message ?? "")) return [];
      throw new Error(error.message);
    }
    const classRows = (classes ?? []) as Array<Record<string, unknown>>;
    if (!classRows.length) return [];

    const ids = classRows.map((c) => String(c.id));
    const { data: roster, error: rosErr } = await sb
      .from("training_class_roster")
      .select("class_id, staff_name, staff_email, staff_phone, staff_user_id, sort_order")
      .in("class_id", ids)
      .order("sort_order", { ascending: true });
    if (rosErr) throw new Error(rosErr.message);

    const byClass = new Map<string, TrainingClassRosterView[]>();
    for (const r of (roster ?? []) as Array<{
      class_id: string;
      staff_name: string;
      staff_email: string;
      staff_phone: string | null;
      staff_user_id: string | null;
    }>) {
      const list = byClass.get(r.class_id) ?? [];
      list.push({
        name: r.staff_name,
        email: r.staff_email,
        phone: r.staff_phone ?? "",
        staffUserId: r.staff_user_id,
      });
      byClass.set(r.class_id, list);
    }
    return classRows.map((c) => mapClass(c, byClass.get(String(c.id)) ?? []));
  });

export function quoteForRosterPreview(
  type: string,
  seatCount: number,
  billingExempt: boolean,
) {
  if (!isTrainingClassType(type)) return null;
  return quoteTrainingClass(type, seatCount, billingExempt);
}

export function rosterIsExternal(type: string): boolean {
  return isTrainingClassType(type) && trainingClassIsExternal(type);
}

export function sanitizedRosterInput(rows: unknown): ReturnType<typeof cleanRosterRows> {
  if (!Array.isArray(rows)) return [];
  return cleanRosterRows(
    rows.map((r) => {
      const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
      return {
        name: String(o.name ?? ""),
        email: String(o.email ?? ""),
        phone: String(o.phone ?? ""),
        staffUserId: typeof o.staffUserId === "string" ? o.staffUserId : null,
      };
    }),
  );
}

export function rosterValidationMessage(rows: unknown): string | null {
  return validateRosterRows(sanitizedRosterInput(rows));
}
