import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rankEligibility, type EligibilityResult } from "./eligibility";
import {
  resolveRequiredQualsForCodes,
  loadStaffQualsBulk,
} from "./required-qualifications.functions";

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

    // 1) active org members → profile fields (two-step; no FK between organization_members and profiles)
    const { data: members, error: mErr } = await supabase
      .from("organization_members")
      .select("user_id, active")
      .eq("organization_id", orgId)
      .eq("active", true);
    if (mErr) throw mErr;
    const userIds = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
    let profilesById = new Map<string, { id: string; full_name: string | null; date_of_birth: string | null }>();
    if (userIds.length) {
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, date_of_birth")
        .in("id", userIds);
      if (pErr) throw pErr;
      profilesById = new Map((profs ?? []).map((p: any) => [p.id, p]));
    }
    const memberRows = (members ?? []).map((m: any) => {
      const p = profilesById.get(m.user_id);
      return {
        id: m.user_id as string,
        full_name: (p?.full_name as string | null) ?? null,
        date_of_birth: (p?.date_of_birth as string | null) ?? null,
        active: !!m.active,
      };
    }).filter((r) => r.id);

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
      if (!s.staff_id) continue;
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

    // 4) host staff for this location (host_home). Locations mirror teams
    // (name = team_name), so resolve the home's team and read its care-team
    // rows — never the legacy home_designations role labels.
    let hostSet = new Set<string>();
    if (data.locationId) {
      const { data: loc } = await supabase
        .from("locations")
        .select("id, name, type")
        .eq("id", data.locationId).maybeSingle();
      if (loc?.type === "host_home" && loc.name) {
        const { data: team } = await supabase
          .from("teams")
          .select("id")
          .eq("organization_id", orgId)
          .eq("team_name", loc.name)
          .maybeSingle();
        if (team?.id) {
          const { data: hosts } = await supabase
            .from("home_staff_designations")
            .select("staff_id")
            .eq("team_id", team.id);
          hostSet = new Set((hosts ?? []).map((h: any) => h.staff_id));
        }
      }
    }

    // 4b) Client-scoped host exclusion (HHS conflict-of-interest).
    // The location-based block only fires when a host_home locationId is passed.
    // Admin-hours and other clockable shifts for an HHS client don't pass one, so
    // resolve the client's OWN host-home team here and union its designations into
    // hostSet — excluding the host regardless of locationId. Gated to host_home
    // arrangements so group-home designated staff aren't blocked.
    {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("team_id")
        .eq("id", data.clientId)
        .maybeSingle();
      const clientTeamId = (clientRow as { team_id: string | null } | null)?.team_id ?? null;
      if (clientTeamId) {
        const { data: t } = await supabase
          .from("teams")
          .select("team_name")
          .eq("id", clientTeamId)
          .maybeSingle();
        const teamName = (t as { team_name: string | null } | null)?.team_name ?? null;
        if (teamName) {
          const { data: loc } = await supabase
            .from("locations")
            .select("id")
            .eq("organization_id", orgId)
            .eq("name", teamName)
            .eq("type", "host_home")
            .maybeSingle();
          if (loc) {
            const { data: clientHosts } = await supabase
              .from("home_staff_designations")
              .select("staff_id")
              .eq("team_id", clientTeamId)
              .eq("active", true);
            for (const h of (clientHosts ?? []) as Array<{ staff_id: string | null }>) {
              if (h.staff_id) hostSet.add(h.staff_id);
            }
          }
        }
      }
    }

    // 5) client-specific trainings required (published only)
    const { data: clientTrainings } = await supabase
      .from("client_specific_trainings")
      .select("id")
      .eq("organization_id", orgId)
      .eq("client_id", data.clientId)
      .eq("status", "published");
    const requiredClientTrainings = (clientTrainings ?? []).map((c: any) => c.id as string);

    // 6) Required qualifications for this code — one source of truth:
    // confirmed staff_prerequisite rules via resolver. Codes without a
    // confirmed rule fall back to the hardcoded map (resolver logs a warning).
    const nowIso = new Date().toISOString();
    const { perCode: requiredByCode } = await resolveRequiredQualsForCodes(
      supabase,
      orgId,
      [data.serviceCode],
    );
    const requiredQuals = requiredByCode.get(data.serviceCode.toUpperCase()) ?? [];
    const requiredCertKeys = requiredQuals.map((q) => q.nsKey);

    // Bulk-load namespaced qualifications (external_cert / baseline_training /
    // hive_course / client_specific_training) per staff — matches rule kinds.
    const qualsByStaff = await loadStaffQualsBulk(supabase, orgId, staffIds, nowIso);


    // completed client-specific trainings per staff
    const completedTrainingsByStaff = new Map<string, Set<string>>();
    if (requiredClientTrainings.length && staffIds.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: completions } = await (supabase as any)
        .from("training_completions")
        .select("user_id, ref_id")
        .eq("topic_kind", "person")
        .eq("is_current", true)
        .in("user_id", staffIds)
        .in("ref_id", requiredClientTrainings);
      for (const c of (completions ?? []) as Array<{ user_id: string; ref_id: string }>) {
        const set = completedTrainingsByStaff.get(c.user_id) ?? new Set<string>();
        set.add(c.ref_id);
        completedTrainingsByStaff.set(c.user_id, set);
      }
    }

    const result = rankEligibility({
      serviceCode: data.serviceCode,
      shiftStart, shiftEnd,
      staff: memberRows.map((r) => ({
        ...r,
        weeklyShifts: byStaffShifts.get(r.id) ?? [],
        activeCertKeys: activeCertsByStaff.get(r.id) ?? new Set<string>(),
        completedClientTrainings: completedTrainingsByStaff.get(r.id) ?? new Set<string>(),
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
