// Setup tools + Nectar drafting + open-shift conflict check.
// All writes go through requireSupabaseAuth so RLS enforces tenant scope.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ──────────────────────────────────────────────────────────────────────────────
// Setup tool A — bulk caseload editor (client → staff[])
// Diffs the current staff_assignments rows for this client and applies the
// minimum set of inserts/deletes. Idempotent.
// ──────────────────────────────────────────────────────────────────────────────
// Per the column comment on staff_assignments.service_codes:
//   • NULL    → all of the client's authorized codes (legacy / default)
//   • [a, b]  → assignment scoped to exactly those codes
//   • []      → INVALID; the row must be deleted instead
//
// Inputs (back-compat):
//   • { staff_ids: uuid[] }                     → each staff = "All codes" (NULL)
//   • { assignments: [{staff_id, service_codes|null}], ... } → per-staff scope
export const setClientCaseload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    client_id: string;
    staff_ids?: string[];
    assignments?: Array<{ staff_id: string; service_codes: string[] | null }>;
  }) =>
    z.object({
      organization_id: z.string().uuid(),
      client_id: z.string().uuid(),
      staff_ids: z.array(z.string().uuid()).optional(),
      assignments: z.array(z.object({
        staff_id: z.string().uuid(),
        service_codes: z.array(z.string()).nullable(),
      })).optional(),
    }).refine((v) => Array.isArray(v.staff_ids) || Array.isArray(v.assignments), {
      message: "Provide either staff_ids or assignments",
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase } = context as any;

    // Authoritative set of codes this client may be scoped to.
    const { data: clientRow } = await supabase
      .from("clients")
      .select("authorized_dspd_codes, job_code")
      .eq("id", data.client_id)
      .maybeSingle();
    const allCodes: string[] = Array.from(new Set([
      ...(((clientRow as { authorized_dspd_codes?: string[] } | null)?.authorized_dspd_codes) ?? []),
      ...(((clientRow as { job_code?: string[] } | null)?.job_code) ?? []),
    ].filter(Boolean)));
    const allCodesSet = new Set(allCodes);

    // Desired state per staff_id.
    const desired = new Map<string, string[] | null>();
    if (data.assignments && !data.staff_ids) {
      for (const a of data.assignments) {
        let codes: string[] | null = a.service_codes;
        if (codes !== null) {
          codes = Array.from(new Set(codes));
          const unknown = codes.filter((c) => !allCodesSet.has(c));
          if (unknown.length > 0) {
            throw new Error(
              `Service code${unknown.length === 1 ? "" : "s"} not authorized for this client: ${unknown.join(", ")}`,
            );
          }
          if (codes.length === 0) continue; // drop staff w/ empty scope
          if (allCodes.length > 0 && codes.length === allCodes.length) codes = null;
        }
        desired.set(a.staff_id, codes);
      }
    } else if (data.staff_ids) {
      for (const id of data.staff_ids) desired.set(id, null);
    }

    const { data: existing, error: rErr } = await supabase
      .from("staff_assignments")
      .select("id, staff_id, service_codes")
      .eq("organization_id", data.organization_id)
      .eq("client_id", data.client_id);
    if (rErr) throw rErr;

    type Existing = { id: string; staff_id: string; service_codes: string[] | null };
    const existingByStaff = new Map<string, Existing>();
    for (const r of (existing ?? []) as Existing[]) existingByStaff.set(r.staff_id, r);

    let added = 0, removed = 0, updated = 0;

    const toInsert: Array<{
      organization_id: string; client_id: string; staff_id: string;
      is_group_home_assignment: boolean; service_codes: string[] | null;
    }> = [];
    for (const [staffId, codes] of desired.entries()) {
      const prev = existingByStaff.get(staffId);
      if (!prev) {
        toInsert.push({
          organization_id: data.organization_id,
          client_id: data.client_id,
          staff_id: staffId,
          is_group_home_assignment: false,
          service_codes: codes,
        });
      } else {
        const a = JSON.stringify(prev.service_codes ?? null);
        const b = JSON.stringify(codes ?? null);
        if (a !== b) {
          const { error: uErr } = await supabase
            .from("staff_assignments")
            .update({ service_codes: codes })
            .eq("id", prev.id);
          if (uErr) throw uErr;
          updated++;
        }
      }
    }
    if (toInsert.length > 0) {
      const { error: iErr } = await supabase
        .from("staff_assignments")
        .upsert(toInsert, { onConflict: "staff_id,client_id", ignoreDuplicates: false });
      if (iErr) throw iErr;
      added = toInsert.length;
    }

    const toRemoveIds: string[] = [];
    for (const [staffId, row] of existingByStaff.entries()) {
      if (!desired.has(staffId)) toRemoveIds.push(row.id);
    }
    if (toRemoveIds.length > 0) {
      const { error: dErr } = await supabase
        .from("staff_assignments")
        .delete()
        .in("id", toRemoveIds);
      if (dErr) throw dErr;
      removed = toRemoveIds.length;
    }

    return { added, removed, updated };
  });

// ──────────────────────────────────────────────────────────────────────────────
// Setup tool A2 — single (staff, client, code) additive/subtractive edits.
// Used by the per-code "+ Add staff" control on the client profile's
// Authorized Codes section and by the intake add-codes prompt. Unlike
// setClientCaseload (which replaces the client's full desired state), these
// touch exactly one staff/code pairing and leave every other assignment on
// the client untouched.
// ──────────────────────────────────────────────────────────────────────────────
async function loadClientAuthorizedCodes(supabase: any, clientId: string): Promise<Set<string>> {
  const { data: clientRow } = await supabase
    .from("clients")
    .select("authorized_dspd_codes, job_code")
    .eq("id", clientId)
    .maybeSingle();
  return new Set<string>(
    [
      ...(((clientRow as { authorized_dspd_codes?: string[] } | null)?.authorized_dspd_codes) ?? []),
      ...(((clientRow as { job_code?: string[] } | null)?.job_code) ?? []),
    ].filter(Boolean),
  );
}

export const addStaffToClientCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    client_id: string;
    staff_id: string;
    service_code: string;
  }) =>
    z.object({
      organization_id: z.string().uuid(),
      client_id: z.string().uuid(),
      staff_id: z.string().uuid(),
      service_code: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase } = context as any;
    const code = data.service_code.toUpperCase();

    const allCodes = await loadClientAuthorizedCodes(supabase, data.client_id);
    if (!allCodes.has(code)) {
      throw new Error(`Service code not authorized for this client: ${code}`);
    }

    const { data: existing, error: rErr } = await supabase
      .from("staff_assignments")
      .select("id, service_codes")
      .eq("organization_id", data.organization_id)
      .eq("client_id", data.client_id)
      .eq("staff_id", data.staff_id)
      .maybeSingle();
    if (rErr) throw rErr;

    if (!existing) {
      const { error: iErr } = await supabase.from("staff_assignments").insert({
        organization_id: data.organization_id,
        client_id: data.client_id,
        staff_id: data.staff_id,
        is_group_home_assignment: false,
        service_codes: [code],
      });
      if (iErr) throw iErr;
      return { ok: true };
    }

    const scopes = (existing as { service_codes: string[] | null }).service_codes;
    if (scopes === null) return { ok: true }; // already scoped to all codes
    if (scopes.includes(code)) return { ok: true }; // already assigned

    let next: string[] | null = Array.from(new Set([...scopes, code]));
    if (allCodes.size > 0 && next.length === allCodes.size) next = null; // collapse to "all"
    const { error: uErr } = await supabase
      .from("staff_assignments")
      .update({ service_codes: next })
      .eq("id", (existing as { id: string }).id);
    if (uErr) throw uErr;
    return { ok: true };
  });

export const removeStaffFromClientCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    client_id: string;
    staff_id: string;
    service_code: string;
  }) =>
    z.object({
      organization_id: z.string().uuid(),
      client_id: z.string().uuid(),
      staff_id: z.string().uuid(),
      service_code: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase } = context as any;
    const code = data.service_code.toUpperCase();

    const { data: existing, error: rErr } = await supabase
      .from("staff_assignments")
      .select("id, service_codes")
      .eq("organization_id", data.organization_id)
      .eq("client_id", data.client_id)
      .eq("staff_id", data.staff_id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!existing) return { ok: true };

    const scopes = (existing as { service_codes: string[] | null }).service_codes;
    const id = (existing as { id: string }).id;

    let remaining: string[];
    if (scopes === null) {
      const allCodes = await loadClientAuthorizedCodes(supabase, data.client_id);
      remaining = Array.from(allCodes).filter((c) => c !== code);
    } else {
      remaining = scopes.filter((c) => c !== code);
    }

    if (remaining.length === 0) {
      const { error: dErr } = await supabase.from("staff_assignments").delete().eq("id", id);
      if (dErr) throw dErr;
    } else {
      const { error: uErr } = await supabase
        .from("staff_assignments")
        .update({ service_codes: remaining })
        .eq("id", id);
      if (uErr) throw uErr;
    }
    return { ok: true };
  });

// ──────────────────────────────────────────────────────────────────────────────
// Open shift — staff "take" with conflict pre-check.
// Sets staff_id + status='accepted' atomically when no conflict; otherwise
// throws a friendly error the UI surfaces as a pop-up.
// ──────────────────────────────────────────────────────────────────────────────
export const takeOpenShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shift_id: string }) =>
    z.object({ shift_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;

    const { data: shift, error: sErr } = await supabase
      .from("scheduled_shifts")
      .select(
        "id, organization_id, staff_id, client_id, starts_at, ends_at, service_code, status",
      )
      .eq("id", data.shift_id)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!shift) throw new Error("Shift no longer available.");
    if (shift.staff_id)
      throw new Error("Someone already took this shift.");
    if (!["open", "pending"].includes(shift.status))
      throw new Error("This shift isn't open anymore.");

    // Caseload check
    const { data: assign } = await supabase
      .from("staff_assignments")
      .select("id")
      .eq("organization_id", shift.organization_id)
      .eq("staff_id", userId)
      .eq("client_id", shift.client_id)
      .maybeSingle();
    if (!assign)
      throw new Error("This client isn't on your caseload.");

    // Time-off check
    const day = (shift.starts_at as string).slice(0, 10);
    const { data: off } = await supabase
      .from("time_off_requests")
      .select("id")
      .eq("organization_id", shift.organization_id)
      .eq("staff_id", userId)
      .eq("status", "approved")
      .lte("start_date", day)
      .gte("end_date", day)
      .maybeSingle();
    if (off) throw new Error("You're marked off that day.");

    // Conflict check — any of your other shifts overlap this window?
    const { data: conflicts, error: cErr } = await supabase
      .from("scheduled_shifts")
      .select("id, starts_at, ends_at, service_code")
      .eq("organization_id", shift.organization_id)
      .eq("staff_id", userId)
      .lt("starts_at", shift.ends_at)
      .gt("ends_at", shift.starts_at);
    if (cErr) throw cErr;
    if ((conflicts ?? []).length > 0) {
      const c = conflicts![0] as {
        starts_at: string; ends_at: string; service_code: string | null;
      };
      const when = `${new Date(c.starts_at).toLocaleString(undefined, {
        weekday: "short", hour: "numeric", minute: "2-digit",
      })}–${new Date(c.ends_at).toLocaleTimeString(undefined, {
        hour: "numeric", minute: "2-digit",
      })}`;
      throw new Error(
        `Can't take this shift — it conflicts with your ${c.service_code ?? "shift"} on ${when}.`,
      );
    }

    const { error: uErr } = await supabase
      .from("scheduled_shifts")
      .update({
        staff_id: userId,
        status: "accepted",
        claim_requested_by: null,
        published: true,
      })
      .eq("id", data.shift_id)
      .is("staff_id", null);
    if (uErr) throw uErr;

    return { ok: true };
  });

// ──────────────────────────────────────────────────────────────────────────────
// Nectar — draft shifts from a free-text prompt.
// Resolves names → real ids from this org's records. Unknown names/codes
// come back as flagged drafts the admin fixes before publishing.
// ──────────────────────────────────────────────────────────────────────────────
type DraftShift = {
  staff_id: string | null;
  staff_label: string | null;
  client_id: string | null;
  client_label: string | null;
  service_code: string | null;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
  flags: string[];
};

export const nectarDraftShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    prompt: string;
    week_start_iso: string;
  }) =>
    z.object({
      organization_id: z.string().uuid(),
      prompt: z.string().min(3).max(4000),
      week_start_iso: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase } = context as any;

    const [staffRes, clientsRes, authsRes] = await Promise.all([
      supabase
        .from("organization_members")
        .select("user_id, profiles:profiles!inner(id, first_name, last_name, full_name)")
        .eq("organization_id", data.organization_id)
        .eq("active", true),
      supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", data.organization_id),
      supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("client_billing_codes" as any)
        .select("client_id, service_code, service_end_date")
        .eq("organization_id", data.organization_id),
    ]);

    type StaffRow = { profiles: { id: string; first_name: string | null; last_name: string | null; full_name: string | null } };
    const staffList = ((staffRes.data ?? []) as unknown as StaffRow[])
      .map((m) => m.profiles)
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        name:
          (p.full_name?.trim()) ||
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
          "Staff",
      }));
    const clientList = ((clientsRes.data ?? []) as Array<{
      id: string; first_name: string; last_name: string;
    }>).map((c) => ({
      id: c.id,
      name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
    }));
    const today = new Date().toISOString().slice(0, 10);
    const authsByClient = new Map<string, Set<string>>();
    for (const a of (authsRes.data ?? []) as Array<{
      client_id: string; service_code: string; service_end_date: string | null;
    }>) {
      if (a.service_end_date && a.service_end_date <= today) continue;
      const set = authsByClient.get(a.client_id) ?? new Set<string>();
      set.add((a.service_code ?? "").toUpperCase());
      authsByClient.set(a.client_id, set);
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured.");

    const system = `You are Nectar, a scheduling assistant for HIVE.
Output strict JSON with shape: {"drafts": [{"staff_name": string|null, "client_name": string|null, "service_code": string|null, "starts_at": string|null, "ends_at": string|null, "notes": string|null}]}.
Use ISO8601 UTC for starts_at/ends_at. The current week starts on ${data.week_start_iso}.
Only use staff and client names that appear in the lists below; if a name is ambiguous or missing, leave it null.
Only use service codes that appear in the codes list. Use null otherwise.

STAFF: ${JSON.stringify(staffList.map((s) => s.name))}
CLIENTS: ${JSON.stringify(clientList.map((c) => c.name))}
SERVICE CODES: ["SLH","SLN","COM","PAC","RP2","RP4","RP5","HHS","RHS","DSI","DSG","DSP","SEI","CHA","HSQ","PM1"]`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "bedrock",
        messages: [
          { role: "system", content: system },
          { role: "user", content: data.prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      if (aiRes.status === 402)
        throw new Error("Nectar credits exhausted — add credits in Workspace billing.");
      if (aiRes.status === 429)
        throw new Error("Nectar is rate-limited — try again shortly.");
      throw new Error(`Nectar error: ${txt.slice(0, 200)}`);
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { drafts?: Array<Record<string, string | null>> } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const staffByName = new Map(staffList.map((s) => [norm(s.name), s.id]));
    const clientByName = new Map(clientList.map((c) => [norm(c.name), c.id]));

    const drafts: DraftShift[] = (parsed.drafts ?? []).map((d) => {
      const flags: string[] = [];
      const staffName = d.staff_name ?? null;
      const clientName = d.client_name ?? null;
      const code = (d.service_code ?? "")?.toUpperCase() || null;
      const staffId = staffName ? staffByName.get(norm(staffName)) ?? null : null;
      const clientId = clientName ? clientByName.get(norm(clientName)) ?? null : null;
      if (staffName && !staffId) flags.push("unknown staff");
      if (clientName && !clientId) flags.push("unknown client");
      if (clientId && code && !authsByClient.get(clientId)?.has(code))
        flags.push(`${code} not authorized for client`);
      if (!d.starts_at || !d.ends_at) flags.push("missing time");
      return {
        staff_id: staffId,
        staff_label: staffName,
        client_id: clientId,
        client_label: clientName,
        service_code: code,
        starts_at: d.starts_at ?? null,
        ends_at: d.ends_at ?? null,
        notes: d.notes ?? null,
        flags,
      };
    });

    return { drafts };
  });

// ──────────────────────────────────────────────────────────────────────────────
// Auto-fill open shifts — proposes (staff, shift) pairings for open shifts in
// the week. Doesn't write; admin reviews and accepts in the same drawer.
// ──────────────────────────────────────────────────────────────────────────────
export const autoFillOpenShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; week_start_iso: string }) =>
    z.object({
      organization_id: z.string().uuid(),
      week_start_iso: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase } = context as any;
    const start = new Date(data.week_start_iso);
    const end = new Date(start); end.setDate(end.getDate() + 7);

    const [openRes, allShiftRes, assignRes, offRes] = await Promise.all([
      supabase
        .from("scheduled_shifts")
        .select("id, client_id, service_code, starts_at, ends_at")
        .eq("organization_id", data.organization_id)
        .is("staff_id", null)
        .in("status", ["open"])
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at"),
      supabase
        .from("scheduled_shifts")
        .select("staff_id, starts_at, ends_at")
        .eq("organization_id", data.organization_id)
        .not("staff_id", "is", null)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString()),
      supabase
        .from("staff_assignments")
        .select("staff_id, client_id")
        .eq("organization_id", data.organization_id),
      supabase
        .from("time_off_requests")
        .select("staff_id, start_date, end_date")
        .eq("organization_id", data.organization_id)
        .eq("status", "approved")
        .gte("end_date", start.toISOString().slice(0, 10)),
    ]);
    if (openRes.error) throw openRes.error;

    const open = (openRes.data ?? []) as Array<{
      id: string; client_id: string; service_code: string;
      starts_at: string; ends_at: string;
    }>;
    const taken = (allShiftRes.data ?? []) as Array<{
      staff_id: string; starts_at: string; ends_at: string;
    }>;
    const assigns = (assignRes.data ?? []) as Array<{
      staff_id: string; client_id: string;
    }>;
    const off = (offRes.data ?? []) as Array<{
      staff_id: string; start_date: string; end_date: string;
    }>;

    const staffByClient = new Map<string, Set<string>>();
    for (const a of assigns) {
      const set = staffByClient.get(a.client_id) ?? new Set<string>();
      set.add(a.staff_id);
      staffByClient.set(a.client_id, set);
    }
    const offByStaff = new Map<string, Array<[string, string]>>();
    for (const o of off) {
      const arr = offByStaff.get(o.staff_id) ?? [];
      arr.push([o.start_date, o.end_date]);
      offByStaff.set(o.staff_id, arr);
    }

    const overlaps = (aS: string, aE: string, bS: string, bE: string) =>
      new Date(aS) < new Date(bE) && new Date(aE) > new Date(bS);

    type Proposal = {
      shift_id: string; client_id: string; service_code: string;
      starts_at: string; ends_at: string;
      staff_id: string | null; reason: string;
    };
    const proposals: Proposal[] = open.map((s) => {
      const candidates = Array.from(staffByClient.get(s.client_id) ?? []);
      const day = s.starts_at.slice(0, 10);
      const eligible = candidates.filter((sid) => {
        const offs = offByStaff.get(sid) ?? [];
        if (offs.some(([a, b]) => a <= day && day <= b)) return false;
        const conflict = taken.some(
          (t) => t.staff_id === sid && overlaps(s.starts_at, s.ends_at, t.starts_at, t.ends_at),
        );
        return !conflict;
      });
      // Greedy: pick least-loaded staff first to spread shifts.
      const load = new Map<string, number>();
      for (const t of taken) load.set(t.staff_id, (load.get(t.staff_id) ?? 0) + 1);
      eligible.sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0));
      const pick = eligible[0] ?? null;
      if (pick) {
        // Tentatively reserve so the next iteration sees the conflict
        taken.push({ staff_id: pick, starts_at: s.starts_at, ends_at: s.ends_at });
      }
      return {
        shift_id: s.id,
        client_id: s.client_id,
        service_code: s.service_code,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        staff_id: pick,
        reason: pick
          ? "Eligible — caseload, no conflict, not on time off."
          : candidates.length === 0
          ? "No staff on this client's caseload."
          : "All caseload staff conflict or are off.",
      };
    });

    return { proposals };
  });

// Accept a batch of nectar/auto-fill drafts — writes through createShift-equivalent.
export const applyDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    drafts: Array<{
      // For Nectar new shifts
      staff_id?: string | null;
      client_id?: string | null;
      service_code?: string | null;
      starts_at?: string | null;
      ends_at?: string | null;
      notes?: string | null;
      // For auto-fill: update existing open shift
      assign_to_shift_id?: string | null;
    }>;
  }) =>
    z.object({
      organization_id: z.string().uuid(),
      drafts: z.array(z.object({
        staff_id: z.string().uuid().nullable().optional(),
        client_id: z.string().uuid().nullable().optional(),
        service_code: z.string().nullable().optional(),
        starts_at: z.string().nullable().optional(),
        ends_at: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        assign_to_shift_id: z.string().uuid().nullable().optional(),
      })),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;
    let created = 0;
    let assigned = 0;
    for (const d of data.drafts) {
      if (d.assign_to_shift_id) {
        if (!d.staff_id) continue;
        const { error } = await supabase
          .from("scheduled_shifts")
          .update({ staff_id: d.staff_id, status: "pending" })
          .eq("id", d.assign_to_shift_id)
          .eq("organization_id", data.organization_id);
        if (error) throw error;
        assigned++;
      } else {
        if (!d.client_id || !d.service_code || !d.starts_at || !d.ends_at) continue;
        const code = d.service_code.toUpperCase();
        const insertRow = {
          organization_id: data.organization_id,
          staff_id: d.staff_id ?? null,
          client_id: d.client_id,
          service_code: code,
          job_code: code,
          starts_at: d.starts_at,
          ends_at: d.ends_at,
          status: d.staff_id ? "pending" : "open",
          published: false,
          shift_type: "hourly",
          notes: d.notes ?? null,
          created_by: userId,
          created_from: "nectar",
        };
        const { gateScheduledShiftInsert } = await import("@/lib/scheduling/shift-commit");
        await gateScheduledShiftInsert(supabase, [insertRow as never], { mode: "bulk_auto", userId });
        const { error } = await supabase.from("scheduled_shifts").insert(insertRow);
        if (error) throw error;
        created++;
      }
    }
    return { created, assigned };
  });
