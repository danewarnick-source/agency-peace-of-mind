// Day Program billing — single source of truth for DSG / DSP / DSI / MTP
// (Utah DSPD SOW DHHS91172 Art. 7, 9, 13, eff. 7/1/26).
//
// Day-program codes bill PER CLIENT PER DAY off a Day Program Session.
// Staff clock-in on a session is for labor/payroll only and NEVER drives
// day-program client billing (same firewall pattern as RHS).
//
// For DSG/DSP/HHS the fee-schedule dollar figure is a CAP. The actual
// per-client rate is set by the RFS committee and stored on the client's
// authorization row (client_billing_codes.rate_per_unit). Billing must
// always price from the client authorization, validated <= cap.
// MTP is the only day-program code with a FLAT statewide rate.

export type DayProgramCode = "DSG" | "DSP" | "DSI" | "SED";
export type DspMode = "qtr_hr" | "daily_extended";

/** Codes that drive a Day Program Session. */
export const DAY_PROGRAM_CODES: ReadonlySet<DayProgramCode> = new Set([
  "DSG",
  "DSP",
  "DSI",
  "SED",
]);

/**
 * Codes whose attendance unit makes a same-date MTP unit billable.
 * SOW 13.1 + 13.4(2): DSI explicitly EXCLUDED — transportation is bundled
 * in the DSI code description.
 */
export const MTP_ELIGIBLE_CODES: ReadonlySet<DayProgramCode> = new Set([
  "DSG",
  "DSP",
  "SED",
]);

export function isDayProgramCode(code: string | null | undefined): code is DayProgramCode {
  return !!code && DAY_PROGRAM_CODES.has(code as DayProgramCode);
}

export function isMtpEligibleCode(code: string | null | undefined): boolean {
  return !!code && MTP_ELIGIBLE_CODES.has(code as DayProgramCode);
}

// ─── Rate caps (fee schedule, eff. 7/1/26) ────────────────────────────────
export const RATE_CAPS = {
  DSG_DAILY: 246.61,
  DSP_QTR_HR: 10.25,
  DSP_DAILY_EXTENDED: 403.39,
  DSI_TIER: [
    /* 1h */ 55.05,
    /* 2h */ 78.92,
    /* 3h */ 102.76,
    /* 4h */ 126.63,
    /* 5h */ 150.49,
    /* 6h */ 174.35,
  ] as const,
  MTP_FLAT: 21.13,
} as const;

/** Flat MTP rate — never per-client. */
export const MTP_FLAT_RATE = RATE_CAPS.MTP_FLAT;

// ─── Mode + tier selection ────────────────────────────────────────────────
// Thresholds derived from SOW 7.6: typical DSG day ~6h; DSP partial ≤4h,
// DSP extended ~7–10h. The 4–7h band is intentionally ambiguous and must
// be confirmed by a reviewer (Nectar Scrubber flag).
export const DSP_QTR_HR_MAX_MINUTES = 4 * 60;
export const DSP_DAILY_MIN_MINUTES = 7 * 60;
export const DSP_DAILY_MAX_MINUTES = 10 * 60;

export type DspModeResult =
  | { mode: DspMode; ambiguous: false }
  | { mode: null; ambiguous: true; reason: string };

export function dspModeForMinutes(minutes: number): DspModeResult {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { mode: null, ambiguous: true, reason: "Session has no duration." };
  }
  if (minutes <= DSP_QTR_HR_MAX_MINUTES) return { mode: "qtr_hr", ambiguous: false };
  if (minutes >= DSP_DAILY_MIN_MINUTES) return { mode: "daily_extended", ambiguous: false };
  return {
    mode: null,
    ambiguous: true,
    reason:
      "DSP session length is between 4h and 7h — reviewer must select " +
      "partial (qtr-hr) or extended (daily) and record a reason.",
  };
}

export type DsiTier = { tierHours: 1 | 2 | 3 | 4 | 5 | 6; cap: number };

/**
 * DSI tier is selected by ACTUAL hours delivered (SOW 9). We round UP to
 * the next whole hour up to a max of 6 — anything beyond 6h still bills
 * at the 6h tier.
 */
export function dsiTierForMinutes(minutes: number): DsiTier | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.min(6, Math.max(1, Math.ceil(minutes / 60))) as DsiTier["tierHours"];
  return { tierHours: hours, cap: RATE_CAPS.DSI_TIER[hours - 1] };
}

// ─── Cap validation (used by client_billing_codes editor) ─────────────────
export type RateValidation = { ok: true } | { ok: false; cap: number; reason: string };

export function validateClientRateAgainstCap(
  code: string,
  rate: number,
  opts?: { dspMode?: DspMode; dsiTierHours?: DsiTier["tierHours"] },
): RateValidation {
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, cap: 0, reason: "Rate must be a positive number." };
  }
  const c = code.toUpperCase();
  let cap: number | null = null;
  switch (c) {
    case "DSG":
      cap = RATE_CAPS.DSG_DAILY;
      break;
    case "DSP":
      cap =
        opts?.dspMode === "daily_extended"
          ? RATE_CAPS.DSP_DAILY_EXTENDED
          : RATE_CAPS.DSP_QTR_HR;
      break;
    case "DSI": {
      const tier = opts?.dsiTierHours ?? 6;
      cap = RATE_CAPS.DSI_TIER[tier - 1];
      break;
    }
    case "MTP":
      // MTP is flat — there is no client-authorized rate at all.
      return {
        ok: false,
        cap: RATE_CAPS.MTP_FLAT,
        reason: "MTP bills at the flat statewide rate; no per-client rate is set.",
      };
    default:
      return { ok: true };
  }
  if (cap == null) return { ok: true };
  if (rate > cap) {
    return {
      ok: false,
      cap,
      reason: `Rate $${rate.toFixed(2)} exceeds the fee-schedule cap of $${cap.toFixed(2)} for ${c}.`,
    };
  }
  return { ok: true };
}

// ─── Compliance flag helpers ──────────────────────────────────────────────
/**
 * MTP firewall reason for a (client, date) when no qualifying DSG/DSP/SED
 * attendance row exists. Use in the view + UI so the message is identical.
 */
export const MTP_BLOCK_NO_DAY_PROGRAM =
  "MTP not billable: no DSG/DSP/SED attendance for this client on this date (SOW 13.4(3)).";

export const MTP_BLOCK_DSI_DAY =
  "MTP not billable: DSI includes transportation in its code description (SOW 13.1).";
