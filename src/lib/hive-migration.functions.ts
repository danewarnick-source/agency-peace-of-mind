// Executive Company Migration — engagement workflow + provider sign-off
// gate + HIVE access logging on top of the shared Smart Import engine.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TargetOnly = z.object({ targetOrgId: z.string().uuid() });
const JobId = z.object({ jobId: z.string().uuid() });

async function assertHiveExec(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, userId: string,
) {
  const { data, error } = await sb.from("hive_executives")
    .select("id").eq("user_id", userId).eq("active", true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("HIVE executive access required.");
}

// List migration (white_glove) jobs for a target customer.
export const listMigrationJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TargetOnly.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: jobs, error } = await sb
      .from("import_jobs")
      .select("id, status, mode, source, scale, engagement_status, quote_amount_cents, provider_signoff_at, provider_signoff_by, created_at, committed_at, submitted_at, notes, created_by, target_org_id")
      .eq("source", "white_glove")
      .eq("target_org_id", data.targetOrgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return jobs ?? [];
  });

// Update engagement workflow fields.
export const setEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      jobId: z.string().uuid(),
      engagement_status: z.enum(["quoted", "in_progress", "review", "complete"]).optional(),
      quote_amount_cents: z.number().int().nonnegative().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    await assertHiveExec(sb, context.userId);
    const patch: Record<string, unknown> = {};
    if (data.engagement_status !== undefined) patch.engagement_status = data.engagement_status;
    if (data.quote_amount_cents !== undefined) patch.quote_amount_cents = data.quote_amount_cents;
    const { error } = await sb.from("import_jobs").update(patch).eq("id", data.jobId);
    if (error) throw new Error(error.message);
    await logAccess(sb, data.jobId, context.userId, "engagement_update", patch);
    return { ok: true };
  });

// Provider sign-off — must be the receiving customer's admin (RLS allows
// target_org admins to update import_jobs; we also stamp who signed).
export const providerSignoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => JobId.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: job, error } = await sb.from("import_jobs")
      .select("id, target_org_id, source").eq("id", data.jobId).single();
    if (error || !job) throw new Error("Job not found");
    if (job.source !== "white_glove" || !job.target_org_id) {
      throw new Error("Sign-off only applies to white-glove migrations.");
    }
    const { data: isAdmin } = await sb.rpc("has_org_role", {
      _org: job.target_org_id, _user: context.userId, _role: "admin",
    });
    if (!isAdmin) throw new Error("Only the receiving company's admin can sign off.");

    const { error: upErr } = await sb.from("import_jobs").update({
      provider_signoff_at: new Date().toISOString(),
      provider_signoff_by: context.userId,
      engagement_status: "review",
    }).eq("id", data.jobId);
    if (upErr) throw new Error(upErr.message);

    await sb.from("import_audit").insert({
      import_job_id: data.jobId,
      org_id: job.target_org_id,
      item: "Provider sign-off recorded; commit unlocked",
      traces_to: "admin_override",
      actor: context.userId,
      action: "provider_signoff",
    });
    return { ok: true };
  });

// HIVE staff explicit access log (view/edit a mapping, prep step).
export const logHiveAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      jobId: z.string().uuid(),
      action: z.string().min(1).max(80),
      details: z.record(z.string(), z.unknown()).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    await assertHiveExec(sb, context.userId);
    await logAccess(sb, data.jobId, context.userId, data.action, data.details ?? {});
    return { ok: true };
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logAccess(sb: any, jobId: string, actor: string, action: string, details: Record<string, unknown>) {
  const { data: job } = await sb.from("import_jobs")
    .select("target_org_id").eq("id", jobId).maybeSingle();
  await sb.from("import_access_log").insert({
    import_job_id: jobId,
    target_org_id: job?.target_org_id ?? null,
    actor,
    action,
    details,
  });
}

export const listAccessLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => JobId.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("import_access_log")
      .select("id, action, details, actor, created_at")
      .eq("import_job_id", data.jobId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const actorIds = Array.from(new Set((rows ?? []).map((r: { actor: string }) => r.actor)));
    const actorMap = new Map<string, string>();
    if (actorIds.length) {
      const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", actorIds);
      for (const p of profs ?? []) actorMap.set(p.id, p.full_name ?? p.email ?? p.id);
    }
    return (rows ?? []).map((r: { id: string; action: string; details: unknown; actor: string; created_at: string }) => ({
      ...r,
      actor_name: actorMap.get(r.actor) ?? "Unknown",
    }));
  });
