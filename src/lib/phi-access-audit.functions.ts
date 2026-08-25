/**
 * PHI access audit — workforce accountability for chart / document / eMAR / EVV views.
 * Inserts go through the service-role client (RLS denies authenticated INSERT).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

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
  ip: z.string().max(120).optional().nullable(),
  userAgent: z.string().max(500).optional().nullable(),
});

const ListInput = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid().optional().nullable(),
  actorUserId: z.string().uuid().optional().nullable(),
  resourceType: LogInput.shape.resourceType.optional().nullable(),
  action: LogInput.shape.action.optional().nullable(),
  fromIso: z.string().datetime().optional().nullable(),
  toIso: z.string().datetime().optional().nullable(),
  breakGlassOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export type PhiAccessResourceType = z.infer<typeof LogInput>["resourceType"];
export type PhiAccessAction = z.infer<typeof LogInput>["action"];
export type PhiAccessAuditRow = {
  id: string;
  organization_id: string;
  actor_user_id: string;
  actor_name: string | null;
  actor_role: string | null;
  resource_type: PhiAccessResourceType;
  resource_id: string | null;
  client_id: string | null;
  client_name?: string | null;
  action: PhiAccessAction;
  break_glass: boolean;
  detail: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export type ListPhiAccessAuditInput = z.infer<typeof ListInput>;

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
    const { logPhiAccess, resolveRequestMeta } = await import("@/lib/phi-access-audit.server");
    const { ip, userAgent } = resolveRequestMeta({
      ip: data.ip,
      userAgent: data.userAgent,
    });
    await logPhiAccess({
      supabaseUserClient: context.supabase,
      userId: context.userId,
      organizationId: data.organizationId,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      clientId: data.clientId,
      action: data.action,
      detail: data.detail,
      ip,
      userAgent,
    });
    return { ok: true as const };
  });

/** Admin/manager audit trail for PHI access review UI. */
export const listPhiAccessAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ListInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { rows: [] as PhiAccessAuditRow[] };

    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const limit = Math.min(data.limit ?? 50, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("phi_access_audit_log")
      .select(
        "id, organization_id, actor_user_id, actor_role, resource_type, resource_id, client_id, action, break_glass, detail, ip, user_agent, created_at",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.actorUserId) q = q.eq("actor_user_id", data.actorUserId);
    if (data.resourceType) q = q.eq("resource_type", data.resourceType);
    if (data.action) q = q.eq("action", data.action);
    if (data.fromIso) q = q.gte("created_at", data.fromIso);
    if (data.toIso) q = q.lte("created_at", data.toIso);
    if (data.breakGlassOnly) q = q.eq("break_glass", true);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const actorIds = Array.from(
      new Set(
        ((rows ?? []) as Array<{ actor_user_id: string }>).map((r) => r.actor_user_id).filter(Boolean),
      ),
    );
    const nameById = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: members } = await supabase
        .from("org_member_directory")
        .select("id, full_name, email")
        .in("id", actorIds);
      for (const m of members ?? []) {
        const label =
          (m as { full_name?: string | null; email?: string | null }).full_name?.trim() ||
          (m as { email?: string | null }).email ||
          null;
        if (label) nameById.set((m as { id: string }).id, label);
      }
    }

    const clientIds = Array.from(
      new Set(
        ((rows ?? []) as Array<{ client_id: string | null }>)
          .map((r) => r.client_id)
          .filter((id): id is string => !!id),
      ),
    );
    const clientNameById = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .in("id", clientIds);
      for (const c of clients ?? []) {
        const label = [
          (c as { first_name?: string | null }).first_name,
          (c as { last_name?: string | null }).last_name,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (label) clientNameById.set((c as { id: string }).id, label);
      }
    }

    const out: PhiAccessAuditRow[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      organization_id: r.organization_id as string,
      actor_user_id: r.actor_user_id as string,
      actor_name: nameById.get(r.actor_user_id as string) ?? null,
      actor_role: (r.actor_role as string | null) ?? null,
      resource_type: r.resource_type as PhiAccessResourceType,
      resource_id: (r.resource_id as string | null) ?? null,
      client_id: (r.client_id as string | null) ?? null,
      client_name: r.client_id
        ? clientNameById.get(r.client_id as string) ?? null
        : null,
      action: r.action as PhiAccessAction,
      break_glass: !!r.break_glass,
      detail: (r.detail as string | null) ?? null,
      ip: (r.ip as string | null) ?? null,
      user_agent: (r.user_agent as string | null) ?? null,
      created_at: r.created_at as string,
    }));

    return { rows: out };
  });
