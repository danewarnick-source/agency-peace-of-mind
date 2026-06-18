import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ───── Public types ────────────────────────────────────────────────────────

export interface CompanyRow {
  organization_id: string;
  name: string;
  plan: string;
  status: string;
  mrr_cents: number;
  renewal_date: string | null;
  trial_ends_at: string | null;
  staff_count: number;
  client_count: number;
  open_tickets: number;
  health: "good" | "warn" | "risk";
}

export interface ExecKpis {
  active_companies: number;
  trial_companies: number; // kept for back-compat; always 0 — no trial state
  past_due_companies: number;
  locked_companies: number;
  mrr_cents: number;
  open_tickets: number;
}

export interface CompanyDetail {
  organization_id: string;
  name: string;
  legal_name: string | null;
  dba_name: string | null;
  display_acronym: string | null;
  billing_sms_phone: string | null;

  /** Provider-submitted fields captured during signup. Read-only in exec UI. */
  signup: {
    contact_name: string | null;
    contact_phone: string | null;
    staff_count_at_signup: number | null;
    billing_interval: string | null; // 'monthly' | 'annual'
    signup_date: string | null;
  };

  subscription: {
    plan: string;
    status: string;
    mrr_cents: number;
    renewal_date: string | null;
    trial_ends_at: string | null;
    started_at: string;
    canceled_at: string | null;
    notes: string | null;
    staff_count: number | null;
    billing_interval: string | null;
    current_period_end: string | null;
    past_due_since: string | null;
    locked_at: string | null;
  } | null;
  usage: {
    staff_count: number;
    client_count: number;
    hours_last_30d: number;
    active_staff_last_7d: number;
  };
  tickets: Array<{
    id: string;
    subject: string;
    status: string;
    severity: string;
    source: string;
    created_at: string;
    updated_at: string;
  }>;
}

export interface TicketRow {
  id: string;
  organization_id: string;
  organization_name: string;
  subject: string;
  body: string | null;
  status: string;
  severity: string;
  source: string;
  opened_by: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

// ───── Helpers ─────────────────────────────────────────────────────────────

/**
 * Hive Standard volume pricing — single rate table, $500 monthly minimum.
 * Mirrors signup.tsx pricing so MRR is consistent between the provider's
 * own billing page and the executive overview without a round-trip to Stripe.
 */
function ratePerStaff(staff: number): number {
  if (staff >= 50) return 99;
  if (staff >= 20) return 109;
  return 125;
}
function liveMonthlyCents(staffCount: number | null | undefined, plan: string | null | undefined): number {
  // Enterprise plans are operator-priced — fall back to whatever mrr_cents is
  // recorded on the subscription row (set manually by Hive Exec).
  if (plan === "enterprise") return -1; // sentinel: caller uses recorded mrr_cents
  const n = Math.max(0, Math.floor(staffCount ?? 0));
  if (n <= 0) return 0;
  return Math.max(500, n * ratePerStaff(n)) * 100;
}

async function ensureExecutive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("hive_executives")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Access denied — HIVE Executive permission required.");
}

async function audit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  action: string,
  target_org_id: string | null,
  summary: string,
): Promise<void> {
  await supabase.from("hive_executive_audit_log").insert({
    actor_user_id: userId,
    action,
    target_org_id,
    summary,
  });
}

// ───── Permission check ────────────────────────────────────────────────────

export const checkHiveExecutive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isExecutive: boolean }> => {
    try {
      const { supabase, userId } = context;
      const { data, error } = await supabase
        .from("hive_executives")
        .select("id")
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle();
      if (error) {
        console.error("checkHiveExecutive query error:", error);
        return { isExecutive: false };
      }
      return { isExecutive: !!data };
    } catch (err) {
      console.error("checkHiveExecutive unhandled error:", err);
      return { isExecutive: false };
    }
  });

// ───── KPIs ────────────────────────────────────────────────────────────────

export const getExecKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExecKpis> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    await audit(supabase, userId, "view_kpis", null, "Loaded executive KPIs");

    const { data: subs } = await supabase
      .from("org_subscriptions")
      .select("status, mrr_cents, staff_count, plan");
    const { count: ticketCount } = await supabase
      .from("org_support_tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["submitted", "in_progress", "waiting_customer"]);

    const rows = (subs ?? []) as Array<{
      status: string;
      mrr_cents: number | null;
      staff_count: number | null;
      plan: string | null;
    }>;

    // MRR is computed live from current staff_count + volume tier — falls
    // back to the recorded mrr_cents only for Enterprise (operator-priced)
    // or when staff_count is somehow missing on legacy rows.
    const mrr_cents = rows
      .filter((r) => r.status === "active" || r.status === "past_due")
      .reduce((sum, r) => {
        const live = liveMonthlyCents(r.staff_count, r.plan);
        const value = live >= 0 ? live : (r.mrr_cents ?? 0);
        return sum + value;
      }, 0);

    return {
      active_companies: rows.filter((r) => r.status === "active").length,
      trial_companies: 0, // no trial state in Hive — providers pay at signup
      past_due_companies: rows.filter((r) => r.status === "past_due").length,
      locked_companies: rows.filter((r) => r.status === "locked").length,
      mrr_cents,
      open_tickets: ticketCount ?? 0,
    };
  });

// ───── Companies list ──────────────────────────────────────────────────────

export const listCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanyRow[]> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    await audit(supabase, userId, "list_companies", null, "Loaded company list");

    const { data: orgs, error: orgsErr } = await supabase
      .from("organizations")
      .select("id, name");
    if (orgsErr) throw orgsErr;

    const { data: subs } = await supabase
      .from("org_subscriptions")
      .select("organization_id, plan, status, mrr_cents, renewal_date, trial_ends_at, staff_count, billing_interval");
    const subByOrg = new Map<string, NonNullable<typeof subs>[number]>(
      (subs ?? []).map((s) => [s.organization_id, s]),
    );

    // Counts (HEAD requests so no row data crosses the wire)
    const orgIds = ((orgs ?? []) as Array<{ id: string; name: string }>).map((o) => o.id);
    const counts = await Promise.all(
      orgIds.map(async (orgId) => {
        const [staffRes, clientRes, ticketRes] = await Promise.all([
          supabase
            .from("organization_members")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .eq("active", true),
          supabase
            .from("clients")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId),
          supabase
            .from("org_support_tickets")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .in("status", ["submitted", "in_progress", "waiting_customer"]),
        ]);
        return {
          orgId,
          staff: staffRes.count ?? 0,
          clients: clientRes.count ?? 0,
          tickets: ticketRes.count ?? 0,
        };
      }),
    );
    const countByOrg = new Map(counts.map((c) => [c.orgId, c]));

    return ((orgs ?? []) as Array<{ id: string; name: string }>).map((o) => {
      const sub = subByOrg.get(o.id);
      const c = countByOrg.get(o.id);
      // No subscription row → show as inactive (was 'trial' before — Hive has
      // no trial state). For accounts with a sub, surface the real status.
      const status = sub?.status ?? "inactive";
      const tickets = c?.tickets ?? 0;
      let health: CompanyRow["health"] = "good";
      if (status === "locked" || status === "past_due" || tickets >= 3) health = "risk";
      else if (status === "inactive" || tickets >= 1) health = "warn";

      // Live MRR — recompute from current sub.staff_count + volume tier so
      // the exec overview reflects today's billable basis, not a signup snapshot.
      const subStaff = (sub as { staff_count: number | null } | null)?.staff_count ?? null;
      const live = liveMonthlyCents(subStaff, sub?.plan ?? null);
      const mrr_cents =
        sub == null ? 0 : live >= 0 ? live : (sub.mrr_cents ?? 0);

      return {
        organization_id: o.id,
        name: o.name,
        plan: sub?.plan ?? "hive_standard",
        status,
        mrr_cents,
        renewal_date: sub?.renewal_date ?? null,
        trial_ends_at: sub?.trial_ends_at ?? null,
        staff_count: c?.staff ?? 0,
        client_count: c?.clients ?? 0,
        open_tickets: tickets,
        health,
      };
    });
  });

// ───── Company detail (aggregate-only, no PHI) ─────────────────────────────

function validateCompanyDetailInput(input: unknown): { organizationId: string } {
  const i = (input ?? {}) as Record<string, unknown>;
  const organizationId = typeof i.organizationId === "string" ? i.organizationId : "";
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
    throw new Error("Invalid organization id.");
  }
  return { organizationId };
}

export const getCompanyDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateCompanyDetailInput)
  .handler(async ({ data, context }): Promise<CompanyDetail> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    await audit(supabase, userId, "view_company", data.organizationId, "Opened company detail");

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name, legal_name, dba_name, display_acronym, billing_sms_phone, created_by, created_at")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) throw new Error("Organization not found.");

    const { data: sub } = await supabase
      .from("org_subscriptions")
      .select(
        "plan, status, mrr_cents, renewal_date, trial_ends_at, started_at, canceled_at, notes, staff_count, billing_interval, current_period_end, past_due_since, locked_at",
      )
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    // Signup contact name comes from the org creator's profile.
    const createdBy = (org as { created_by: string | null }).created_by;
    let contactName: string | null = null;
    if (createdBy) {
      const { data: creator } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", createdBy)
        .maybeSingle();
      contactName = (creator as { full_name: string | null } | null)?.full_name ?? null;
    }

    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [staffRes, clientRes, hoursRes, activeStaffRes, ticketsRes] = await Promise.all([
      supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", data.organizationId)
        .eq("active", true),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", data.organizationId),
      supabase
        .from("evv_timesheets")
        .select("clock_in_timestamp, clock_out_timestamp")
        .eq("organization_id", data.organizationId)
        .gte("clock_in_timestamp", since30),
      supabase
        .from("evv_timesheets")
        .select("staff_id")
        .eq("organization_id", data.organizationId)
        .gte("clock_in_timestamp", since7),
      supabase
        .from("org_support_tickets")
        .select("id, subject, status, severity, source, created_at, updated_at")
        .eq("organization_id", data.organizationId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    let hours_last_30d = 0;
    for (const r of (hoursRes.data ?? []) as Array<{
      clock_in_timestamp: string;
      clock_out_timestamp: string | null;
    }>) {
      if (!r.clock_out_timestamp) continue;
      const h =
        (new Date(r.clock_out_timestamp).getTime() - new Date(r.clock_in_timestamp).getTime()) /
        3_600_000;
      if (h > 0 && isFinite(h)) hours_last_30d += h;
    }

    const activeSet = new Set(
      ((activeStaffRes.data ?? []) as Array<{ staff_id: string }>).map((r) => r.staff_id),
    );

    // Live MRR override: when the subscription is on Hive Standard, the
    // operator should see what the provider is currently billable for today,
    // not whatever was stamped at signup. Enterprise plans keep the stored value.
    const subStaff = (sub as { staff_count: number | null } | null)?.staff_count ?? null;
    const subPlan = (sub as { plan: string | null } | null)?.plan ?? null;
    const live = liveMonthlyCents(subStaff, subPlan);
    const liveMrr = live >= 0 ? live : (sub?.mrr_cents ?? 0);

    return {
      organization_id: org.id,
      name: org.name,
      legal_name: (org as { legal_name: string | null }).legal_name ?? null,
      dba_name: (org as { dba_name: string | null }).dba_name ?? null,
      display_acronym: (org as { display_acronym: string | null }).display_acronym ?? null,
      billing_sms_phone: (org as { billing_sms_phone: string | null }).billing_sms_phone ?? null,
      signup: {
        contact_name: contactName,
        contact_phone: (org as { billing_sms_phone: string | null }).billing_sms_phone ?? null,
        staff_count_at_signup: subStaff,
        billing_interval: (sub as { billing_interval: string | null } | null)?.billing_interval ?? null,
        signup_date:
          (sub as { started_at: string | null } | null)?.started_at ??
          (org as { created_at: string | null }).created_at ??
          null,
      },
      subscription: sub
        ? {
            plan: sub.plan,
            status: sub.status,
            mrr_cents: liveMrr,
            renewal_date: sub.renewal_date,
            trial_ends_at: sub.trial_ends_at,
            started_at: sub.started_at,
            canceled_at: sub.canceled_at,
            notes: sub.notes,
            staff_count: subStaff,
            billing_interval: (sub as { billing_interval: string | null }).billing_interval,
            current_period_end: (sub as { current_period_end: string | null }).current_period_end,
            past_due_since: (sub as { past_due_since: string | null }).past_due_since,
            locked_at: (sub as { locked_at: string | null }).locked_at,
          }
        : null,
      usage: {
        staff_count: staffRes.count ?? 0,
        client_count: clientRes.count ?? 0,
        hours_last_30d: Math.round(hours_last_30d * 10) / 10,
        active_staff_last_7d: activeSet.size,
      },
      tickets: (ticketsRes.data ?? []) as CompanyDetail["tickets"],
    };
  });

// ───── Subscription update ─────────────────────────────────────────────────

function validateSubPatch(input: unknown): {
  organizationId: string;
  patch: {
    plan?: string;
    status?: string;
    mrr_cents?: number;
    renewal_date?: string | null;
    trial_ends_at?: string | null;
    notes?: string | null;
  };
} {
  const i = (input ?? {}) as Record<string, unknown>;
  const organizationId = typeof i.organizationId === "string" ? i.organizationId : "";
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid organization id.");
  const patch = (i.patch ?? {}) as Record<string, unknown>;
  const out: ReturnType<typeof validateSubPatch>["patch"] = {};
  const plans = ["hive_standard", "enterprise"];
  const statuses = ["active", "past_due", "locked", "cancelled", "canceled"];
  if (typeof patch.plan === "string" && plans.includes(patch.plan)) out.plan = patch.plan;
  if (typeof patch.status === "string" && statuses.includes(patch.status)) out.status = patch.status;
  if (typeof patch.mrr_cents === "number" && patch.mrr_cents >= 0 && patch.mrr_cents < 100_000_000)
    out.mrr_cents = Math.round(patch.mrr_cents);
  if (typeof patch.renewal_date === "string" || patch.renewal_date === null)
    out.renewal_date = (patch.renewal_date as string | null) ?? null;
  if (typeof patch.trial_ends_at === "string" || patch.trial_ends_at === null)
    out.trial_ends_at = (patch.trial_ends_at as string | null) ?? null;
  if (typeof patch.notes === "string" || patch.notes === null)
    out.notes = (patch.notes as string | null) ?? null;
  return { organizationId, patch: out };
}

export const upsertSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateSubPatch)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    const { data: existing } = await supabase
      .from("org_subscriptions")
      .select("id")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patchAny = data.patch as any;
    if (existing) {
      const { error } = await supabase
        .from("org_subscriptions")
        .update(patchAny)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("org_subscriptions").insert({
        organization_id: data.organizationId,
        ...patchAny,
      });
      if (error) throw error;
    }

    await audit(
      supabase,
      userId,
      "update_subscription",
      data.organizationId,
      `Updated: ${Object.keys(data.patch).join(", ") || "(noop)"}`,
    );
    return { ok: true };
  });

// ───── Tickets list (all orgs, exec only) ──────────────────────────────────

export const listAllTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TicketRow[]> => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);
    await audit(supabase, userId, "list_tickets", null, "Loaded ticket queue");

    const { data, error } = await supabase
      .from("org_support_tickets")
      .select(
        "id, organization_id, subject, body, status, severity, source, opened_by, created_at, updated_at, resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const orgIds = [...new Set((data ?? []).map((t) => t.organization_id))];
    const { data: orgs } = orgIds.length
      ? await supabase.from("organizations").select("id, name").in("id", orgIds)
      : { data: [] };
    const orgNameById = new Map(
      ((orgs ?? []) as Array<{ id: string; name: string }>).map((o) => [o.id, o.name]),
    );

    return ((data ?? []) as Array<Omit<TicketRow, "organization_name">>).map((t) => ({
      ...t,
      organization_name: orgNameById.get(t.organization_id) ?? "—",
    }));
  });

function validateTicketUpdate(input: unknown): {
  ticketId: string;
  patch: { status?: string; severity?: string; assignee_user_id?: string | null };
} {
  const i = (input ?? {}) as Record<string, unknown>;
  const ticketId = typeof i.ticketId === "string" ? i.ticketId : "";
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) throw new Error("Invalid ticket id.");
  const patch = (i.patch ?? {}) as Record<string, unknown>;
  const statuses = ["submitted", "in_progress", "waiting_customer", "resolved", "closed"];
  const sev = ["low", "normal", "high", "urgent"];
  const out: ReturnType<typeof validateTicketUpdate>["patch"] = {};
  if (typeof patch.status === "string" && statuses.includes(patch.status)) out.status = patch.status;
  if (typeof patch.severity === "string" && sev.includes(patch.severity)) out.severity = patch.severity;
  if (patch.assignee_user_id === null) out.assignee_user_id = null;
  else if (typeof patch.assignee_user_id === "string" && /^[0-9a-f-]{36}$/i.test(patch.assignee_user_id))
    out.assignee_user_id = patch.assignee_user_id;
  return { ticketId, patch: out };
}

export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateTicketUpdate)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    const updates: Record<string, unknown> = { ...data.patch };
    if (data.patch.status === "resolved" || data.patch.status === "closed") {
      updates.resolved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("org_support_tickets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(updates as any)
      .eq("id", data.ticketId);
    if (error) throw error;

    await audit(
      supabase,
      userId,
      "update_ticket",
      null,
      `Ticket ${data.ticketId} → ${JSON.stringify(data.patch)}`,
    );
    return { ok: true };
  });

// ───── Organization name fields update (HIVE Executive only) ───────────────

function normName(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

function validateOrgNamesInput(input: unknown): {
  organizationId: string;
  attestation: boolean;
  patch: {
    name?: string;
    legal_name?: string | null;
    dba_name?: string | null;
    display_acronym?: string | null;
  };
} {
  const i = (input ?? {}) as Record<string, unknown>;
  const organizationId = typeof i.organizationId === "string" ? i.organizationId : "";
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid organization id.");
  if (i.attestation !== true) {
    throw new Error("Approval attestation required to change organization identifying information.");
  }
  const p = (i.patch ?? {}) as Record<string, unknown>;
  const out: ReturnType<typeof validateOrgNamesInput>["patch"] = {};
  const name = normName(p.name);
  if (name === null) throw new Error("Company name cannot be empty.");
  if (typeof name === "string") {
    if (name.length > 200) throw new Error("Company name too long.");
    out.name = name;
  }
  const legal = normName(p.legal_name);
  if (legal !== undefined) out.legal_name = legal;
  const dba = normName(p.dba_name);
  if (dba !== undefined) out.dba_name = dba;
  const acr = normName(p.display_acronym);
  if (acr !== undefined) {
    if (acr && acr.length > 12) throw new Error("Display acronym must be 12 characters or fewer.");
    out.display_acronym = acr;
  }
  return { organizationId, attestation: true, patch: out };
}

export const updateOrgNames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateOrgNamesInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureExecutive(supabase, userId);

    const { data: before, error: bErr } = await supabase
      .from("organizations")
      .select("id, name, legal_name, dba_name, display_acronym")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!before) throw new Error("Organization not found.");

    type Row = { name: string; legal_name: string | null; dba_name: string | null; display_acronym: string | null };
    const b = before as unknown as Row;
    const updates: Record<string, unknown> = {};
    const diffs: Array<{ field: string; old: string | null; new: string | null }> = [];
    const fields: Array<keyof Row> = ["name", "legal_name", "dba_name", "display_acronym"];
    for (const f of fields) {
      if (f in data.patch) {
        const next = (data.patch as Record<string, string | null | undefined>)[f] ?? null;
        const prev = b[f] ?? null;
        if (next !== prev) {
          updates[f] = next;
          diffs.push({ field: f, old: prev, new: next });
        }
      }
    }
    if (!diffs.length) return { ok: true, changed: 0 };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: uErr } = await supabase.from("organizations").update(updates as any).eq("id", data.organizationId);
    if (uErr) throw uErr;

    const summary =
      "Org identifying info updated (with approval attestation): " +
      diffs.map((d) => `${d.field}: ${JSON.stringify(d.old)} → ${JSON.stringify(d.new)}`).join("; ");
    await audit(supabase, userId, "update_org_names", data.organizationId, summary);

    return { ok: true, changed: diffs.length };
  });
