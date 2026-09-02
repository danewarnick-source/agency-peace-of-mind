import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isRbacSeedTriggerError,
  type SignupWorkspaceReason,
  workspaceNameFromSignup,
} from "@/lib/signup-workspace";

export type EnsureSignupWorkspaceResult = {
  ok: boolean;
  orgId: string | null;
  reason: SignupWorkspaceReason | null;
};

function emailLocalPart(email: string | null | undefined): string {
  const raw = String(email ?? "").trim();
  const at = raw.indexOf("@");
  return at > 0 ? raw.slice(0, at) : raw;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * After a real session exists: find the creator org, or provision profile +
 * org + admin membership (same outcome as handle_new_user).
 *
 * Live landmine: org INSERT still fires seed_rbac_after_org_insert, which
 * errors because public.rbac_roles was dropped. That swallowed Dane's
 * signup (no profile, no org). SQL handoff drops that leftover trigger.
 * Never log name / phone / email.
 */
export const ensureSignupWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agencyName?: string } | undefined) => {
    return { agencyName: String(input?.agencyName ?? "").trim() };
  })
  .handler(async ({ data, context }): Promise<EnsureSignupWorkspaceResult> => {
    const userId = context.userId;
    if (!userId) {
      return { ok: false, orgId: null, reason: "no_session" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;

    const findOrg = async (): Promise<{ orgId: string | null; reason: SignupWorkspaceReason | null }> => {
      const { data: org, error } = await admin
        .from("organizations")
        .select("id")
        .eq("created_by", userId)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("[signup] workspace lookup failed", { code: "org_query_error" });
        return { orgId: null, reason: "org_query_error" };
      }
      const orgId = typeof org?.id === "string" ? org.id : null;
      return { orgId, reason: null };
    };

    const existing = await findOrg();
    if (existing.orgId) return { ok: true, orgId: existing.orgId, reason: null };
    if (existing.reason === "org_query_error") {
      return { ok: false, orgId: null, reason: "org_query_error" };
    }

    const name = workspaceNameFromSignup({
      agencyName: data.agencyName,
      emailLocalPart: emailLocalPart(context.claims?.email ?? null),
    });
    const slugBase = `${name}-${String(userId).slice(0, 6)}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const profileUpsert = await admin.from("profiles").upsert(
      {
        id: userId,
        email: context.claims?.email ?? null,
        agency_name: data.agencyName || null,
      },
      { onConflict: "id" },
    );
    if (profileUpsert?.error) {
      console.warn("[signup] workspace profile upsert failed", { code: "provision_failed" });
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const again = await findOrg();
      if (again.orgId) return { ok: true, orgId: again.orgId, reason: null };

      const { data: created, error: insertErr } = await admin
        .from("organizations")
        .insert({
          name,
          slug: attempt === 0 ? slugBase : `${slugBase}-${attempt}`,
          created_by: userId,
        })
        .select("id")
        .maybeSingle();

      if (insertErr) {
        if (isRbacSeedTriggerError(insertErr.message)) {
          console.warn("[signup] workspace provision failed", { code: "trigger_blocked" });
          return { ok: false, orgId: null, reason: "trigger_blocked" };
        }
        console.warn("[signup] workspace provision failed", { code: "provision_failed" });
      } else if (typeof created?.id === "string") {
        const memberIns = await admin.from("organization_members").insert({
          organization_id: created.id,
          user_id: userId,
          role: "admin",
        });
        if (memberIns?.error) {
          console.warn("[signup] workspace membership insert failed", { code: "provision_failed" });
        }
        return { ok: true, orgId: created.id, reason: null };
      }
      await sleep(350 * (attempt + 1));
    }

    const last = await findOrg();
    if (last.orgId) return { ok: true, orgId: last.orgId, reason: null };
    return { ok: false, orgId: null, reason: last.reason ?? "provision_failed" };
  });
