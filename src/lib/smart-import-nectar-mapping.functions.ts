// NECTAR-assisted column-mapping suggester for the historical timesheets and
// historical daily-notes spreadsheet imports.
//
// One call per uploaded file. The client sends column headers plus a small
// sample of non-empty values per column; the server enriches the prompt with
// deterministic overlap hints against the real staff and client rosters in
// this org, then asks NECTAR (Bedrock) to decide which column maps to each
// field based on actual VALUES rather than header text alone.
//
// If NECTAR (or the deterministic pre-check) can't confidently find a staff
// or client column anywhere in the file, `whole_file_needed=true` is
// returned for that field, signalling the admin to pick a single "this
// entire file is for staff/client X" value on the mapping screen instead of
// forcing a column choice that doesn't exist.
//
// NECTAR only proposes — the admin still confirms and can override every
// mapping. The org roster leaves the server; the sample values (already
// visible to the admin) are the only thing about the uploaded file that is
// sent to the AI.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gatewayFetch } from "@/lib/ai-bedrock.server";

type Person = { id: string; label: string; norms: string[] };

const TIMESHEET_FIELDS = ["staff", "client", "date", "clock_in", "clock_out", "notes", "service_code"] as const;
const DAILY_NOTE_FIELDS = ["staff", "client", "date", "narrative", "goals"] as const;
type TimesheetField = (typeof TIMESHEET_FIELDS)[number];
type DailyNoteField = (typeof DAILY_NOTE_FIELDS)[number];
type AnyField = TimesheetField | DailyNoteField;

const InputSchema = z.object({
  organization_id: z.string().uuid(),
  mode: z.enum(["timesheets", "daily_notes"]),
  file_name: z.string().min(1).max(300),
  columns: z
    .array(
      z.object({
        header: z.string().min(1).max(200),
        samples: z.array(z.string().max(400)).max(20),
      }),
    )
    .min(1)
    .max(80),
});

type FieldSuggestion = {
  column: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
  whole_file_needed: boolean;
};

// ─── normalization + overlap heuristic ────────────────────────────────────
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function personNorms(first: string, last: string, full?: string | null): string[] {
  const f = normalize(first || "");
  const l = normalize(last || "");
  const combined = normalize(full || `${first} ${last}`);
  const lastFirst = l && f ? `${l} ${f}` : "";
  return Array.from(new Set([combined, `${f} ${l}`.trim(), lastFirst].filter(Boolean)));
}
function overlapFraction(samples: string[], pool: Person[]): number {
  const norms = new Set(pool.flatMap((p) => p.norms));
  if (samples.length === 0 || norms.size === 0) return 0;
  let hits = 0;
  for (const s of samples) {
    const n = normalize(s);
    if (!n) continue;
    if (norms.has(n)) { hits++; continue; }
    // token containment fallback (e.g. "Smith, J." vs "j smith")
    const parts = n.split(" ").filter(Boolean);
    if (parts.length >= 2 && norms.has(`${parts[0]} ${parts[parts.length - 1]}`)) hits++;
  }
  return hits / samples.length;
}
function looksLikeDate(samples: string[]): number {
  if (samples.length === 0) return 0;
  const re = /^\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/;
  let hits = 0;
  for (const s of samples) if (re.test(s) || (!isNaN(Date.parse(s)) && /\d{4}/.test(s))) hits++;
  return hits / samples.length;
}
function looksLikeTime(samples: string[]): number {
  if (samples.length === 0) return 0;
  const re = /\b\d{1,2}:\d{2}(\s?[ap]m?)?/i;
  let hits = 0;
  for (const s of samples) if (re.test(s)) hits++;
  return hits / samples.length;
}
function avgLen(samples: string[]): number {
  const s = samples.filter(Boolean);
  return s.length === 0 ? 0 : s.reduce((a, b) => a + b.length, 0) / s.length;
}

// ─── the server function ──────────────────────────────────────────────────
export const suggestImportColumnMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;

    // Confirm caller belongs to this org (RLS already enforces reads, this
    // just gives a clean error message).
    const { data: memberRow, error: memErr } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organization_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (memErr) throw new Error(memErr.message);
    if (!memberRow) throw new Error("You are not a member of this organization.");

    // Load roster. organization_members ↔ profiles has no FK (both key off
    // auth.users.id), so PostgREST cannot embed them — two queries, join in JS.
    const [memRes, clientsRes] = await Promise.all([
      supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", data.organization_id)
        .eq("active", true)
        .limit(800),
      supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", data.organization_id)
        .limit(800),
    ]);
    if (memRes.error) throw new Error(memRes.error.message);
    if (clientsRes.error) throw new Error(clientsRes.error.message);

    const memberIds = (memRes.data ?? []).map((m: { user_id: string | null }) => m.user_id).filter(Boolean) as string[];
    let staff: Person[] = [];
    if (memberIds.length > 0) {
      const profRes = await supabase
        .from("profiles")
        .select("id, first_name, last_name, full_name")
        .in("id", memberIds);
      if (profRes.error) throw new Error(profRes.error.message);
      staff = (profRes.data ?? []).map((p) => ({
        id: p.id,
        label: (p.full_name?.trim()) || [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Staff",
        norms: personNorms(p.first_name ?? "", p.last_name ?? "", p.full_name),
      }));
    }

    const clients: Person[] = ((clientsRes.data ?? []) as Array<{ id: string; first_name: string; last_name: string }>)
      .map((c) => ({
        id: c.id,
        label: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Client",
        norms: personNorms(c.first_name ?? "", c.last_name ?? ""),
      }));

    // Pre-compute deterministic hints for every column. NECTAR is told these
    // hints; even if the model wavers, we honor an overlap≥0.5 override for
    // staff/client below.
    const columnHints = data.columns.map((c) => {
      const staffOverlap = overlapFraction(c.samples, staff);
      const clientOverlap = overlapFraction(c.samples, clients);
      return {
        header: c.header,
        avg_len: Math.round(avgLen(c.samples)),
        looks_like_date: Number(looksLikeDate(c.samples).toFixed(2)),
        looks_like_time: Number(looksLikeTime(c.samples).toFixed(2)),
        staff_name_match_fraction: Number(staffOverlap.toFixed(2)),
        client_name_match_fraction: Number(clientOverlap.toFixed(2)),
        samples: c.samples.slice(0, 8),
      };
    });

    const fields =
      data.mode === "timesheets" ? [...TIMESHEET_FIELDS] : [...DAILY_NOTE_FIELDS];

    // Whether whole-file constants are legal for a given field. Only the
    // "who" fields — staff and client — can meaningfully be one value for
    // the entire upload. Dates, times, narratives, etc. must come from
    // per-row cells.
    const wholeFileEligible = new Set<AnyField>(["staff", "client"]);

    const system = `You are NECTAR, mapping columns of a single-sheet historical import spreadsheet for a Utah DSPD provider.

Rules you MUST follow:
1. Choose columns based on the ACTUAL SAMPLE VALUES, not the header name. Headers from other platforms are often generic ("Type", "Info") or mislabeled.
2. Use the provided overlap fractions against the real staff/client rosters as strong evidence — a column with staff_name_match_fraction ≥ 0.5 IS the staff column even if its header says "Employee Code" or "Type". Same for client.
3. For date/time/notes/narrative/service_code/goals, rely on the sample values and heuristic hints (looks_like_date, looks_like_time, avg_len, sample content).
4. If NO column in the file plausibly contains staff names (staff_name_match_fraction < 0.2 for every column and no header/sample strongly suggests a person's name), set staff.column = null AND staff.whole_file_needed = true. Same rule for client. Do this ONLY for staff or client — never for date/time/narrative/etc.
5. Do NOT invent columns. Only pick from the headers provided. If nothing plausible exists for an OPTIONAL field, return null with whole_file_needed=false.
6. Return strict JSON only, no prose, matching the schema below exactly.`;

    const user = {
      mode: data.mode,
      fields_requested: fields,
      whole_file_eligible_fields: Array.from(wholeFileEligible).filter((f) => (fields as string[]).includes(f)),
      file_name: data.file_name,
      columns: columnHints,
      staff_names_sample: staff.slice(0, 40).map((s) => s.label),
      client_names_sample: clients.slice(0, 40).map((c) => c.label),
      response_schema: {
        mapping: Object.fromEntries(
          fields.map((f) => [
            f,
            {
              column: "string|null (must be one of the provided headers or null)",
              confidence: "high|medium|low",
              reason: "one short sentence",
              whole_file_needed: "true only if staff/client and no column exists in the file",
            },
          ]),
        ),
      },
    };

    let modelMapping: Record<string, FieldSuggestion> = {};
    try {
      const res = await gatewayFetch({
        model: "bedrock",
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(user) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1200,
        temperature: 0.1,
      });
      if (res.ok) {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const raw = json.choices?.[0]?.message?.content ?? "{}";
        try {
          const parsed = JSON.parse(raw) as { mapping?: Record<string, Partial<FieldSuggestion>> };
          if (parsed.mapping && typeof parsed.mapping === "object") {
            for (const f of fields) {
              const m = parsed.mapping[f];
              if (!m) continue;
              const headerOk = m.column && data.columns.some((c) => c.header === m.column);
              modelMapping[f] = {
                column: headerOk ? (m.column as string) : null,
                confidence: (m.confidence as FieldSuggestion["confidence"]) ?? "low",
                reason: typeof m.reason === "string" ? m.reason.slice(0, 200) : "",
                whole_file_needed: wholeFileEligible.has(f as AnyField) && m.whole_file_needed === true,
              };
            }
          }
        } catch {
          // fall through — deterministic layer below still runs
        }
      }
    } catch {
      // AI unavailable → deterministic-only suggestion still returned
      modelMapping = {};
    }

    // Deterministic override / fill. For staff & client the overlap
    // fraction is authoritative: if any column exceeds 0.5, that column
    // wins even if NECTAR picked something else or nothing at all.
    const finalMapping: Record<string, FieldSuggestion> = {};

    const bestOverlap = (kind: "staff" | "client") => {
      let best: { header: string; frac: number } | null = null;
      for (const c of columnHints) {
        const f = kind === "staff" ? c.staff_name_match_fraction : c.client_name_match_fraction;
        if (f > (best?.frac ?? 0)) best = { header: c.header, frac: f };
      }
      return best;
    };

    for (const f of fields) {
      const suggested: FieldSuggestion = modelMapping[f] ?? {
        column: null,
        confidence: "low",
        reason: "",
        whole_file_needed: false,
      };

      if (f === "staff" || f === "client") {
        const overlap = bestOverlap(f);
        if (overlap && overlap.frac >= 0.5) {
          finalMapping[f] = {
            column: overlap.header,
            confidence: overlap.frac >= 0.8 ? "high" : "medium",
            reason: `${Math.round(overlap.frac * 100)}% of samples in "${overlap.header}" match real ${f} names.`,
            whole_file_needed: false,
          };
          continue;
        }
        // No column has meaningful overlap — flag whole-file constant.
        if (!suggested.column) {
          finalMapping[f] = {
            column: null,
            confidence: "low",
            reason:
              overlap && overlap.frac > 0
                ? `No column reliably contains ${f} names (best match: "${overlap.header}" at ${Math.round(overlap.frac * 100)}%).`
                : `No column in this file contains ${f} names.`,
            whole_file_needed: true,
          };
          continue;
        }
        finalMapping[f] = suggested;
        continue;
      }

      // Non-person fields: keep NECTAR's suggestion; fall back to a simple
      // heuristic for date/time.
      if (!suggested.column) {
        if (f === "date") {
          const c = columnHints.filter((c) => c.looks_like_date >= 0.5).sort((a, b) => b.looks_like_date - a.looks_like_date)[0];
          if (c) {
            finalMapping[f] = {
              column: c.header,
              confidence: "medium",
              reason: `Values in "${c.header}" look like dates.`,
              whole_file_needed: false,
            };
            continue;
          }
        }
        if (f === "clock_in" || f === "clock_out") {
          const c = columnHints.filter((c) => c.looks_like_time >= 0.5).sort((a, b) => b.looks_like_time - a.looks_like_time);
          const pick = f === "clock_in" ? c[0] : c[1] ?? c[0];
          if (pick) {
            finalMapping[f] = {
              column: pick.header,
              confidence: "low",
              reason: `Values in "${pick.header}" look like times.`,
              whole_file_needed: false,
            };
            continue;
          }
        }
      }
      finalMapping[f] = suggested;
    }

    return {
      mapping: finalMapping as Record<AnyField, FieldSuggestion>,
      column_hints: columnHints,
    };
  });
