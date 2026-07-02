/**
 * Employee Loan server functions.
 *
 * Admin/manager-only for read/write. E-sign flow uses:
 *   - `sendEmployeeLoanForSignature` — admin creates a one-time token and emails
 *     the staff member a magic link.
 *   - `getEmployeeLoanForSigning` — PUBLIC (no auth); returns the frozen
 *     agreement snapshot for the token holder.
 *   - `submitEmployeeLoanSignature` — PUBLIC (no auth); records the signature
 *     with IP + user-agent, marks the token used, advances the loan status.
 *
 * Signatures are captured with the ESIGN Act's four requirements in mind:
 * intent (explicit consent), association (token→loan), attribution
 * (name + email + IP + UA), and integrity (immutable snapshot + sha256).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

const orgOnly = z.object({ organization_id: z.string().uuid() });

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
  staff_id: z.string().uuid(),
  borrower_name: z.string().min(1).max(200),
  borrower_email: z.string().email().max(320).nullable().optional(),
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

export type EmployeeLoanInput = z.infer<typeof loanInput>;

async function assertAdmin(supabase: any, userId: string, organization_id: string) {
  await requireOrgMembership(supabase, userId, organization_id, "manager");
}

export const listEmployeeLoans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organization_id);
    const { data: rows, error } = await (supabase as any)
      .from("employee_loans")
      .select("id, staff_id, borrower_name, borrower_email, status, agreement_date, advance_amount, advance_cadence, updated_at")
      .eq("organization_id", data.organization_id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getEmployeeLoan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid(), loan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organization_id);
    const { data: loan, error } = await (supabase as any)
      .from("employee_loans")
      .select("*")
      .eq("id", data.loan_id)
      .eq("organization_id", data.organization_id)
      .single();
    if (error) throw new Error(error.message);
    const { data: entries } = await (supabase as any)
      .from("employee_loan_entries")
      .select("*")
      .eq("loan_id", data.loan_id)
      .order("entry_date", { ascending: true });
    const { data: signatures } = await (supabase as any)
      .from("employee_loan_signatures")
      .select("id, signer_type, signer_name, signer_email, signature_image, signature_method, signer_ip, signed_at")
      .eq("loan_id", data.loan_id)
      .order("signed_at", { ascending: true });
    const { data: tokens } = await (supabase as any)
      .from("employee_loan_signature_tokens")
      .select("id, signer_email, signer_name, expires_at, used_at, created_at")
      .eq("loan_id", data.loan_id)
      .order("created_at", { ascending: false });
    return { loan, entries: entries ?? [], signatures: signatures ?? [], tokens: tokens ?? [] };
  });

export const upsertEmployeeLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().optional(), values: loanInput }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.values.organization_id);
    const payload: any = { ...data.values, created_by: userId };
    if (data.id) {
      // Lock edits once signed
      const { data: existing } = await (supabase as any)
        .from("employee_loans")
        .select("status")
        .eq("id", data.id)
        .single();
      if (existing?.status === "signed" || existing?.status === "active") {
        throw new Error("This loan has been signed and is locked. Void the agreement to make changes.");
      }
      const { data: row, error } = await (supabase as any)
        .from("employee_loans")
        .update(payload)
        .eq("id", data.id)
        .eq("organization_id", data.values.organization_id)
        .select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await (supabase as any)
      .from("employee_loans")
      .insert(payload)
      .select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEmployeeLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid(), loan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organization_id);
    const { error } = await (supabase as any)
      .from("employee_loans")
      .delete()
      .eq("id", data.loan_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addEmployeeLoanEntry = createServerFn({ method: "POST" })
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
    await assertAdmin(supabase, userId, data.organization_id);
    const { data: row, error } = await (supabase as any)
      .from("employee_loan_entries")
      .insert({ ...data, created_by: userId })
      .select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEmployeeLoanEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid(), entry_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organization_id);
    const { error } = await (supabase as any)
      .from("employee_loan_entries")
      .delete()
      .eq("id", data.entry_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export function computeRunningBalance(entries: { kind: string; amount: number }[]): number {
  let bal = 0;
  for (const e of entries) {
    const a = Number(e.amount ?? 0);
    if (e.kind === "advance" || e.kind === "direct_payment") bal += a;
    else if (e.kind === "repayment") bal -= a;
    else bal += a;
  }
  return Math.round(bal * 100) / 100;
}

// ───────── E-Signature (magic link) ─────────

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export const sendEmployeeLoanForSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      loan_id: z.string().uuid(),
      signer_email: z.string().email(),
      signer_name: z.string().min(1).max(200),
      base_url: z.string().url(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organization_id);

    // Load the loan (frozen snapshot for the signer)
    const { data: loan, error: lErr } = await (supabase as any)
      .from("employee_loans").select("*")
      .eq("id", data.loan_id).eq("organization_id", data.organization_id)
      .single();
    if (lErr || !loan) throw new Error(lErr?.message || "Loan not found");

    const rawToken = randomBytes(32).toString("hex");
    const token_hash = sha256(rawToken);
    const expires_at = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const snapshot = {
      loan_id: loan.id,
      organization_id: loan.organization_id,
      borrower_name: loan.borrower_name,
      lender_name: loan.lender_name,
      agreement_date: loan.agreement_date,
      purpose: loan.purpose,
      advance_amount: loan.advance_amount,
      advance_cadence: loan.advance_cadence,
      direct_payment_amount: loan.direct_payment_amount,
      direct_payment_cadence: loan.direct_payment_cadence,
      direct_payment_due_day: loan.direct_payment_due_day,
      direct_payment_start_date: loan.direct_payment_start_date,
      direct_payment_description: loan.direct_payment_description,
      interest_rate: loan.interest_rate,
      interest_notes: loan.interest_notes,
      repayment_conditions: loan.repayment_conditions,
      maturity_date: loan.maturity_date,
      repayment_method: loan.repayment_method,
      voluntary_ack: loan.voluntary_ack,
      signature_parties: loan.signature_parties,
      notes: loan.notes,
    };

    const { data: token, error: tErr } = await (supabase as any)
      .from("employee_loan_signature_tokens")
      .insert({
        organization_id: data.organization_id,
        loan_id: data.loan_id,
        signer_email: data.signer_email,
        signer_name: data.signer_name,
        token_hash,
        agreement_snapshot: snapshot,
        expires_at,
        created_by: userId,
      })
      .select().single();
    if (tErr) throw new Error(tErr.message);

    // Mark loan as sent
    await (supabase as any)
      .from("employee_loans")
      .update({ status: "sent_for_signature" })
      .eq("id", data.loan_id);

    // Build sign URL
    const signUrl = `${data.base_url.replace(/\/$/, "")}/sign/employee-loan/${rawToken}`;

    // Send email via existing send-email edge function (uses org email settings)
    const { data: settings } = await (supabase as any)
      .from("org_email_settings")
      .select("from_name, from_address, reply_to, verified")
      .eq("organization_id", data.organization_id)
      .maybeSingle();

    let emailStatus: { ok: boolean; error?: string } = { ok: false, error: "Email sender not configured. The signing link is still valid — send it manually below." };
    if (settings?.verified && settings?.from_address) {
      const fromName = String(settings.from_name || "").trim();
      const fromAddress = String(settings.from_address).trim();
      const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
      const html = `
        <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
          <h2 style="margin:0 0 12px">Loan agreement ready for your signature</h2>
          <p>Hi ${data.signer_name},</p>
          <p>${loan.lender_name} has prepared an Employee Loan Agreement for you to review and sign electronically.</p>
          <p style="margin:20px 0">
            <a href="${signUrl}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Review &amp; sign agreement</a>
          </p>
          <p style="font-size:12px;color:#555">This link expires on ${new Date(expires_at).toLocaleString()}. It can be used one time.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
          <p style="font-size:11px;color:#666">
            By clicking the link and completing the signing form you are electronically signing this agreement
            under the U.S. E-SIGN Act. Your electronic signature has the same legal effect as a handwritten one.
            If you did not expect this email, do not click the link — reply and let us know.
          </p>
        </div>`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: invokeData, error: invokeErr } = await (supabase as any).functions.invoke("send-email", {
        body: {
          from,
          to: data.signer_email,
          subject: `Loan agreement ready for your signature — ${loan.lender_name}`,
          html,
          reply_to: settings.reply_to ?? undefined,
        },
      });
      if (invokeErr) emailStatus = { ok: false, error: invokeErr.message };
      else if (!invokeData || invokeData.ok !== true) emailStatus = { ok: false, error: invokeData?.error || "Email send failed" };
      else emailStatus = { ok: true };
    }

    return { token_id: token.id, sign_url: signUrl, expires_at, email: emailStatus };
  });

export const voidEmployeeLoanSignatureToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid(), token_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organization_id);
    const { error } = await (supabase as any)
      .from("employee_loan_signature_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", data.token_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── PUBLIC — no auth. Guarded by the token itself. ──

export const getEmployeeLoanForSigning = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(16) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token_hash = sha256(data.token);
    const { data: token } = await (supabaseAdmin as any)
      .from("employee_loan_signature_tokens")
      .select("id, loan_id, organization_id, signer_email, signer_name, agreement_snapshot, expires_at, used_at")
      .eq("token_hash", token_hash)
      .maybeSingle();
    if (!token) return { ok: false as const, error: "This signing link is invalid." };
    if (token.used_at) return { ok: false as const, error: "This signing link has already been used." };
    if (new Date(token.expires_at).getTime() < Date.now()) return { ok: false as const, error: "This signing link has expired. Please request a new one." };
    return { ok: true as const, token };
  });

export const submitEmployeeLoanSignature = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      token: z.string().min(16),
      signer_name: z.string().min(1).max(200),
      signature_image: z.string().min(20).max(500_000),
      signature_method: z.enum(["typed", "drawn"]),
      consent: z.literal(true),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token_hash = sha256(data.token);

    // Re-validate token
    const { data: token } = await (supabaseAdmin as any)
      .from("employee_loan_signature_tokens")
      .select("*")
      .eq("token_hash", token_hash)
      .maybeSingle();
    if (!token) throw new Error("Invalid signing link");
    if (token.used_at) throw new Error("This link has already been used.");
    if (new Date(token.expires_at).getTime() < Date.now()) throw new Error("This link has expired.");

    // Capture request metadata
    let signer_ip: string | null = null;
    let signer_user_agent: string | null = null;
    try {
      signer_ip = getRequestIP({ xForwardedFor: true }) ?? null;
      signer_user_agent = getRequestHeader("user-agent") ?? null;
      // Fallback for IP
      if (!signer_ip) {
        const req = getRequest();
        signer_ip =
          req.headers.get("cf-connecting-ip") ||
          req.headers.get("x-real-ip") ||
          req.headers.get("x-forwarded-for") ||
          null;
      }
    } catch { /* best-effort */ }

    const snapshotStr = JSON.stringify(token.agreement_snapshot);
    const agreement_sha256 = sha256(snapshotStr);

    const { error: sigErr } = await (supabaseAdmin as any)
      .from("employee_loan_signatures")
      .insert({
        organization_id: token.organization_id,
        loan_id: token.loan_id,
        token_id: token.id,
        signer_type: "employee",
        signer_name: data.signer_name,
        signer_email: token.signer_email,
        signature_image: data.signature_image,
        signature_method: data.signature_method,
        signer_ip,
        signer_user_agent,
        agreement_snapshot: token.agreement_snapshot,
        agreement_sha256,
      });
    if (sigErr) throw new Error(sigErr.message);

    await (supabaseAdmin as any)
      .from("employee_loan_signature_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", token.id);

    await (supabaseAdmin as any)
      .from("employee_loans")
      .update({ status: "signed" })
      .eq("id", token.loan_id);

    return { ok: true as const, signed_at: new Date().toISOString() };
  });
