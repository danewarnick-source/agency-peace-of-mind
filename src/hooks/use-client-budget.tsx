import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";
import { useAllClientBillingCodes, type ClientBillingCode } from "./use-client-billing-codes";
import {
  computeEntryUnits,
  isBillableForReview,
  unitsToHours,
  UNITS_PER_HOUR,
} from "@/lib/billing-units";
import { isDailyServiceCode } from "@/lib/service-billing";
import { isNonAnswer } from "@/lib/nectar-quality";

/**
 * Live per-code budget ledger. For each authorized billing code we
 * compute used units (across ALL staff) within the code's annual budget
 * window, plus the renewal target and a hours/week-needed projection.
 *
 * Hourly codes: used = hours × 4. Daily codes: used = distinct days.
 */
export type CodeBudget = {
  code: ClientBillingCode;
  /** Start of the budget year for this code (defaults to today if unset). */
  period_start: Date;
  /** End/renewal date for this code (null if unset). */
  period_end: Date | null;
  is_daily: boolean;
  used_units: number;
  used_hours: number;
  remaining_units: number;
  remaining_hours: number;
  /** Pct of annual authorization used (0..200). */
  used_pct: number;
  /** Hours used per week so far (avg over weeks elapsed in window). */
  weekly_pace_hours: number;
  /** Hours/week needed to fully utilize remaining by renewal date. */
  hours_per_week_target: number;
  /** Days from today to renewal. Negative if passed. */
  days_to_renewal: number;
  /** Weeks from today to renewal. */
  weeks_to_renewal: number;
  status: "ok" | "under" | "over" | "exhausted" | "expired" | "no_period";
};

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function weeksBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / (7 * 86_400_000));
}

export function useClientBudget(clientId: string | undefined) {
  const { data: org } = useCurrentOrg();
  const { data: allCodes } = useAllClientBillingCodes();

  return useQuery({
    enabled: !!org?.organization_id && !!clientId && !!allCodes,
    queryKey: ["client-budget", org?.organization_id, clientId, allCodes?.length],
    refetchInterval: 60_000,
    queryFn: async (): Promise<CodeBudget[]> => {
      const codes = (allCodes ?? []).filter((c) => c.client_id === clientId);
      if (codes.length === 0) return [];

      // Earliest period_start across this client's codes gates our data window.
      const now = new Date();
      const earliestStart = codes
        .map((c) => parseDate(c.service_start_date))
        .filter((d): d is Date => !!d)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? new Date(now.getFullYear(), 0, 1);

      // Pull all completed punches for this client in the widest window.
      const { data: tsRows, error: tsErr } = await supabase
        .from("evv_timesheets")
        .select("service_type_code, clock_in_timestamp, clock_out_timestamp, rounded_clock_in, rounded_clock_out, corrected_clock_in, corrected_clock_out, review_status, shift_note_text")
        .eq("organization_id", org!.organization_id)
        .eq("client_id", clientId!)
        .gte("clock_in_timestamp", earliestStart.toISOString());
      if (tsErr) throw tsErr;

      // Daily-rate days come from the hhs_daily_records_v view; only
      // billable rows (attendance Present + daily note) consume budget.
      const { data: dlRows, error: dlErr } = await supabase
        .from("hhs_daily_records_v")
        .select("record_date, service_code, billable")
        .eq("organization_id", org!.organization_id)
        .eq("client_id", clientId!)
        .eq("billable", true)
        .gte("record_date", earliestStart.toISOString().slice(0, 10));
      if (dlErr) throw dlErr;

      return codes.map((code): CodeBudget => {
        const period_start = parseDate(code.service_start_date) ?? new Date(now.getFullYear(), 0, 1);
        const period_end = parseDate(code.service_end_date);
        const is_daily = isDailyServiceCode(code.service_code);

        // Sum usage strictly within the code's period.
        let used_hours = 0;
        let used_days = 0;
        let used_entry_units = 0;
        if (code.service_code === "RHS" || code.service_code === "DSG") {
          // Shared residential setting: any staff member who clocked in/out
          // with a real shift note for this client on a date makes that
          // whole date billable — this is an aggregate check across every
          // staff member who worked that date, not a single "the" daily
          // note. RHS requires a substantive (50+ word) note; DSG only
          // requires a complete clocked shift with a real (non-blank,
          // non-placeholder) note — its SOW bar is start/end time on the
          // documentation, not narrative depth.
          const dates = new Set<string>();
          for (const r of (tsRows ?? []) as Array<{
            service_type_code: string | null;
            clock_in_timestamp: string | null;
            clock_out_timestamp: string | null;
            rounded_clock_in: string | null;
            rounded_clock_out: string | null;
            corrected_clock_in: string | null;
            corrected_clock_out: string | null;
            review_status: string | null;
            shift_note_text: string | null;
          }>) {
            if (r.service_type_code !== code.service_code) continue;
            if (!isBillableForReview(r)) continue;
            const billIn = (r.review_status === "approved" && r.corrected_clock_in)
              ? r.corrected_clock_in
              : (r.rounded_clock_in ?? r.clock_in_timestamp);
            const billOut = (r.review_status === "approved" && r.corrected_clock_out)
              ? r.corrected_clock_out
              : (r.rounded_clock_out ?? r.clock_out_timestamp);
            if (!billIn || !billOut) continue;
            const inT = new Date(billIn);
            if (inT < period_start) continue;
            if (period_end && inT > period_end) continue;
            const note = r.shift_note_text ?? "";
            const qualifies = code.service_code === "RHS"
              ? (!isNonAnswer(note) && note.trim().length >= 50)
              : (!isNonAnswer(note) && note.trim().length > 0);
            if (!qualifies) continue;
            dates.add(billIn.slice(0, 10));
          }
          used_days = dates.size;
        } else if (is_daily) {
          const dates = new Set<string>();
          for (const r of (dlRows ?? []) as Array<{ record_date: string | null; service_code: string | null }>) {
            if (!r.record_date) continue;
            // View rows carry the service code — attribute days to the exact code.
            if (r.service_code && r.service_code !== code.service_code) continue;
            const d = new Date(r.record_date + "T00:00:00");
            if (d < period_start) continue;
            if (period_end && d > period_end) continue;
            dates.add(r.record_date);
          }
          used_days = dates.size;
        } else {
          for (const r of (tsRows ?? []) as Array<{
            service_type_code: string | null;
            clock_in_timestamp: string | null;
            clock_out_timestamp: string | null;
            rounded_clock_in: string | null;
            rounded_clock_out: string | null;
            corrected_clock_in: string | null;
            corrected_clock_out: string | null;
            review_status: string | null;
          }>) {
            if (r.service_type_code !== code.service_code) continue;
            // needs_review/rejected are excluded until a supervisor approves.
            if (!isBillableForReview(r)) continue;
            // Same authoritative-time precedence as records-tab.tsx: approved
            // correction, else the rounded (nearest-quarter-hour) punch, else
            // raw as a last resort. Never derived back into the raw/corrected
            // columns — only used to compute used units/hours here.
            const billIn = (r.review_status === "approved" && r.corrected_clock_in)
              ? r.corrected_clock_in
              : (r.rounded_clock_in ?? r.clock_in_timestamp);
            const billOut = (r.review_status === "approved" && r.corrected_clock_out)
              ? r.corrected_clock_out
              : (r.rounded_clock_out ?? r.clock_out_timestamp);
            if (!billIn || !billOut) continue;
            const inT = new Date(billIn);
            if (inT < period_start) continue;
            if (period_end && inT > period_end) continue;
            const hrs =
              (new Date(billOut).getTime() - inT.getTime()) / 3_600_000;
            if (hrs > 0 && isFinite(hrs)) {
              used_hours += hrs;
              // Per-entry rounding; the bucket sums entry units, never re-rounds.
              used_entry_units += computeEntryUnits(billIn, billOut);
            }
          }
        }

        const used_units = is_daily ? used_days : used_entry_units;
        const annual = code.annual_unit_authorization ?? 0;
        const remaining_units = Math.max(0, annual - used_units);
        const remaining_hours = is_daily
          ? remaining_units // for daily, "hours" col is irrelevant; mirror days
          : unitsToHours(remaining_units);
        const used_pct = annual > 0 ? Math.min(200, (used_units / annual) * 100) : 0;

        const weeksElapsed = Math.max(0.001, weeksBetween(period_start, now));
        const weekly_pace_hours = is_daily ? used_days / weeksElapsed : used_hours / weeksElapsed;

        const days_to_renewal = period_end
          ? Math.ceil((period_end.getTime() - now.getTime()) / 86_400_000)
          : 0;
        const weeks_to_renewal = period_end ? weeksBetween(now, period_end) : 0;

        let hours_per_week_target = 0;
        let status: CodeBudget["status"] = "ok";
        if (!period_end) {
          status = "no_period";
        } else if (days_to_renewal < 0) {
          status = "expired";
        } else if (used_units >= annual && annual > 0) {
          status = "exhausted";
        } else if (weeks_to_renewal > 0) {
          hours_per_week_target = is_daily
            ? remaining_units / weeks_to_renewal
            : remaining_hours / weeks_to_renewal;
          if (weekly_pace_hours > hours_per_week_target * 1.15) status = "over";
          else if (weekly_pace_hours < hours_per_week_target * 0.7) status = "under";
        }

        return {
          code,
          period_start,
          period_end,
          is_daily,
          used_units,
          used_hours: is_daily ? used_days : used_hours,
          remaining_units,
          remaining_hours,
          used_pct,
          weekly_pace_hours,
          hours_per_week_target,
          days_to_renewal,
          weeks_to_renewal,
          status,
        };
      });
    },
  });
}

export const _UNITS_PER_HOUR = UNITS_PER_HOUR;
