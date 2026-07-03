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

/** Attach an uploaded hr_documents row as the evidence for a baseline training.
 *  Nectar runs OCR, validates against the per-training rule, and records
 *  pass/fail + reasons. A failed validation still saves the review (so the UI
 *  can show why) but does NOT attach the certificate as evidence and does
 *  NOT clear/grant any sign-off. */
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

    // OCR — read expiration, name, cert type, completion date, and a short
    // text summary of what Nectar actually saw.
    let nectarExpires: string | null = null;
    let nectarConfidence: number | null = null;
    let nectarName: string | null = null;
    let nectarCertType: string | null = null;
    let nectarCompletedDate: string | null = null;
    let nectarSummary: string | null = null;
    let ocrFailed = false;
    let ocrError: string | null = null;
    if (data.run_ocr) {
      try {
        const ocr = await runNectarCertOcr(
          sb,
          data.organization_id,
          data.hr_document_id,
          t,
        );
        nectarExpires = ocr.expires_on;
        nectarConfidence = ocr.confidence;
        nectarName = ocr.name_on_certificate;
        nectarCertType = ocr.cert_type;
        nectarCompletedDate = ocr.completed_on;
        nectarSummary = ocr.summary;
      } catch (e) {
        ocrFailed = true;
        ocrError = (e as Error).message;
        console.warn("[baseline cert] OCR failed", ocrError);
      }
    }

    const nameMatch = compareNames(profileName, nectarName);

    // Deterministic validation against the per-training rule.
    const reasons: string[] = [];
    if (ocrFailed) {
      reasons.push(
        `Nectar could not read this certificate${ocrError ? ` (${ocrError})` : ""}.`,
      );
    } else {
      // Keyword groups
      const summaryHaystack = (
        (nectarSummary ?? "") +
        " " +
        (nectarCertType ?? "")
      ).toLowerCase();
      for (const group of t.validation.required_keyword_groups) {
        const hit = group.any_of.some((kw) =>
          summaryHaystack.includes(kw.toLowerCase()),
        );
        if (!hit) {
          reasons.push(
            `Missing ${group.label} (expected one of: ${group.any_of.join(", ")}).`,
          );
        }
      }
      // Name check
      if (nameMatch === "unreadable") {
        reasons.push("Could not read the staff member's name on the certificate.");
      } else if (nameMatch === "mismatch") {
        reasons.push(
          `Name on certificate ("${nectarName}") does not match staff profile ("${profileName ?? "—"}").`,
        );
      }
      // Required dates
      if (t.validation.requires_completion_date && !nectarCompletedDate) {
        reasons.push("Missing certificate/completion date.");
      }
      if (t.validation.requires_expiration_date && !nectarExpires) {
        reasons.push("Missing expiration date.");
      }
    }

    const validationStatus: "passed" | "failed" =
      reasons.length === 0 ? "passed" : "failed";

    // Compute effective dates only when validation passed.
    const today = new Date().toISOString().slice(0, 10);
    const completedDate =
      validationStatus === "passed"
        ? (nectarCompletedDate ?? data.completed_date ?? today)
        : null;
    let expires: string | null = null;
    if (validationStatus === "passed") {
      expires = t.tracks_expiration ? nectarExpires : null;
      if (
        !expires &&
        t.tracks_expiration &&
        t.default_validity_months &&
        completedDate
      ) {
        const d = new Date(`${completedDate}T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() + t.default_validity_months);
        expires = d.toISOString().slice(0, 10);
      }
    }

    // Look up any existing row to preserve previous attached evidence when
    // the NEW upload fails validation (we never silently replace a good cert
    // with a bad one, and we never grant evidence based on a failed cert).
    const { data: existing } = await sb
      .from("staff_baseline_training_completions")
      .select(
        "id, evidence_document_id, completed_date, expires_at, admin_signed_off_at, admin_signed_off_by",
      )
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .eq("training_key", data.training_key)
      .maybeSingle();

    const passedEvidenceId =
      validationStatus === "passed"
        ? data.hr_document_id
        : (existing?.evidence_document_id ?? null);
    // Re-uploading a NEW passing cert clears any prior admin sign-off. A
    // failed upload never touches existing sign-off / evidence / dates.
    const upsertRow: Record<string, unknown> = {
      organization_id: data.organization_id,
      staff_id: data.staff_id,
      training_key: data.training_key,
      evidence_document_id: passedEvidenceId,
      nectar_suggested_expires:
        validationStatus === "passed" && nectarExpires !== null,
      nectar_name_match: nameMatch,
      nectar_extracted_name: nectarName,
      nectar_extracted_cert_type: nectarCertType,
      nectar_extracted_completed_date: nectarCompletedDate,
      nectar_extracted_summary: nectarSummary,
      nectar_validation_status: validationStatus,
      nectar_validation_reasons: reasons,
      nectar_reviewed_at: new Date().toISOString(),
    };
    if (validationStatus === "passed") {
      upsertRow.completed_date = completedDate;
      upsertRow.expires_at = expires;
      upsertRow.admin_signed_off_at = null;
      upsertRow.admin_signed_off_by = null;
      upsertRow.completed_by = userId;
    } else {
      // Preserve prior fields on failure.
      upsertRow.completed_date = existing?.completed_date ?? null;
      upsertRow.expires_at = existing?.expires_at ?? null;
      upsertRow.admin_signed_off_at = existing?.admin_signed_off_at ?? null;
      upsertRow.admin_signed_off_by = existing?.admin_signed_off_by ?? null;
    }

    const { error } = await sb
      .from("staff_baseline_training_completions")
      .upsert(upsertRow, {
        onConflict: "organization_id,staff_id,training_key",
      });
    if (error) throw new Error(error.message);

    return {
      ok: validationStatus === "passed",
      validation_status: validationStatus,
      reasons,
      expires_at: expires,
      completed_date: completedDate,
      nectar_suggested: validationStatus === "passed" && nectarExpires !== null,
      nectar_confidence: nectarConfidence,
      nectar_name: nectarName,
      nectar_cert_type: nectarCertType,
      nectar_completed_date: nectarCompletedDate,
      nectar_summary: nectarSummary,
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
      .select(
        "evidence_document_id, completed_date, nectar_validation_status",
      )
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .eq("training_key", data.training_key)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!row?.evidence_document_id)
      throw new Error("Upload a valid certificate before signing off.");
    if (row.nectar_validation_status === "failed")
      throw new Error(
        "Nectar rejected this certificate — upload a valid one before signing off.",
      );

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
  completed_on: string | null;
  name_on_certificate: string | null;
  cert_type: string | null;
  summary: string | null;
  confidence: number;
}

async function runNectarCertOcr(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  organizationId: string,
  hrDocumentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  training: { title: string; validation: { cert_type_label: string; required_keyword_groups: Array<{ label: string; any_of: string[] }> } },
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

  const keywordHint = training.validation.required_keyword_groups
    .map((g) => `- ${g.label}: any of [${g.any_of.join(", ")}]`)
    .join("\n");

  const contentBlocks: unknown[] = [
    {
      type: "text",
      text: `An admin is attempting to file this certificate as evidence of completing "${training.title}" (expected certificate type: "${training.validation.cert_type_label}").

Read the certificate carefully and extract:
1. cert_type: the name/type of the certificate AS IT APPEARS on the document (e.g. "CPR & First Aid", "BLS", "30-Day Training", "Person-Centered Thinking"). Do NOT guess — copy what the document actually says.
2. name_on_certificate: the full name of the person the cert was issued to.
3. completed_on: the issue / completion date (YYYY-MM-DD).
4. expires_on: the expiration / renewal date (YYYY-MM-DD). Pick the LATEST clearly-labeled expiration if multiple appear.
5. summary: a short plain-text summary (1-3 sentences) including ALL visible course/program names, training titles, certifying body, and any wording related to: ${training.validation.required_keyword_groups.map((g) => g.label).join("; ")}. This summary is used to verify the certificate matches the expected training type, so include the exact wording from the document.
6. confidence: 0..1, how confident you are.

Expected keywords for this training type (informational — DO NOT invent them if they are not on the cert):
${keywordHint}

Reply ONLY with compact JSON:
{"cert_type":"..."|null,"name_on_certificate":"..."|null,"completed_on":"YYYY-MM-DD"|null,"expires_on":"YYYY-MM-DD"|null,"summary":"..."|null,"confidence":0..1}

If a field is not clearly visible on the document, return null for that field. Do NOT fabricate.`,
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
        model: "bedrock",
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
    completed_on?: string | null;
    name_on_certificate?: string | null;
    cert_type?: string | null;
    summary?: string | null;
    confidence?: number;
  } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const dateOrNull = (v: unknown): string | null =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const strOrNull = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  return {
    expires_on: dateOrNull(parsed.expires_on),
    completed_on: dateOrNull(parsed.completed_on),
    name_on_certificate: strOrNull(parsed.name_on_certificate),
    cert_type: strOrNull(parsed.cert_type),
    summary: strOrNull(parsed.summary),
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0,
  };
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
