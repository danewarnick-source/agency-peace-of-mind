/**
 * Schedule requests — time-off + shift-swap.
 *
 * Reads and writes are scoped to the caller's organization_id and enforced by
 * RLS on time_off_requests / shift_swap_requests. We also pass the org filter
 * explicitly on every query / mutation as a defense-in-depth match for the
 * cross-org-delete guardrail we apply on scheduled_shifts.
 *
 * Approving a swap reuses the Phase-2 mutation (saveShift) to update
 * scheduled_shifts.staff_id — we DO NOT touch scheduled_shifts directly here.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { saveShift } from "@/lib/schedule-preview-mutations";

export type TimeOffRequest = {
  id: string;
  organization_id: string;
  staff_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  type: "pto" | "sick" | "personal" | "unpaid" | "other";
  note: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

export type SwapRequest = {
  id: string;
  organization_id: string;
  shift_id: string;
  from_staff_id: string;
  to_staff_id: string | null;
  note: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

// ─── Admin: all org requests ───────────────────────────────────────────────
export function useOrgScheduleRequests() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  return useQuery({
    enabled: !!orgId,
    queryKey: ["schedule-requests", orgId],
    queryFn: async () => {
      const [toRes, swRes] = await Promise.all([
        supabase
          .from("time_off_requests" as never)
          .select("*")
          .eq("organization_id", orgId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("shift_swap_requests" as never)
          .select("*")
          .eq("organization_id", orgId!)
          .order("created_at", { ascending: false }),
      ]);
      if (toRes.error) throw toRes.error;
      if (swRes.error) throw swRes.error;
      return {
        timeOff: (toRes.data ?? []) as unknown as TimeOffRequest[],
        swaps: (swRes.data ?? []) as unknown as SwapRequest[],
      };
    },
  });
}

// ─── Staff: only my requests ───────────────────────────────────────────────
export function useMyScheduleRequests() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  return useQuery({
    enabled: !!orgId && !!user?.id,
    queryKey: ["my-schedule-requests", orgId, user?.id],
    queryFn: async () => {
      const [toRes, swRes] = await Promise.all([
        supabase
          .from("time_off_requests" as never)
          .select("*")
          .eq("organization_id", orgId!)
          .eq("staff_id", user!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("shift_swap_requests" as never)
          .select("*")
          .eq("organization_id", orgId!)
          .eq("from_staff_id", user!.id)
          .order("created_at", { ascending: false }),
      ]);
      if (toRes.error) throw toRes.error;
      if (swRes.error) throw swRes.error;
      return {
        timeOff: (toRes.data ?? []) as unknown as TimeOffRequest[],
        swaps: (swRes.data ?? []) as unknown as SwapRequest[],
      };
    },
  });
}

// ─── Create ────────────────────────────────────────────────────────────────
export async function createTimeOffRequest(input: {
  organization_id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  type: TimeOffRequest["type"];
  note?: string | null;
}) {
  if (!input.start_date || !input.end_date) throw new Error("Pick a date range.");
  if (input.end_date < input.start_date) throw new Error("End date must be on or after start.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("time_off_requests").insert({
    organization_id: input.organization_id,
    staff_id: input.staff_id,
    start_date: input.start_date,
    end_date: input.end_date,
    type: input.type,
    note: input.note?.trim() || null,
    status: "pending",
  });
  if (error) throw error;

  // Best-effort in-app notification to admins/managers. Failure here must
  // never block the request itself.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("notifications").insert({
      organization_id: input.organization_id,
      recipient_role: "admin",
      type: "time_off_requested",
      urgency: "normal",
      title: "New time-off request",
      body: `${fmtRange(input.start_date, input.end_date)} · ${input.type.toUpperCase()}${input.note ? ` — ${input.note.trim()}` : ""}`,
      link_to: "/dashboard/scheduler",
      related_type: "time_off_request",
    });
  } catch { /* ignore notification failure */ }
}

function fmtRange(s: string, e: string) {
  const f = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return s === e ? f(s) : `${f(s)} – ${f(e)}`;
}

// ─── Conflict check (advisory) ─────────────────────────────────────────────
/**
 * Returns PUBLISHED scheduled_shifts for a staff member that overlap the
 * given inclusive date range. Used by the admin requests panel to warn
 * before approving time-off that collides with already-published shifts.
 */
export async function fetchConflictingShifts(
  organizationId: string,
  staffId: string,
  startDate: string,
  endDate: string,
) {
  const startIso = new Date(startDate + "T00:00:00").toISOString();
  const endIso = new Date(endDate + "T23:59:59.999").toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("scheduled_shifts")
    .select("id, starts_at, ends_at, job_code, published, status, client_id")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .lt("starts_at", endIso)
    .gt("ends_at", startIso)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  type Row = { id: string; starts_at: string; ends_at: string; job_code: string | null; published: boolean; status: string; client_id: string };
  return ((data ?? []) as Row[]).filter((s) => s.published && s.status !== "cancelled");
}

export async function createSwapRequest(input: {
  organization_id: string;
  shift_id: string;
  from_staff_id: string;
  to_staff_id: string | null;
  note?: string | null;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("shift_swap_requests").insert({
    organization_id: input.organization_id,
    shift_id: input.shift_id,
    from_staff_id: input.from_staff_id,
    to_staff_id: input.to_staff_id ?? null,
    note: input.note?.trim() || null,
    status: "pending",
  });
  if (error) throw error;
}

// ─── Decide (admin) ────────────────────────────────────────────────────────
async function patchRequest(
  table: "time_off_requests" | "shift_swap_requests",
  id: string,
  organizationId: string,
  patch: Record<string, unknown>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from(table)
    .update(patch)
    .eq("id", id)
    .eq("organization_id", organizationId); // org-scope guard, never cross-org
  if (error) throw error;
}

export async function decideTimeOff(
  req: TimeOffRequest,
  decision: "approved" | "denied",
  deciderId: string,
) {
  await patchRequest("time_off_requests", req.id, req.organization_id, {
    status: decision,
    decided_by: deciderId,
    decided_at: new Date().toISOString(),
  });
  // In-app notification back to the requesting staff member.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("notifications").insert({
      organization_id: req.organization_id,
      recipient_role: "staff",
      recipient_user_id: req.staff_id,
      type: "time_off_decided",
      urgency: "normal",
      title: decision === "approved" ? "Time off approved" : "Time off denied",
      body: `${fmtRange(req.start_date, req.end_date)} · ${req.type.toUpperCase()}`,
      link_to: "/dashboard/schedule",
      related_id: req.id,
      related_type: "time_off_request",
    });
  } catch { /* ignore */ }
}

/**
 * Approving a swap: reassign the shift via the Phase-2 saveShift path, then
 * mark the swap approved. If the swap is "open" (to_staff_id null), the caller
 * must pass a chosen to_staff_id (admin picks in the panel before approving).
 */
export async function approveSwap(
  req: SwapRequest,
  resolvedToStaffId: string,
  shift: {
    client_id: string;
    job_code: string | null;
    service_code?: string | null;
    shift_type: string;
    starts_at: string;
    ends_at: string;
    status: string;
    published: boolean;
  },
  deciderId: string,
) {
  // Reuse the existing mutation — same payload shape, same org guard.
  await saveShift({
    id: req.shift_id,
    organization_id: req.organization_id,
    staff_id: resolvedToStaffId,
    client_id: shift.client_id,
    job_code: shift.job_code ?? "",
    service_code: shift.service_code ?? shift.job_code ?? "",
    shift_type: shift.shift_type,
    starts_at: shift.starts_at,
    ends_at: shift.ends_at,
    notes: null,
    status: shift.status,
    published: shift.published,
    created_by: deciderId,
  });
  await patchRequest("shift_swap_requests", req.id, req.organization_id, {
    status: "approved",
    to_staff_id: resolvedToStaffId,
    decided_by: deciderId,
    decided_at: new Date().toISOString(),
  });
}

export async function denySwap(req: SwapRequest, deciderId: string) {
  await patchRequest("shift_swap_requests", req.id, req.organization_id, {
    status: "denied",
    decided_by: deciderId,
    decided_at: new Date().toISOString(),
  });
}

// ─── Overlap helper (advisory warning) ─────────────────────────────────────
/**
 * Build a Map<staffId, Array<[startDateMs, endDateMs]>> of APPROVED time-off,
 * for fast overlap checks in the shift editor. Dates are inclusive day ranges.
 */
export function buildApprovedTimeOffIndex(rows: TimeOffRequest[]) {
  const m = new Map<string, Array<[number, number]>>();
  for (const r of rows) {
    if (r.status !== "approved") continue;
    const s = new Date(r.start_date + "T00:00:00").getTime();
    const e = new Date(r.end_date + "T23:59:59.999").getTime();
    const arr = m.get(r.staff_id) ?? [];
    arr.push([s, e]);
    m.set(r.staff_id, arr);
  }
  return m;
}

export function staffHasTimeOffOverlap(
  index: Map<string, Array<[number, number]>>,
  staffId: string,
  startsAtIso: string,
  endsAtIso: string,
): boolean {
  const ranges = index.get(staffId);
  if (!ranges) return false;
  const a = new Date(startsAtIso).getTime();
  const b = new Date(endsAtIso).getTime();
  // Strict inequality: a shift that starts exactly when the time-off ends
  // (or ends exactly when it starts) is back-to-back, not an overlap.
  for (const [s, e] of ranges) if (a < e && b > s) return true;
  return false;
}
