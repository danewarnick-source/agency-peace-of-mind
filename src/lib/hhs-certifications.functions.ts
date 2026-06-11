import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { z } from "zod";

// Read-model + month-end certification for the HHS Monthly Attendance roll-up.
// Reads only (attendance + the billable view); the daily WRITER stays in
// src/lib/hhs.functions.ts. The certification table is a human SQL handoff —
// everything here degrades gracefully (tableReady=false) until it exists, so
// the hub never crashes pre-migration.

export type AttendanceRow = {
  client_id: string;
  record_date: string;
  presence_status: string;
  away_reason: string | null;
  away_category: string | null;
  staff_initials_signature: string | null;
};

export type BlockedDay = { record_date: string; blocked_reason: string | null };

export type MonthCertification = {
  id: string;
  month: string;
  present_days: number;
  away_days: number;
  blocked_days: number;
  certified_by: string;
  certified_at: string;
  certified_by_name: string | null;
};

/** Attendance rows + blocked (unbillable) days for one client + month. */
export const getHhsMonthData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId: z.string().uuid(),
      clientId: z.string().uuid(),
      monthStart: z.string(),
      monthEnd: z.string(),
    }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ attendance: AttendanceRow[]; blocked: BlockedDay[] }> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const attQ = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hhs_monthly_attendance" as never)
      .select("client_id, record_date, presence_status, away_reason, away_category, staff_initials_signature")
      .eq("organization_id", data.organizationId)
      .eq("client_id", data.clientId)
      .gte("record_date", data.monthStart)
      .lte("record_date", data.monthEnd);
    if (attQ.error) throw new Error(attQ.error.message);

    const blkQ = await supabase
      .from("hhs_daily_records_v")
      .select("record_date, blocked_reason, billable")
      .eq("organization_id", data.organizationId)
      .eq("client_id", data.clientId)
      .eq("billable", false)
      .gte("record_date", data.monthStart)
      .lte("record_date", data.monthEnd);
    if (blkQ.error) throw new Error(blkQ.error.message);

    const blockedByDate = new Map<string, string | null>();
    for (const r of (blkQ.data ?? []) as Array<{ record_date: string | null; blocked_reason: string | null }>) {
      if (r.record_date) blockedByDate.set(r.record_date, r.blocked_reason);
    }

    return {
      attendance: (attQ.data ?? []) as unknown as AttendanceRow[],
      blocked: [...blockedByDate.entries()].map(([record_date, blocked_reason]) => ({ record_date, blocked_reason })),
    };
  });

/**
 * Certification status for one month. `tableReady` is false when the
 * hhs_monthly_certifications handoff table doesn't exist yet — the UI uses it
 * to disable "Certify month" with a "Pending database update" tooltip.
 */
export const getMonthCertification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId: z.string().uuid(),
      clientId: z.string().uuid(),
      month: z.string(),
    }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ tableReady: boolean; cert: MonthCertification | null }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    try {
      const { data: row, error } = await sb
        .from("hhs_monthly_certifications")
        .select("id, month, present_days, away_days, blocked_days, certified_by, certified_at")
        .eq("organization_id", data.organizationId)
        .eq("client_id", data.clientId)
        .eq("month", data.month)
        .maybeSingle();
      if (error) return { tableReady: false, cert: null };
      if (!row) return { tableReady: true, cert: null };

      // Resolve signer name (no FK org_members↔profiles — separate lookup).
      let certified_by_name: string | null = null;
      const { data: prof } = await sb.from("profiles").select("full_name").eq("id", row.certified_by).maybeSingle();
      certified_by_name = (prof?.full_name as string | undefined) ?? null;

      return { tableReady: true, cert: { ...row, certified_by_name } as MonthCertification };
    } catch {
      return { tableReady: false, cert: null };
    }
  });

/** Certify a month (admin/manager). Stores signer, timestamp, count snapshot. */
export const certifyHhsMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId: z.string().uuid(),
      clientId: z.string().uuid(),
      month: z.string(),
      presentDays: z.number().int().min(0),
      awayDays: z.number().int().min(0),
      blockedDays: z.number().int().min(0),
    }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase, userId } = context;
    // Admin or manager (the closest match to "admin or the assigned program lead").
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error } = await sb
      .from("hhs_monthly_certifications")
      .upsert(
        {
          organization_id: data.organizationId,
          client_id: data.clientId,
          month: data.month,
          present_days: data.presentDays,
          away_days: data.awayDays,
          blocked_days: data.blockedDays,
          certified_by: userId,
          certified_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,client_id,month" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
