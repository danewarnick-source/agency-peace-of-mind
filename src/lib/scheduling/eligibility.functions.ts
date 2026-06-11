import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rankEligibility, type EligibilityResult } from "./eligibility";

/**
 * Rank candidate staff for a (client + service code + time window) slot.
 * Returns ALL active staff in the org with a rank score and reasons, sorted
 * best-first. Host staff for the shift's host_home location are returned with
 * blocked=true so the picker can omit them entirely.
 */
export const rankStaffForShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organizationId: string;
    clientId: string;
    serviceCode: string;
    startsAtIso: string;
    endsAtIso: string;
    locationId?: string | null;
    overtimeThresholdHours?: number;
  }) => z.object({
    organizationId: z.string().uuid(),
    clientId: z.string().uuid(),
    serviceCode: z.string().min(1).max(16),
    startsAtIso: z.string(),
    endsAtIso: z.string(),
    locationId: z.string().uuid().nullable().optional(),
    overtimeThresholdHours: z.number().int().optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<Array<EligibilityResult & { staffName: string }>> => {
    const { supabase } = context;
    const orgId = data.organizationId;
    const shiftStart = new Date(data.startsAtIso);
    const shiftEnd = new Date(data.endsAtIso);

    // Calendar week window (Sun..Sat in user's local — using UTC start of day from shift start)
    const dow = shiftStart.getUTCDay();
    const weekStart = new Date(shiftStart);
    weekStart.setUTCDate(shiftStart.getUTCDate() - dow);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

    // 1) active org members
    const { data: members, error: mErr } = await supabase
      .from("organization_members")
      .select("user_id, active, profiles:profiles!inner(id, full_name, date_of_birth)")
      .eq("organization_id", orgId)
      .eq("active", true);
    if (mErr) throw mErr;
    const memberRows = (members ?? []).map((m: any) => ({
      id: m.profiles?.id as string,
      full_name: (m.profiles?.full_name as string | null) ?? null,
      date_of_birth: (m.profiles?.date_of_birth as string | null) ?? null,
      active: !!m.active,
    })).filter((r) => r.id);

    if (memberRows.length === 0) return [];

    const staffIds = memberRows.map((r) => r.id);

    // 2) weekly scheduled shifts for these staff
    const { data: weekShifts, error: wErr } = await supabase
      .from("scheduled_shifts")
      .select("id, staff_id, starts_at, ends_at, parent_shift_id")
      .eq("organization_id", orgId)
      .gte("starts_at", weekStart.toISOString())
      .lt("starts_at", weekEnd.toISOString())
      .in("staff_id", staffIds);
    if (wErr) throw wErr;
    // Segments don't add additional hours (they sit inside parent); only count base.
    const byStaffShifts = new Map<string, Array<{ id: string; starts_at: string; ends_at: string }>>();
    for (const s of weekShifts ?? []) {
      if (s.parent_shift_id) continue;
      const arr = byStaffShifts.get(s.staff_id) ?? [];
      arr.push({ id: s.id, starts_at: s.starts_at, ends_at: s.ends_at });
      byStaffShifts.set(s.staff_id, arr);
    }

    // 3) assignments to this client
    const { data: assigns } = await supabase
      .from("staff_assignments")
      .select("staff_id")
      .eq("organization_id", orgId)
      .eq("client_id", data.clientId);
    const assignedSet = new Set((assigns ?? []).map((a: any) => a.staff_id));

    // 4) host staff for this location (host_home)
    let hostSet = new Set<string>();
    if (data.locationId) {
      const { data: loc } = await supabase
        .from("locations")
        .select("id, type, legacy_home_designation_id")
        .eq("id", data.locationId).maybeSingle();
      if (loc?.type === "host_home" && loc.legacy_home_designation_id) {
        const { data: hosts } = await supabase
          .from("home_staff_designations")
          .select("user_id")
          .eq("designation_id", loc.legacy_home_designation_id);
        hostSet = new Set((hosts ?? []).map((h: any) => h.user_id));
      }
    }

    // 5) client-specific trainings required
    const { data: clientTrainings } = await supabase
      .from("client_specific_trainings")
      .select("id")
      .eq("organization_id", orgId)
      .eq("client_id", data.clientId);
    const requiredClientTrainings = (clientTrainings ?? []).map((c: any) => c.id);

    // 6) certifications currency
    // Simplified: pull each staff's active certifications by type-name; we can't
    // resolve which certs are "required for code X" without a code→cert map,
    // so we leave requiredCertKeys empty for now and surface this in Phase 2.
    const requiredCertKeys: string[] = [];

    const result = rankEligibility({
      serviceCode: data.serviceCode,
      shiftStart, shiftEnd,
      staff: memberRows.map((r) => ({
        ...r,
        weeklyShifts: byStaffShifts.get(r.id) ?? [],
        activeCertKeys: new Set<string>(),
        completedClientTrainings: new Set<string>(),
        assignedToClient: assignedSet.has(r.id),
        isHostForLocation: hostSet.has(r.id),
      })),
      clientId: data.clientId,
      requiredCertKeys,
      requiredClientTrainings,
      overtimeThresholdHours: data.overtimeThresholdHours ?? 40,
    });
    const nameById = new Map(memberRows.map((r) => [r.id, r.full_name ?? "Staff"]));
    return result.map((r) => ({ ...r, staffName: nameById.get(r.staffId) ?? "Staff" }));
  });
