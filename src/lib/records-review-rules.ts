// Records review exception engine — pure, deterministic.
// A shift lands in the "Needs review" queue iff at least one rule trips.
// Inputs are only existing evv_timesheets columns; no new schema, no AI.
import { isNonAnswer } from "@/lib/nectar-quality";

export type ReviewExceptionCode =
  | "out_of_geofence"
  | "missing_note"
  | "no_clockout_stale";

export interface ReviewException {
  code: ReviewExceptionCode;
  label: string;
}

export interface ReviewRuleInput {
  is_out_of_bounds: boolean | null;
  outside_geofence_reason: string | null;
  shift_note_text: string | null;
  goals_completed: string[] | null;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  service_type_code: string;
  import_source: string | null;
  staff_confirmed_at: string | null;
}

/** Codes where a PCSP goal must be checked for the shift to bill clean. */
const REQUIRES_PCSP_GOAL = new Set([
  "SLN", "SLH", "COM", "PAC", "ACA", "CHA", "HSQ", "DSI", "SEI",
]);

const STALE_NO_CLOCKOUT_HOURS = 18;

export function reviewExceptions(r: ReviewRuleInput, now: Date = new Date()): ReviewException[] {
  const out: ReviewException[] = [];

  // 1) Out-of-geofence punch with no resolving reason yet.
  if (r.is_out_of_bounds === true) {
    const reason = (r.outside_geofence_reason ?? "").trim();
    if (reason.length === 0) {
      out.push({ code: "out_of_geofence", label: "Out of geofence" });
    }
  }

  // 2) Missing/short note OR required PCSP goal not checked.
  //    Only evaluable once the shift has clocked out.
  if (r.clock_out_timestamp) {
    const note = r.shift_note_text ?? "";
    const noteBad =
      isNonAnswer(note) || note.trim().length < 50;
    const requiresGoal = REQUIRES_PCSP_GOAL.has(r.service_type_code);
    const goalsEmpty = !r.goals_completed || r.goals_completed.length === 0;

    // Historical imports predate Hive's goal tracking — the original shift
    // never had a PCSP goal to check, and often predate Hive's note-length
    // conventions too. Once a staff member has actually attested the record
    // (staff_confirmed_at populated) through the Historical Records flow,
    // it's on file, signed, and retrievable for an auditor — flagging it
    // forever for note/goal data that could never have existed is noise,
    // not a compliance gap. An import still awaiting attestation is not
    // exempt; it surfaces separately as "Awaiting staff confirmation".
    const isAttestedHistoricalImport =
      r.import_source === "historical_import" && !!r.staff_confirmed_at;

    if (noteBad && !isAttestedHistoricalImport) {
      out.push({ code: "missing_note", label: "Missing/short note" });
    } else if (requiresGoal && goalsEmpty && !isAttestedHistoricalImport) {
      out.push({ code: "missing_note", label: "PCSP goal not checked" });
    }
  }

  // 3) Stale open shift — clocked in, no clock-out, older than threshold.
  if (!r.clock_out_timestamp) {
    const startedMs = new Date(r.clock_in_timestamp).getTime();
    const ageHrs = (now.getTime() - startedMs) / 36e5;
    if (ageHrs > STALE_NO_CLOCKOUT_HOURS) {
      out.push({ code: "no_clockout_stale", label: "No clock-out" });
    }
  }

  return out;
}
