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

// Cross-org guard for every service-role write in this file. Verifies, BEFORE
// any write happens, that
//   (a) the CALLER has an ACTIVE membership in the organization they claim to
//       act for, and
//   (b) the TARGET actually belongs to that same organization (staff via
//       organization_members; clients via clients.organization_id).
// Without (b), the service-role writes below (which bypass RLS) could touch a
// profile/user/client in a DIFFERENT org just by passing that record's id — a
// cross-organization IDOR. The target-staff check accepts a membership row
// regardless of its `active` flag on purpose: archiveEntity sets active=false,
// and deleteEntity may run afterwards on an already-archived employee, so an
// active-only check would break that legitimate flow. Existence of any row
// still proves same-org ownership.
async function assertCallerAndTargetInOrg(
  actorId: string,
  kind: "employee" | "client",
  targetId: string,
  orgId: string,
) {
  const { data: myOrgs } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", actorId)
    .eq("active", true);
  const mine = new Set((myOrgs ?? []).map((r) => r.organization_id));
  if (!mine.has(orgId)) {
    throw new Error("Not authorized for this organization");
  }

  if (kind === "employee") {
    const { data } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", targetId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!data) throw new Error("Not authorized for this organization");
  } else {
    const { data } = await supabaseAdmin
      .from("clients")
      .select("organization_id")
      .eq("id", targetId)
      .maybeSingle();
    if (!data || data.organization_id !== orgId) {
      throw new Error("Not authorized for this organization");
    }
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
    await assertCallerAndTargetInOrg(context.userId, data.kind, data.id, data.organizationId);
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
    await assertCallerAndTargetInOrg(context.userId, data.kind, data.id, data.organizationId);
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

      // Scope the membership removal to the org the caller actually administers.
      // (Previously this stripped the user's membership in ALL orgs — breaks
      //  multi-org users.)
      await supabaseAdmin
        .from("organization_members")
        .delete()
        .eq("user_id", data.id)
        .eq("organization_id", data.organizationId);

      // Only when this was their LAST membership do we wipe their profile / auth.
      const { data: remaining } = await supabaseAdmin
        .from("organization_members")
        .select("id")
        .eq("user_id", data.id)
        .limit(1);
      if (!remaining || remaining.length === 0) {
        await supabaseAdmin.from("course_assignments").delete().eq("user_id", data.id);
        await supabaseAdmin.from("external_certifications").delete().eq("user_id", data.id);
        await supabaseAdmin.from("profiles").delete().eq("id", data.id);
        await supabaseAdmin.auth.admin.deleteUser(data.id).catch(() => {});
      }
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

