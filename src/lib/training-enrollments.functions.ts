/**
 * Hive Training enrollment system — catalog, seat purchases, and per-staff
 * enrollment through to certificate verification.
 *
 * Flow: org admin buys N seats of a `training_products` row
 * (`purchaseTrainingSeats`, invoice-based — Stripe isn't wired up yet) →
 * assigns seats to staff (`enrollStaffInTraining`) → Hive exec sends the
 * training link and later marks it completed, which flips the enrollment to
 * `certificate_pending` and notifies the org admin → org admin uploads the
 * certificate (`uploadTrainingCertificate`), which runs Nectar OCR and, on
 * pass, verifies the enrollment and closes the linked obligation instance.
 *
 * Tables (see supabase/migrations/20260819210000_hive_training_enrollment_system.sql)
 * are ahead of the generated Supabase types until a human regenerates them
 * from the live schema (see docs/SQL_HANDOFF.md), so this file reads/writes
 * through an untyped client cast — the same pattern used elsewhere in this
 * codebase for tables ahead of `types.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { runNectarCertOcr } from "@/lib/nectar-cert-ocr";
import { assertAddonForOrg } from "@/lib/entitlements.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type EnrollmentStatus =
  | "enrolled"
  | "link_sent"
  | "completed"
  | "certificate_pending"
  | "certificate_uploaded"
  | "verified"
  | "cancelled";

export interface TrainingProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price_cents: number;
  active: boolean;
  fulfills_obligation_key: string | null;
  cert_type_label: string | null;
  cert_keyword_groups: Array<{ label: string; any_of: string[] }> | null;
  renewal_months: number | null;
  sort_order: number;
}

// ───── Internal helpers ─────────────────────────────────────────────────

async function ensureHiveExecutive(sb: AnySupabase, userId: string): Promise<void> {
  const { data, error } = await sb
    .from("hive_executives")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access denied — HIVE Executive permission required.");
}

async function notifyHiveExecInternal(
  sb: AnySupabase,
  organizationId: string,
  title: string,
  body: string,
  relatedId: string | null,
): Promise<void> {
  const { data: execs, error } = await sb
    .from("hive_executives")
    .select("user_id")
    .eq("active", true);
  if (error) throw new Error(error.message);
  const rows = ((execs ?? []) as Array<{ user_id: string }>).map((e) => ({
    organization_id: organizationId,
    recipient_user_id: e.user_id,
    recipient_role: "super_admin",
    type: "hive_training_update",
    urgency: "normal",
    title,
    body,
    link_to: "/dashboard/hive-exec/training",
    related_id: relatedId,
    related_type: "training_enrollment",
  }));
  if (!rows.length) return;
  const { error: insErr } = await sb.from("notifications").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

async function notifyOrgAdminsInternal(
  sb: AnySupabase,
  organizationId: string,
  title: string,
  body: string,
  linkTo: string,
  relatedId: string | null,
  nextRemindAt: string | null = null,
): Promise<void> {
  const { data: admins, error } = await sb
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .in("role", ["admin"]);
  if (error) throw new Error(error.message);
  const rows = ((admins ?? []) as Array<{ user_id: string }>).map((a) => ({
    organization_id: organizationId,
    recipient_user_id: a.user_id,
    recipient_role: "admin",
    type: "hive_training_update",
    urgency: "normal",
    title,
    body,
    link_to: linkTo,
    related_id: relatedId,
    related_type: "training_enrollment",
    next_remind_at: nextRemindAt,
  }));
  if (!rows.length) return;
  const { error: insErr } = await sb.from("notifications").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

async function assertOrgAdmin(sb: AnySupabase, orgId: string, userId: string): Promise<void> {
  await requireOrgMembership(sb, userId, orgId, "admin");
}

export async function markTrainingLinkSentInternal(
  sb: AnySupabase,
  enrollmentId: string,
  userId: string,
): Promise<void> {
  const { data: enr, error: getErr } = await sb
    .from("training_enrollments")
    .select("id, organization_id, staff_id, staff_name, product_id, training_products(name)")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (getErr) throw new Error(getErr.message);
  if (!enr) throw new Error("Enrollment not found");

  const { error } = await sb
    .from("training_enrollments")
    .update({
      status: "link_sent",
      link_sent_at: new Date().toISOString(),
      link_sent_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId);
  if (error) throw new Error(error.message);

  const productName = enr.training_products?.name ?? "training";
  await notifyOrgAdminsInternal(
    sb,
    enr.organization_id,
    `Training link sent to ${enr.staff_name}`,
    `${enr.staff_name}'s enrollment link for "${productName}" has been sent.`,
    `/dashboard/employees/${enr.staff_id ?? ""}?tab=record`,
    enrollmentId,
  );
}

export async function markTrainingCompletedInternal(
  sb: AnySupabase,
  enrollmentId: string,
  _userId: string,
): Promise<void> {
  const { data: enr, error: getErr } = await sb
    .from("training_enrollments")
    .select("id, organization_id, staff_id, staff_name, product_id, training_products(name)")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (getErr) throw new Error(getErr.message);
  if (!enr) throw new Error("Enrollment not found");

  const now = new Date().toISOString();
  const { error } = await sb
    .from("training_enrollments")
    .update({
      status: "certificate_pending",
      completed_at: now,
      admin_notified_at: now,
      updated_at: now,
    })
    .eq("id", enrollmentId);
  if (error) throw new Error(error.message);

  const productName = enr.training_products?.name ?? "their training";
  await notifyOrgAdminsInternal(
    sb,
    enr.organization_id,
    `${enr.staff_name} completed ${productName}`,
    `${enr.staff_name} completed "${productName}". Please upload their certificate.`,
    `/dashboard/employees/${enr.staff_id}?tab=record`,
    enrollmentId,
  );
}

export async function remindAdminInternal(
  sb: AnySupabase,
  enrollmentId: string,
): Promise<void> {
  const { data: enr, error: getErr } = await sb
    .from("training_enrollments")
    .select("id, organization_id, staff_id, staff_name, product_id, training_products(name)")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (getErr) throw new Error(getErr.message);
  if (!enr) throw new Error("Enrollment not found");

  const productName = enr.training_products?.name ?? "their training";
  await notifyOrgAdminsInternal(
    sb,
    enr.organization_id,
    `Reminder: upload ${enr.staff_name}'s certificate`,
    `${enr.staff_name} completed "${productName}" and is still waiting on a certificate upload.`,
    `/dashboard/employees/${enr.staff_id}?tab=record`,
    enrollmentId,
  );
}

// ───── Catalog ───────────────────────────────────────────────────────────

export const getTrainingProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrainingProduct[]> => {
    const { supabase } = context;
    if (!supabase) return [];
    const sb = supabase as AnySupabase;
    // Public catalog read — every authenticated user may see it (RLS:
    // "authenticated read training products"), no org-membership check.
    const { data, error } = await sb
      .from("training_products")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as TrainingProduct[];
  });

// ───── Purchases ─────────────────────────────────────────────────────────

export interface TrainingPurchaseRow {
  id: string;
  organization_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  seats_remaining: number;
  price_cents_each: number;
  total_cents: number;
  payment_status: string;
  status: string;
  purchased_by_name: string | null;
  purchased_at: string;
}

export const purchaseTrainingSeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ purchase_id: string }> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not authenticated");
    const sb = supabase as AnySupabase;
    await assertOrgAdmin(sb, data.organization_id, userId);
    await assertAddonForOrg(sb, userId, "hive_training", data.organization_id);

    const { data: product, error: prodErr } = await sb
      .from("training_products")
      .select("id, price_cents, active")
      .eq("id", data.product_id)
      .maybeSingle();
    if (prodErr) throw new Error(prodErr.message);
    if (!product || !product.active) throw new Error("Training product not found or inactive");

    const { data: purchaser } = await sb
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    const totalCents = product.price_cents * data.quantity;
    const { data: inserted, error: insErr } = await sb
      .from("training_purchases")
      .insert({
        organization_id: data.organization_id,
        product_id: data.product_id,
        quantity: data.quantity,
        seats_remaining: data.quantity,
        price_cents_each: product.price_cents,
        total_cents: totalCents,
        payment_status: "invoice_pending",
        purchased_by: userId,
        purchased_by_name: purchaser?.full_name ?? "Admin",
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return { purchase_id: inserted.id as string };
  });

export const getOrgTrainingPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TrainingPurchaseRow[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    const sb = supabase as AnySupabase;
    await assertOrgAdmin(sb, data.organization_id, userId);

    const { data: rows, error } = await sb
      .from("training_purchases")
      .select("*, training_products(name)")
      .eq("organization_id", data.organization_id)
      .order("purchased_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      organization_id: r.organization_id as string,
      product_id: r.product_id as string,
      product_name: (r.training_products as { name: string } | null)?.name ?? "—",
      quantity: r.quantity as number,
      seats_remaining: r.seats_remaining as number,
      price_cents_each: r.price_cents_each as number,
      total_cents: r.total_cents as number,
      payment_status: r.payment_status as string,
      status: r.status as string,
      purchased_by_name: r.purchased_by_name as string | null,
      purchased_at: r.purchased_at as string,
    }));
  });

// ───── Enrollment ────────────────────────────────────────────────────────

export interface StaffCandidate {
  staff_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  already_enrolled: boolean;
}

export const searchActiveStaffForEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        product_id: z.string().uuid(),
        query: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<StaffCandidate[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    const sb = supabase as AnySupabase;
    await assertOrgAdmin(sb, data.organization_id, userId);

    const { data: mems, error: memErr } = await sb
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organization_id)
      .eq("active", true);
    if (memErr) throw new Error(memErr.message);
    const ids = (mems ?? []).map((m: { user_id: string }) => m.user_id);
    if (!ids.length) return [];

    let profileQuery = sb
      .from("profiles")
      .select("id, full_name, email, phone")
      .in("id", ids);
    if (data.query && data.query.trim()) {
      profileQuery = profileQuery.ilike("full_name", `%${data.query.trim()}%`);
    }
    const { data: profs, error: profErr } = await profileQuery;
    if (profErr) throw new Error(profErr.message);

    const { data: activeEnrollments, error: enrErr } = await sb
      .from("training_enrollments")
      .select("staff_id")
      .eq("organization_id", data.organization_id)
      .eq("product_id", data.product_id)
      .not("status", "in", "(cancelled,verified)");
    if (enrErr) throw new Error(enrErr.message);
    const enrolledIds = new Set(
      ((activeEnrollments ?? []) as Array<{ staff_id: string }>).map((e) => e.staff_id),
    );

    return ((profs ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
    }>).map((p) => ({
      staff_id: p.id,
      full_name: p.full_name ?? "—",
      email: p.email,
      phone: p.phone,
      already_enrolled: enrolledIds.has(p.id),
    }));
  });

export const enrollStaffInTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        purchase_id: z.string().uuid(),
        staff_ids: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ enrolled: number }> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not authenticated");
    const sb = supabase as AnySupabase;

    const { data: purchase, error: purErr } = await sb
      .from("training_purchases")
      .select("id, organization_id, product_id, seats_remaining, status")
      .eq("id", data.purchase_id)
      .maybeSingle();
    if (purErr) throw new Error(purErr.message);
    if (!purchase) throw new Error("Purchase not found");

    await assertOrgAdmin(sb, purchase.organization_id, userId);
    await assertAddonForOrg(sb, userId, "hive_training", purchase.organization_id);

    if (purchase.status !== "active") throw new Error("This purchase is not active");
    if (purchase.seats_remaining < data.staff_ids.length) {
      throw new Error(
        `Only ${purchase.seats_remaining} seat(s) remaining — cannot enroll ${data.staff_ids.length} staff.`,
      );
    }

    const { data: existing, error: exErr } = await sb
      .from("training_enrollments")
      .select("staff_id")
      .eq("organization_id", purchase.organization_id)
      .eq("product_id", purchase.product_id)
      .in("staff_id", data.staff_ids)
      .not("status", "in", "(cancelled,verified)");
    if (exErr) throw new Error(exErr.message);
    const alreadyEnrolled = new Set(
      ((existing ?? []) as Array<{ staff_id: string }>).map((e) => e.staff_id),
    );
    const toEnroll = data.staff_ids.filter((id) => !alreadyEnrolled.has(id));
    if (!toEnroll.length) throw new Error("All selected staff already have an active enrollment for this training.");

    const { data: profs, error: profErr } = await sb
      .from("profiles")
      .select("id, full_name, email, phone")
      .in("id", toEnroll);
    if (profErr) throw new Error(profErr.message);

    const { data: enroller } = await sb
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    const rows = ((profs ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
    }>).map((p) => ({
      organization_id: purchase.organization_id,
      purchase_id: purchase.id,
      product_id: purchase.product_id,
      staff_id: p.id,
      staff_name: p.full_name ?? "—",
      staff_email: p.email ?? "",
      staff_phone: p.phone,
      enrolled_by: userId,
      enrolled_by_name: enroller?.full_name ?? "Admin",
    }));

    const { error: insErr } = await sb.from("training_enrollments").insert(rows);
    if (insErr) throw new Error(insErr.message);

    const { error: updErr } = await sb
      .from("training_purchases")
      .update({
        seats_remaining: purchase.seats_remaining - rows.length,
        status: purchase.seats_remaining - rows.length <= 0 ? "fully_used" : "active",
      })
      .eq("id", purchase.id);
    if (updErr) throw new Error(updErr.message);

    const { data: product } = await sb
      .from("training_products")
      .select("name")
      .eq("id", purchase.product_id)
      .maybeSingle();
    const names = rows.map((r) => r.staff_name).join(", ");
    await notifyHiveExecInternal(
      sb,
      purchase.organization_id,
      `${rows.length} staff enrolled in ${product?.name ?? "training"}`,
      `Newly enrolled: ${names}. Send them their training links.`,
      purchase.id,
    );

    return { enrolled: rows.length };
  });

export const cancelEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        enrollment_id: z.string().uuid(),
        reason: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not authenticated");
    const sb = supabase as AnySupabase;

    const { data: enr, error: getErr } = await sb
      .from("training_enrollments")
      .select("id, organization_id, purchase_id, staff_name, status, product_id")
      .eq("id", data.enrollment_id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!enr) throw new Error("Enrollment not found");

    await assertOrgAdmin(sb, enr.organization_id, userId);
    if (enr.status === "cancelled" || enr.status === "verified") {
      throw new Error(`Cannot cancel an enrollment that is already ${enr.status}`);
    }

    const { error: updErr } = await sb
      .from("training_enrollments")
      .update({
        status: "cancelled",
        cancelled_reason: data.reason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.enrollment_id);
    if (updErr) throw new Error(updErr.message);

    const { data: purchase, error: purErr } = await sb
      .from("training_purchases")
      .select("id, seats_remaining, quantity")
      .eq("id", enr.purchase_id)
      .maybeSingle();
    if (purErr) throw new Error(purErr.message);
    if (purchase) {
      const newRemaining = Math.min(purchase.quantity, purchase.seats_remaining + 1);
      await sb
        .from("training_purchases")
        .update({ seats_remaining: newRemaining, status: "active" })
        .eq("id", purchase.id);
    }

    const { data: product } = await sb
      .from("training_products")
      .select("name")
      .eq("id", enr.product_id)
      .maybeSingle();
    await notifyHiveExecInternal(
      sb,
      enr.organization_id,
      `Enrollment cancelled: ${enr.staff_name}`,
      `${enr.staff_name}'s enrollment in "${product?.name ?? "training"}" was cancelled${data.reason ? ` — ${data.reason}` : ""}.`,
      data.enrollment_id,
    );

    return { ok: true };
  });

// ───── Hive-exec fulfillment actions ────────────────────────────────────

export const markTrainingLinkSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ enrollment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not authenticated");
    const sb = supabase as AnySupabase;
    await ensureHiveExecutive(sb, userId);
    await markTrainingLinkSentInternal(sb, data.enrollment_id, userId);
    return { ok: true };
  });

export const markTrainingCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ enrollment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not authenticated");
    const sb = supabase as AnySupabase;
    await ensureHiveExecutive(sb, userId);
    await markTrainingCompletedInternal(sb, data.enrollment_id, userId);
    return { ok: true };
  });

export const remindAdminForCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ enrollment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not authenticated");
    const sb = supabase as AnySupabase;
    await ensureHiveExecutive(sb, userId);
    await remindAdminInternal(sb, data.enrollment_id);
    return { ok: true };
  });

export interface BulkUpdateResult {
  succeeded: number;
  failed: number;
  errors: Array<{ enrollment_id: string; message: string }>;
}

const BULK_ACTIONS = ["mark_link_sent", "mark_completed_and_notify_admins", "remind_admins"] as const;

export const bulkUpdateEnrollments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        enrollment_ids: z.array(z.string().uuid()).min(1).max(100),
        action: z.enum(BULK_ACTIONS),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<BulkUpdateResult> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not authenticated");
    const sb = supabase as AnySupabase;
    await ensureHiveExecutive(sb, userId);

    const result: BulkUpdateResult = { succeeded: 0, failed: 0, errors: [] };

    if (data.action === "mark_link_sent") {
      for (const id of data.enrollment_ids) {
        try {
          await markTrainingLinkSentInternal(sb, id, userId);
          result.succeeded++;
        } catch (e) {
          result.failed++;
          result.errors.push({ enrollment_id: id, message: (e as Error).message });
        }
      }
      return result;
    }

    if (data.action === "remind_admins") {
      for (const id of data.enrollment_ids) {
        try {
          await remindAdminInternal(sb, id);
          result.succeeded++;
        } catch (e) {
          result.failed++;
          result.errors.push({ enrollment_id: id, message: (e as Error).message });
        }
      }
      return result;
    }

    // mark_completed_and_notify_admins: flip each enrollment individually,
    // but send ONE consolidated notification per org listing all its staff.
    const now = new Date().toISOString();
    const byOrg = new Map<string, Array<{ id: string; staff_id: string; staff_name: string; product_name: string }>>();

    for (const id of data.enrollment_ids) {
      try {
        const { data: enr, error: getErr } = await sb
          .from("training_enrollments")
          .select("id, organization_id, staff_id, staff_name, status, product_id, training_products(name)")
          .eq("id", id)
          .maybeSingle();
        if (getErr) throw new Error(getErr.message);
        if (!enr) throw new Error("Enrollment not found");

        const { error: updErr } = await sb
          .from("training_enrollments")
          .update({ status: "certificate_pending", completed_at: now, admin_notified_at: now, updated_at: now })
          .eq("id", id);
        if (updErr) throw new Error(updErr.message);

        const list = byOrg.get(enr.organization_id) ?? [];
        list.push({
          id,
          staff_id: enr.staff_id,
          staff_name: enr.staff_name,
          product_name: enr.training_products?.name ?? "training",
        });
        byOrg.set(enr.organization_id, list);
        result.succeeded++;
      } catch (e) {
        result.failed++;
        result.errors.push({ enrollment_id: id, message: (e as Error).message });
      }
    }

    for (const [orgId, staffList] of byOrg) {
      const body = staffList
        .map((s) => `${s.staff_name} — ${s.product_name} (upload: /dashboard/employees/${s.staff_id}?tab=record)`)
        .join("\n");
      await notifyOrgAdminsInternal(
        sb,
        orgId,
        `${staffList.length} staff completed training — certificates needed`,
        body,
        "/dashboard/employees",
        null,
      );
    }

    return result;
  });

// ───── Certificate upload + verification ────────────────────────────────

export interface UploadCertificateResult {
  ok: boolean;
  validation_status: "passed" | "failed" | "skipped";
  reasons: string[];
  expires_on: string | null;
}

export const uploadTrainingCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        enrollment_id: z.string().uuid(),
        hr_document_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<UploadCertificateResult> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not authenticated");
    const sb = supabase as AnySupabase;

    const { data: enr, error: getErr } = await sb
      .from("training_enrollments")
      .select(
        "id, organization_id, staff_id, staff_name, status, obligation_instance_id, training_products(name, cert_type_label, cert_keyword_groups, renewal_months)",
      )
      .eq("id", data.enrollment_id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!enr) throw new Error("Enrollment not found");

    await assertOrgAdmin(sb, enr.organization_id, userId);

    const product = enr.training_products as {
      name: string;
      cert_type_label: string | null;
      cert_keyword_groups: Array<{ label: string; any_of: string[] }> | null;
      renewal_months: number | null;
    } | null;

    const now = new Date().toISOString();
    let validationStatus: "passed" | "failed" | "skipped" = "skipped";
    let reasons: string[] = [];
    let expiresOn: string | null = null;

    if (product?.cert_type_label) {
      try {
        const ocr = await runNectarCertOcr(sb, enr.organization_id, data.hr_document_id, {
          title: product.name,
          validation: {
            cert_type_label: product.cert_type_label,
            required_keyword_groups: product.cert_keyword_groups ?? [],
          },
        });
        expiresOn = ocr.expires_on;
        const summary = (ocr.summary ?? "").toLowerCase();
        const groups = product.cert_keyword_groups ?? [];
        const missing = groups.filter(
          (g) => !g.any_of.some((kw) => summary.includes(kw.toLowerCase())),
        );
        if (ocr.confidence < 0.4) {
          reasons.push("Nectar could not read this certificate with confidence.");
        }
        if (missing.length) {
          reasons.push(`Missing expected content: ${missing.map((g) => g.label).join(", ")}`);
        }
        validationStatus = reasons.length ? "failed" : "passed";
      } catch (e) {
        reasons = [`Nectar OCR failed: ${(e as Error).message}`];
        validationStatus = "failed";
      }
    }

    const updates: Record<string, unknown> = {
      status: validationStatus === "failed" ? "certificate_uploaded" : "verified",
      certificate_uploaded_at: now,
      certificate_document_id: data.hr_document_id,
      nectar_validation_status: validationStatus,
      updated_at: now,
    };
    if (validationStatus !== "failed") {
      updates.verified_at = now;
      updates.nectar_extracted_expires_date = expiresOn;
    }

    const { error: updErr } = await sb
      .from("training_enrollments")
      .update(updates)
      .eq("id", data.enrollment_id);
    if (updErr) throw new Error(updErr.message);

    if (validationStatus !== "failed") {
      if (enr.obligation_instance_id) {
        await sb
          .from("company_obligation_instances")
          .update({ status: "completed" })
          .eq("id", enr.obligation_instance_id)
          .eq("status", "pending");
      }
      if (expiresOn) {
        const remindDate = new Date(expiresOn);
        remindDate.setDate(remindDate.getDate() - 60);
        await notifyOrgAdminsInternal(
          sb,
          enr.organization_id,
          `Renewal coming up: ${enr.staff_name}'s ${product?.name ?? "certification"}`,
          `${enr.staff_name}'s "${product?.name ?? "certification"}" expires ${expiresOn}. Time to renew.`,
          `/dashboard/employees/${enr.staff_id}?tab=record`,
          data.enrollment_id,
          remindDate.toISOString(),
        );
      }
    }

    await notifyHiveExecInternal(
      sb,
      enr.organization_id,
      `Certificate uploaded: ${enr.staff_name}`,
      `${enr.staff_name}'s certificate for "${product?.name ?? "training"}" was uploaded — Nectar validation: ${validationStatus}.`,
      data.enrollment_id,
    );

    return { ok: true, validation_status: validationStatus, reasons, expires_on: expiresOn };
  });

/** Hive exec manual override when Nectar OCR failed but the admin confirms the cert is valid. */
export const manuallyVerifyEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        enrollment_id: z.string().uuid(),
        expires_on: z.string().date().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not authenticated");
    const sb = supabase as AnySupabase;
    await ensureHiveExecutive(sb, userId);

    const { error } = await sb
      .from("training_enrollments")
      .update({
        status: "verified",
        verified_at: new Date().toISOString(),
        nectar_validation_status: "manually_confirmed",
        nectar_extracted_expires_date: data.expires_on ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.enrollment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ───── Reads for staff & exec dashboards ────────────────────────────────

export interface StaffEnrollmentRow {
  id: string;
  product_name: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  completed_at: string | null;
  verified_at: string | null;
  nectar_extracted_expires_date: string | null;
  certificate_document_id: string | null;
}

export const getStaffTrainingEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organization_id: z.string().uuid(), staff_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<StaffEnrollmentRow[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    const sb = supabase as AnySupabase;
    await requireOrgMembership(sb, userId, data.organization_id);
    if (userId !== data.staff_id) await assertOrgAdmin(sb, data.organization_id, userId);

    const { data: rows, error } = await sb
      .from("training_enrollments")
      .select(
        "id, status, enrolled_at, completed_at, verified_at, nectar_extracted_expires_date, certificate_document_id, training_products(name)",
      )
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .neq("status", "cancelled")
      .order("enrolled_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      product_name: (r.training_products as { name: string } | null)?.name ?? "—",
      status: r.status as EnrollmentStatus,
      enrolled_at: r.enrolled_at as string,
      completed_at: r.completed_at as string | null,
      verified_at: r.verified_at as string | null,
      nectar_extracted_expires_date: r.nectar_extracted_expires_date as string | null,
      certificate_document_id: r.certificate_document_id as string | null,
    }));
  });

export const getMyTrainingEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StaffEnrollmentRow[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    const sb = supabase as AnySupabase;
    const { data: rows, error } = await sb
      .from("training_enrollments")
      .select(
        "id, status, enrolled_at, completed_at, verified_at, nectar_extracted_expires_date, certificate_document_id, training_products(name)",
      )
      .eq("staff_id", userId)
      .neq("status", "cancelled")
      .order("enrolled_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      product_name: (r.training_products as { name: string } | null)?.name ?? "—",
      status: r.status as EnrollmentStatus,
      enrolled_at: r.enrolled_at as string,
      completed_at: r.completed_at as string | null,
      verified_at: r.verified_at as string | null,
      nectar_extracted_expires_date: r.nectar_extracted_expires_date as string | null,
      certificate_document_id: r.certificate_document_id as string | null,
    }));
  });

export interface ExecEnrollmentRow {
  id: string;
  organization_id: string;
  org_name: string;
  staff_id: string;
  staff_name: string;
  staff_email: string;
  staff_phone: string | null;
  product_id: string;
  product_name: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  link_sent_at: string | null;
  completed_at: string | null;
  admin_notified_at: string | null;
  certificate_uploaded_at: string | null;
  verified_at: string | null;
  nectar_validation_status: string | null;
  nectar_extracted_expires_date: string | null;
  certificate_document_id: string | null;
}

export const getAllTrainingEnrollmentsForExec = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExecEnrollmentRow[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    const sb = supabase as AnySupabase;
    await ensureHiveExecutive(sb, userId);

    const { data: rows, error } = await sb
      .from("training_enrollments")
      .select(
        "*, training_products(name), organizations(name)",
      )
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      organization_id: r.organization_id as string,
      org_name: (r.organizations as { name: string } | null)?.name ?? "—",
      staff_id: r.staff_id as string,
      staff_name: r.staff_name as string,
      staff_email: r.staff_email as string,
      staff_phone: r.staff_phone as string | null,
      product_id: r.product_id as string,
      product_name: (r.training_products as { name: string } | null)?.name ?? "—",
      status: r.status as EnrollmentStatus,
      enrolled_at: r.enrolled_at as string,
      link_sent_at: r.link_sent_at as string | null,
      completed_at: r.completed_at as string | null,
      admin_notified_at: r.admin_notified_at as string | null,
      certificate_uploaded_at: r.certificate_uploaded_at as string | null,
      verified_at: r.verified_at as string | null,
      nectar_validation_status: r.nectar_validation_status as string | null,
      nectar_extracted_expires_date: r.nectar_extracted_expires_date as string | null,
      certificate_document_id: r.certificate_document_id as string | null,
    }));
  });

