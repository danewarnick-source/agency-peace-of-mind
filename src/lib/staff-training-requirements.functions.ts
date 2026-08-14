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
import { runNectarCertOcr } from "@/lib/nectar-cert-ocr";
import { compareNames } from "@/lib/name-matching";

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

/** Admin/manager OR — for trainings marked self_attest — the staffer themselves. */
async function assertCanCompleteBaseline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  viewerId: string,
  staffId: string,
  trainingKey: string,
) {
  const t = baselineByKey(trainingKey);
  if (t?.self_attest && viewerId === staffId) return;
  await assertAdminOrManager(supabase, orgId, viewerId);
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
    if (!supabase || !userId)
      return {
        ok: false,
        validation_status: "failed" as const,
        reasons: ["Not authenticated"],
        expires_at: null,
        completed_date: null,
        nectar_suggested: false,
        nectar_confidence: null,
        nectar_name: null,
        nectar_cert_type: null,
        nectar_completed_date: null,
        nectar_summary: null,
        profile_name: null,
        name_match: "unreadable" as const,
      };
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
    if (data.run_ocr && !t.auto_complete_on_upload) {
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

    // Deterministic validation against the per-training rule. Presence-only
    // trainings (auto_complete_on_upload) skip content/name validation
    // entirely — any uploaded document satisfies the requirement.
    const reasons: string[] = [];
    if (t.auto_complete_on_upload) {
      // no-op: reasons stays empty, validation always passes.
    } else if (ocrFailed) {
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
      // Presence-only trainings are complete the moment a document is on
      // file — no separate admin sign-off step.
      upsertRow.admin_signed_off_at = t.auto_complete_on_upload ? new Date().toISOString() : null;
      upsertRow.admin_signed_off_by = t.auto_complete_on_upload ? userId : null;
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
    if (!supabase || !userId) return { ok: false };
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
    if (!supabase || !userId) return { ok: false };
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await assertCanCompleteBaseline(sb, data.organization_id, userId, data.staff_id, data.training_key);

    const t = baselineByKey(data.training_key);
    const requiresUpload = t?.requires_upload !== false;

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
    if (requiresUpload) {
      if (!row?.evidence_document_id)
        throw new Error("Upload a valid certificate before signing off.");
      if (row.nectar_validation_status === "failed")
        throw new Error(
          "Nectar rejected this certificate — upload a valid one before signing off.",
        );
    }

    const completedDate =
      (row?.completed_date as string | null) ??
      new Date().toISOString().slice(0, 10);

    const { error } = await sb
      .from("staff_baseline_training_completions")
      .upsert(
        {
          organization_id: data.organization_id,
          staff_id: data.staff_id,
          training_key: data.training_key,
          admin_signed_off_at: new Date().toISOString(),
          admin_signed_off_by: userId,
          completed_date: completedDate,
          completed_by: userId,
        },
        { onConflict: "organization_id,staff_id,training_key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Revoke a prior sign-off (returns the row to "Awaiting sign-off"). */
export const revokeBaselineSignOff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgStaffKey.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: false };
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
    if (!supabase || !userId) return { ok: false };
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
// Name comparison (compareNames) and Nectar OCR (runNectarCertOcr) now live
// in shared modules — @/lib/name-matching and @/lib/nectar-cert-ocr — so
// Company Obligations can reuse the same validation logic. See imports above.
