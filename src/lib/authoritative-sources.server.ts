// Server-only helpers/config for authoritative-sources.functions.ts.
// These live in a separate module because TanStack Start's server-fn code
// splitter (?tss-serverfn-split) breaks sibling module-scope references
// from within handler bodies. See docs/tanstack-serverfn-splitting.
import { z } from "zod";
import { gatewayFetch } from "@/lib/ai-bedrock.server";

export const AUTH_KINDS = [
  "state_sow",
  "provider_contract",
  "dspd_requirement",
  "dhs_requirement",
  "public_record",
  "tool_template",
  "other",
] as const;

export const NON_OBLIGATION_KINDS = new Set<string>(["tool_template"]);

export function stripHtmlToText(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 200) : null;
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  cleaned = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ");
  cleaned = cleaned.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { title, text: cleaned };
}

export const REQ_SYSTEM_PROMPT = `You are NECTAR, reading a Utah DSPD provider's State Scope of Work, provider contract, or DSPD/DHS requirement document.

Your job is to extract REQUIREMENTS the provider must meet — written as prose clauses, numbered sections, "the Provider shall…", "must maintain…", "required documents include…", etc. This is narrative text, NOT a structured table.

Return STRICT JSON only, shape:
{
  "requirements": [
    {
      "title": "short imperative phrase, <=140 chars",
      "description": "brief summary of the obligation in your own words, <=200 chars, do not copy long passages from the source.",
      "category": "audit_doc" | "obligation" | "rule" | "billing",
      "citation": "best locator you can identify, e.g. '§4.2', 'Section 3.1', 'page 7', 'Attachment A'",
      "applies_to": "company" | "staff" | "client"
    }
  ]
}

Rules:
- Only include items actually stated in the document text. Do NOT invent.
- "category":
    audit_doc  = a document the provider must produce, retain, or submit (PCSPs on file, incident reports, training records, etc.)
    obligation = a thing the provider must do (notify within X hours, conduct annual review, maintain insurance, etc.)
    rule       = a constraint / prohibition (no overlapping services, staff-to-client ratio caps, etc.)
    billing    = a billing/reimbursement requirement (EVV, claim timeliness, prior auth)
- Keep every field concise. Do not echo large sections of the document text. The goal is a compact list.
- Prefer fewer high-quality items over many vague ones.
- If the text contains no requirement language at all, return {"requirements": []}.`;

export const ReqItem = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(["audit_doc", "obligation", "rule", "billing"]).optional().nullable(),
  citation: z.string().max(200).optional().nullable(),
  applies_to: z.enum(["company", "staff", "client"]).optional().nullable(),
});
export const ReqExtraction = z.object({
  requirements: z.array(ReqItem).max(500).default([]),
});

export function chunkDocumentRanges(
  text: string,
  windowSize = 12_000,
  overlap = 800,
  maxChunks = 80,
): Array<[number, number]> {
  if (text.length <= windowSize) return [[0, text.length]];
  const ranges: Array<[number, number]> = [];
  let start = 0;
  while (start < text.length && ranges.length < maxChunks) {
    let end = Math.min(start + windowSize, text.length);
    if (end < text.length) {
      const searchFrom = Math.max(start + windowSize - 3_000, start + 1);
      const boundary = text.lastIndexOf("\n\n", end);
      if (boundary >= searchFrom) end = boundary;
    }
    ranges.push([start, end]);
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return ranges;
}

export function chunkDocumentText(
  text: string,
  windowSize = 12_000,
  overlap = 800,
  maxChunks = 80,
): string[] {
  return chunkDocumentRanges(text, windowSize, overlap, maxChunks).map(([s, e]) =>
    text.slice(s, e),
  );
}


export class ChunkParseError extends Error {}

export async function extractOnce(
  windowText: string,
  partLabel: string,
): Promise<Array<z.infer<typeof ReqItem>>> {
  const res = await gatewayFetch({
    // NOTE: this string is ignored by the Bedrock shim in
    // `src/lib/ai-bedrock.server.ts` (it uses BEDROCK_MODEL_ID). Kept as
    // "bedrock" so nobody reading the code thinks we're calling Google.
    model: "bedrock",
    messages: [
      { role: "system", content: REQ_SYSTEM_PROMPT },
      {
        role: "user",
        content: `${partLabel}\n\nDOCUMENT TEXT:\n\n${windowText}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 8192,
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
  if (res.status === 402)
    throw new Error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
  if (!res.ok) throw new ChunkParseError(`AI gateway error ${res.status}`);
  const json = await res.json();
  const finishReason: string | undefined = json.choices?.[0]?.finish_reason;
  const content: string = json.choices?.[0]?.message?.content ?? "{}";
  if (finishReason === "length") {
    throw new ChunkParseError("output truncated (hit max_tokens)");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new ChunkParseError("model returned invalid/truncated JSON");
  }
  const parsed = ReqExtraction.safeParse(raw);
  if (!parsed.success)
    throw new ChunkParseError("model output failed schema validation");
  return parsed.data.requirements;
}


export async function extractChunkWithRetry(
  windowText: string,
  partLabel: string,
): Promise<{ items: Array<z.infer<typeof ReqItem>>; failures: string[] }> {
  try {
    const items = await extractOnce(windowText, partLabel);
    return { items, failures: [] };
  } catch (err) {
    if (!(err instanceof ChunkParseError)) throw err;
    const mid = Math.floor(windowText.length / 2);
    const boundary = windowText.lastIndexOf("\n\n", mid + 2_000);
    const split = boundary > windowText.length * 0.2 ? boundary : mid;
    const halves = [windowText.slice(0, split), windowText.slice(split)];
    const items: Array<z.infer<typeof ReqItem>> = [];
    const failures: string[] = [];
    for (let h = 0; h < halves.length; h += 1) {
      try {
        const got = await extractOnce(halves[h], `${partLabel} (retry ${h + 1}/2)`);
        items.push(...got);
      } catch (retryErr) {
        if (!(retryErr instanceof ChunkParseError)) throw retryErr;
        failures.push(`${partLabel} half ${h + 1}: ${(retryErr as Error).message}`);
      }
    }
    return { items, failures };
  }
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function extractRequirementsFromText(text: string): Promise<{
  items: Array<z.infer<typeof ReqItem>>;
  chunkCount: number;
  chunkFailures: string[];
}> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const chunks = chunkDocumentText(text);
  const perChunk = await mapWithConcurrency(chunks, 3, (chunk, i) =>
    extractChunkWithRetry(chunk, `PART ${i + 1} OF ${chunks.length}`),
  );

  const merged: Array<z.infer<typeof ReqItem>> = [];
  const seen = new Set<string>();
  const chunkFailures: string[] = [];
  for (const r of perChunk) {
    chunkFailures.push(...r.failures);
    for (const item of r.items) {
      const dedupeKey = `${item.title.trim().toLowerCase()}|${(item.citation ?? "").trim().toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged.push(item);
    }
  }
  return { items: merged, chunkCount: chunks.length, chunkFailures };
}

export const EXPLAIN_SYSTEM_PROMPT = `You are NECTAR. Your job is to RESTATE a compliance requirement in plain, everyday English so a busy provider-admin can understand what it is saying.

STRICT RULES:
- You are NOT giving legal, compliance, or audit advice.
- You DO NOT tell the reader whether they are compliant, whether the rule applies to them, or what they "must" do beyond what the source already says.
- You DO NOT add obligations, deadlines, dollar figures, or specifics that are not in the source text.
- You stay close to the source. If the source is vague, your restatement is vague.
- If you cannot confidently restate it without inventing meaning, say so.

Return STRICT JSON only:
{
  "plain_language": "2-5 short sentences restating the requirement in plain English. No bullet points. No headings.",
  "key_terms": [
    { "term": "string from the source", "plain": "short plain-English gloss" }
  ],
  "confidence": "high" | "medium" | "low",
  "caveat": "one short sentence noting any ambiguity or what the reader should double-check in the source"
}

key_terms is at most 4 items. Only include terms that actually appear in the requirement text and are likely unfamiliar to a non-lawyer.`;

export const ExplainResp = z.object({
  plain_language: z.string().max(2000),
  key_terms: z
    .array(z.object({ term: z.string().max(120), plain: z.string().max(400) }))
    .max(6)
    .default([]),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  caveat: z.string().max(400).optional().nullable(),
});
