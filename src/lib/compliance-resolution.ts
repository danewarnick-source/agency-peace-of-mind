/**
 * Shared helpers that used to wire app events into nectar_compliance_instances.
 *
 * Parallel writer DISABLED: punch-pad / shift-commit / incident paths must
 * not mint nectar_compliance_instances. Clocks live on the Compliance spine
 * (company_obligations* catalog/instance engine). Tables stay; these
 * helpers no-op so callers do not need to change.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

export async function resolveComplianceRequirement(
  _supabase: AnySupabase,
  _organizationId: string,
  _featureKey: string,
  _triggerId: string,
  _triggerKind: string,
  _triggeredAt?: Date,
): Promise<void> {
  return;
}

export async function createIncidentInstances(
  _supabase: AnySupabase,
  _organizationId: string,
  _incidentId: string,
  _createdAt: Date,
): Promise<void> {
  return;
}
