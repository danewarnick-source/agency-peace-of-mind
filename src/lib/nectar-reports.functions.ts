import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeEntryUnits } from "@/lib/billing-units";

const roundHours = (h: number): number => Math.round(h * 10) / 10;
import { isDailyServiceCode } from "@/lib/service-billing";

import { gatewayFetch } from "@/lib/ai-bedrock.server";

// ───── Public types ──────────────────────────────────────────────────────────

export type NectarReportIntent =
  | "shifts"
  | "hours_by_client"
  | "hours_by_staff"
  | "hours_by_code"
  | "budget_status";

export interface NectarReportPlan {
  intent: NectarReportIntent;
  start_date?: string | null;
  end_date?: string | null;
  staff_name?: string | null;
  partner_staff_name?: string | null;
  client_name?: string | null;
  service_code?: string | null;
  notes?: string | null;
}

export interface NectarReportColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface NectarReportResult {
  plan: NectarReportPlan;
  title: string;
  columns: NectarReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  totals?: Record<string, string | number | null>;
  notice?: string;
}

// ───── Helpers ──────────────────────────────────────────────────────────────

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}
function isoDate(d: Date) {
  return d.toISOString();
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}
interface ClientRow {
  id: string;
  first_name: string;
  last_name: string;
  medicaid_id: string | null;
}
interface TsRow {
  id: string;
  client_id: string;
  staff_id: string;
  service_type_code: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
}

function nameMatches(profile: ProfileRow | undefined, query: string | null | undefined): boolean {
  if (!query || !profile) return true;
  const q = query.toLowerCase().trim();
  const full = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.toLowerCase();
  return full.includes(q);
}
function clientNameMatches(c: ClientRow | undefined, q: string | null | undefined): boolean {
  if (!q || !c) return true;
  const full = `${c.first_name} ${c.last_name}`.toLowerCase();
  return full.includes(q.toLowerCase().trim());
}

function fullName(p?: ProfileRow): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

// ───── AI plan extraction ───────────────────────────────────────────────────

async function planFromPrompt(prompt: string): Promise<NectarReportPlan> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured.");

  const today = new Date().toISOString().slice(0, 10);
  const system = `You translate an admin's plain-language reporting request into a strict JSON plan for the HIVE NECTAR report builder.

Available intents:
- "shifts": individual EVV shift punches (staff × client × code × times)
- "hours_by_client": total hours grouped by client (optional service_code filter)
- "hours_by_staff": total hours grouped by staff
- "hours_by_code": total hours grouped by service code
- "budget_status": per-client/per-code authorization vs used units (current authorization windows)

Return STRICT JSON only, no markdown, no code fences. Schema:
{
  "intent": "shifts" | "hours_by_client" | "hours_by_staff" | "hours_by_code" | "budget_status",
  "start_date": "YYYY-MM-DD" | null,
  "end_date":   "YYYY-MM-DD" | null,
  "staff_name": string | null,
  "partner_staff_name": string | null,
  "client_name": string | null,
  "service_code": string | null,
  "notes": string | null
}

Date conventions (today is ${today}):
- "this month"  → first..last day of current month
- "last month"  → first..last day of previous month
- "this quarter"/"last quarter" → calendar quarter
- "this year"/"last year" → calendar year
- "budget year" → leave dates null (budget_status uses authorization windows)
If no date is implied, leave both null.

Examples:
"all shifts John Doe worked this month with Tonya"
=> {"intent":"shifts","staff_name":"John Doe","partner_staff_name":"Tonya","start_date":"<month start>","end_date":"<month end>","client_name":null,"service_code":null,"notes":null}

"total DSI hours per client last quarter"
=> {"intent":"hours_by_client","service_code":"DSI","start_date":"<q start>","end_date":"<q end>","staff_name":null,"partner_staff_name":null,"client_name":null,"notes":null}

"units billed vs remaining for every client this budget year"
=> {"intent":"budget_status","start_date":null,"end_date":null,"staff_name":null,"partner_staff_name":null,"client_name":null,"service_code":null,"notes":null}
`;

  const res = await gatewayFetch({
      model: "bedrock",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt.slice(0, 2000) },
      ],
      response_format: { type: "json_object" },
    });
  if (res.status === 429) throw new Error("AI rate limit reached. Please retry shortly.");
  if (res.status === 402) throw new Error("AI workspace credits exhausted. Add credits to continue.");
  if (!res.ok) throw new Error(`AI error (${res.status}).`);

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: Partial<NectarReportPlan> = {};
  try { parsed = JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
  }
  const intent = (["shifts","hours_by_client","hours_by_staff","hours_by_code","budget_status"] as NectarReportIntent[])
    .includes(parsed.intent as NectarReportIntent) ? (parsed.intent as NectarReportIntent) : "hours_by_client";

  return {
    intent,
    start_date: parsed.start_date ?? null,
    end_date: parsed.end_date ?? null,
    staff_name: parsed.staff_name ?? null,
    partner_staff_name: parsed.partner_staff_name ?? null,
    client_name: parsed.client_name ?? null,
    service_code: parsed.service_code ?? null,
    notes: parsed.notes ?? null,
  };
}

// ───── Server function ──────────────────────────────────────────────────────

interface AskInput { prompt: string; organizationId: string }

const UUID_RE_RPT = /^[0-9a-f-]{36}$/i;

function validateInput(input: unknown): AskInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const prompt = typeof i.prompt === "string" ? i.prompt.trim() : "";
  const organizationId = typeof i.organizationId === "string" ? i.organizationId : "";
  if (prompt.length < 3 || prompt.length > 2000) {
    throw new Error("Prompt must be 3–2000 characters.");
  }
  if (!UUID_RE_RPT.test(organizationId)) throw new Error("Invalid organizationId.");
  return { prompt, organizationId };
}

export const askNectarReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInput)
  .handler(async ({ data, context }): Promise<NectarReportResult> => {
    const { supabase, userId } = context;
    const orgId = data.organizationId;

    // Verify manager+ membership on the PASSED org (not first-membership).
    const { requireOrgMembership } = await import("@/integrations/supabase/require-org");
    await requireOrgMembership(supabase, userId, orgId, "manager");


    const plan = await planFromPrompt(data.prompt);

    // Default to "this month" when intent needs dates and none provided.
    const now = new Date();
    let startDate: Date | null = plan.start_date ? new Date(plan.start_date + "T00:00:00") : null;
    let endDate: Date | null = plan.end_date ? new Date(plan.end_date + "T23:59:59") : null;
    if (plan.intent !== "budget_status" && (!startDate || !endDate)) {
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
    }

    // ── Budget status intent ───────────────────────────────────────────────
    if (plan.intent === "budget_status") {
      return await runBudgetStatus(supabase, orgId, plan);
    }

    // ── Shift / aggregate intents ─────────────────────────────────────────
    const tsQ = await supabase
      .from("evv_timesheets")
      .select("id, client_id, staff_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
      .eq("organization_id", orgId)
      .gte("clock_in_timestamp", isoDate(startDate!))
      .lte("clock_in_timestamp", isoDate(endDate!));
    if (tsQ.error) throw tsQ.error;
    let rows = (tsQ.data ?? []) as TsRow[];
    rows = rows.filter((r) => r.clock_out_timestamp);

    // Fetch lookups
    const staffIds = [...new Set(rows.map((r) => r.staff_id))];
    const clientIds = [...new Set(rows.map((r) => r.client_id))];
    const [profilesRes, clientsRes] = await Promise.all([
      staffIds.length
        ? supabase.from("profiles").select("id, first_name, last_name").in("id", staffIds)
        : Promise.resolve({ data: [], error: null }),
      clientIds.length
        ? supabase.from("clients").select("id, first_name, last_name, medicaid_id").in("id", clientIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const profileById = new Map<string, ProfileRow>(
      ((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p]),
    );
    const clientById = new Map<string, ClientRow>(
      ((clientsRes.data ?? []) as ClientRow[]).map((c) => [c.id, c]),
    );

    // Apply name/code filters
    rows = rows.filter((r) => {
      if (plan.service_code && r.service_type_code !== plan.service_code) return false;
      if (plan.staff_name && !nameMatches(profileById.get(r.staff_id), plan.staff_name)) return false;
      if (plan.client_name && !clientNameMatches(clientById.get(r.client_id), plan.client_name)) return false;
      return true;
    });

    // partner_staff_name: keep rows that overlap with a shift by a staff
    // matching the partner name on the same client.
    if (plan.partner_staff_name) {
      const partnerRowsAll = (tsQ.data ?? []).filter(
        (r) => r.clock_out_timestamp && nameMatches(profileById.get(r.staff_id), plan.partner_staff_name),
      );
      rows = rows.filter((r) => {
        const a0 = new Date(r.clock_in_timestamp).getTime();
        const a1 = new Date(r.clock_out_timestamp!).getTime();
        return partnerRowsAll.some((p) => {
          if (p.client_id !== r.client_id || p.staff_id === r.staff_id) return false;
          const b0 = new Date(p.clock_in_timestamp).getTime();
          const b1 = new Date(p.clock_out_timestamp!).getTime();
          return a0 < b1 && b0 < a1;
        });
      });
    }

    // Compute hours per row
    const withHours = rows.map((r) => {
      const hrs =
        (new Date(r.clock_out_timestamp!).getTime() - new Date(r.clock_in_timestamp).getTime()) /
        3_600_000;
      return { row: r, hours: hrs > 0 && isFinite(hrs) ? hrs : 0 };
    });

    if (plan.intent === "shifts") {
      const cols: NectarReportColumn[] = [
        { key: "date", label: "Date" },
        { key: "staff", label: "Staff" },
        { key: "client", label: "Client" },
        { key: "code", label: "Code" },
        { key: "in", label: "Clock in" },
        { key: "out", label: "Clock out" },
        { key: "hours", label: "Hours", align: "right" },
        { key: "units", label: "Units", align: "right" },
      ];
      const dataRows = withHours
        .sort((a, b) => a.row.clock_in_timestamp.localeCompare(b.row.clock_in_timestamp))
        .map(({ row, hours }) => ({
          date: row.clock_in_timestamp.slice(0, 10),
          staff: fullName(profileById.get(row.staff_id)),
          client: clientById.get(row.client_id)
            ? `${clientById.get(row.client_id)!.last_name}, ${clientById.get(row.client_id)!.first_name}`
            : "—",
          code: row.service_type_code,
          in: new Date(row.clock_in_timestamp).toLocaleTimeString(),
          out: row.clock_out_timestamp ? new Date(row.clock_out_timestamp).toLocaleTimeString() : "—",
          hours: roundHours(hours),
          units: isDailyServiceCode(row.service_type_code)
            ? 1
            : computeEntryUnits(row.clock_in_timestamp, row.clock_out_timestamp),
        }));
      const totalHours = withHours.reduce((s, r) => s + r.hours, 0);
      const totalUnits = dataRows.reduce((s, r) => s + Number(r.units ?? 0), 0);
      return {
        plan,
        title: `Shifts ${startDate!.toLocaleDateString()} – ${endDate!.toLocaleDateString()}`,
        columns: cols,
        rows: dataRows,
        totals: {
          date: "TOTAL",
          hours: roundHours(totalHours),
          units: totalUnits,
        },
      };
    }

    // hours_by_* aggregate
    const groupKey = plan.intent === "hours_by_client"
      ? (r: TsRow) => r.client_id
      : plan.intent === "hours_by_staff"
        ? (r: TsRow) => r.staff_id
        : (r: TsRow) => r.service_type_code;

    const groups = new Map<string, { hours: number; units: number; sample: TsRow }>();
    for (const { row, hours } of withHours) {
      const k = groupKey(row);
      // Per-entry rounding; group buckets sum entry units, never re-round.
      const entryUnits = isDailyServiceCode(row.service_type_code)
        ? 1
        : computeEntryUnits(row.clock_in_timestamp, row.clock_out_timestamp);
      const cur = groups.get(k);
      if (cur) { cur.hours += hours; cur.units += entryUnits; }
      else groups.set(k, { hours, units: entryUnits, sample: row });
    }

    const labelHeader = plan.intent === "hours_by_client"
      ? "Client" : plan.intent === "hours_by_staff" ? "Staff" : "Service code";

    const dataRows = [...groups.entries()]
      .map(([k, v]) => {
        let label = k;
        if (plan.intent === "hours_by_client") {
          const c = clientById.get(k);
          label = c ? `${c.last_name}, ${c.first_name}` : "—";
        } else if (plan.intent === "hours_by_staff") {
          label = fullName(profileById.get(k));
        }
        return {
          label,
          hours: roundHours(v.hours),
          units: v.units,
        };
      })
      .sort((a, b) => (b.hours as number) - (a.hours as number));

    const totalHours = withHours.reduce((s, r) => s + r.hours, 0);
    const totalUnits = [...groups.values()].reduce((s, g) => s + g.units, 0);

    return {
      plan,
      title: `${labelHeader} totals · ${startDate!.toLocaleDateString()} – ${endDate!.toLocaleDateString()}`,
      columns: [
        { key: "label", label: labelHeader },
        { key: "hours", label: "Hours", align: "right" },
        { key: "units", label: "Units", align: "right" },
      ],
      rows: dataRows,
      totals: {
        label: "TOTAL",
        hours: roundHours(totalHours),
        units: totalUnits,
      },
    };
  });

// ───── Budget status executor ───────────────────────────────────────────────

async function runBudgetStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  plan: NectarReportPlan,
): Promise<NectarReportResult> {
  const codesRes = await supabase
    .from("client_billing_codes")
    .select("client_id, service_code, annual_unit_authorization, service_start_date, service_end_date, unit_type, rate_per_unit")
    .eq("organization_id", orgId);
  if (codesRes.error) throw codesRes.error;
  const codes = (codesRes.data ?? []) as Array<{
    client_id: string;
    service_code: string;
    annual_unit_authorization: number | null;
    service_start_date: string | null;
    service_end_date: string | null;
    unit_type: string | null;
    rate_per_unit: number | null;
  }>;

  const clientIds = [...new Set(codes.map((c) => c.client_id))];
  const clientsRes = clientIds.length
    ? await supabase.from("clients").select("id, first_name, last_name, medicaid_id").in("id", clientIds)
    : { data: [], error: null };
  const clientById = new Map<string, ClientRow>(
    ((clientsRes.data ?? []) as ClientRow[]).map((c) => [c.id, c]),
  );

  // Pull punches+daily covering all open windows.
  const earliestStart = codes
    .map((c) => (c.service_start_date ? new Date(c.service_start_date) : null))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? new Date(new Date().getFullYear(), 0, 1);

  const [tsRes, dlRes] = await Promise.all([
    supabase
      .from("evv_timesheets")
      .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
      .eq("organization_id", orgId)
      .gte("clock_in_timestamp", earliestStart.toISOString()),
    // Daily-rate days come from the hhs_daily_records_v view; only
    // billable rows (attendance Present + daily note) count as used units.
    supabase
      .from("hhs_daily_records_v")
      .select("client_id, record_date, service_code, billable")
      .eq("organization_id", orgId)
      .eq("billable", true)
      .gte("record_date", earliestStart.toISOString().slice(0, 10)),
  ]);
  if (tsRes.error) throw tsRes.error;
  if (dlRes.error) throw dlRes.error;
  const tsRows = (tsRes.data ?? []) as Array<{
    client_id: string; service_type_code: string | null;
    clock_in_timestamp: string; clock_out_timestamp: string | null;
  }>;
  const dlRows = (dlRes.data ?? []) as Array<{ client_id: string; record_date: string; service_code: string | null }>;

  const filtered = codes.filter((code) => {
    if (plan.service_code && code.service_code !== plan.service_code) return false;
    const c = clientById.get(code.client_id);
    if (plan.client_name && !clientNameMatches(c, plan.client_name)) return false;
    return true;
  });

  const dataRows = filtered.map((code) => {
    const c = clientById.get(code.client_id);
    const periodStart = code.service_start_date ? new Date(code.service_start_date) : null;
    const periodEnd = code.service_end_date ? new Date(code.service_end_date) : null;
    const isDaily = isDailyServiceCode(code.service_code);
    let used = 0;
    if (isDaily) {
      const set = new Set<string>();
      for (const r of dlRows) {
        if (r.client_id !== code.client_id || !r.record_date) continue;
        // View rows carry the service code — attribute days to the exact code.
        if (r.service_code && r.service_code !== code.service_code) continue;
        const d = new Date(r.record_date + "T00:00:00");
        if (periodStart && d < periodStart) continue;
        if (periodEnd && d > periodEnd) continue;
        set.add(r.record_date);
      }
      used = set.size;
    } else {
      for (const r of tsRows) {
        if (r.client_id !== code.client_id || !r.clock_out_timestamp) continue;
        if (r.service_type_code !== code.service_code) continue;
        const inT = new Date(r.clock_in_timestamp);
        if (periodStart && inT < periodStart) continue;
        if (periodEnd && inT > periodEnd) continue;
        // Per-entry rounding; the bucket sums entry units, never re-rounds.
        used += computeEntryUnits(r.clock_in_timestamp, r.clock_out_timestamp);
      }
    }
    const annual = code.annual_unit_authorization ?? 0;
    const remaining = Math.max(0, annual - used);
    return {
      client: c ? `${c.last_name}, ${c.first_name}` : "—",
      medicaid_id: c?.medicaid_id ?? "—",
      code: code.service_code,
      unit_type: code.unit_type ?? "—",
      annual,
      used,
      remaining,
      pct: annual > 0 ? Math.round((used / annual) * 100) : 0,
      rate: code.rate_per_unit ?? 0,
      renewal: code.service_end_date ?? "—",
    };
  });

  return {
    plan,
    title: "Budget status — annual authorization vs used units",
    columns: [
      { key: "client", label: "Client" },
      { key: "medicaid_id", label: "Medicaid ID" },
      { key: "code", label: "Code" },
      { key: "unit_type", label: "Unit type" },
      { key: "annual", label: "Annual units", align: "right" },
      { key: "used", label: "Used", align: "right" },
      { key: "remaining", label: "Remaining", align: "right" },
      { key: "pct", label: "% used", align: "right" },
      { key: "rate", label: "Rate", align: "right" },
      { key: "renewal", label: "Renewal" },
    ],
    rows: dataRows,
    notice: "Includes billing rates — admin view only. Never expose this dataset to staff.",
  };
}
