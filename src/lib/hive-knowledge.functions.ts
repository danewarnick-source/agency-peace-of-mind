import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gatewayFetch } from "@/lib/ai-bedrock.server";

// ─────────────────────────────────────────────────────────────────────────────
// Steve Guide-me — retrieval over the authored hive_knowledge table ONLY.
// No org data, no client data, no PHI reachable from this module.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureExecutive(supabase: any, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("hive_executives")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Executive access required.");
}

export interface HiveKnowledgeRow {
  id: string;
  title: string;
  slug: string;
  category: string;
  body: string;
  related_feature_key: string | null;
  related_route: string | null;
  updated_at: string;
}

// ─── List / Read ─────────────────────────────────────────────────────────────

export const listHiveKnowledge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HiveKnowledgeRow[]> => {
    await ensureExecutive(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("hive_knowledge")
      .select("id, title, slug, category, body, related_feature_key, related_route, updated_at")
      .order("category")
      .order("title");
    if (error) throw error;
    return (data ?? []) as HiveKnowledgeRow[];
  });

// ─── Upsert / Delete ─────────────────────────────────────────────────────────

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2).max(200),
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/, "lowercase, digits, hyphens"),
  category: z.string().min(2).max(80),
  body: z.string().min(10).max(20000),
  related_feature_key: z.string().max(120).nullable().optional(),
  related_route: z.string().max(200).nullable().optional(),
});

export const upsertHiveKnowledgeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureExecutive(context.supabase, context.userId);
    const payload = {
      title: data.title,
      slug: data.slug,
      category: data.category,
      body: data.body,
      related_feature_key: data.related_feature_key ?? null,
      related_route: data.related_route ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("hive_knowledge").update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("hive_knowledge")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: (row as { id: string }).id };
  });

export const deleteHiveKnowledgeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureExecutive(context.supabase, context.userId);
    const { error } = await context.supabase.from("hive_knowledge").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ─── Ask Steve (Guide-me retrieval + LLM composition) ────────────────────────

export interface SteveSource {
  title: string;
  slug: string;
  category: string;
  related_feature_key: string | null;
  related_route: string | null;
}

export interface SteveAnswer {
  answer: string;
  sources: SteveSource[];
  found: boolean;
}

const askSchema = z.object({
  question: z.string().min(2).max(1000),
  routeContext: z.string().max(200).nullable().optional(),
  featureKeyContext: z.string().max(120).nullable().optional(),
});

/**
 * Tokenize a natural-language question into a Postgres tsquery-safe prefix
 * expression. Falls back to a plain trigram-ish OR list if empty.
 */
function toTsQuery(q: string): string {
  const words = q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .slice(0, 12);
  if (words.length === 0) return "";
  return words.map((w) => `${w}:*`).join(" | ");
}
const STOPWORDS = new Set([
  "the","and","for","with","how","what","when","where","why","who","does","this","that",
  "from","have","has","are","was","were","can","could","would","should","about","into",
  "you","your","our","their","them","his","her","its","not","but","get","got",
]);

export const askSteve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => askSchema.parse(d))
  .handler(async ({ data, context }): Promise<SteveAnswer> => {
    await ensureExecutive(context.supabase, context.userId);

    // ── 1. Retrieve candidate articles (keyword ILIKE for now) ──
    const words = data.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
      .slice(0, 8);
    let rows: HiveKnowledgeRow[] = [];
    if (words.length > 0) {
      // OR each word across title/body/category so any keyword can hit
      const orClauses = words.flatMap((w) => [
        `title.ilike.%${w}%`,
        `body.ilike.%${w}%`,
        `category.ilike.%${w}%`,
      ]).join(",");
      const { data: r2, error } = await context.supabase
        .from("hive_knowledge")
        .select("id, title, slug, category, body, related_feature_key, related_route, updated_at")
        .or(orClauses)
        .limit(8);
      if (error) throw error;
      rows = (r2 ?? []) as HiveKnowledgeRow[];
      // Rank client-side by keyword hit count
      rows = rows
        .map((r) => {
          const hay = `${r.title} ${r.body} ${r.category}`.toLowerCase();
          const score = words.reduce((s, w) => s + (hay.includes(w) ? (r.title.toLowerCase().includes(w) ? 3 : 1) : 0), 0);
          return { r, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((x) => x.r);
    }


    // Bias by feature/route context if provided
    if (data.featureKeyContext || data.routeContext) {
      const { data: ctxRows } = await context.supabase
        .from("hive_knowledge")
        .select("id, title, slug, category, body, related_feature_key, related_route, updated_at")
        .or([
          data.featureKeyContext ? `related_feature_key.eq.${data.featureKeyContext}` : null,
          data.routeContext ? `related_route.eq.${data.routeContext}` : null,
        ].filter(Boolean).join(","))
        .limit(3);
      const seen = new Set(rows.map((r) => r.id));
      for (const r of (ctxRows ?? []) as HiveKnowledgeRow[]) {
        if (!seen.has(r.id)) rows.unshift(r); // context-relevant to front
      }
      rows = rows.slice(0, 6);
    }

    if (rows.length === 0) {
      return {
        answer:
          "I couldn't find that in the HIVE knowledge base yet. Try rephrasing, or add an article for it in Configuration → Knowledge Base so I can answer next time.",
        sources: [],
        found: false,
      };
    }

    // ── 2. Compose with the model, grounded ONLY in retrieved articles ──
    const contextBlock = rows
      .map(
        (r, i) =>
          `[${i + 1}] TITLE: ${r.title}\nCATEGORY: ${r.category}\nROUTE: ${r.related_route ?? "—"}\nFEATURE: ${r.related_feature_key ?? "—"}\nBODY:\n${r.body}`,
      )
      .join("\n\n---\n\n");

    const system = `You are Steve, the Executive Command Center assistant for HIVE. You are in "Guide-me" mode: a documentation retrieval assistant.

STRICT RULES:
- Answer ONLY from the CONTEXT ARTICLES below.
- If the answer is not in the context, say so plainly and suggest the most likely surface (e.g. "Try Configuration → Feature Registry") — never fabricate steps, routes, or button names.
- You have NO access to organization data, client records, financials, billing rows, PHI, or anything outside these authored articles. If asked, say that isn't a capability you have in this phase.
- Cite the articles you used inline as [1], [2], etc. matching the numbered CONTEXT ARTICLES.
- Be concise: 2–6 sentences, plain English, second person. Use short bullet steps when the answer is procedural.
- Never invent a feature_key, route path, or UI element that isn't in the context.

OUTPUT FORMAT — return STRICT JSON only, no markdown, no code fences:
{"answer":"<your answer with [n] citations>","used":[<article indices you actually used, 1-based>]}`;

    const currentContext = [
      data.routeContext ? `CURRENT ROUTE: ${data.routeContext}` : null,
      data.featureKeyContext ? `CURRENT FEATURE: ${data.featureKeyContext}` : null,
    ].filter(Boolean).join("\n");

    const user = `${currentContext ? currentContext + "\n\n" : ""}QUESTION:
"""
${data.question}
"""

CONTEXT ARTICLES:
${contextBlock}`;

    const res = await gatewayFetch({
      model: "bedrock",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    if (res.status === 429) throw new Error("Steve is rate-limited. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`Steve error (${res.status}).`);

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    let parsed: { answer?: string; used?: number[] } = {};
    try { parsed = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } } }

    const answer = (parsed.answer ?? "").trim() ||
      "I found some articles but couldn't compose an answer. Open them directly:";
    const usedIdx = Array.isArray(parsed.used) && parsed.used.length
      ? parsed.used.map((n) => Number(n)).filter((n) => n >= 1 && n <= rows.length)
      : rows.map((_, i) => i + 1);
    const sources: SteveSource[] = usedIdx.map((n) => {
      const r = rows[n - 1];
      return {
        title: r.title,
        slug: r.slug,
        category: r.category,
        related_feature_key: r.related_feature_key,
        related_route: r.related_route,
      };
    });

    return { answer, sources, found: true };
  });
