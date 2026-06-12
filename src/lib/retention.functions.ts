/**
 * CRM Phase A7 — Referral retention server fns.
 *
 * Lifecycle: active → archived (soft, recoverable) → purged (hard delete +
 * tombstone). Archive is configurable per org; min 30 days post-due.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, requireAnyPermission } from "@/lib/require-permission";

const orgOnly = z.object({ organization_id: z.string().uuid() });

// ─── Retention settings ────────────────────────────────────────

export const getRetentionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabase as any)
      .from("org_referral_retention_settings")
      .select("archive_days_after_due, purge_grace_days, auto_archive_enabled, updated_at")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (
      row ?? {
        archive_days_after_due: 90,
        purge_grace_days: 30,
        auto_archive_enabled: true,
        updated_at: null as string | null,
      }
    );
  });

const updateSettingsInput = orgOnly.extend({
  archive_days_after_due: z.number().int().min(30).max(3650),
  purge_grace_days: z.number().int().min(0).max(3650),
  auto_archive_enabled: z.boolean(),
});

export const updateRetentionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateSettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("org_referral_retention_settings")
      .upsert(
        {
          organization_id: data.organization_id,
          archive_days_after_due: data.archive_days_after_due,
          purge_grace_days: data.purge_grace_days,
          auto_archive_enabled: data.auto_archive_enabled,
          updated_by: userId,
        },
        { onConflict: "organization_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Archive / restore ────────────────────────────────────────

const archiveInput = orgOnly.extend({
  referral_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const archiveReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => archiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");

    const { data: settings } = await supabase
      .from("org_referral_retention_settings")
      .select("purge_grace_days")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    const graceDays = settings?.purge_grace_days ?? 30;
    const purgeAfter = new Date(Date.now() + graceDays * 86400_000).toISOString();

    const { error } = await supabase
      .from("referrals")
      .update({
        archived_at: new Date().toISOString(),
        archived_by: userId,
        archive_reason: data.reason || "manual archive",
        purge_after: purgeAfter,
        status: "archived",
      })
      .eq("id", data.referral_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);

    await supabase.from("referral_activities").insert({
      organization_id: data.organization_id,
      referral_id: data.referral_id,
      activity_type: "archive",
      occurred_at: new Date().toISOString(),
      body: data.reason ? `Archived: ${data.reason}` : "Archived",
      created_by: userId,
    });
    return { ok: true };
  });

const restoreInput = orgOnly.extend({ referral_id: z.string().uuid() });

export const restoreReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => restoreInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");

    const { data: row, error: readErr } = await supabase
      .from("referrals")
      .select("id, archived_at, purge_after")
      .eq("id", data.referral_id)
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Referral not found");
    if (!row.archived_at) throw new Error("Referral is not archived");
    if (row.purge_after && new Date(row.purge_after).getTime() < Date.now()) {
      throw new Error("Referral has aged past the purge grace period");
    }

    const { error } = await supabase
      .from("referrals")
      .update({
        archived_at: null,
        archived_by: null,
        archive_reason: null,
        purge_after: null,
        status: "new",
      })
      .eq("id", data.referral_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);

    await supabase.from("referral_activities").insert({
      organization_id: data.organization_id,
      referral_id: data.referral_id,
      activity_type: "restore",
      occurred_at: new Date().toISOString(),
      body: "Restored from archive",
      created_by: userId,
    });
    return { ok: true };
  });

// ─── Sweep + purge ────────────────────────────────────────────

export const sweepArchiveEligible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: count, error } = await (supabase as any).rpc(
      "archive_eligible_referrals",
      { _organization_id: data.organization_id },
    );
    if (error) throw new Error(error.message);
    return { archived: (count as number) ?? 0 };
  });

export const purgeAgedReferrals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: count, error } = await (supabase as any).rpc(
      "purge_aged_referrals",
      { _organization_id: data.organization_id },
    );
    if (error) throw new Error(error.message);
    return { purged: (count as number) ?? 0 };
  });

// ─── Listing archived referrals ───────────────────────────────

export const listArchivedReferrals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);
    const { data: rows, error } = await supabase
      .from("referrals")
      .select(
        "id, first_name, age, category, support_coordinator_id, due_date, decision_outcome, decision_reason, archived_at, archived_by, archive_reason, purge_after",
      )
      .eq("organization_id", data.organization_id)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
