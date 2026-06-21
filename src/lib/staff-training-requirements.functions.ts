/**
 * Server functions for the fixed baseline staff-training requirements.
 *
 * Workflow:
 *  1. Admin uploads a certificate (PDF/image) — Nectar runs OCR to read
 *     both the expiration date and the name on the cert. Nectar compares
 *     the cert name to the staffer's profile name and records a match /
 *     mismatch / unreadable result. Re-uploading a cert clears any prior
 *     admin sign-off (the new cert must be re-verified).
 *  2. Admin reviews Nectar's result and explicitly signs off. ONLY then is
 *     the training considered "Completed" (green). No certificate or no
 *     sign-off → "Incomplete" (red).
 *
 * Storage: rows live in `staff_baseline_training_completions` keyed by
 * (organization_id, staff_id, training_key). Evidence files reuse the
 * existing `hr-documents` bucket via `createHrDocumentUploadUrl`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { baselineByKey } from "@/lib/staff-training-requirements";

const orgStaffKey = z.object({
  organization_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  training_key: z.string().min(1).max(64),
});

async function assertAdminOrManager(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  viewerId: string,
) {
  const { data: isAdmin, error } = await supabase.rpc(
    "is_org_admin_or_manager",
    { _org: orgId, _user: viewerId },
  );
  if (error) throw new Error(error.message);
  if (!isAdmin)
    throw new Error("Forbidden: admin or manager role required");
}

/** Attach an uploaded hr_documents row as the evidence for a baseline training. */
export const attachBaselineCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgStaffKey
      .extend({
        hr_document_id: z.string().uuid(),
        completed_date: z.string().date().optional(),
        run_ocr: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await assertAdminOrManager(sb, data.organization_id, userId);

    const t = baselineByKey(data.training_key);
    if (!t) throw new Error("Unknown training key");

    // Look up the staffer's profile name for Nectar's name-match.
    const { data: prof } = await sb
      .from("profiles")
      .select("full_name")
      .eq("id", data.staff_id)
      .maybeSingle();
    const profileName: string | null =
      (prof?.full_name as string | null) ?? null;

    const today = new Date().toISOString().slice(0, 10);
    const completedDate = data.completed_date ?? today;

    // OCR — read expiration AND name on certificate; compare to profile.
    let nectarExpires: string | null = null;
    let nectarConfidence: number | null = null;
    let nectarName: string | null = null;
    let nameMatch: "match" | "mismatch" | "unreadable" | null = null;
    if (data.run_ocr) {
      try {
        const ocr = await runNectarCertOcr(
          sb,
          data.organization_id,
          data.hr_document_id,
          t.title,
        );
        nectarExpires = t.tracks_expiration ? ocr.expires_on : null;
        nectarConfidence = ocr.confidence;
        nectarName = ocr.name_on_certificate;
        nameMatch = compareNames(profileName, nectarName);
      } catch (e) {
        console.warn("[baseline cert] OCR failed", (e as Error).message);
      }
    }

    // Fallback expiration: default_validity_months from completed_date.
    let expires = nectarExpires;
    if (!expires && t.tracks_expiration && t.default_validity_months) {
      const d = new Date(`${completedDate}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + t.default_validity_months);
      expires = d.toISOString().slice(0, 10);
    }

    // Re-uploading a cert ALWAYS clears any prior admin sign-off.
    const { error } = await sb
      .from("staff_baseline_training_completions")
      .upsert(
        {
          organization_id: data.organization_id,
          staff_id: data.staff_id,
          training_key: data.training_key,
          completed_date: completedDate,
          expires_at: expires,
          evidence_document_id: data.hr_document_id,
          nectar_suggested_expires: nectarExpires !== null,
          nectar_name_match: nameMatch,
          nectar_extracted_name: nectarName,
          nectar_reviewed_at: new Date().toISOString(),
          admin_signed_off_at: null,
          admin_signed_off_by: null,
          completed_by: userId,
        },
        { onConflict: "organization_id,staff_id,training_key" },
      );
    if (error) throw new Error(error.message);

    return {
      ok: true,
      expires_at: expires,
      nectar_suggested: nectarExpires !== null,
      nectar_confidence: nectarConfidence,
      nectar_name: nectarName,
      profile_name: profileName,
      name_match: nameMatch,
    };
  });

/** Admin override of the expiration date (clears the "Nectar set this" flag). */
export const setBaselineExpiration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgStaffKey
      .extend({ expires_at: z.string().date().nullable() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await assertAdminOrManager(sb, data.organization_id, userId);
    const { error } = await sb
      .from("staff_baseline_training_completions")
      .update({ expires_at: data.expires_at, nectar_suggested_expires: false })
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .eq("training_key", data.training_key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin sign-off — marks the training Completed (green). Requires a cert. */
export const adminSignOffBaselineCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgStaffKey.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await assertAdminOrManager(sb, data.organization_id, userId);

    const { data: row, error: rErr } = await sb
      .from("staff_baseline_training_completions")
      .select("evidence_document_id, completed_date")
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .eq("training_key", data.training_key)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!row?.evidence_document_id)
      throw new Error("Upload a certificate before signing off.");

    const completedDate =
      (row.completed_date as string | null) ??
      new Date().toISOString().slice(0, 10);

    const { error } = await sb
      .from("staff_baseline_training_completions")
      .update({
        admin_signed_off_at: new Date().toISOString(),
        admin_signed_off_by: userId,
        completed_date: completedDate,
        completed_by: userId,
      })
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .eq("training_key", data.training_key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Revoke a prior sign-off (returns the row to "Awaiting sign-off"). */
export const revokeBaselineSignOff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgStaffKey.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await assertAdminOrManager(sb, data.organization_id, userId);
    const { error } = await sb
      .from("staff_baseline_training_completions")
      .update({ admin_signed_off_at: null, admin_signed_off_by: null })
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .eq("training_key", data.training_key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Clear a baseline completion (admin only). */
export const clearBaselineCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgStaffKey.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await assertAdminOrManager(sb, data.organization_id, userId);
    const { error } = await sb
      .from("staff_baseline_training_completions")
      .delete()
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .eq("training_key", data.training_key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Name comparison
// ---------------------------------------------------------------------------

function normalizeName(s: string | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[.,'’"`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tolerant name comparison — handles middle initials and reordering. */
function compareNames(
  profileName: string | null,
  certName: string | null,
): "match" | "mismatch" | "unreadable" {
  if (!certName || !certName.trim()) return "unreadable";
  if (!profileName || !profileName.trim()) return "unreadable";
  const a = normalizeName(profileName).split(" ").filter(Boolean);
  const b = normalizeName(certName).split(" ").filter(Boolean);
  if (a.length === 0 || b.length === 0) return "unreadable";
  // First + last name match (ignore middle names/initials)
  const aFirst = a[0];
  const aLast = a[a.length - 1];
  const bFirst = b[0];
  const bLast = b[b.length - 1];
  if (aFirst === bFirst && aLast === bLast) return "match";
  // Allow reversed order (Last, First)
  if (aFirst === bLast && aLast === bFirst) return "match";
  return "mismatch";
}

// ---------------------------------------------------------------------------
// Nectar OCR helper
// ---------------------------------------------------------------------------

interface OcrResult {
  expires_on: string | null;
  name_on_certificate: string | null;
  confidence: number;
}

async function runNectarCertOcr(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  organizationId: string,
  hrDocumentId: string,
  trainingTitle: string,
): Promise<OcrResult> {
  const { data: doc, error: docErr } = await sb
    .from("hr_documents")
    .select("id, object_path, mime_type, file_name")
    .eq("id", hrDocumentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (docErr || !doc) throw new Error("Document not found for OCR");

  const { data: signed, error: signErr } = await sb.storage
    .from("hr-documents")
    .createSignedUrl(doc.object_path, 600);
  if (signErr) throw new Error(signErr.message);

  const fileRes = await fetch(signed.signedUrl);
  if (!fileRes.ok) throw new Error(`Download failed (${fileRes.status})`);
  const buf = new Uint8Array(await fileRes.arrayBuffer());
  const mime = (doc.mime_type || "").toLowerCase() || "image/jpeg";
  const base64 = base64Encode(buf);

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const contentBlocks: unknown[] = [
    {
      type: "text",
      text: `This is a "${trainingTitle}" certificate. Extract:
1. The expiration date (look for "expires", "expiration", "valid through", "valid until"). Pick the LATEST clearly-labeled expiration date if several appear.
2. The full name of the person the certificate was issued to.

Reply ONLY with compact JSON:
{"expires_on":"YYYY-MM-DD"|null,"name_on_certificate":"Full Name"|null,"confidence":0..1}

If either field is not clearly visible, return null for that field.`,
    },
  ];
  if (mime.startsWith("image/")) {
    contentBlocks.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${base64}` },
    });
  } else if (mime === "application/pdf") {
    contentBlocks.push({
      type: "file",
      file: {
        filename: doc.file_name ?? "certificate.pdf",
        file_data: `data:application/pdf;base64,${base64}`,
      },
    });
  } else {
    throw new Error(`Unsupported certificate type for OCR: ${mime}`);
  }

  const aiRes = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: contentBlocks }],
        response_format: { type: "json_object" },
      }),
    },
  );
  if (!aiRes.ok) {
    const t = await aiRes.text();
    throw new Error(`Nectar OCR ${aiRes.status}: ${t.slice(0, 200)}`);
  }
  const json = await aiRes.json();
  const raw = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: {
    expires_on?: string | null;
    name_on_certificate?: string | null;
    confidence?: number;
  } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const expires =
    typeof parsed.expires_on === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(parsed.expires_on)
      ? parsed.expires_on
      : null;
  const name =
    typeof parsed.name_on_certificate === "string" &&
    parsed.name_on_certificate.trim().length > 0
      ? parsed.name_on_certificate.trim()
      : null;
  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;
  return { expires_on: expires, name_on_certificate: name, confidence };
}

function base64Encode(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // eslint-disable-next-line no-undef
  return btoa(s);
}
