import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Kind = z.enum(["employee", "client"]);

async function assertManager(actorId: string, orgId: string) {
  const { data } = await supabaseAdmin
    .from("organization_members")
    .select("role,active")
    .eq("user_id", actorId)
    .eq("organization_id", orgId)
    .eq("active", true)
    .maybeSingle();
  if (!data || !["admin", "manager", "super_admin"].includes(data.role)) {
    throw new Error("Forbidden: only managers or admins may archive or delete profiles");
  }
}

async function staffActiveBlockers(_staffId: string, _orgId: string) {
  // Time-clock module removed; no active-shift blockers to check.
  return null;
}

async function clientActiveBlockers(clientId: string, orgId: string) {
  // Unsubmitted (pending_approval) daily logs serve as billable claims pending
  const { data: pending } = await supabaseAdmin
    .from("daily_logs")
    .select("id")
    .eq("organization_id", orgId)
    .eq("client_id", clientId)
    .eq("status", "pending_approval")
    .limit(1);
  if (pending && pending.length) {
    return "Action Blocked: This client has unsubmitted billable claims pending. Please finalize the billing export before removal.";
  }
  return null;
}

export const archiveEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      kind: Kind,
      id: z.string().uuid(),
      organizationId: z.string().uuid(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.organizationId);

    if (data.kind === "employee") {
      const blocker = await staffActiveBlockers(data.id, data.organizationId);
      if (blocker) throw new Error(blocker);

      const { error: pErr } = await supabaseAdmin
        .from("profiles")
        .update({ account_status: "archived", team_id: null, is_active: false })
        .eq("id", data.id);
      if (pErr) throw new Error(pErr.message);

      await supabaseAdmin
        .from("organization_members")
        .update({ active: false })
        .eq("user_id", data.id)
        .eq("organization_id", data.organizationId);
    } else {
      const blocker = await clientActiveBlockers(data.id, data.organizationId);
      if (blocker) throw new Error(blocker);

      const { error } = await supabaseAdmin
        .from("clients")
        .update({ account_status: "archived", team_id: null })
        .eq("id", data.id)
        .eq("organization_id", data.organizationId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      kind: Kind,
      id: z.string().uuid(),
      organizationId: z.string().uuid(),
      confirmName: z.string().trim().min(1),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId, data.organizationId);

    if (data.kind === "employee") {
      const blocker = await staffActiveBlockers(data.id, data.organizationId);
      if (blocker) throw new Error(blocker);

      const { data: prof } = await supabaseAdmin
        .from("profiles").select("full_name").eq("id", data.id).maybeSingle();
      const expected = (prof?.full_name ?? "").trim();
      if (!expected || expected.toLowerCase() !== data.confirmName.trim().toLowerCase()) {
        throw new Error("Confirmation name does not match. Deletion aborted.");
      }

      // Cascade-friendly cleanup of related rows that don't have ON DELETE CASCADE.
      await supabaseAdmin.from("organization_members").delete().eq("user_id", data.id);
      await supabaseAdmin.from("course_assignments").delete().eq("user_id", data.id);
      await supabaseAdmin.from("external_certifications").delete().eq("user_id", data.id);
      await supabaseAdmin.from("profiles").delete().eq("id", data.id);
      await supabaseAdmin.auth.admin.deleteUser(data.id).catch(() => {});
    } else {
      const blocker = await clientActiveBlockers(data.id, data.organizationId);
      if (blocker) throw new Error(blocker);

      const { data: cli } = await supabaseAdmin
        .from("clients").select("first_name,last_name")
        .eq("id", data.id).eq("organization_id", data.organizationId).maybeSingle();
      if (!cli) throw new Error("Client not found");
      const expected = `${cli.first_name ?? ""} ${cli.last_name ?? ""}`.trim();
      if (!expected || expected.toLowerCase() !== data.confirmName.trim().toLowerCase()) {
        throw new Error("Confirmation name does not match. Deletion aborted.");
      }

      // Wipe dependent rows then the client itself.
      await supabaseAdmin.from("daily_logs").delete().eq("client_id", data.id);

      await supabaseAdmin.from("pba_transactions").delete()
        .in("account_id",
          (await supabaseAdmin.from("pba_accounts").select("id").eq("client_id", data.id)).data?.map(r => r.id) ?? ["00000000-0000-0000-0000-000000000000"]
        );
      await supabaseAdmin.from("pba_accounts").delete().eq("client_id", data.id);
      await supabaseAdmin.from("clients").delete().eq("id", data.id);
    }
    return { ok: true };
  });

export const getAccountStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("profiles").select("account_status").eq("id", data.userId).maybeSingle();
    return { status: (row?.account_status as string | null) ?? "active" };
  });
