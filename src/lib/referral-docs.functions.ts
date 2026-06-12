/**
 * CRM A1.5 — referral document upload + NECTAR parse-to-prefill.
 *
 * Parse is advisory: it returns a pre-fill draft only. The user reviews
 * and saves through the existing createReferral path. We NEVER auto-create.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, requireAnyPermission } from "@/lib/require-permission";


const orgOnly = z.object({ organization_id: z.string().uuid() });

// ─── Record an uploaded file (after client-side upload to storage) ────

const recordInput = orgOnly.extend({
  storage_path: z.string().min(1).max(1024),
  file_name: z.string().min(1).max(255),
  mime_type: z.string().max(120).optional().nullable(),
  size_bytes: z.number().int().nonnegative().optional().nullable(),
  draft_key: z.string().min(1).max(64).optional().nullable(),
  referral_id: z.string().uuid().optional().nullable(),
});

export const recordReferralDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => recordInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");
    const { data: row, error } = await supabase
      .from("referral_documents")
      .insert({
        organization_id: data.organization_id,
        referral_id: data.referral_id || null,
        draft_key: data.draft_key || null,
        storage_bucket: "referral-documents",
        storage_path: data.storage_path,
        file_name: data.file_name,
        mime_type: data.mime_type || null,
        size_bytes: data.size_bytes ?? null,
        uploaded_by: userId,
      })
      .select("id, storage_path, file_name, mime_type")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ─── Parse a stored doc OR pasted text via NECTAR (Bedrock vision) ────

const parseInput = orgOnly.extend({
  document_id: z.string().uuid().optional().nullable(),
  storage_path: z.string().max(1024).optional().nullable(),
  text: z.string().max(60_000).optional().nullable(),
});

export type ReferralPrefill = {
  first_name?: string;
  age?: number;
  gender?: string;
  date_of_birth?: string;
  location_city?: string;
  location_county?: string;
  disability_types?: string[];
  disability_level?: string;
  requested_codes?: string[];
  budget_note?: string;
  need_level?: string;
  description?: string;
  category?: "direct_support" | "rhs" | "hhs";
  support_coordinator_name?: string;
  support_coordinator_agency?: string;
  support_coordinator_email?: string;
  support_coordinator_phone?: string;
  due_date?: string;
  notes?: string;
};

export const parseReferralDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => parseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");

    let storagePath: string | null = data.storage_path ?? null;
    if (data.document_id) {
      const { data: doc, error } = await supabase
        .from("referral_documents")
        .select("id, organization_id, storage_path")
        .eq("id", data.document_id)
        .single();
      if (error || !doc) throw new Error("Document not found");
      if (doc.organization_id !== data.organization_id) throw new Error("Forbidden");
      storagePath = doc.storage_path;
    }

    if (!storagePath && !data.text) {
      throw new Error("Provide a document or pasted text to parse");
    }

    const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    if (!SUPABASE_URL) throw new Error("Server misconfigured");

    // Forward the caller's bearer so the edge function's verify_jwt passes.
    const authHeader = `Bearer ${(context.claims as { __raw?: string })?.__raw ?? ""}`;
    // Fallback: pull from supabase client's session if needed.
    const sessionToken =
      (await supabase.auth.getSession()).data.session?.access_token ?? "";
    const bearer = sessionToken ? `Bearer ${sessionToken}` : authHeader;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-referral-doc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: bearer,
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify(
        storagePath
          ? { bucket: "referral-documents", path: storagePath }
          : { text: data.text },
      ),
    });

    const payload = (await res.json().catch(() => ({}))) as {
      fields?: ReferralPrefill;
      error?: string;
      message?: string;
    };

    if (!res.ok) {
      // Update doc row with parse failure for the audit trail.
      if (data.document_id) {
        await supabase
          .from("referral_documents")
          .update({
            parse_status: res.status === 415 ? "skipped" : "failed",
            parse_error: payload.message || payload.error || `HTTP ${res.status}`,
          })
          .eq("id", data.document_id);
      }
      return {
        ok: false as const,
        status: res.status,
        message:
          payload.message ||
          payload.error ||
          "Parser unavailable — fill the referral manually.",
        fields: {} as ReferralPrefill,
      };
    }

    const fields = payload.fields ?? {};
    if (data.document_id) {
      await supabase
        .from("referral_documents")
        .update({ parse_status: "parsed", parsed_fields: fields, parse_error: null })
        .eq("id", data.document_id);
    }
    return { ok: true as const, fields };
  });

// ─── List documents attached to a referral ───────────────────────────

export const listReferralDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgOnly.extend({ referral_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);
    const { data: rows, error } = await supabase
      .from("referral_documents")
      .select(
        "id, file_name, mime_type, size_bytes, storage_path, parse_status, parse_error, created_at",
      )
      .eq("referral_id", data.referral_id)
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ─── Attach draft uploads to a referral after creation ───────────────

export const attachDraftDocumentsToReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgOnly
      .extend({
        draft_key: z.string().min(1).max(64),
        referral_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");
    const { error } = await supabase
      .from("referral_documents")
      .update({ referral_id: data.referral_id, draft_key: null })
      .eq("organization_id", data.organization_id)
      .eq("draft_key", data.draft_key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Signed URL for re-viewing the original doc ──────────────────────

export const getReferralDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgOnly.extend({ document_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAnyPermission(supabase, userId, data.organization_id, [
      "view_referrals",
      "manage_referrals",
    ]);
    const { data: doc, error } = await supabase
      .from("referral_documents")
      .select("id, organization_id, storage_path")
      .eq("id", data.document_id)
      .single();
    if (error || !doc) throw new Error("Not found");
    if (doc.organization_id !== data.organization_id) throw new Error("Forbidden");
    const { data: signed, error: sErr } = await supabase.storage
      .from("referral-documents")
      .createSignedUrl(doc.storage_path, 300);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Failed to sign");
    return { url: signed.signedUrl };
  });
