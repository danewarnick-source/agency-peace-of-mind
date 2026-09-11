/**
 * Idempotent open-instance writer for a staff member.
 * Used by hire/assignment auto-assign and class-roster fulfillment.
 * Never duplicates an open (pending/overdue) row for the same staff + duty.
 * Catalog standing / intake / by_design / retired duties do not get a clock —
 * only the keyed engine (`generateNextInstanceInternal`) creates catalog instances,
 * and only when disposition is obligation.
 */

import { hireDueDaysForTitle } from "./obligation-auto-assign.ts";
import { addDaysUTC, endOfDayUTC, formatShort } from "./obligation-due-dates.ts";
import { obligationCreatesInstances } from "./sow-obligation-catalog.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type EnsureStaff = {
  id: string;
  full_name: string | null;
  role: string;
};

export type FoundObligation = {
  id: string;
  title: string;
  key?: string | null;
  disposition?: string | null;
  source?: string | null;
};

export async function findObligationByTitles(
  supabase: AnySupabase,
  organizationId: string,
  titles: string[],
): Promise<FoundObligation | null> {
  if (!titles.length) return null;
  const query = supabase
    .from("company_obligations")
    .select("id, title, key, disposition, source")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .in("title", titles);
  let { data, error } = await query;
  if (error && /column|schema cache|disposition|state_code/i.test(error.message)) {
    const retry = await supabase
      .from("company_obligations")
      .select("id, title, source")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .in("title", titles);
    data = retry.data;
    error = retry.error;
  }
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as FoundObligation[];
  for (const title of titles) {
    const hit = rows.find((r) => r.title === title);
    if (hit) return hit;
  }
  return rows[0] ?? null;
}

export async function ensureOpenStaffObligationInternal(
  supabase: AnySupabase,
  organizationId: string,
  titles: string[],
  staff: EnsureStaff,
  opts?: { dueDays?: number; periodPrefix?: string },
): Promise<{ id: string } | null> {
  const ob = await findObligationByTitles(supabase, organizationId, titles);
  if (!ob) return null;
  if (!obligationCreatesInstances(ob)) return null;

  const { data: existing, error: openErr } = await supabase
    .from("company_obligation_instances")
    .select("id")
    .eq("obligation_id", ob.id)
    .eq("assignee_staff_id", staff.id)
    .is("client_id", null)
    .in("status", ["pending", "overdue"])
    .maybeSingle();
  if (openErr) throw new Error(openErr.message);
  if (existing) return { id: existing.id as string };

  const days = opts?.dueDays ?? hireDueDaysForTitle(ob.title);
  const due = addDaysUTC(new Date(), days);
  const periodKey = `${opts?.periodPrefix ?? "Assigned"} ${formatShort(due)}`;

  const { data: inserted, error: insErr } = await supabase
    .from("company_obligation_instances")
    .insert({
      obligation_id: ob.id,
      organization_id: organizationId,
      period_key: periodKey,
      due_at: endOfDayUTC(due),
      status: "pending",
      assignee_staff_id: staff.id,
    })
    .select("id")
    .maybeSingle();
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") return null;
    throw new Error(insErr.message);
  }
  if (!inserted) return null;

  await supabase.from("company_obligation_instance_assignees").upsert(
    [
      {
        instance_id: inserted.id,
        organization_id: organizationId,
        staff_id: staff.id,
        staff_name: staff.full_name ?? "Staff",
        staff_role: staff.role,
      },
    ],
    { onConflict: "instance_id,staff_id", ignoreDuplicates: true },
  );
  return { id: inserted.id as string };
}

export async function loadStaffForEnsure(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
): Promise<EnsureStaff | null> {
  const [{ data: mem }, { data: prof }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", staffId)
      .eq("active", true)
      .maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("id", staffId).maybeSingle(),
  ]);
  if (!mem || !prof) return null;
  return {
    id: staffId,
    full_name: (prof.full_name as string | null) ?? "Staff",
    role: String(mem.role ?? "employee"),
  };
}
