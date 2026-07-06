/**
 * Shared server-side helper: detect billing_conflict candidates for a batch of
 * scheduled_shifts inserts and raise compliance flags accordingly.
 *
 * This is the SINGLE choke-point every scheduling insert site routes through.
 * It never inserts — call it before your existing insert. Two modes:
 *
 *   mode: 'bulk_auto'  → any candidate raises an OPEN flag (attributed to
 *                        userId) and the insert is allowed to proceed.
 *                        Used by server-side bulk expansions where no live
 *                        provider is present to decide.
 *
 *   mode: 'strict_acknowledgements'
 *                      → given acknowledgements[] covering every candidate,
 *                        each is raised + resolved as acknowledged_continued.
 *                        If any candidate lacks an ack, throws
 *                        ComplianceReviewRequiredError(candidates) so the
 *                        caller (UI) can open the resolution dialog.
 *
 * Detection is per (client_id, service_date) bundle. Sibling shifts already
 * committed for the same client+date are read from scheduled_shifts and
 * merged into the code set — so a conflict is judged against the *full* day,
 * not just the incoming row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ShiftInsertRow = {
  organization_id: string;
  client_id: string | null;
  staff_id: string | null;
  service_code: string | null;
  starts_at: string;
  ends_at: string;
  [k: string]: unknown;
};

export type CandidateFlagLike = {
  ruleId: string;
  requirementId: string;
  matchedCodes: string[];
  humanExplanation: string;
  source: { title: string; verbatim: string; citation: string | null };
  /** which bundle this candidate came from */
  bundle: { clientId: string; date: string; incomingCodes: string[]; siblingCodes: string[] };
};

export type Acknowledgement = {
  ruleId: string;
  resolution: "acknowledged_continued" | "stopped";
  note?: string;
};

export class ComplianceReviewRequiredError extends Error {
  candidates: CandidateFlagLike[];
  constructor(candidates: CandidateFlagLike[]) {
    super("Compliance review required for one or more scheduling entries.");
    this.name = "ComplianceReviewRequiredError";
    this.candidates = candidates;
  }
}

const ACTIVE_STATES = new Set(["active", "active_by_code"]);

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Bundle key: one (client_id, date) group. */
type Bundle = {
  organizationId: string;
  clientId: string;
  date: string;
  rows: ShiftInsertRow[];
  incomingCodes: string[];
};

function groupBundles(rows: ShiftInsertRow[]): Bundle[] {
  const map = new Map<string, Bundle>();
  for (const r of rows) {
    if (!r.client_id || !r.service_code) continue;
    const date = dateOf(r.starts_at);
    const key = `${r.organization_id}|${r.client_id}|${date}`;
    let b = map.get(key);
    if (!b) {
      b = {
        organizationId: r.organization_id,
        clientId: r.client_id,
        date,
        rows: [],
        incomingCodes: [],
      };
      map.set(key, b);
    }
    b.rows.push(r);
    b.incomingCodes.push(String(r.service_code).toUpperCase());
  }
  return Array.from(map.values());
}

/** Fetch sibling codes already committed for the same client on the same date. */
async function fetchSiblingCodes(
  supabase: SupabaseClient<Database>,
  bundle: Bundle,
): Promise<string[]> {
  const dayStart = `${bundle.date}T00:00:00.000Z`;
  const dayEnd = `${bundle.date}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from("scheduled_shifts")
    .select("service_code")
    .eq("organization_id", bundle.organizationId)
    .eq("client_id", bundle.clientId)
    .gte("starts_at", dayStart)
    .lte("starts_at", dayEnd);
  if (error) throw error;
  return (data ?? [])
    .map((r) => (r.service_code ? String(r.service_code).toUpperCase() : null))
    .filter((c): c is string => Boolean(c));
}

/** Load confirmed billing_conflict rules whose source requirement is active. */
async function loadActiveBillingRules(
  supabase: SupabaseClient<Database>,
  organizationId: string,
) {
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("nectar_compliance_rules" as any)
    .select(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "id, requirement_id, rule_definition, requirement:nectar_requirements!inner(id, title, original_title, description, original_description, source_citation, activation_state)" as any,
    )
    .eq("organization_id", organizationId)
    .eq("rule_type", "billing_conflict")
    .eq("status", "confirmed");
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).filter(
    (r) => r.requirement && ACTIVE_STATES.has(r.requirement.activation_state),
  );
}

export async function detectShiftBundleConflicts(
  supabase: SupabaseClient<Database>,
  rows: ShiftInsertRow[],
): Promise<CandidateFlagLike[]> {
  if (rows.length === 0) return [];
  const orgIds = Array.from(new Set(rows.map((r) => r.organization_id)));
  const rulesByOrg = new Map<string, Awaited<ReturnType<typeof loadActiveBillingRules>>>();
  for (const orgId of orgIds) {
    rulesByOrg.set(orgId, await loadActiveBillingRules(supabase, orgId));
  }
  const bundles = groupBundles(rows);
  const candidates: CandidateFlagLike[] = [];
  for (const b of bundles) {
    const rules = rulesByOrg.get(b.organizationId) ?? [];
    if (rules.length === 0) continue;
    const siblings = await fetchSiblingCodes(supabase, b);
    const allCodes = Array.from(new Set([...b.incomingCodes, ...siblings]));
    for (const r of rules) {
      const def = r.rule_definition ?? {};
      const conflicting = Array.isArray(def.conflicting_codes)
        ? (def.conflicting_codes as string[]).map((c) => String(c).toUpperCase())
        : [];
      if (conflicting.length < 2) continue;
      const matched = conflicting.filter((c) => allCodes.includes(c));
      if (matched.length >= 2) {
        candidates.push({
          ruleId: r.id,
          requirementId: r.requirement.id,
          matchedCodes: matched,
          humanExplanation: `Codes ${matched.join(" + ")} appear for client on ${b.date}, which this rule flags as a conflict.`,
          source: {
            title: r.requirement.original_title ?? r.requirement.title ?? "Requirement",
            verbatim: r.requirement.original_description ?? r.requirement.description ?? "",
            citation: r.requirement.source_citation ?? null,
          },
          bundle: {
            clientId: b.clientId,
            date: b.date,
            incomingCodes: b.incomingCodes,
            siblingCodes: siblings,
          },
        });
      }
    }
  }
  return candidates;
}

async function raiseAndMaybeResolve(
  supabase: SupabaseClient<Database>,
  userId: string,
  cand: CandidateFlagLike,
  ack: Acknowledgement | null,
) {
  const orgLookup = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("nectar_compliance_rules" as any)
    .select("organization_id")
    .eq("id", cand.ruleId)
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgId = (orgLookup.data as any)?.organization_id ?? null;
  const { data: flag, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("nectar_compliance_flags" as any)
    .insert({
      organization_id: orgId,
      rule_id: cand.ruleId,
      requirement_id: cand.requirementId,
      detection_type: "billing_conflict",
      subject_context: {
        source: "scheduling",
        client_id: cand.bundle.clientId,
        date: cand.bundle.date,
        incoming_codes: cand.bundle.incomingCodes,
        sibling_codes: cand.bundle.siblingCodes,
        matched_codes: cand.matchedCodes,
      },
      source_snapshot: cand.source,
      raised_to: userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (ack) {
    const { error: uErr } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_flags" as any)
      .update({
        resolution: ack.resolution,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        resolution_note: ack.note ?? null,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("id", (flag as any).id);
    if (uErr) throw uErr;
  }
}

export type GateOpts =
  | { mode: "bulk_auto"; userId: string }
  | { mode: "strict_acknowledgements"; userId: string; acknowledgements: Acknowledgement[] };

/**
 * Run detection and raise/resolve flags. Does NOT insert. Returns the
 * candidates that fired (empty ⇒ safe to insert with no side effects).
 * Throws ComplianceReviewRequiredError in strict mode when acks are missing.
 */
export async function gateScheduledShiftInsert(
  supabase: SupabaseClient<Database>,
  rows: ShiftInsertRow[],
  opts: GateOpts,
): Promise<{ candidates: CandidateFlagLike[]; blocked: boolean }> {
  const candidates = await detectShiftBundleConflicts(supabase, rows);
  if (candidates.length === 0) return { candidates, blocked: false };

  if (opts.mode === "strict_acknowledgements") {
    const ackByRule = new Map(opts.acknowledgements.map((a) => [a.ruleId, a] as const));
    const missing = candidates.filter((c) => !ackByRule.has(c.ruleId));
    if (missing.length > 0) {
      throw new ComplianceReviewRequiredError(missing);
    }
    const anyStopped = candidates.some((c) => ackByRule.get(c.ruleId)!.resolution === "stopped");
    for (const c of candidates) {
      await raiseAndMaybeResolve(supabase, opts.userId, c, ackByRule.get(c.ruleId) ?? null);
    }
    return { candidates, blocked: anyStopped };
  }

  // bulk_auto: raise open flags, insert allowed to proceed
  for (const c of candidates) {
    await raiseAndMaybeResolve(supabase, opts.userId, c, null);
  }
  return { candidates, blocked: false };
}
