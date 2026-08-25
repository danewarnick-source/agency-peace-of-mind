/**
 * PHI access audit — workforce accountability for chart / document / eMAR / EVV views.
 * Inserts go through the service-role client (RLS denies authenticated INSERT).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LogInput = z.object({
  organizationId: z.string().uuid(),
  resourceType: z.enum([
    "client_chart",
    "client_document",
    "emar",
    "evv_timesheet",
    "medication_list",
    "incident",
    "daily_log",
    "other",
  ]),
  resourceId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  action: z.enum(["view", "download", "export", "ai_process"]).default("view"),
  detail: z.string().max(500).optional().nullable(),
});

export type PhiAccessResourceType = z.infer<typeof LogInput>["resourceType"];

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
  action?: "view" | "download" | "export" | "ai_process";
  detail?: string | null;
}): Promise<void> {
  try {
    const { data: membership } = await opts.supabaseUserClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", opts.organizationId)
      .eq("user_id", opts.userId)
      .eq("active", true)
      .maybeSingle();

    const { data: isSuperRaw } = await opts.supabaseUserClient.rpc("is_super_admin", {
      _user: opts.userId,
    });
    const isSuper = !!isSuperRaw;
    const role = (membership as { role?: string } | null)?.role ?? (isSuper ? "super_admin" : null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("phi_access_audit_log").insert({
      organization_id: opts.organizationId,
      actor_user_id: opts.userId,
      actor_role: role,
      resource_type: opts.resourceType,
      resource_id: opts.resourceId ?? null,
      client_id: opts.clientId ?? null,
      action: opts.action ?? "view",
      break_glass: isSuper,
      detail: opts.detail ?? null,
    });
  } catch {
    // swallow — never block clinical path
  }
}

/** Explicit client-callable logger (e.g. document download buttons). */
export const recordPhiAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => LogInput.parse(i))
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) return { ok: false as const };
    await requireOrgMembership(
      context.supabase,
      context.userId,
      data.organizationId,
      "employee",
    );
    await logPhiAccess({
      supabaseUserClient: context.supabase,
      userId: context.userId,
      organizationId: data.organizationId,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      clientId: data.clientId,
      action: data.action,
      detail: data.detail,
    });
    return { ok: true as const };
  });
