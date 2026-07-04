// Server-only helpers/config for authoritative-sources.functions.ts.
// These live in a separate module because TanStack Start's server-fn code
// splitter (?tss-serverfn-split) breaks sibling module-scope references
// from within handler bodies. See docs/tanstack-serverfn-splitting.
import { z } from "zod";
import { gatewayFetch } from "@/lib/ai-bedrock.server";
import {
  acquireBedrockSlot,
  recordBedrockTokens,
  RateLimitError,
} from "@/lib/nectar-rate-limit.server";

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

Output rules (STRICT — the parser will reject anything else):
- Return ONLY the raw JSON object. No markdown code fences. No prose before or after. No explanation.
- Single-line minified JSON, no unnecessary whitespace.
- Omit optional fields entirely when null (do not emit "citation": null).

Content rules:
- Only include items actually stated in the document text. Do NOT invent.
- "category":
    audit_doc  = a document the provider must produce, retain, or submit (PCSPs on file, incident reports, training records, etc.)
    obligation = a thing the provider must do (notify within X hours, conduct annual review, maintain insurance, etc.)
    rule       = a constraint / prohibition (no overlapping services, staff-to-client ratio caps, etc.)
    billing    = a billing/reimbursement requirement (EVV, claim timeliness, prior auth)
- Keep every field concise. Do not echo large sections of the document text. The goal is a compact list.
- Prefer fewer high-quality items over many vague ones.
- If the text contains no requirement language at all, return {"requirements":[]}.`;

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
  windowSize = 40_000,
  overlap = 4_000,
  maxChunks = 20,
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
  windowSize = 40_000,
  overlap = 4_000,
  maxChunks = 20,
): string[] {
  return chunkDocumentRanges(text, windowSize, overlap, maxChunks).map(([s, e]) =>
    text.slice(s, e),
  );
}


export class ChunkParseError extends Error {}
export class ChunkTruncationError extends Error {}

export class TransientAIError extends Error {
  retryAfterMs: number;

  constructor(message: string, retryAfterMs = 30_000) {
    super(message);
    this.name = "TransientAIError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function isTransientAIError(err: unknown): err is TransientAIError {
  return (
    err instanceof TransientAIError ||
    err instanceof RateLimitError ||
    /rate limit|temporar|timeout|timed out|429|503|502|504/i.test(
      (err as Error)?.message ?? "",
    )
  );
}

/**
 * Best-effort repair of model JSON output before parsing.
 *  - Strip surrounding markdown code fences (```json ... ``` or ``` ... ```).
 *  - Trim any prose before the first '{' and after the matching '}'.
 * Zero extra AI calls; runs entirely locally.
 */
export function repairJsonPayload(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return s;
  // Fenced block: ```json\n...\n``` or ```\n...\n```
  const fenced = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fenced) s = fenced[1].trim();
  // Extract first balanced { ... } object
  const first = s.indexOf("{");
  if (first < 0) return s;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = first; i < s.length; i += 1) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === "\\") { escape = true; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return s.slice(first, i + 1);
    }
  }
  return s.slice(first); // unbalanced — let JSON.parse fail
}

export async function extractOnce(
  windowText: string,
  partLabel: string,
  opts: { maxTokens?: number } = {},
): Promise<Array<z.infer<typeof ReqItem>>> {
  const maxTokens = opts.maxTokens ?? 16_000;

  // Wait for a rate-limit slot before actually calling Bedrock. This is the
  // ONLY place that talks to the model, so gating here is sufficient.
  await acquireBedrockSlot();

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
    max_tokens: maxTokens,
  });
  if (res.status === 429) {
    throw new TransientAIError("AI rate limit reached. Try again in a moment.");
  }
  if (res.status === 402)
    throw new Error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
  if ([408, 500, 502, 503, 504].includes(res.status)) {
    throw new TransientAIError(`AI temporarily unavailable (${res.status}). NECTAR will retry.`);
  }
  if (!res.ok) throw new ChunkParseError(`AI gateway error ${res.status}`);
  const json = await res.json();

  // Record token usage into the daily bucket (best-effort).
  const usage = (json?.usage ?? {}) as { total_tokens?: number; input_tokens?: number; output_tokens?: number };
  const totalTokens =
    typeof usage.total_tokens === "number"
      ? usage.total_tokens
      : (Number(usage.input_tokens ?? 0) + Number(usage.output_tokens ?? 0));
  if (totalTokens > 0) void recordBedrockTokens(totalTokens);

  const finishReason: string | undefined = json.choices?.[0]?.finish_reason;
  const content: string = json.choices?.[0]?.message?.content ?? "{}";
  if (finishReason === "length") {
    throw new ChunkTruncationError(`output truncated at max_tokens=${maxTokens}`);
  }
  // Local repair before parse — kills the vast majority of "invalid JSON"
  // errors caused by markdown fences or a preamble like "Here is the JSON:".
  const repaired = repairJsonPayload(content);
  let raw: unknown;
  try {
    raw = JSON.parse(repaired);
  } catch {
    throw new ChunkParseError("model returned invalid JSON (after repair)");
  }
  const parsed = ReqExtraction.safeParse(raw);
  if (!parsed.success)
    throw new ChunkParseError("model output failed schema validation");
  return parsed.data.requirements;
}

/**
 * Run ONE chunk through the model. No recursive splitting.
 *  - Transient errors (rate limit / 5xx) bubble up so the caller can retry.
 *  - True output truncation (finish_reason=length) triggers ONE retry with
 *    max_tokens doubled (up to a hard cap). If that still truncates, record
 *    a failure and move on.
 *  - Parse/schema errors record a failure immediately (splitting doesn't fix
 *    a formatting problem — repairJsonPayload already tried).
 */
export async function extractChunkOnce(
  windowText: string,
  partLabel: string,
): Promise<{ items: Array<z.infer<typeof ReqItem>>; failures: string[] }> {
  const attempts: Array<{ maxTokens: number }> = [
    { maxTokens: 16_000 },
    { maxTokens: 32_000 },
  ];
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      const items = await extractOnce(windowText, partLabel, attempts[i]);
      return { items, failures: [] };
    } catch (err) {
      if (isTransientAIError(err)) throw err; // caller decides how to back off
      lastErr = err as Error;
      if (err instanceof ChunkTruncationError && i < attempts.length - 1) {
        // Retry once with a larger output budget.
        continue;
      }
      // Parse/schema/other permanent error — record and stop.
      break;
    }
  }
  const msg = lastErr?.message ?? "unknown extraction error";
  return { items: [], failures: [`${partLabel}: ${msg}`] };
}

/** @deprecated Kept as a thin alias so existing imports don't break. */
export const extractChunkWithRetry = extractChunkOnce;

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
  const perChunk = await mapWithConcurrency(chunks, 1, (chunk, i) =>
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
