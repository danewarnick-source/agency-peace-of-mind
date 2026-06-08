/**
 * Client-intake checklist server functions.
 *
 * Access gate: admin / super_admin / hive_executive (org-wide) OR a staffer
 * with an active `staff_assignments` row to that client. Everyone else is
 * denied. The gate is enforced by SQL via `can_view_client_intake` (RPC) and
 * RLS on `client_intake_completion` — server fns ALSO check `canView` so we
 * fail-closed with a clean error rather than leaking an empty list.
 *
 * Evidence files reuse the PHI-gated client document store
 * (`nectar_documents` with owner_kind='client'). No new bucket.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

const orgClient = z.object({
  organization_id: z.string().uuid(),
  client_id: z.string().uuid(),
});

export interface ClientIntakeRow {
  requirement_id: string;
  title: string;
  category: string | null;
  source_citation: string | null;
  evidence_type: string | null;
  renewal: string | null;
  checklist_layer: string | null;
  purpose: string | null;
  conditional: string | null;
  note: string | null;
  completion: {
    id: string | null;
    status: string;
    completed_date: string | null;
    expires_at: string | null;
    evidence_document_id: string | null;
    notes: string | null;
    completed_by: string | null;
  };
}

export const getClientIntakeChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgClient.parse(d))
  .handler(async ({ data, context }): Promise<ClientIntakeRow[]> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: canView, error: gateErr } = await sb.rpc(
      "can_view_client_intake",
      {
        _org: data.organization_id,
        _client: data.client_id,
        _viewer: userId,
      },
    );
    if (gateErr) throw new Error(gateErr.message);
    if (!canView) {
      throw new Error(
        "Forbidden: only the org admin or staff assigned to this client may view the intake checklist.",
      );
    }

    const [{ data: base, error: baseErr }, { data: comp, error: compErr }] =
      await Promise.all([
        sb.rpc("get_hr_client_intake_base", { _org: data.organization_id }),
        sb
          .from("client_intake_completion")
          .select("*")
          .eq("organization_id", data.organization_id)
          .eq("client_id", data.client_id),
      ]);
    if (baseErr) throw new Error(baseErr.message);
    if (compErr) throw new Error(compErr.message);

    const compMap = new Map<string, Record<string, unknown>>();
    for (const c of comp ?? []) compMap.set(c.requirement_id as string, c);

    return (base ?? []).map((r: Record<string, unknown>) => {
      const c = compMap.get(r.id as string);
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        requirement_id: r.id as string,
        title: (r.title as string) ?? "Untitled",
        category: (r.category as string) ?? null,
        source_citation: (r.source_citation as string) ?? null,
        evidence_type: (meta.evidence_type as string) ?? null,
        renewal: (meta.renewal as string) ?? null,
        checklist_layer: (meta.checklist_layer as string) ?? null,
        purpose: (meta.purpose as string) ?? null,
        conditional: (meta.conditional as string) ?? null,
        note: (meta.note as string) ?? null,
        completion: {
          id: (c?.id as string) ?? null,
          status: (c?.status as string) ?? "not_started",
          completed_date: (c?.completed_date as string) ?? null,
          expires_at: (c?.expires_at as string) ?? null,
          evidence_document_id: (c?.evidence_document_id as string) ?? null,
          notes: (c?.notes as string) ?? null,
          completed_by: (c?.completed_by as string) ?? null,
        },
      };
    });
  });

export const upsertClientIntakeCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        client_id: z.string().uuid(),
        requirement_id: z.string().uuid(),
        status: z.enum([
          "not_started",
          "in_progress",
          "complete",
          "expired",
          "waived",
          "not_applicable",
        ]),
        completed_date: z.string().date().nullable().optional(),
        expires_at: z.string().date().nullable().optional(),
        evidence_document_id: z.string().uuid().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: canView, error: gateErr } = await sb.rpc(
      "can_view_client_intake",
      {
        _org: data.organization_id,
        _client: data.client_id,
        _viewer: userId,
      },
    );
    if (gateErr) throw new Error(gateErr.message);
    if (!canView) throw new Error("Forbidden");

    const { error } = await sb.from("client_intake_completion").upsert(
      {
        organization_id: data.organization_id,
        client_id: data.client_id,
        requirement_id: data.requirement_id,
        status: data.status,
        completed_date: data.completed_date ?? null,
        expires_at: data.expires_at ?? null,
        evidence_document_id: data.evidence_document_id ?? null,
        notes: data.notes ?? null,
        completed_by: userId,
      },
      { onConflict: "client_id,requirement_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
