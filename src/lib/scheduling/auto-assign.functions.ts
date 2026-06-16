// Auto-assign engine: walks open shifts in a window, ranks eligible staff
// using existing eligibility logic, and proposes (or applies) assignments.
// Fairness: prefers staff with fewer hours already scheduled this week.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rankEligibility } from "./eligibility";

type Proposal = {
  shiftId: string;
  clientName: string;
  startsAt: string;
  endsAt: string;
  serviceCode: string | null;
  staffId: string | null;
  staffName: string | null;
  score: number;
  reasons: string[];
  blocked: boolean;
  reason: string;
};

const Input = z.object({
  organizationId: z.string().uuid(),
  startIso: z.string(),
  endIso: z.string(),
  dryRun: z.boolean().default(true),
  applyShiftIds: z.array(z.string().uuid()).optional(),
});

export const autoAssignRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const orgId = data.organizationId;

    // 1) open shifts in window
    const { data: openShifts, error: oErr } = await sb
      .from("scheduled_shifts")
      .select("id, client_id, service_code, starts_at, ends_at, location_id")
      .eq("organization_id", orgId)
      .is("staff_id", null)
      .gte("starts_at", data.startIso)
      .lt("starts_at", data.endIso)
      .order("starts_at");
    if (oErr) throw oErr;
    if (!openShifts?.length) return { proposals: [] as Proposal[], applied: 0 };

    // 2) active members (two-step; no FK between organization_members and profiles)
    const { data: members } = await sb
      .from("organization_members")
      .select("user_id, active")
      .eq("organization_id", orgId).eq("active", true);
    const userIds = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
    let profMap = new Map<string, any>();
    if (userIds.length) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, full_name, date_of_birth")
        .in("id", userIds);
      profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    }
    const memberRows = (members ?? []).map((m: any) => {
      const p = profMap.get(m.user_id);
      return {
        id: m.user_id as string,
        full_name: (p?.full_name as string | null) ?? null,
        date_of_birth: (p?.date_of_birth as string | null) ?? null,
        active: true,
      };
    }).filter((r: any) => r.id);
    if (!memberRows.length) return { proposals: [], applied: 0 };
    const staffIds = memberRows.map((r: any) => r.id);
    const nameById = new Map<string, string>(memberRows.map((r: any) => [r.id as string, (r.full_name ?? "Staff") as string]));

    // Calendar week window (use first shift's week)
    const first = new Date(openShifts[0].starts_at);
    const dow = first.getUTCDay();
    const weekStart = new Date(first);
    weekStart.setUTCDate(first.getUTCDate() - dow);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

    // 3) weekly shifts for fairness baseline + overlap check
    const { data: weekShifts } = await sb
      .from("scheduled_shifts")
      .select("id, staff_id, starts_at, ends_at, parent_shift_id")
      .eq("organization_id", orgId)
      .gte("starts_at", weekStart.toISOString())
      .lt("starts_at", weekEnd.toISOString())
      .in("staff_id", staffIds);
    const byStaffShifts = new Map<string, Array<{ id: string; starts_at: string; ends_at: string }>>();
    for (const s of (weekShifts ?? [])) {
      if (s.parent_shift_id || !s.staff_id) continue;
      const arr = byStaffShifts.get(s.staff_id) ?? [];
      arr.push({ id: s.id, starts_at: s.starts_at, ends_at: s.ends_at });
      byStaffShifts.set(s.staff_id, arr);
    }

    // 4) client metadata for names + assignments + trainings
    const clientIds = Array.from(new Set(openShifts.map((s: any) => s.client_id)));
    const { data: clients } = await sb
      .from("clients").select("id, first_name, last_name").in("id", clientIds);
    const clientName = new Map<string, string>((clients ?? []).map((c: any) =>
      [c.id as string, (`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Client") as string]));

    const { data: assigns } = await sb
      .from("staff_assignments").select("staff_id, client_id")
      .eq("organization_id", orgId).in("client_id", clientIds);
    const assignedByClient = new Map<string, Set<string>>();
    for (const a of (assigns ?? [])) {
      const set = assignedByClient.get(a.client_id) ?? new Set();
      set.add(a.staff_id); assignedByClient.set(a.client_id, set);
    }

    const { data: ctrain } = await sb
      .from("client_specific_trainings").select("id, client_id")
      .eq("organization_id", orgId).in("client_id", clientIds);
    const trainingsByClient = new Map<string, string[]>();
    for (const t of (ctrain ?? [])) {
      const arr = trainingsByClient.get(t.client_id) ?? [];
      arr.push(t.id); trainingsByClient.set(t.client_id, arr);
    }

    // 5) approved PTO blocks — time_off_requests uses start_date/end_date (date columns)
    const { data: ptos } = await sb
      .from("time_off_requests")
      .select("staff_id, start_date, end_date, status")
      .eq("organization_id", orgId)
      .eq("status", "approved")
      .lte("start_date", data.endIso.slice(0, 10))
      .gte("end_date", data.startIso.slice(0, 10));
    const ptoByStaff = new Map<string, Array<{ s: number; e: number }>>();
    for (const p of (ptos ?? [])) {
      const arr = ptoByStaff.get(p.staff_id) ?? [];
      arr.push({
        s: new Date(p.start_date + "T00:00:00").getTime(),
        e: new Date(p.end_date + "T23:59:59.999").getTime(),
      });
      ptoByStaff.set(p.staff_id, arr);
    }

    const proposals: Proposal[] = [];
    const applyIds = data.applyShiftIds ? new Set(data.applyShiftIds) : null;
    let applied = 0;

    for (const shift of openShifts) {
      const shiftStart = new Date(shift.starts_at);
      const shiftEnd = new Date(shift.ends_at);
      const sMs = shiftStart.getTime();
      const eMs = shiftEnd.getTime();

      const ranked = rankEligibility({
        serviceCode: shift.service_code ?? "",
        shiftStart, shiftEnd,
        staff: memberRows.map((r: any) => ({
          ...r,
          weeklyShifts: byStaffShifts.get(r.id) ?? [],
          activeCertKeys: new Set<string>(),
          completedClientTrainings: new Set<string>(),
          assignedToClient: assignedByClient.get(shift.client_id)?.has(r.id) ?? false,
          isHostForLocation: false,
        })),
        clientId: shift.client_id,
        requiredCertKeys: [],
        requiredClientTrainings: trainingsByClient.get(shift.client_id) ?? [],
        overtimeThresholdHours: 40,
      });

      // filter PTO + provisional overlap (assignments made earlier in this pass)
      const candidates = ranked.filter((r: any) => {
        if (r.blocked) return false;
        const ptoHits = ptoByStaff.get(r.staffId) ?? [];
        if (ptoHits.some(p => p.s < eMs && p.e > sMs)) return false;
        const sh = byStaffShifts.get(r.staffId) ?? [];
        if (sh.some(x => new Date(x.starts_at).getTime() < eMs && new Date(x.ends_at).getTime() > sMs)) return false;
        return true;
      });

      // fairness boost: weight by inverse weekly minutes already booked
      const scored = candidates.map((c: any) => {
        const minutes = (byStaffShifts.get(c.staffId) ?? []).reduce((acc, x) =>
          acc + (new Date(x.ends_at).getTime() - new Date(x.starts_at).getTime()) / 60000, 0);
        const fairnessBoost = Math.max(0, 30 - minutes / 60); // up to +30 if 0 hrs scheduled
        return { ...c, finalScore: (c.score ?? 0) + fairnessBoost, weekMinutes: minutes };
      }).sort((a: any, b: any) => b.finalScore - a.finalScore);

      const best = scored[0];
      const proposal: Proposal = {
        shiftId: shift.id,
        clientName: clientName.get(shift.client_id) ?? "Client",
        startsAt: shift.starts_at,
        endsAt: shift.ends_at,
        serviceCode: shift.service_code,
        staffId: best?.staffId ?? null,
        staffName: best ? (nameById.get(best.staffId) ?? "Staff") : null,
        score: best?.finalScore ?? 0,
        reasons: best?.reasons ?? [],
        blocked: !best,
        reason: best ? `${best.weekMinutes / 60 | 0}h this week` : "No eligible staff",
      };
      proposals.push(proposal);

      // Apply
      const shouldApply = !data.dryRun && best && (!applyIds || applyIds.has(shift.id));
      if (shouldApply) {
        const { error: upErr } = await sb.from("scheduled_shifts")
          .update({
            staff_id: best.staffId,
            status: "draft",
            created_from: "rotation",
          })
          .eq("id", shift.id)
          .is("staff_id", null);
        if (!upErr) {
          applied++;
          // track provisional so subsequent shifts in this pass don't double-book
          const arr = byStaffShifts.get(best.staffId) ?? [];
          arr.push({ id: shift.id, starts_at: shift.starts_at, ends_at: shift.ends_at });
          byStaffShifts.set(best.staffId, arr);
        }
      }
    }

    return { proposals, applied };
  });
