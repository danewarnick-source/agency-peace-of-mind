import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ organizationId: z.string().uuid() });

function pct(num: number, denom: number): number {
  if (denom <= 0) return 100;
  return Math.round((num / denom) * 100);
}

export const getAgencyHealthSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const orgId = data.organizationId;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ---- Client Records Health ----
    // 1) Daily progress notes >= 50 chars (last 30 days)
    const { data: logs } = await supabase
      .from("daily_logs")
      .select("narrative")
      .eq("organization_id", orgId)
      .gte("submitted_at", since);
    const totalLogs = logs?.length ?? 0;
    const passingLogs = (logs ?? []).filter(
      (l) => ((l as { narrative: string | null }).narrative ?? "").trim().length >= 50,
    ).length;
    const dailyScore = pct(passingLogs, totalLogs);

    // 2) eMAR doses with timestamp + signature attestation, no exception
    const { data: emar } = await supabase
      .from("emar_logs")
      .select("status, administered_at, signature_attestation, exception_reason")
      .eq("organization_id", orgId)
      .gte("created_at", since);
    const totalEmar = emar?.length ?? 0;
    const passingEmar = (emar ?? []).filter((e) => {
      const r = e as { status: string; administered_at: string | null; signature_attestation: string | null; exception_reason: string | null };
      return r.status === "given" && r.administered_at && r.signature_attestation && !r.exception_reason;
    }).length;
    const medScore = pct(passingEmar, totalEmar);

    // 3) Monthly attendance signed & attested
    const { data: att } = await supabase
      .from("hhs_monthly_attendance")
      .select("presence_status, staff_initials_signature, attestation_accepted")
      .eq("organization_id", orgId);
    const billable = (att ?? []).filter((r) => (r as { presence_status: string }).presence_status === "present");
    const signedAtt = billable.filter((r) => {
      const x = r as { staff_initials_signature: string | null; attestation_accepted: boolean };
      return !!x.staff_initials_signature && !!x.attestation_accepted;
    }).length;
    const attendanceScore = pct(signedAtt, billable.length);

    const clientOverall = Math.round((dailyScore + medScore + attendanceScore) / 3);

    // ---- Employee Documentation Health ----
    // 1) EVV geofence — punches flagged is_out_of_bounds=false count as validated
    const { data: evv } = await supabase
      .from("evv_timesheets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("is_out_of_bounds, outside_geofence_reason" as any)
      .eq("organization_id", orgId)
      .gte("created_at", since);
    const totalEvv = evv?.length ?? 0;
    const inFence = (evv ?? []).filter((e) => {
      const r = e as unknown as { is_out_of_bounds?: boolean | null; outside_geofence_reason: string | null };
      if (typeof r.is_out_of_bounds === "boolean") return !r.is_out_of_bounds;
      return !r.outside_geofence_reason;
    }).length;
    const geofenceScore = pct(inFence, totalEvv);

    // 2) eMAR administration accuracy — signed attestation present
    const totalEmarAdmin = (emar ?? []).filter((e) => (e as { status: string }).status === "given").length;
    const signedEmar = (emar ?? []).filter((e) => {
      const r = e as { status: string; signature_attestation: string | null };
      return r.status === "given" && !!r.signature_attestation;
    }).length;
    const emarAccuracyScore = pct(signedEmar, totalEmarAdmin);

    // 3) Credentials — approved external certifications across active staff
    const { data: members } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("active", true);
    const activeUserIds = (members ?? []).map((m) => (m as { user_id: string }).user_id);
    const totalStaff = activeUserIds.length;
    let credentialedStaff = 0;
    if (totalStaff > 0) {
      const { data: certs } = await supabase
        .from("external_certifications")
        .select("user_id, status")
        .eq("organization_id", orgId)
        .eq("status", "approved");
      const credSet = new Set((certs ?? []).map((c) => (c as { user_id: string }).user_id));
      credentialedStaff = activeUserIds.filter((u) => credSet.has(u)).length;
    }
    const credentialsScore = pct(credentialedStaff, totalStaff);

    const employeeOverall = Math.round((geofenceScore + emarAccuracyScore + credentialsScore) / 3);

    return {
      client: {
        overall: clientOverall,
        daily: { score: dailyScore, passing: passingLogs, total: totalLogs },
        medication: { score: medScore, passing: passingEmar, total: totalEmar },
        attendance: { score: attendanceScore, passing: signedAtt, total: billable.length },
      },
      employee: {
        overall: employeeOverall,
        geofence: { score: geofenceScore, passing: inFence, total: totalEvv },
        emarAccuracy: { score: emarAccuracyScore, passing: signedEmar, total: totalEmarAdmin },
        credentials: { score: credentialsScore, passing: credentialedStaff, total: totalStaff },
      },
    };
  });

export type AgencyHealthSnapshot = Awaited<ReturnType<typeof getAgencyHealthSnapshot>>;
