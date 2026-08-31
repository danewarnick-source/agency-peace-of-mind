/**
 * Idempotent open-instance writer for a staff member.
 * Used by hire/assignment auto-assign and class-roster fulfillment.
 * Never duplicates an open (pending/overdue) row for the same staff + duty.
 */

import { hireDueDaysForTitle } from "./obligation-auto-assign.ts";
import { addDaysUTC, endOfDayUTC, formatShort } from "./obligation-due-dates.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type EnsureStaff = {
  id: string;
  full_name: string | null;
  role: string;
};

export async function findObligationByTitles(
  supabase: AnySupabase,
  organizationId: string,
  titles: string[],
): Promise<{ id: string; title: string } | null> {
  if (!titles.length) return null;
  const { data, error } = await supabase
    .from("company_obligations")
    .select("id, title")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .in("title", titles);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; title: string }>;
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
