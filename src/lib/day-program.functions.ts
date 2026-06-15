// Day Program Session server functions — DSG / DSP / DSI / SED / MTP.
// All RPC over the authenticated supabase client (RLS scopes to org).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  dspModeForMinutes,
  dsiTierForMinutes,
  RATE_CAPS,
  MTP_FLAT_RATE,
  MTP_BLOCK_NO_DAY_PROGRAM,
  MTP_BLOCK_DSI_DAY,
  isMtpEligibleCode,
} from "./day-program-billing";
import { computeEntryUnits } from "./billing-units";

const DayCode = z.enum(["DSG", "DSP", "DSI", "SED"]);

// ─── List sessions for the current org (date window) ──────────────────────
export const listDayProgramSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; from: string; to: string }) =>
    z
      .object({
        organizationId: z.string().uuid(),
        from: z.string(),
        to: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("day_program_sessions")
      .select(
        "id, session_date, service_code, start_time, end_time, location_id, location_label, notes",
      )
      .eq("organization_id", data.organizationId)
      .gte("session_date", data.from)
      .lte("session_date", data.to)
      .order("session_date", { ascending: false })
      .order("start_time", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDayProgramSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [{ data: session, error: sErr }, { data: attendance, error: aErr }, { data: staff, error: stErr }] =
      await Promise.all([
        context.supabase
          .from("day_program_sessions")
          .select("*")
          .eq("id", data.sessionId)
          .single(),
        context.supabase
          .from("day_program_attendance")
          .select("*, transport:day_program_transport(*)")
          .eq("session_id", data.sessionId),
        context.supabase
          .from("day_program_session_staff")
          .select("*")
          .eq("session_id", data.sessionId),
      ]);
    if (sErr) throw new Error(sErr.message);
    if (aErr) throw new Error(aErr.message);
    if (stErr) throw new Error(stErr.message);
    return { session, attendance: attendance ?? [], staff: staff ?? [] };
  });

// ─── Create session ───────────────────────────────────────────────────────
export const createDayProgramSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      organizationId: string;
      sessionDate: string;
      serviceCode: "DSG" | "DSP" | "DSI" | "SED";
      startTime: string;
      endTime: string;
      locationId?: string | null;
      locationLabel?: string | null;
      notes?: string | null;
    }) =>
      z
        .object({
          organizationId: z.string().uuid(),
          sessionDate: z.string(),
          serviceCode: DayCode,
          startTime: z.string(),
          endTime: z.string(),
          locationId: z.string().uuid().nullish(),
          locationLabel: z.string().nullish(),
          notes: z.string().nullish(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("day_program_sessions")
      .insert({
        organization_id: data.organizationId,
        session_date: data.sessionDate,
        service_code: data.serviceCode,
        start_time: data.startTime,
        end_time: data.endTime,
        location_id: data.locationId ?? null,
        location_label: data.locationLabel ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ─── Compute billing for an attendance row (pure server-side) ─────────────
type CapInputs = {
  serviceCode: "DSG" | "DSP" | "DSI" | "SED";
  arrival: string | null;
  departure: string | null;
  dspMode?: "qtr_hr" | "daily" | null;
  clientRate: number | null;
};

function computeBilling(input: CapInputs): {
  billedUnits: number;
  billedMode: "daily" | "qtr_hr";
  cap: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  const minutes =
    input.arrival && input.departure
      ? Math.max(
          0,
          (new Date(input.departure).getTime() - new Date(input.arrival).getTime()) / 60_000,
        )
      : 0;

  if (input.serviceCode === "DSG") {
    return { billedUnits: 1, billedMode: "daily", cap: RATE_CAPS.DSG_DAILY, warnings };
  }
  if (input.serviceCode === "SED") {
    return { billedUnits: 1, billedMode: "daily", cap: RATE_CAPS.DSG_DAILY, warnings };
  }
  if (input.serviceCode === "DSI") {
    const tier = dsiTierForMinutes(minutes);
    if (!tier) {
      warnings.push("DSI session needs arrival + departure to pick a tier.");
      return { billedUnits: 0, billedMode: "daily", cap: 0, warnings };
    }
    return { billedUnits: 1, billedMode: "daily", cap: tier.cap, warnings };
  }
  // DSP
  const mode = input.dspMode ?? dspModeForMinutes(minutes).mode;
  if (!mode) {
    warnings.push(
      "DSP session length is ambiguous (4–7h); reviewer must select qtr-hr or daily mode and record a reason.",
    );
    return { billedUnits: 0, billedMode: "qtr_hr", cap: RATE_CAPS.DSP_QTR_HR, warnings };
  }
  if (mode === "qtr_hr") {
    const units = computeEntryUnits(input.arrival, input.departure);
    return { billedUnits: units, billedMode: "qtr_hr", cap: RATE_CAPS.DSP_QTR_HR, warnings };
  }
  return { billedUnits: 1, billedMode: "daily", cap: RATE_CAPS.DSP_DAILY_EXTENDED, warnings };
}

// ─── Upsert attendance ────────────────────────────────────────────────────
export const upsertDayProgramAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      sessionId: string;
      clientId: string;
      attended: boolean;
      arrivalTime?: string | null;
      departureTime?: string | null;
      activityNote?: string | null;
      dspMode?: "qtr_hr" | "daily" | null;
      overrideReason?: string | null;
    }) =>
      z
        .object({
          sessionId: z.string().uuid(),
          clientId: z.string().uuid(),
          attended: z.boolean(),
          arrivalTime: z.string().nullish(),
          departureTime: z.string().nullish(),
          activityNote: z.string().nullish(),
          dspMode: z.enum(["qtr_hr", "daily"]).nullish(),
          overrideReason: z.string().nullish(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: session, error: sErr } = await context.supabase
      .from("day_program_sessions")
      .select("organization_id, service_code")
      .eq("id", data.sessionId)
      .single();
    if (sErr || !session) throw new Error(sErr?.message ?? "Session not found");

    const code = session.service_code as "DSG" | "DSP" | "DSI" | "SED";

    // Look up the client's authorized rate for this code.
    const { data: cbcRow } = await context.supabase
      .from("client_billing_codes")
      .select("rate_per_unit")
      .eq("organization_id", session.organization_id)
      .eq("client_id", data.clientId)
      .eq("service_code", code)
      .maybeSingle();
    const clientRate = cbcRow?.rate_per_unit ?? null;

    let billedUnits = 0;
    let billedMode: "daily" | "qtr_hr" = "daily";
    let cap = 0;
    if (data.attended) {
      const calc = computeBilling({
        serviceCode: code,
        arrival: data.arrivalTime ?? null,
        departure: data.departureTime ?? null,
        dspMode: data.dspMode ?? null,
        clientRate,
      });
      billedUnits = calc.billedUnits;
      billedMode = calc.billedMode;
      cap = calc.cap;
    }

    const { data: row, error } = await context.supabase
      .from("day_program_attendance")
      .upsert(
        {
          session_id: data.sessionId,
          client_id: data.clientId,
          attended: data.attended,
          arrival_time: data.arrivalTime ?? null,
          departure_time: data.departureTime ?? null,
          activity_note: data.activityNote ?? null,
          billed_code: data.attended ? code : null,
          billed_mode: data.attended ? billedMode : null,
          billed_units: data.attended ? billedUnits : null,
          billed_rate: data.attended ? clientRate : null,
          cap_snapshot: data.attended ? cap : null,
          override_reason: data.overrideReason ?? null,
        },
        { onConflict: "session_id,client_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ─── Upsert transport block (MTP firewall enforced here too) ──────────────
export const upsertDayProgramTransport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      attendanceId: string;
      pickupLocation?: string | null;
      pickupTime?: string | null;
      dropoffLocation?: string | null;
      dropoffTime?: string | null;
      transportStaffId?: string | null;
    }) =>
      z
        .object({
          attendanceId: z.string().uuid(),
          pickupLocation: z.string().nullish(),
          pickupTime: z.string().nullish(),
          dropoffLocation: z.string().nullish(),
          dropoffTime: z.string().nullish(),
          transportStaffId: z.string().uuid().nullish(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Resolve session/client/date to apply the MTP firewall.
    const { data: att, error: aErr } = await context.supabase
      .from("day_program_attendance")
      .select("client_id, session:day_program_sessions(session_date, service_code, organization_id)")
      .eq("id", data.attendanceId)
      .single();
    if (aErr || !att) throw new Error(aErr?.message ?? "Attendance not found");

    type SessRef = { session_date: string; service_code: string; organization_id: string };
    const sess = (Array.isArray(att.session) ? att.session[0] : att.session) as SessRef;
    const sessionCode = sess.service_code;

    let mtpBilled = false;
    let blockReason: string | null = null;

    if (sessionCode === "DSI") {
      blockReason = MTP_BLOCK_DSI_DAY;
    } else if (isMtpEligibleCode(sessionCode)) {
      // Verify there's actually a billable DSG/DSP/SED attendance on this date for this client.
      const { data: peers } = await context.supabase
        .from("day_program_attendance")
        .select("billed_units, billed_code, session:day_program_sessions!inner(session_date, organization_id)")
        .eq("client_id", att.client_id)
        .eq("attended", true);
      const hasDayProgramUnit = (peers ?? []).some((p) => {
        type S = { session_date: string; organization_id: string };
        const ps = (Array.isArray(p.session) ? p.session[0] : p.session) as S;
        return (
          ps?.session_date === sess.session_date &&
          ps?.organization_id === sess.organization_id &&
          ["DSG", "DSP", "SED"].includes(p.billed_code ?? "") &&
          (p.billed_units ?? 0) > 0
        );
      });
      if (hasDayProgramUnit) {
        mtpBilled = true;
      } else {
        blockReason = MTP_BLOCK_NO_DAY_PROGRAM;
      }
    } else {
      blockReason = MTP_BLOCK_NO_DAY_PROGRAM;
    }

    const { data: row, error } = await context.supabase
      .from("day_program_transport")
      .upsert(
        {
          attendance_id: data.attendanceId,
          pickup_location: data.pickupLocation ?? null,
          pickup_time: data.pickupTime ?? null,
          dropoff_location: data.dropoffLocation ?? null,
          dropoff_time: data.dropoffTime ?? null,
          transport_staff_id: data.transportStaffId ?? null,
          mtp_billed: mtpBilled,
          mtp_block_reason: blockReason,
        },
        { onConflict: "attendance_id" },
      )
      .select("id, mtp_billed, mtp_block_reason")
      .single();
    if (error) throw new Error(error.message);
    return { ...row, mtp_flat_rate: MTP_FLAT_RATE };
  });

// ─── Delete session ──────────────────────────────────────────────────────
export const deleteDayProgramSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("day_program_sessions")
      .delete()
      .eq("id", data.sessionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
