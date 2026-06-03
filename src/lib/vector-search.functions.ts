import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

const EMBED_MODEL = "google/gemini-embedding-001";
const EMBED_DIMS = 1536;
const ROUTER_MODEL = "google/gemini-2.5-flash";

interface SearchInput {
  query: string;
  organizationId: string;
  matchCount: number;
}
interface BackfillInput {
  organizationId: string;
  limit: number;
}

function validateSearch(input: unknown): SearchInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const query = typeof i.query === "string" ? i.query.trim() : "";
  const organizationId = typeof i.organizationId === "string" ? i.organizationId : "";
  if (query.length === 0 || query.length > 2000) throw new Error("Query must be 1–2000 chars.");
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid organization.");
  const matchCount =
    typeof i.matchCount === "number" && i.matchCount > 0 && i.matchCount <= 200
      ? Math.floor(i.matchCount)
      : 50;
  return { query, organizationId, matchCount };
}

function validateBackfill(input: unknown): BackfillInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const organizationId = typeof i.organizationId === "string" ? i.organizationId : "";
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid organization.");
  const limit =
    typeof i.limit === "number" && i.limit > 0 && i.limit <= 100 ? Math.floor(i.limit) : 25;
  return { organizationId, limit };
}

async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000), dimensions: EMBED_DIMS }),
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Please retry shortly.");
  if (res.status === 402) throw new Error("AI workspace credits exhausted.");
  if (!res.ok) throw new Error(`Embedding error (${res.status}).`);
  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) throw new Error("Malformed embedding response.");
  return vec;
}

// ────────────────────────────────────────────────────────────────
// 🧠 LLM SQL Router — turns a sentence into structured filters.
// ────────────────────────────────────────────────────────────────
type RouterResult = {
  caregiver_name: string | null;
  client_name: string | null;
  hour_min: number | null;
  date_from: string | null; // ISO
  date_to: string | null;   // ISO
  requires_semantic: boolean;
};

async function routeQueryWithLLM(query: string): Promise<RouterResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");
  const today = new Date().toISOString().slice(0, 10);

  const system = `You are a SQL router for a caregiver timesheet ledger. Today is ${today}.
Parse the admin's natural-language request and return STRICT JSON with these keys:
  caregiver_name (string|null)   - first/last name of a staff member if mentioned
  client_name    (string|null)   - first/last name of a client/patient if mentioned
  hour_min       (integer|null)  - 0-23 lower bound on clock-in hour (e.g. "after 3pm"=15, "night shift"=18)
  date_from      (string|null)   - ISO date YYYY-MM-DD lower bound
  date_to        (string|null)   - ISO date YYYY-MM-DD upper bound (inclusive)
  requires_semantic (boolean)    - true ONLY if the user describes an ACTIVITY or NARRATIVE concept that needs
                                   meaning-matching against shift notes (e.g. "practiced money management",
                                   "went into the community", "showed aggression"). false for pure name/date/time lookups.
Return ONLY the JSON object, nothing else.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: ROUTER_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: query },
      ],
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Please retry shortly.");
  if (res.status === 402) throw new Error("AI workspace credits exhausted.");
  if (!res.ok) throw new Error(`Router error (${res.status}).`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { parsed = {}; }

  const str = (v: unknown) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : null;
  const iso = (v: unknown) => {
    const s = str(v);
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  const hr = num(parsed.hour_min);
  return {
    caregiver_name: str(parsed.caregiver_name),
    client_name: str(parsed.client_name),
    hour_min: hr != null && hr >= 0 && hr <= 23 ? hr : null,
    date_from: iso(parsed.date_from),
    date_to: (() => {
      const s = str(parsed.date_to);
      if (!s) return null;
      // make date_to end-of-day inclusive when only a date is given
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        d.setHours(23, 59, 59, 999);
      }
      return d.toISOString();
    })(),
    requires_semantic: parsed.requires_semantic === true,
  };
}

function buildShiftCorpus(r: {
  service_type_code: string | null;
  shift_note_text: string | null;
  goals_completed: string[] | null;
  outside_geofence_reason: string | null;
}): string {
  const parts = [
    r.service_type_code ? `Service code: ${r.service_type_code}.` : "",
    Array.isArray(r.goals_completed) && r.goals_completed.length > 0
      ? `PCSP goals targeted: ${r.goals_completed.join("; ")}.`
      : "",
    r.shift_note_text ? `Caregiver narrative: ${r.shift_note_text}` : "",
    r.outside_geofence_reason ? `Geofence exception: ${r.outside_geofence_reason}` : "",
  ].filter(Boolean);
  return parts.join("\n").slice(0, 8000) || "Empty shift record.";
}

// ────────────────────────────────────────────────────────────────
// 🚦 Hybrid search: LLM router → SQL filter (+ optional vector).
// ────────────────────────────────────────────────────────────────
export const searchTimesheetsByVector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateSearch)
  .handler(async ({ data, context }) => {
    await requireOrgMembership(context.supabase, context.userId, data.organizationId, "employee");
    const route = await routeQueryWithLLM(data.query);

    let vecLiteral: string | null = null;
    if (route.requires_semantic) {
      const vec = await embed(data.query);
      vecLiteral = `[${vec.join(",")}]`;
    }

    const { data: rows, error } = await context.supabase.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "hybrid_search_timesheets" as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        query_embedding: vecLiteral,
        caregiver_name: route.caregiver_name,
        client_name: route.client_name,
        hour_min: route.hour_min,
        date_from: route.date_from,
        date_to: route.date_to,
        match_count: data.matchCount,
        _org: data.organizationId,
      } as any,
    );
    if (error) throw new Error(error.message);

    return {
      matches: (rows ?? []) as Array<{ id: string; similarity: number }>,
      route,
    };
  });

// ────────────────────────────────────────────────────────────────
// Backfill embeddings (unchanged).
// ────────────────────────────────────────────────────────────────
export const backfillTimesheetEmbeddings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateBackfill)
  .handler(async ({ data, context }) => {
    await requireOrgMembership(context.supabase, context.userId, data.organizationId, "admin");
    const { data: rows, error } = await context.supabase
      .from("evv_timesheets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id, service_type_code, shift_note_text, goals_completed, outside_geofence_reason" as any)
      .eq("organization_id", data.organizationId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .is("timesheet_embedding" as any, null)
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as unknown as Array<{
      id: string;
      service_type_code: string | null;
      shift_note_text: string | null;
      goals_completed: string[] | null;
      outside_geofence_reason: string | null;
    }>;
    if (list.length === 0) return { embedded: 0, remaining: 0 };

    let embedded = 0;
    for (const row of list) {
      const corpus = buildShiftCorpus(row);
      try {
        const vec = await embed(corpus);
        const literal = `[${vec.join(",")}]`;
        const { error: upErr } = await context.supabase
          .from("evv_timesheets")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ timesheet_embedding: literal } as any)
          .eq("id", row.id);
        if (!upErr) embedded += 1;
      } catch (err) {
        console.error("Embed row failed", row.id, err);
      }
    }

    const { count } = await context.supabase
      .from("evv_timesheets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id" as any, { count: "exact", head: true })
      .eq("organization_id", data.organizationId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .is("timesheet_embedding" as any, null);

    return { embedded, remaining: count ?? 0 };
  });
