import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

const KindEnum = z.enum(["sei_employment_monthly", "sei_support_strategies", "usor_vendor", "usor_vendor_job_development"]);

// Sentinel values, not NULL — see migration 20260813110000 for why.
const NIL_CLIENT_ID = "00000000-0000-0000-0000-000000000000";

export type UpiAttestationRow = {
  id: string;
  organization_id: string;
  client_id: string | null;
  kind: "sei_employment_monthly" | "sei_support_strategies" | "usor_vendor" | "usor_vendor_job_development";
  period_label: string | null;
  attested_at: string;
  attested_by: string;
  attested_by_name: string | null;
};

function normalizeRow(r: { client_id: string; period_label: string } & Record<string, unknown>): UpiAttestationRow {
  return {
    ...(r as unknown as UpiAttestationRow),
    client_id: r.client_id === NIL_CLIENT_ID ? null : r.client_id,
    period_label: r.period_label === "" ? null : r.period_label,
  };
}

/** List every attestation of a given kind for the org (org-wide read, used to drive deadlines). */
export const listUpiAttestations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    kind: KindEnum,
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [] as UpiAttestationRow[];
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("upi_attestations")
      .select("id, organization_id, client_id, kind, period_label, attested_at, attested_by, attested_by_name")
      .eq("organization_id", data.organizationId)
      .eq("kind", data.kind);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as Array<{ client_id: string; period_label: string } & Record<string, unknown>>).map(normalizeRow);
  });

/** Record (upsert) an attestation. One row per (org, kind, client, period) — re-attesting just refreshes the timestamp. */
export const recordUpiAttestation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    clientId: z.string().uuid().nullable(),
    kind: KindEnum,
    periodLabel: z.string().max(20).nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: true };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error } = await sb
      .from("upi_attestations")
      .upsert({
        organization_id: data.organizationId,
        client_id: data.clientId ?? NIL_CLIENT_ID,
        kind: data.kind,
        period_label: data.periodLabel ?? "",
        attested_at: new Date().toISOString(),
        attested_by: userId,
        attested_by_name: (prof?.full_name as string | null) ?? null,
      }, { onConflict: "organization_id,kind,client_id,period_label" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
