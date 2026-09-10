import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  checkAndMarkOverdueInternal,
  type CompanyObligationRow,
  type ObligationInstanceRow,
} from "@/lib/company-obligations.functions";
import {
  buildAgencyDocCards,
  isCompanyPolicyObligation,
  tallyAgencyDocCards,
  type AgencyDocCard,
  type AgencyDocCounts,
  type AgencyDocInstance,
} from "@/lib/agency-documents";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type AgencyDocumentsIndex = {
  cards: AgencyDocCard[];
  counts: AgencyDocCounts;
  codes: string[];
};

async function loadOrgCodes(supabase: AnySupabase, organizationId: string): Promise<string[]> {
  const codes = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);

  const orgAttempt = await supabase
    .from("organizations")
    .select("services_offered")
    .eq("id", organizationId)
    .maybeSingle();
  if (!orgAttempt.error) {
    for (const c of (orgAttempt.data as { services_offered?: string[] | null } | null)?.services_offered ?? []) {
      codes.add(String(c).toUpperCase());
    }
  }

  const outlineAttempt = await supabase
    .from("provider_interest_outline")
    .select("codes_held")
    .eq("organization_id", organizationId);
  if (!outlineAttempt.error) {
    for (const row of (outlineAttempt.data ?? []) as Array<{ codes_held: string[] | null }>) {
      for (const c of row.codes_held ?? []) codes.add(String(c).toUpperCase());
    }
  }

  const clientAttempt = await supabase
    .from("clients")
    .select("authorized_dspd_codes")
    .eq("organization_id", organizationId)
    .eq("account_status", "active");
  if (!clientAttempt.error) {
    for (const c of (clientAttempt.data ?? []) as Array<{ authorized_dspd_codes: string[] | null }>) {
      for (const code of c.authorized_dspd_codes ?? []) codes.add(code.toUpperCase());
    }
  }

  const cbcAttempt = await supabase
    .from("client_billing_codes")
    .select("service_code, service_end_date")
    .eq("organization_id", organizationId);
  if (!cbcAttempt.error) {
    for (const r of (cbcAttempt.data ?? []) as Array<{
      service_code: string | null;
      service_end_date: string | null;
    }>) {
      if (r.service_end_date && r.service_end_date < today) continue;
      if (r.service_code) codes.add(r.service_code.toUpperCase());
    }
  }

  return Array.from(codes);
}

/**
 * Org-wide Agency documents from existing company_obligations (scope org).
 * Company policies (provider / agency_policy_id) are excluded — not DSPD rows.
 * No new tables.
 */
export async function loadAgencyDocumentsIndex(
  supabase: AnySupabase,
  organizationId: string,
): Promise<AgencyDocumentsIndex> {
  await checkAndMarkOverdueInternal(supabase, organizationId);
  const codes = await loadOrgCodes(supabase, organizationId);

  const { data: obligations, error: oErr } = await supabase
    .from("company_obligations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("scope", "org");
  if (oErr) throw new Error(oErr.message);

  const orgRows = ((obligations ?? []) as CompanyObligationRow[]).filter(
    (o) => o.active !== false && !isCompanyPolicyObligation(o),
  );
  const obligationIds = orgRows.map((o) => o.id);

  const instances: ObligationInstanceRow[] = [];
  if (obligationIds.length) {
    const { data, error } = await supabase
      .from("company_obligation_instances")
      .select("*")
      .eq("organization_id", organizationId)
      .in("obligation_id", obligationIds);
    if (error) throw new Error(error.message);
    instances.push(...((data ?? []) as ObligationInstanceRow[]));
  }

  const byObligation = new Map<string, ObligationInstanceRow[]>();
  for (const inst of instances) {
    const list = byObligation.get(inst.obligation_id) ?? [];
    list.push(inst);
    byObligation.set(inst.obligation_id, list);
  }

  const mapped: AgencyDocInstance[] = [];
  for (const ob of orgRows) {
    const rows = byObligation.get(ob.id) ?? [];
    if (!rows.length) {
      mapped.push({
        title: ob.title,
        instanceStatus: "pending",
        dueAt: "",
        obligationId: ob.id,
        instanceId: null,
        evidenceType: ob.evidence_type,
        attestationText: ob.attestation_text,
      });
      continue;
    }
    for (const inst of rows) {
      mapped.push({
        title: ob.title,
        instanceStatus: inst.status,
        dueAt: inst.due_at,
        instanceUploadPath: inst.upload_path,
        instanceUploadFilename: inst.upload_filename,
        obligationId: ob.id,
        instanceId: inst.id,
        evidenceType: ob.evidence_type,
        attestationText: ob.attestation_text,
      });
    }
  }

  const cards = buildAgencyDocCards(mapped, codes);
  return { cards, counts: tallyAgencyDocCards(cards), codes };
}

export const listAgencyDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AgencyDocumentsIndex> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) {
      return { cards: [], counts: { missing: 0, due_soon: 0, on_file: 0 }, codes: [] };
    }
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    return loadAgencyDocumentsIndex(supabase, data.organizationId);
  });
