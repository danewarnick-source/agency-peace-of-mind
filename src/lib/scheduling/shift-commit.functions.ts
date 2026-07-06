/**
 * The single server-fn wrapper every scheduling insert site routes through.
 * Wraps the shared helper `gateScheduledShiftInsert` + the actual insert
 * inside one transaction-shaped call. All 8 legacy insert sites call this
 * (never .from("scheduled_shifts").insert directly).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ComplianceReviewRequiredError,
  gateScheduledShiftInsert,
  type CandidateFlagLike,
  type ShiftInsertRow,
} from "./shift-commit";

const ShiftRowZ = z
  .object({
    organization_id: z.string().uuid(),
    client_id: z.string().uuid().nullable(),
    staff_id: z.string().uuid().nullable(),
    service_code: z.string().nullable(),
    starts_at: z.string(),
    ends_at: z.string(),
  })
  .passthrough();

const AckZ = z.object({
  ruleId: z.string().uuid(),
  resolution: z.enum(["acknowledged_continued", "stopped"]),
  note: z.string().max(4000).optional(),
});

export type InsertScheduledShiftsResult =
  | {
      status: "inserted";
      inserted: number;
      flagsRaised: number;
      blocked: boolean;
      insertedIds: string[];
    }
  | { status: "needs_review"; candidates: CandidateFlagLike[] };

/**
 * Client-callable strict-mode entry: run detection; if any candidate lacks
 * an acknowledgement, return `needs_review` (UI opens dialog and calls
 * back with acknowledgements). Otherwise raise/resolve flags and insert.
 */
export const insertScheduledShiftsGated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rows: z.array(ShiftRowZ).min(1),
        acknowledgements: z.array(AckZ).optional(),
        returnInserted: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<InsertScheduledShiftsResult> => {
    const { supabase, userId } = context;
    try {
      const gate = await gateScheduledShiftInsert(supabase, data.rows as ShiftInsertRow[], {
        mode: "strict_acknowledgements",
        userId,
        acknowledgements: data.acknowledgements ?? [],
      });
      if (gate.blocked) {
        // provider chose Stop on ≥1 candidate — do not insert
        return { status: "inserted", inserted: 0, flagsRaised: gate.candidates.length, blocked: true, insertedIds: [] };
      }
      const insertRes = await supabase
        .from("scheduled_shifts")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(data.rows as any)
        .select("id");
      if (insertRes.error) throw insertRes.error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ids = ((insertRes.data ?? []) as any[]).map((r) => String(r.id));
      return {
        status: "inserted",
        inserted: ids.length,
        flagsRaised: gate.candidates.length,
        blocked: false,
        insertedIds: ids,
      };
    } catch (e) {
      if (e instanceof ComplianceReviewRequiredError) {
        return { status: "needs_review", candidates: e.candidates };
      }
      throw e;
    }
  });
