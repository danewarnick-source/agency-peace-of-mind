// NECTAR certificate OCR — reads an uploaded document (hr_documents row) and
// extracts cert type, name on the certificate, completion/expiration dates,
// and a short summary used for keyword-group validation. Extracted from
// staff-training-requirements.functions.ts (no behavior change) so it can
// also be used against obligation-evidence uploads for Company Obligations.
import { gatewayFetch, assertBedrockConfigured } from "@/lib/ai-bedrock.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface NectarCertOcrResult {
  expires_on: string | null;
  completed_on: string | null;
  name_on_certificate: string | null;
  cert_type: string | null;
  summary: string | null;
  confidence: number;
}

function guessMimeFromName(fileName: string | null): string | null {
  if (!fileName) return null;
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    default: return null;
  }
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

type TrainingLike = {
  title: string;
  validation: { cert_type_label: string; required_keyword_groups: Array<{ label: string; any_of: string[] }> };
};

/**
 * Runs Nectar OCR against an `hr_documents` row. `bucket` defaults to
 * 'hr-documents' (the baseline-training flow); pass 'obligation-evidence'
 * when the caller has an hr_documents row pointing there.
 */
export async function runNectarCertOcr(
  sb: AnySupabase,
  organizationId: string,
  hrDocumentId: string,
  training: TrainingLike,
  bucket: string = "hr-documents",
): Promise<NectarCertOcrResult> {
  const { data: doc, error: docErr } = await sb
    .from("hr_documents")
    .select("id, object_path, mime_type, file_name")
    .eq("id", hrDocumentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (docErr || !doc) throw new Error("Document not found for OCR");

  return runNectarCertOcrFromStoragePath(
    sb, bucket, doc.object_path, doc.mime_type ?? null, doc.file_name ?? null, training,
  );
}

/**
 * Same OCR call, but against a raw storage object path rather than an
 * `hr_documents` row — used by Company Obligations, whose evidence uploads
 * go straight to the `obligation-evidence` bucket without an hr_documents
 * row (see company_obligation_completions.upload_path).
 */
export async function runNectarCertOcrFromStoragePath(
  sb: AnySupabase,
  bucket: string,
  objectPath: string,
  mimeType: string | null,
  fileName: string | null,
  training: TrainingLike,
): Promise<NectarCertOcrResult> {
  const { data: signed, error: signErr } = await sb.storage
    .from(bucket)
    .createSignedUrl(objectPath, 600);
  if (signErr) throw new Error(signErr.message);

  const fileRes = await fetch(signed.signedUrl);
  if (!fileRes.ok) throw new Error(`Download failed (${fileRes.status})`);
  const buf = new Uint8Array(await fileRes.arrayBuffer());
  const mime = (mimeType || "").toLowerCase() || guessMimeFromName(fileName) || "image/jpeg";
  const base64 = base64Encode(buf);

  assertBedrockConfigured();

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
        filename: fileName ?? "certificate.pdf",
        file_data: `data:application/pdf;base64,${base64}`,
      },
    });
  } else {
    throw new Error(`Unsupported certificate type for OCR: ${mime}`);
  }

  const aiRes = await gatewayFetch({
    model: "bedrock",
    messages: [{ role: "user", content: contentBlocks }],
    response_format: { type: "json_object" },
  });
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
