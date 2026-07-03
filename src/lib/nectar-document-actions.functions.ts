import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { gatewayFetch } from "@/lib/ai-bedrock.server";

import {
  DETECTED_TYPES,
  DETECTED_TYPE_LABELS,
  liveActionsForType,
  type DetectedDocType,
} from "./nectar-capability-registry";

// =============================================================
// NECTAR Document Detection + Offer
// - detectAndOfferActions: classify (AI) + return curated live actions
// - proposeStaffChecklistFromDocument: live propose-and-confirm handler
// add_to_authoritative_sources stays in authoritative-sources.functions.ts
// (already-working flow); the offer UI dispatches to it directly.
// =============================================================

type DocRow = {
  id: string;
  organization_id: string;
  title: string;
  file_name: string;
  raw_text: string | null;
  metadata: Record<string, unknown> | null;
};

async function fetchDoc(
  supabase: ReturnType<typeof getSupabase>,
  documentId: string,
): Promise<DocRow> {
  const { data, error } = await supabase
    .from("nectar_documents")
    .select("id, organization_id, title, file_name, raw_text, metadata")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Document not found");
  return data as DocRow;
}

// Tiny type bridge so the helper signature compiles without exporting the
// internal Supabase generic.
function getSupabase(ctx: { supabase: unknown }): {
  from: (t: string) => {
    select: (s: string) => {
      eq: (
        col: string,
        v: string,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
    insert: (
      rows: ReadonlyArray<Record<string, unknown>>,
    ) => Promise<{ error: { message: string } | null }>;
  };
} {
  return ctx.supabase as never;
}

// ---------- AI classifier ----------

const CLASSIFY_SYSTEM = `You are NECTAR's document type classifier for a Utah DSPD provider platform.

Classify the document into EXACTLY one of these types:
- staff_checklist: a staff legal/compliance checklist (employee onboarding/compliance list)
- scope_of_work: a DSPD/DHHS Scope of Work, state contract, or provider agreement
- insurance_certificate: certificate of insurance or liability coverage
- training_certificate: a training, CPR, First-Aid, or certification completion document
- policy_document: an agency policy, handbook, or written procedure
- client_intake: client intake, consent, authorization, or referral paperwork tied to one person
- unknown: cannot confidently classify

Return STRICT JSON: { "type": <one of the above>, "confidence": <0..1>, "reason": <short string> }
Be conservative — return "unknown" with low confidence rather than guessing.`;

async function classifyWithAI(
  text: string,
  fileName: string,
): Promise<{ type: DetectedDocType; confidence: number; reason: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { type: "unknown", confidence: 0, reason: "no_api_key" };
  const snippet = (text || "").slice(0, 12000);
  const res = await gatewayFetch({
      model: "bedrock",
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM },
        {
          role: "user",
          content: `FILE NAME: ${fileName}\n\nDOCUMENT TEXT:\n\n${snippet || "(no extracted text)"}`,
        },
      ],
      response_format: { type: "json_object" },
    });
  if (!res.ok) return { type: "unknown", confidence: 0, reason: `ai_${res.status}` };
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  let parsed: { type?: string; confidence?: number; reason?: string } = {};
  try {
    parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
  } catch {
    parsed = {};
  }
  const t = (DETECTED_TYPES as ReadonlyArray<string>).includes(parsed.type ?? "")
    ? (parsed.type as DetectedDocType)
    : "unknown";
  const c =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;
  return { type: t, confidence: c, reason: String(parsed.reason ?? "") };
}

// ---------- 1. Detect + offer ----------

export const detectAndOfferActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ documentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const doc = await fetchDoc(supabase as never, data.documentId);
    await requireOrgMembership(
      supabase,
      userId,
      doc.organization_id,
      "employee",
    );

    // Reuse a cached detection if present and confident enough.
    const md = (doc.metadata ?? {}) as {
      detected_type?: DetectedDocType;
      detected_type_confidence?: number;
    };
    let detected: { type: DetectedDocType; confidence: number; reason: string };
    if (md.detected_type && typeof md.detected_type_confidence === "number") {
      detected = {
        type: md.detected_type,
        confidence: md.detected_type_confidence,
        reason: "cached",
      };
    } else {
      detected = await classifyWithAI(doc.raw_text ?? "", doc.file_name);
      const nextMd = {
        ...(doc.metadata ?? {}),
        detected_type: detected.type,
        detected_type_confidence: detected.confidence,
        detected_type_reason: detected.reason,
        detected_at: new Date().toISOString(),
      };
      await supabase
        .from("nectar_documents")
        .update({ metadata: nextMd })
        .eq("id", doc.id);
    }

    const actions = liveActionsForType(detected.type);
    const friendly = DETECTED_TYPE_LABELS[detected.type];
    const prompt =
      detected.type === "unknown"
        ? "I've added this to your sources. I can extract its key items or set reminders for any dates I find."
        : `I see you've uploaded your ${friendly}. Here's what I can do with it:`;

    return {
      documentId: doc.id,
      detectedType: detected.type,
      detectedTypeLabel: friendly,
      confidence: detected.confidence,
      prompt,
      actions: actions.map((a) => ({
        action_key: a.action_key,
        label: a.label,
        helper: a.helper,
        handler: a.handler,
      })),
    };
  });

// ---------- 2. Propose staff checklist from document (live handler) ----------

const CHECKLIST_SYSTEM = `Extract a STAFF compliance/legal checklist from the provided document text.

Return STRICT JSON: { "items": [ { "title": string, "category": string|null, "source_citation": string|null, "renewal": string|null } ] }
- title: short imperative item name (e.g. "BCI background check", "CPR certification")
- category: a short bucket like "Background", "Training", "Documents"
- source_citation: the section/clause/page the item came from, if identifiable
- renewal: e.g. "annual", "biennial", null
Only include items that are clearly STAFF-applicable. Skip anything that's advice or commentary.`;

type DraftItem = {
  title: string;
  category: string | null;
  source_citation: string | null;
  renewal: string | null;
};

async function extractChecklistItems(text: string): Promise<DraftItem[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return [];
  const res = await gatewayFetch({
      model: "bedrock",
      messages: [
        { role: "system", content: CHECKLIST_SYSTEM },
        { role: "user", content: text.slice(0, 50000) },
      ],
      response_format: { type: "json_object" },
    });
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  let parsed: { items?: unknown[] } = {};
  try {
    parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
  } catch {
    parsed = {};
  }
  const items: DraftItem[] = [];
  for (const raw of (parsed.items ?? []) as Array<Record<string, unknown>>) {
    const title = String(raw.title ?? "").trim();
    if (!title) continue;
    items.push({
      title: title.slice(0, 200),
      category: raw.category ? String(raw.category).slice(0, 80) : null,
      source_citation: raw.source_citation
        ? String(raw.source_citation).slice(0, 200)
        : null,
      renewal: raw.renewal ? String(raw.renewal).slice(0, 40) : null,
    });
  }
  return items.slice(0, 100);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export const proposeStaffChecklistFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ documentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const doc = await fetchDoc(supabase as never, data.documentId);
    await requireOrgMembership(
      supabase,
      userId,
      doc.organization_id,
      "manager",
    );
    if (!doc.raw_text) {
      throw new Error("Document is still being parsed — try again in a moment.");
    }

    const items = await extractChecklistItems(doc.raw_text);
    if (!items.length) {
      return { proposed: 0, message: "No checklist items detected." };
    }

    const rows = items.map((it) => ({
      organization_id: doc.organization_id,
      source_document_id: doc.id,
      origin: "document",
      requirement_key: `doc_${doc.id.slice(0, 8)}_${slug(it.title)}`,
      title: it.title,
      category: it.category,
      source_citation: it.source_citation,
      approval_state: "nectar_drafted",
      review_status: "needs_attention",
      metadata: {
        scope: "hr_staff_checklist",
        renewal: it.renewal,
        proposed_by: "nectar_document_action",
        proposed_at: new Date().toISOString(),
      },
    }));

    const { error } = await supabase
      .from("nectar_requirements")
      .insert(rows as never);
    if (error) throw new Error(error.message);

    return {
      proposed: rows.length,
      message: `Drafted ${rows.length} item${rows.length === 1 ? "" : "s"} for your review. Nothing is live until you confirm.`,
    };
  });
