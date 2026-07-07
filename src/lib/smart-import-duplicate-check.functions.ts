// Duplicate detection for historical spreadsheet imports.
//
// After the admin has resolved staff/client for every row in the review
// step, the wizard batches proposed rows here and this server function
// checks whether an existing record already looks the same as what's about
// to be inserted — so an overlapping date range isn't silently imported
// twice.
//
// Timesheets: matches on (staff_id, client_id, DATE, clock_in ±5 min,
//   clock_out ±5 min) against evv_timesheets.
// Daily notes: matches on (staff_id, client_id, DATE) against daily_logs.
//
// Returns duplicate row indexes; the wizard flags those rows with a
// "Likely duplicate" badge and defaults them to SKIP (admin can override).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TimesheetRow = z.object({
  index: z.number().int().nonnegative(),
  staff_id: z.string().uuid(),
  client_id: z.string().uuid(),
  clock_in_iso: z.string().min(10),
  clock_out_iso: z.string().min(10),
});

const DailyNoteRow = z.object({
  index: z.number().int().nonnegative(),
  staff_id: z.string().uuid(),
  client_id: z.string().uuid(),
  log_date_iso: z.string().min(8),
});

const InputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("timesheets"),
    organization_id: z.string().uuid(),
    rows: z.array(TimesheetRow).max(5000),
  }),
  z.object({
    mode: z.literal("daily_notes"),
    organization_id: z.string().uuid(),
    rows: z.array(DailyNoteRow).max(5000),
  }),
]);

type DuplicateHit = {
  index: number;
  existing_id: string;
  reason: string;
};

const TOLERANCE_MS = 5 * 60 * 1000; // ±5 minutes for clock in/out

export const checkImportDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase } = context as any;
    if (data.rows.length === 0) return { duplicates: [] as DuplicateHit[] };

    if (data.mode === "timesheets") {
      // Date-window filter to keep the scan tight. We compare (staff, client,
      // day) buckets and then time proximity within the day.
      const dayOf = (iso: string) => iso.slice(0, 10);
      const clientIds = Array.from(new Set(data.rows.map((r) => r.client_id)));
      const staffIds = Array.from(new Set(data.rows.map((r) => r.staff_id)));
      const days = data.rows.map((r) => dayOf(r.clock_in_iso)).sort();
      const minDay = days[0];
      const maxDay = days[days.length - 1];

      const { data: existing, error } = await supabase
        .from("evv_timesheets")
        .select("id, staff_id, client_id, clock_in_timestamp, clock_out_timestamp")
        .eq("organization_id", data.organization_id)
        .in("staff_id", staffIds)
        .in("client_id", clientIds)
        .gte("clock_in_timestamp", `${minDay}T00:00:00Z`)
        .lte("clock_in_timestamp", `${maxDay}T23:59:59Z`)
        .limit(20000);
      if (error) throw new Error(error.message);

      // Bucket existing rows by "staff|client|YYYY-MM-DD"
      const bucket = new Map<string, Array<{ id: string; in: number; out: number }>>();
      for (const e of existing ?? []) {
        const key = `${e.staff_id}|${e.client_id}|${(e.clock_in_timestamp as string).slice(0, 10)}`;
        const list = bucket.get(key) ?? [];
        list.push({
          id: e.id as string,
          in: new Date(e.clock_in_timestamp as string).getTime(),
          out: new Date(e.clock_out_timestamp as string).getTime(),
        });
        bucket.set(key, list);
      }

      const duplicates: DuplicateHit[] = [];
      for (const r of data.rows) {
        const key = `${r.staff_id}|${r.client_id}|${dayOf(r.clock_in_iso)}`;
        const list = bucket.get(key);
        if (!list) continue;
        const rin = new Date(r.clock_in_iso).getTime();
        const rout = new Date(r.clock_out_iso).getTime();
        const hit = list.find(
          (e) => Math.abs(e.in - rin) <= TOLERANCE_MS && Math.abs(e.out - rout) <= TOLERANCE_MS,
        );
        if (hit) {
          duplicates.push({
            index: r.index,
            existing_id: hit.id,
            reason: `already imported: same staff, client, date, and shift times (within 5 minutes).`,
          });
        }
      }
      return { duplicates };
    }

    // daily_notes mode
    const clientIds = Array.from(new Set(data.rows.map((r) => r.client_id)));
    const staffIds = Array.from(new Set(data.rows.map((r) => r.staff_id)));
    const days = data.rows.map((r) => r.log_date_iso.slice(0, 10)).sort();
    const minDay = days[0];
    const maxDay = days[days.length - 1];

    // daily_logs uses `user_id` for the staff member, not `staff_id`.
    const { data: existing, error } = await supabase
      .from("daily_logs")
      .select("id, user_id, client_id, log_date")
      .eq("organization_id", data.organization_id)
      .in("user_id", staffIds)
      .in("client_id", clientIds)
      .gte("log_date", minDay)
      .lte("log_date", maxDay)
      .limit(20000);
    if (error) throw new Error(error.message);

    const seen = new Map<string, string>();
    for (const e of existing ?? []) {
      const key = `${e.user_id}|${e.client_id}|${(e.log_date as string).slice(0, 10)}`;
      if (!seen.has(key)) seen.set(key, e.id as string);
    }

    const duplicates: DuplicateHit[] = [];
    for (const r of data.rows) {
      const key = `${r.staff_id}|${r.client_id}|${r.log_date_iso.slice(0, 10)}`;
      const existingId = seen.get(key);
      if (existingId) {
        duplicates.push({
          index: r.index,
          existing_id: existingId,
          reason: "a daily note already exists for this staff, client, and date.",
        });
      }
    }
    return { duplicates };
  });
