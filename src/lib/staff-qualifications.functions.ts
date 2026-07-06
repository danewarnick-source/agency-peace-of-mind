/**
 * Unified "what qualifications does this staff member currently hold" resolver.
 *
 * Reads across every existing qualification source and returns one canonical
 * Set of keys formatted as `"<kind>:<key>"`, so downstream consumers
 * (staff-prerequisite detector today; scheduling later) do one lookup.
 *
 * Canonical qualification-key namespaces:
 *   external_cert:<cert_type>            active/approved, unexpired external_certifications
 *   baseline_training:<training_key>     staff_baseline_training_completions, unexpired
 *   hive_course:<baseline_key|course_id> hive_training_assignments status='completed', unexpired
 *   client_specific_training:<ref_id>    training_completions topic_kind='person', is_current
 *
 * "must_be_unexpired=false" callers can widen matches by asking for the
 * union set (returned as `all`). "must_be_unexpired=true" callers use
 * `activeOnly`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QualificationKind =
  | "external_cert"
  | "baseline_training"
  | "hive_course"
  | "client_specific_training";

export type QualificationsSnapshot = {
  activeOnly: string[]; // unexpired only
  all: string[];        // held ever (may be expired)
};

const qkey = (kind: QualificationKind, key: string) => `${kind}:${key}`;

async function loadQualifications(args: {
  supabase: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  staffId: string;
  organizationId: string;
  at: string; // ISO
}): Promise<QualificationsSnapshot> {
  const { supabase, staffId, organizationId, at } = args;
  const active = new Set<string>();
  const all = new Set<string>();

  // 1. external_certifications — approved
  const { data: certs } = await supabase
    .from("external_certifications")
    .select("cert_type, expires_at, status")
    .eq("user_id", staffId)
    .eq("status", "approved");
  for (const c of (certs ?? []) as Array<{ cert_type: string; expires_at: string | null }>) {
    const key = qkey("external_cert", c.cert_type);
    all.add(key);
    if (!c.expires_at || c.expires_at > at) active.add(key);
  }

  // 2. staff_baseline_training_completions
  const { data: baseline } = await supabase
    .from("staff_baseline_training_completions")
    .select("training_key, expires_at, completed_date")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId);
  for (const b of (baseline ?? []) as Array<{
    training_key: string;
    expires_at: string | null;
    completed_date: string | null;
  }>) {
    if (!b.training_key) continue;
    const key = qkey("baseline_training", b.training_key);
    all.add(key);
    if (b.completed_date && (!b.expires_at || b.expires_at > at)) active.add(key);
  }

  // 3. hive_training_assignments — completed courses, keyed by baseline_key when present, else course_id
  const { data: assigns } = await supabase
    .from("hive_training_assignments")
    .select("course_id, status, completed_at, expires_at")
    .eq("user_id", staffId);
  const assignRows = (assigns ?? []) as Array<{
    course_id: string;
    status: string;
    completed_at: string | null;
    expires_at: string | null;
  }>;
  const courseIds = Array.from(new Set(assignRows.map((r) => r.course_id).filter(Boolean)));
  const baselineByCourse = new Map<string, string | null>();
  if (courseIds.length) {
    const { data: courses } = await supabase
      .from("hive_training_courses")
      .select("id, baseline_key")
      .in("id", courseIds);
    for (const c of (courses ?? []) as Array<{ id: string; baseline_key: string | null }>) {
      baselineByCourse.set(c.id, c.baseline_key);
    }
  }
  for (const r of assignRows) {
    if (r.status !== "completed") continue;
    const bkey = baselineByCourse.get(r.course_id) ?? null;
    // Register under both course_id and baseline_key when available so rules
    // that reference either identifier resolve.
    const keys = [qkey("hive_course", r.course_id)];
    if (bkey) keys.push(qkey("hive_course", bkey));
    const unexpired = !r.expires_at || r.expires_at > at;
    for (const k of keys) {
      all.add(k);
      if (unexpired) active.add(k);
    }
  }

  // 4. training_completions — client-specific (person topic)
  const { data: comps } = await supabase
    .from("training_completions")
    .select("ref_id, is_current, topic_kind")
    .eq("user_id", staffId)
    .eq("topic_kind", "person");
  for (const c of (comps ?? []) as Array<{
    ref_id: string;
    is_current: boolean | null;
    topic_kind: string;
  }>) {
    if (!c.ref_id) continue;
    const key = qkey("client_specific_training", c.ref_id);
    all.add(key);
    if (c.is_current) active.add(key);
  }

  return { activeOnly: Array.from(active).sort(), all: Array.from(all).sort() };
}

export const getStaffQualifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        staffId: z.string().uuid(),
        at: z.string().optional(), // ISO
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<QualificationsSnapshot> => {
    return await loadQualifications({
      supabase: context.supabase,
      staffId: data.staffId,
      organizationId: data.organizationId,
      at: data.at ?? new Date().toISOString(),
    });
  });

// Server-only helper (safe to reuse from other server fns in the same request).
export async function resolveStaffQualifications(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  args: { organizationId: string; staffId: string; at: string },
): Promise<QualificationsSnapshot> {
  return loadQualifications({ supabase, ...args });
}

export function qualificationKey(kind: QualificationKind, key: string) {
  return qkey(kind, key);
}
