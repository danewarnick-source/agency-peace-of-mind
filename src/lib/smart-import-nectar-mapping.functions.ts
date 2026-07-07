// NECTAR-assisted column-mapping suggester for the historical timesheets and
// historical daily-notes spreadsheet imports.
//
// One call per uploaded file. The client sends column headers plus a deep
// stratified sample of non-empty values per column AND a fill_rate (how
// populated the column actually is across the whole file). The server
// enriches the prompt with deterministic overlap hints against the real
// staff and client rosters in this org, then asks NECTAR (Bedrock) to decide
// which column maps to each field based on ACTUAL VALUES and how populated
// each column is — not just header text.
//
// Emptiness rule: a well-labeled but empty column is worse than a poorly
// labeled populated one. Any column with fill_rate < 0.3 is downgraded on
// the deterministic path and NECTAR is told the same in the prompt.
//
// Roster-first rule: overlap fractions against the real org roster are the
// primary evidence for staff/client, not a confirmation check on the
// header text.
//
// Mixed-person columns: when a single column matches staff on some rows and
// clients on others, we return `per_row_person_column` so the wizard can
// resolve each cell against BOTH pools rather than forcing the whole column
// into one label.
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

const ColumnInputSchema = z.object({
  header: z.string().min(1).max(200),
  samples: z.array(z.string().max(400)).max(60),
  // How populated the column is across the whole file (0..1). Client
  // computes this over up to 2000 rows so a "header looks great but 95% of
  // rows are blank" column can be downgraded.
  fill_rate: z.number().min(0).max(1).optional(),
  sample_size: z.number().int().nonnegative().optional(),
});

const InputSchema = z.object({
  organization_id: z.string().uuid(),
  mode: z.enum(["timesheets", "daily_notes"]),
  file_name: z.string().min(1).max(300),
  columns: z.array(ColumnInputSchema).min(1).max(80),
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
function matchesPool(value: string, poolNormSet: Set<string>): boolean {
  const n = normalize(value);
  if (!n) return false;
  if (poolNormSet.has(n)) return true;
  const parts = n.split(" ").filter(Boolean);
  if (parts.length >= 2 && poolNormSet.has(`${parts[0]} ${parts[parts.length - 1]}`)) return true;
  return false;
}
function overlapCounts(samples: string[], pool: Person[]) {
  const norms = new Set(pool.flatMap((p) => p.norms));
  let hits = 0;
  for (const s of samples) if (matchesPool(s, norms)) hits++;
  return { hits, total: samples.length, frac: samples.length ? hits / samples.length : 0 };
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
      staff = (profRes.data ?? []).map((p: { id: string; first_name: string | null; last_name: string | null; full_name: string | null }) => ({
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

    // Pre-compute deterministic hints for every column. NECTAR sees these
    // hints; deterministic overrides below still make the final call for
    // staff/client when overlap is unambiguous.
    const columnHints = data.columns.map((c) => {
      const s = overlapCounts(c.samples, staff);
      const cl = overlapCounts(c.samples, clients);
      // combined = fraction of samples that match ANY person (staff OR client).
      // Used to detect a per-row mixed-person column.
      const staffSet = new Set(staff.flatMap((p) => p.norms));
      const clientSet = new Set(clients.flatMap((p) => p.norms));
      let combinedHits = 0;
      for (const v of c.samples) if (matchesPool(v, staffSet) || matchesPool(v, clientSet)) combinedHits++;
      const combinedFrac = c.samples.length ? combinedHits / c.samples.length : 0;
      const fillRate = c.fill_rate ?? (c.samples.length > 0 ? 1 : 0);
      return {
        header: c.header,
        fill_rate: Number(fillRate.toFixed(2)),
        rows_scanned: c.sample_size ?? c.samples.length,
        mostly_empty: fillRate < 0.3,
        avg_len: Math.round(avgLen(c.samples)),
        looks_like_date: Number(looksLikeDate(c.samples).toFixed(2)),
        looks_like_time: Number(looksLikeTime(c.samples).toFixed(2)),
        staff_name_match_fraction: Number(s.frac.toFixed(2)),
        client_name_match_fraction: Number(cl.frac.toFixed(2)),
        combined_person_match_fraction: Number(combinedFrac.toFixed(2)),
        samples: c.samples.slice(0, 12),
      };
    });

    // Detect a per-row mixed-person column: high combined roster match but
    // neither staff nor client overlap is dominant. Example: a "Person"
    // column that alternates staff and client per row.
    let perRowPersonColumn: string | null = null;
    for (const c of columnHints) {
      if (
        c.combined_person_match_fraction >= 0.7 &&
        c.staff_name_match_fraction >= 0.2 &&
        c.client_name_match_fraction >= 0.2 &&
        c.staff_name_match_fraction < 0.8 &&
        c.client_name_match_fraction < 0.8 &&
        !c.mostly_empty
      ) {
        perRowPersonColumn = c.header;
        break;
      }
    }

    const fields =
      data.mode === "timesheets" ? [...TIMESHEET_FIELDS] : [...DAILY_NOTE_FIELDS];

    const wholeFileEligible = new Set<AnyField>(["staff", "client"]);

    const system = `You are NECTAR, mapping columns of a spreadsheet import for a Utah DSPD provider.

RULES you MUST follow:
1. Choose columns based on ACTUAL SAMPLE VALUES and how populated the column is — not the header name. Headers from other platforms are often generic ("Type", "Info") or mislabeled.
2. A well-labeled column that is mostly empty (fill_rate < 0.3, "mostly_empty": true) is WORSE than a poorly-labeled column that is populated. Do NOT pick a mostly_empty column when another column matches this field with any populated evidence.
3. ROSTER MATCH IS PRIMARY EVIDENCE for staff/client. A column with staff_name_match_fraction ≥ 0.5 IS the staff column even if the header says "Employee Code" or "Type". Same for client. Use header text only as a tiebreaker.
4. If a column has combined_person_match_fraction ≥ 0.7 but neither staff nor client dominates (both ≥ 0.2, both < 0.8), it is a per-row mixed-person column. Pick it for BOTH staff and client and set mixed_person=true in your response — the wizard will resolve each row individually.
5. For date/time/notes/narrative/service_code/goals, use samples + heuristic hints (looks_like_date, looks_like_time, avg_len, sample content).
6. If NO column plausibly contains staff names (staff_name_match_fraction < 0.2 for every populated column and no header/sample strongly suggests a person), set staff.column = null AND staff.whole_file_needed = true. Same rule for client. Do this ONLY for staff or client — never for date/time/narrative/etc.
7. Do NOT invent columns. Only pick from the provided headers. If nothing plausible exists for an OPTIONAL field, return null with whole_file_needed=false.
8. Return strict JSON only, no prose, matching the schema below exactly.`;

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
              mixed_person: "optional, true if per-row mixed person column",
            },
          ]),
        ),
      },
    };

    let modelMapping: Record<string, FieldSuggestion & { mixed_person?: boolean }> = {};
    try {
      const res = await gatewayFetch({
        model: "bedrock",
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(user) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1400,
        temperature: 0.1,
      });
      if (res.ok) {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const raw = json.choices?.[0]?.message?.content ?? "{}";
        try {
          const parsed = JSON.parse(raw) as {
            mapping?: Record<string, Partial<FieldSuggestion> & { mixed_person?: boolean }>;
          };
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
                mixed_person: m.mixed_person === true,
              };
            }
          }
        } catch {
          // deterministic layer below still runs
        }
      }
    } catch {
      modelMapping = {};
    }

    const finalMapping: Record<string, FieldSuggestion> = {};

    const bestOverlap = (kind: "staff" | "client") => {
      let best: { header: string; frac: number; fill: number } | null = null;
      for (const c of columnHints) {
        if (c.mostly_empty) continue; // never pick a mostly-empty column
        const f = kind === "staff" ? c.staff_name_match_fraction : c.client_name_match_fraction;
        if (f > (best?.frac ?? 0)) best = { header: c.header, frac: f, fill: c.fill_rate };
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
        // If a per-row mixed-person column was detected, use it for both.
        if (perRowPersonColumn) {
          finalMapping[f] = {
            column: perRowPersonColumn,
            confidence: "medium",
            reason: `"${perRowPersonColumn}" mixes staff and client names row-by-row — each row will be resolved individually.`,
            whole_file_needed: false,
          };
          continue;
        }
        const overlap = bestOverlap(f);
        if (overlap && overlap.frac >= 0.5) {
          finalMapping[f] = {
            column: overlap.header,
            confidence: overlap.frac >= 0.8 ? "high" : "medium",
            reason: `${Math.round(overlap.frac * 100)}% of populated samples in "${overlap.header}" match real ${f} names (fill rate ${Math.round(overlap.fill * 100)}%).`,
            whole_file_needed: false,
          };
          continue;
        }
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

      // Non-person fields: reject NECTAR's pick if the column is mostly empty
      // AND a more populated candidate exists for the same field.
      const chosenHint = columnHints.find((c) => c.header === suggested.column);
      if (suggested.column && chosenHint?.mostly_empty) {
        // Try a heuristic-based replacement
        if (f === "date") {
          const alt = columnHints.filter((c) => !c.mostly_empty && c.looks_like_date >= 0.5)
            .sort((a, b) => b.looks_like_date - a.looks_like_date)[0];
          if (alt) {
            finalMapping[f] = {
              column: alt.header,
              confidence: "medium",
              reason: `"${suggested.column}" is mostly empty; "${alt.header}" is populated and looks like dates.`,
              whole_file_needed: false,
            };
            continue;
          }
        }
        if (f === "notes" || f === "narrative") {
          const alt = columnHints.filter((c) => !c.mostly_empty && c.avg_len >= 20)
            .sort((a, b) => b.avg_len - a.avg_len)[0];
          if (alt) {
            finalMapping[f] = {
              column: alt.header,
              confidence: "medium",
              reason: `"${suggested.column}" is mostly empty; "${alt.header}" has real narrative content.`,
              whole_file_needed: false,
            };
            continue;
          }
        }
      }

      // Fill-in fallbacks for common fields when NECTAR returned null.
      if (!suggested.column) {
        if (f === "date") {
          const c = columnHints.filter((c) => !c.mostly_empty && c.looks_like_date >= 0.5).sort((a, b) => b.looks_like_date - a.looks_like_date)[0];
          if (c) {
            finalMapping[f] = { column: c.header, confidence: "medium", reason: `Values in "${c.header}" look like dates.`, whole_file_needed: false };
            continue;
          }
        }
        if (f === "clock_in" || f === "clock_out") {
          const c = columnHints.filter((c) => !c.mostly_empty && c.looks_like_time >= 0.5).sort((a, b) => b.looks_like_time - a.looks_like_time);
          const pick = f === "clock_in" ? c[0] : c[1] ?? c[0];
          if (pick) {
            finalMapping[f] = { column: pick.header, confidence: "low", reason: `Values in "${pick.header}" look like times.`, whole_file_needed: false };
            continue;
          }
        }
      }
      finalMapping[f] = suggested;
    }

    return {
      mapping: finalMapping as Record<AnyField, FieldSuggestion>,
      column_hints: columnHints,
      per_row_person_column: perRowPersonColumn,
    };
  });
