/**
 * Server functions for the fixed baseline staff-training requirements.
 *
 * Storage: rows live in `staff_baseline_training_completions` keyed by
 * (organization_id, staff_id, training_key). Evidence files reuse the
 * existing `hr-documents` bucket via `createHrDocumentUploadUrl` — we just
 * link the resulting hr_documents.id here.
 *
 * Nectar OCR: when an admin uploads a certificate, `attachBaselineCertificate`
 * downloads the file from the HR bucket and asks Lovable AI Gateway to read
 * the expiration date off it. The result is stored as a suggestion
 * (`nectar_suggested_expires = true`) so the admin sees a "Nectar set this —
 * edit if wrong" affordance.
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

async function assertCanWriteStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  staffId: string,
  viewerId: string,
) {
  if (viewerId === staffId) {
    throw new Error("Forbidden: staff may not edit own training completion");
  }
  const { data: canView, error } = await supabase.rpc("can_view_staff_pii", {
    _org: orgId,
    _staff: staffId,
    _viewer: viewerId,
  });
  if (error) throw new Error(error.message);
  if (!canView) throw new Error("Forbidden: not allowed to edit this staffer");
}

/** Mark a baseline training complete with a date (and optional expiration). */
export const markBaselineTrainingComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgStaffKey
      .extend({
        completed_date: z.string().date(),
        expires_at: z.string().date().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await assertCanWriteStaff(sb, data.organization_id, data.staff_id, userId);

    const t = baselineByKey(data.training_key);
    if (!t) throw new Error("Unknown training key");

    // Auto-fill expiration from default_validity_months if tracking expiration
    // and the admin didn't supply one (admin can always override later).
    let expires = data.expires_at ?? null;
    if (
      !expires &&
      t.tracks_expiration &&
      t.default_validity_months &&
      data.completed_date
    ) {
      const d = new Date(`${data.completed_date}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + t.default_validity_months);
      expires = d.toISOString().slice(0, 10);
    }

    const { error } = await sb
      .from("staff_baseline_training_completions")
      .upsert(
        {
          organization_id: data.organization_id,
          staff_id: data.staff_id,
          training_key: data.training_key,
          completed_date: data.completed_date,
          expires_at: expires,
          notes: data.notes ?? null,
          completed_by: userId,
          nectar_suggested_expires: false,
        },
        { onConflict: "organization_id,staff_id,training_key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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
    await assertCanWriteStaff(sb, data.organization_id, data.staff_id, userId);

    const t = baselineByKey(data.training_key);
    if (!t) throw new Error("Unknown training key");

    const today = new Date().toISOString().slice(0, 10);
    const completedDate = data.completed_date ?? today;

    // Optional OCR — Nectar reads the expiration date off the certificate.
    let nectarExpires: string | null = null;
    let nectarConfidence: number | null = null;
    if (data.run_ocr && t.tracks_expiration) {
      try {
        const ocr = await runNectarExpirationOcr(
          sb,
          data.organization_id,
          data.hr_document_id,
          t.title,
        );
        nectarExpires = ocr.expires_on;
        nectarConfidence = ocr.confidence;
      } catch (e) {
        // OCR is best-effort — never block the upload. Surface in notes.
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
    await assertCanWriteStaff(sb, data.organization_id, data.staff_id, userId);
    const { error } = await sb
      .from("staff_baseline_training_completions")
      .update({ expires_at: data.expires_at, nectar_suggested_expires: false })
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
    await assertCanWriteStaff(sb, data.organization_id, data.staff_id, userId);
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
// Nectar OCR helper
// ---------------------------------------------------------------------------

interface OcrResult {
  expires_on: string | null;
  confidence: number;
}

async function runNectarExpirationOcr(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  organizationId: string,
  hrDocumentId: string,
  trainingTitle: string,
): Promise<OcrResult> {
  // Look up the document + signed URL.
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

  // Download as base64 (Lovable AI Gateway accepts image_url or file blocks).
  const fileRes = await fetch(signed.signedUrl);
  if (!fileRes.ok) throw new Error(`Download failed (${fileRes.status})`);
  const buf = new Uint8Array(await fileRes.arrayBuffer());
  // Lowercase mime; default to image/jpeg if missing.
  const mime = (doc.mime_type || "").toLowerCase() || "image/jpeg";
  const base64 = base64Encode(buf);

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const contentBlocks: unknown[] = [
    {
      type: "text",
      text: `This is a "${trainingTitle}" certificate. Find the expiration date. Reply ONLY with compact JSON: {"expires_on":"YYYY-MM-DD"|null,"confidence":0..1}. If multiple dates appear, pick the latest one that is clearly labeled as expiration/expires/valid through. If no expiration is visible, return null.`,
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
  let parsed: { expires_on?: string | null; confidence?: number } = {};
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
  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;
  return { expires_on: expires, confidence };
}

function base64Encode(bytes: Uint8Array): string {
  // Worker runtime: btoa exists but expects a binary string. Chunk to avoid
  // exceeding the call-stack limit on large PDFs.
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // eslint-disable-next-line no-undef
  return btoa(s);
}
