/**
 * Server-only PHI access audit helpers (request metadata, service-role inserts).
 */
import { getRequest, getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PhiAccessAction, PhiAccessResourceType } from "@/lib/phi-access-audit.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isBreakGlass(supabaseUserClient: any, userId: string): Promise<boolean> {
  let isSuper = false;
  let isExec = false;
  try {
    const { data } = await supabaseUserClient.rpc("is_super_admin", { _user: userId });
    isSuper = !!data;
  } catch {
    // RPC may be absent on older DB snapshots
  }
  try {
    const { data } = await supabaseUserClient.rpc("is_hive_executive", { _user: userId });
    isExec = !!data;
  } catch {
    // RPC may be absent on older DB snapshots
  }
  return isSuper || isExec;
}

function resolveRequestMeta(opts: { ip?: string | null; userAgent?: string | null }) {
  let ip = opts.ip ?? null;
  let userAgent = opts.userAgent ?? null;
  if (!ip || !userAgent) {
    try {
      if (!ip) ip = getRequestIP({ xForwardedFor: true }) ?? null;
      if (!userAgent) userAgent = getRequestHeader("user-agent") ?? null;
      if (!ip) {
        const req = getRequest();
        ip =
          req.headers.get("cf-connecting-ip") ||
          req.headers.get("x-real-ip") ||
          req.headers.get("x-forwarded-for") ||
          null;
      }
    } catch {
      // best-effort — client-only callers may not have request context
    }
  }
  return { ip, userAgent };
}

/**
 * Fire-and-forget safe logger for server handlers that already hold auth context.
 * Never throws to callers — audit must not break care delivery.
 */
export async function logPhiAccess(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseUserClient: any;
  userId: string;
  organizationId: string;
  resourceType: PhiAccessResourceType;
  resourceId?: string | null;
  clientId?: string | null;
  action?: PhiAccessAction;
  detail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const { data: membership } = await opts.supabaseUserClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", opts.organizationId)
      .eq("user_id", opts.userId)
      .eq("active", true)
      .maybeSingle();

    const breakGlass = await isBreakGlass(opts.supabaseUserClient, opts.userId);
    const role =
      (membership as { role?: string } | null)?.role ?? (breakGlass ? "super_admin" : null);
    const { ip, userAgent } = resolveRequestMeta({
      ip: opts.ip,
      userAgent: opts.userAgent,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("phi_access_audit_log").insert({
      organization_id: opts.organizationId,
      actor_user_id: opts.userId,
      actor_role: role,
      resource_type: opts.resourceType,
      resource_id: opts.resourceId ?? null,
      client_id: opts.clientId ?? null,
      action: opts.action ?? "view",
      break_glass: breakGlass,
      detail: opts.detail ?? null,
      ip,
      user_agent: userAgent,
    });
  } catch {
    // swallow — never block clinical path
  }
}

export { resolveRequestMeta };
