/**
 * Shared helpers wiring app events into nectar_compliance_instances.
 *
 * - resolveComplianceRequirement: internal (in-HIVE) event_driven
 *   requirements auto-resolve the instant the matching feature action
 *   happens — the action itself IS the evidence.
 * - createIncidentInstances: external (state-portal) event_driven
 *   requirements for incidents need an admin to actually go do the UPI
 *   submission, so these open with real deadlines instead of
 *   auto-resolving.
 *
 * Both are additive: only confirmed, active requirements produce
 * instances, and each trigger is idempotent (checked by
 * requirement_id + triggered_by_id before inserting).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

export async function resolveComplianceRequirement(
  supabase: AnySupabase,
  organizationId: string,
  featureKey: string,
  triggerId: string,
  triggerKind: string,
  triggeredAt: Date = new Date(),
): Promise<void> {
  const { data: reqs } = await supabase
    .from("nectar_requirements")
    .select("id, compliance_pattern, feature_link, metadata")
    .eq("organization_id", organizationId)
    .eq("activation_state", "active")
    .eq("review_status", "confirmed")
    .eq("compliance_pattern", "event_driven")
    .eq("verification_type", "internal");

  for (const req of reqs ?? []) {
    const fl = req.feature_link as { feature?: string } | null;
    if (fl?.feature !== featureKey) continue;

    const { data: existing } = await supabase
      .from("nectar_compliance_instances")
      .select("id")
      .eq("requirement_id", req.id)
      .eq("triggered_by_id", triggerId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("nectar_compliance_instances")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_via: "auto",
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("nectar_compliance_instances").insert({
        organization_id: organizationId,
        requirement_id: req.id,
        triggered_by_id: triggerId,
        triggered_by_kind: triggerKind,
        triggered_at: triggeredAt.toISOString(),
        deadline_at: triggeredAt.toISOString(),
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_via: "auto",
      });
    }
  }
}

export async function createIncidentInstances(
  supabase: AnySupabase,
  organizationId: string,
  incidentId: string,
  createdAt: Date,
): Promise<void> {
  const { data: reqs } = await supabase
    .from("nectar_requirements")
    .select("id, title, metadata")
    .eq("organization_id", organizationId)
    .eq("activation_state", "active")
    .eq("review_status", "confirmed")
    .eq("compliance_pattern", "event_driven")
    .eq("verification_type", "external");

  const incidentReqs = (reqs ?? []).filter(
    (r) =>
      (r.title ?? "").toLowerCase().includes("incident") ||
      (r.title ?? "").toLowerCase().includes("upi"),
  );

  for (const req of incidentReqs) {
    const { data: existing } = await supabase
      .from("nectar_compliance_instances")
      .select("id")
      .eq("requirement_id", req.id)
      .eq("triggered_by_id", incidentId);

    if (existing && existing.length > 0) continue;

    const deadline1 = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    const deadline2 = new Date(createdAt.getTime() + 5 * 24 * 60 * 60 * 1000);
    const now = new Date();

    await supabase.from("nectar_compliance_instances").insert([
      {
        organization_id: organizationId,
        requirement_id: req.id,
        triggered_by_id: incidentId,
        triggered_by_kind: "incident",
        triggered_at: createdAt.toISOString(),
        deadline_at: deadline1.toISOString(),
        status: deadline1 < now ? "overdue" : "open",
      },
      {
        organization_id: organizationId,
        requirement_id: req.id,
        triggered_by_id: incidentId,
        triggered_by_kind: "incident",
        triggered_at: createdAt.toISOString(),
        deadline_at: deadline2.toISOString(),
        status: deadline2 < now ? "overdue" : "open",
      },
    ]);
  }
}
