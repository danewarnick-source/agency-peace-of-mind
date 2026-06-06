/**
 * Client Loan server functions (admin-only).
 *
 * Provider-to-client lending is legally sensitive. The feature is OFF per
 * org by default and only unlocks after an admin records an attestation
 * via `attestLoanFeature`. All read/write fns require admin role.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

export const LOAN_ATTESTATION_VERSION = "draft-2026-06-06-recordkeeping";

export const LOAN_ATTESTATION_TEXT = `DRAFT — pending legal review.

By enabling the Client Loan feature, I (the undersigned administrator)
achnowledge on behalf of my organization that:

1. This is a recordkeeping tool for a financial arrangement the company and
the client's support team have INDEPENDENTLY decided to enter into.

2. HIVE does not provide legal advice and does not determine whether the
arrangement is permissible. The provider is responsible for verifying
permissibility under their state, DSPD, Medicaid, and rep-payee obligations.

3. The provider confirms the arrangement was entered into voluntarily by the
parties and acknowledges HIVE's role is limited to documentation and tracking.

4. Any informational material surfaced by NECTAR or the platform is for
review only and is not a legal conclusion. The platform and its operators
are not liable for use of this feature.

I confirm I have authority to make this attestation for my organization.`;

const orgOnly = z.object({ organization_id: z.string().uuid() });
const orgClient = orgOnly.extend({ client_id: z.string().uuid() });

// ─── Settings / attestation ────────────────────────────────────

export const getLoanFeatureStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { data: settings } = await (supabase as any)
      .from("org_loan_settings")
      .select("*")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    const { data: attestations } = await (supabase as any)
      .from("org_loan_attestations")
      .select("id, attested_at, attested_by, attestation_version")
      .eq("organization_id", data.organization_id)
      .order("attested_at", { ascending: false })
      .limit(5);
    return {
      enabled: !!settings?.enabled,
      settings: settings ?? null,
      attestations: attestations ?? [],
      currentVersion: LOAN_ATTESTATION_VERSION,
      attestationText: LOAN_ATTESTATION_TEXT,
    };
  });

export const attestLoanFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgOnly.extend({ accepted: z.literal(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { data: att, error: attErr } = await (supabase as any)
      .from("org_loan_attestations")
      .insert({
        organization_id: data.organization_id,
        attested_by: userId,
        attestation_version: LOAN_ATTESTATION_VERSION,
        attestation_text: LOAN_ATTESTATION_TEXT,
      })
      .select()
      .single();
    if (attErr) throw new Error(attErr.message);
    const { error: upErr } = await (supabase as any)
      .from("org_loan_settings")
      .upsert({
        organization_id: data.organization_id,
        enabled: true,
        enabled_at: new Date().toISOString(),
        enabled_by: userId,
        active_attestation_id: att.id,
      });
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const disableLoanFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    await (supabase as any)
      .from("org_loan_settings")
      .upsert({ organization_id: data.organization_id, enabled: false });
    return { ok: true };
  });

// ─── Loans ─────────────────────────────────────────────────────

async function assertEnabled(supabase: any, organization_id: string) {
  const { data } = await supabase
    .from("org_loan_settings")
    .select("enabled")
    .eq("organization_id", organization_id)
    .maybeSingle();
  if (!data?.enabled) throw new Error("Client Loan feature is not enabled for this organization.");
}

const repaymentConditionSchema = z.object({
  id: z.string(),
  label: z.string().max(500),
});

const signaturePartySchema = z.object({
  id: z.string(),
  role: z.string().max(120),
  name: z.string().max(200),
  title: z.string().max(200).optional().nullable(),
});

const loanInput = z.object({
  organization_id: z.string().uuid(),
  client_id: z.string().uuid(),
  borrower_name: z.string().min(1).max(200),
  lender_name: z.string().min(1).max(200),
  agreement_date: z.string(),
  purpose: z.string().max(2000).optional().nullable(),
  advance_amount: z.number().nullable().optional(),
  advance_cadence: z.string().max(40).nullable().optional(),
  direct_payment_amount: z.number().nullable().optional(),
  direct_payment_cadence: z.string().max(40).nullable().optional(),
  direct_payment_due_day: z.string().max(60).nullable().optional(),
  direct_payment_start_date: z.string().nullable().optional(),
  direct_payment_description: z.string().max(300).nullable().optional(),
  interest_rate: z.number().min(0).max(100).default(0),
  interest_notes: z.string().max(500).nullable().optional(),
  repayment_conditions: z.array(repaymentConditionSchema).default([]),
  maturity_date: z.string().nullable().optional(),
  repayment_method: z.string().max(500).nullable().optional(),
  voluntary_ack: z.boolean().default(true),
  signature_parties: z.array(signaturePartySchema).default([]),
  notes: z.string().max(2000).nullable().optional(),
  status: z.string().default("draft"),
});

export type LoanInput = z.infer<typeof loanInput>;

export const listOrgLoans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    await assertEnabled(supabase, data.organization_id);
    const { data: rows, error } = await (supabase as any)
      .from("client_loans")
      .select("id, client_id, borrower_name, status, agreement_date, advance_amount, advance_cadence, updated_at")
      .eq("organization_id", data.organization_id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getClientLoanMarkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Admin-only; staff never sees these markers.
    try {
      await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    } catch {
      return [] as { client_id: string; loan_count: number }[];
    }
    const { data: rows } = await (supabase as any)
      .from("client_loans")
      .select("client_id")
      .eq("organization_id", data.organization_id);
    const counts = new Map<string, number>();
    for (const r of rows ?? []) {
      counts.set(r.client_id, (counts.get(r.client_id) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([client_id, loan_count]) => ({ client_id, loan_count }));
  });

export const getLoan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid(), loan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    await assertEnabled(supabase, data.organization_id);
    const { data: loan, error } = await (supabase as any)
      .from("client_loans")
      .select("*")
      .eq("id", data.loan_id)
      .eq("organization_id", data.organization_id)
      .single();
    if (error) throw new Error(error.message);
    const { data: entries } = await (supabase as any)
      .from("client_loan_entries")
      .select("*")
      .eq("loan_id", data.loan_id)
      .order("entry_date", { ascending: true });
    return { loan, entries: entries ?? [] };
  });

export const upsertLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().optional(), values: loanInput }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.values.organization_id, "admin");
    await assertEnabled(supabase, data.values.organization_id);
    const payload: any = { ...data.values, created_by: userId };
    if (data.id) {
      const { data: row, error } = await (supabase as any)
        .from("client_loans")
        .update(payload)
        .eq("id", data.id)
        .eq("organization_id", data.values.organization_id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await (supabase as any)
      .from("client_loans")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid(), loan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { error } = await (supabase as any)
      .from("client_loans")
      .delete()
      .eq("id", data.loan_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Ledger entries ────────────────────────────────────────────

export const addLoanEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      loan_id: z.string().uuid(),
      entry_date: z.string(),
      kind: z.enum(["advance", "direct_payment", "repayment", "adjustment"]),
      amount: z.number(),
      note: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    await assertEnabled(supabase, data.organization_id);
    const { data: row, error } = await (supabase as any)
      .from("client_loan_entries")
      .insert({ ...data, created_by: userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteLoanEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid(), entry_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id, "admin");
    const { error } = await (supabase as any)
      .from("client_loan_entries")
      .delete()
      .eq("id", data.entry_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export function computeRunningBalance(
  entries: { kind: string; amount: number }[],
): number {
  // Advances + direct_payments add to balance owed; repayments subtract; adjustments signed.
  let bal = 0;
  for (const e of entries) {
    const a = Number(e.amount ?? 0);
    if (e.kind === "advance" || e.kind === "direct_payment") bal += a;
    else if (e.kind === "repayment") bal -= a;
    else bal += a; // adjustment uses signed amount
  }
  return Math.round(bal * 100) / 100;
}
