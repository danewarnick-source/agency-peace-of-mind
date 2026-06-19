// Pure eligibility logic for ranking staff against a shift slot.
// Inputs come from DB-shaped records; no I/O happens here so the same code
// can run server-side (rankStaffForShift) and client-side (preview chips).

import { minStaffAgeForCode } from "./code-colors";

export type EligibilityInputs = {
  serviceCode: string | null | undefined;
  shiftStart: Date;
  shiftEnd: Date;
  staff: Array<{
    id: string;
    full_name: string | null;
    active: boolean;
    date_of_birth: string | null;
    // shifts already scheduled for this staff in the same calendar week
    weeklyShifts: Array<{ starts_at: string; ends_at: string; id: string }>;
    // certifications mapped to required cert keys
    activeCertKeys: Set<string>;
    // client-specific training keys
    completedClientTrainings: Set<string>; // values: `${clientId}:${trainingId}` etc.
    // assignments to this client or shared team membership with the client
    assignedToClient: boolean;
    isHostForLocation: boolean;
  }>;
  clientId: string | null;
  requiredCertKeys: string[];          // certs required for this service code
  requiredClientTrainings: string[];   // client-specific training keys required
  overtimeThresholdHours: number;      // configurable, default 40
};

export type EligibilityResult = {
  staffId: string;
  rank: number;                  // 0..1 (higher = better)
  blocked: boolean;              // true → omit from picker (host of this location)
  warnings: string[];            // amber chips
  blockers: string[];            // hard reasons not eligible
  projectedWeeklyHours: number;
  durationHours: number;
};

function hoursBetween(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 3_600_000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function ageYears(dob: string | null, asOf: Date): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = asOf.getFullYear() - d.getFullYear();
  const m = asOf.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < d.getDate())) age--;
  return age;
}

export function rankEligibility(inputs: EligibilityInputs): EligibilityResult[] {
  const { serviceCode, shiftStart, shiftEnd, staff,
    requiredCertKeys, requiredClientTrainings, overtimeThresholdHours, clientId } = inputs;
  const shiftDuration = hoursBetween(shiftStart, shiftEnd);
  const minAge = minStaffAgeForCode(serviceCode);

  return staff.map((s) => {
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (s.isHostForLocation) {
      // Host staff never appear in the picker for shifts at their own home.
      return {
        staffId: s.id, rank: 0, blocked: true,
        warnings: [], blockers: ["Host provider for this client — excluded from their shifts"],
        projectedWeeklyHours: 0, durationHours: shiftDuration,
      };
    }

    if (!s.active) blockers.push("Inactive employee");

    // Overlap with another scheduled shift?
    const conflictingShift = s.weeklyShifts.find((ws) => {
      const ws0 = new Date(ws.starts_at);
      const ws1 = new Date(ws.ends_at);
      return overlaps(shiftStart, shiftEnd, ws0, ws1);
    });
    if (conflictingShift) blockers.push("Already scheduled at this time");

    // Age
    const age = ageYears(s.date_of_birth, shiftStart);
    if (age != null && age < minAge) {
      blockers.push(`Must be ${minAge}+ for this service code`);
    } else if (age == null && minAge > 18) {
      warnings.push("DOB unknown — age requirement not verified");
    }

    // Certs
    for (const key of requiredCertKeys) {
      if (!s.activeCertKeys.has(key)) {
        warnings.push(`Missing or expired cert: ${key}`);
      }
    }

    // Client-specific training
    if (clientId) {
      for (const key of requiredClientTrainings) {
        if (!s.completedClientTrainings.has(key)) {
          warnings.push("No client-specific training");
          break;
        }
      }
    }

    // Hours / OT
    const currentWeeklyHours = s.weeklyShifts
      .filter((ws) => ws.id !== conflictingShift?.id)
      .reduce((sum, ws) => sum + hoursBetween(new Date(ws.starts_at), new Date(ws.ends_at)), 0);
    const projected = currentWeeklyHours + shiftDuration;
    if (projected > overtimeThresholdHours) {
      warnings.push(`+${shiftDuration.toFixed(0)}h → ${projected.toFixed(0)}h this week (OT)`);
    }

    // Assignment / team match boosts rank
    let rank = 0;
    if (s.assignedToClient) rank += 0.5;
    if (blockers.length === 0) rank += 0.3;
    if (warnings.length === 0) rank += 0.2;
    rank -= Math.min(0.2, Math.max(0, (projected - overtimeThresholdHours) / 80));

    return {
      staffId: s.id,
      rank: blockers.length ? 0 : Math.max(0, Math.min(1, rank)),
      blocked: false,
      warnings,
      blockers,
      projectedWeeklyHours: projected,
      durationHours: shiftDuration,
    };
  }).sort((a, b) => b.rank - a.rank);
}
