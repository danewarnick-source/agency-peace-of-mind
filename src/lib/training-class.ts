/**
 * Admin class roster + locked training prices (chunk 2).
 *
 * CPR / Mandt are EXTERNAL classes. 30-day is the in-Hive course from chunk 1.
 * Package creates all three obligations for the same roster.
 * Staff never buy. True North / billing-exempt is always $0.
 */

import { TRAINING_PRICE_CENTS } from "./hive-pricing.ts";
import { THIRTY_DAY_OBLIGATION_TITLE } from "./in-hive-training.ts";

export const TRAINING_CLASS_TYPES = ["cpr_first_aid", "mandt", "thirty_day", "package"] as const;
export type TrainingClassType = (typeof TRAINING_CLASS_TYPES)[number];

export const CPR_OBLIGATION_TITLES = [
  "CPR & First Aid Certification",
  "CPR/First Aid Certification — Initial",
] as const;

export const MANDT_OBLIGATION_TITLES = [
  "Behavior Intervention Certification (SOAR/MANDT/PART/CPI/Safety Care)",
] as const;

export type TrainingClassRosterRow = {
  name: string;
  email: string;
  phone: string;
  staffUserId?: string | null;
};

export type TrainingClassQuote = {
  type: TrainingClassType;
  seatCount: number;
  unitCents: number;
  totalCents: number;
  isExternalClass: boolean;
  obligationTitles: string[];
};

export function isTrainingClassType(value: string): value is TrainingClassType {
  return (TRAINING_CLASS_TYPES as readonly string[]).includes(value);
}

export function trainingClassLabel(type: TrainingClassType): string {
  if (type === "cpr_first_aid") return "CPR / First Aid";
  if (type === "mandt") return "Mandt";
  if (type === "thirty_day") return "30-day orientation";
  return "Training package";
}

export function trainingClassIsExternal(type: TrainingClassType): boolean {
  return type === "cpr_first_aid" || type === "mandt" || type === "package";
}

export function trainingClassUnitCents(type: TrainingClassType): number {
  if (type === "cpr_first_aid") return TRAINING_PRICE_CENTS.cpr_first_aid;
  if (type === "mandt") return TRAINING_PRICE_CENTS.mandt;
  if (type === "thirty_day") return TRAINING_PRICE_CENTS.thirty_day;
  return TRAINING_PRICE_CENTS.full_program;
}

export function quoteTrainingClass(
  type: TrainingClassType,
  seatCount: number,
  billingExempt: boolean,
): TrainingClassQuote {
  const seats = Math.max(1, Math.min(500, Math.floor(Number(seatCount) || 0)));
  const unitCents = billingExempt ? 0 : trainingClassUnitCents(type);
  return {
    type,
    seatCount: seats,
    unitCents,
    totalCents: unitCents * seats,
    isExternalClass: trainingClassIsExternal(type),
    obligationTitles: obligationTitlesForClassType(type),
  };
}

export function obligationTitlesForClassType(type: TrainingClassType): string[] {
  if (type === "cpr_first_aid") return [...CPR_OBLIGATION_TITLES];
  if (type === "mandt") return [...MANDT_OBLIGATION_TITLES];
  if (type === "thirty_day") return [THIRTY_DAY_OBLIGATION_TITLE];
  return [THIRTY_DAY_OBLIGATION_TITLE, ...CPR_OBLIGATION_TITLES, ...MANDT_OBLIGATION_TITLES];
}

export function normalizeRosterEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidRosterEmail(email: string): boolean {
  const e = normalizeRosterEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function cleanRosterRows(rows: TrainingClassRosterRow[]): TrainingClassRosterRow[] {
  return rows
    .map((row) => ({
      name: row.name.trim(),
      email: normalizeRosterEmail(row.email),
      phone: row.phone.trim(),
      staffUserId: row.staffUserId?.trim() || null,
    }))
    .filter((row) => row.name || row.email || row.phone);
}

export function validateRosterRows(rows: TrainingClassRosterRow[]): string | null {
  const cleaned = cleanRosterRows(rows);
  if (cleaned.length === 0) return "Add at least one staff member to the roster.";
  if (cleaned.length > 200) return "A class roster can have at most 200 staff.";
  for (const [i, row] of cleaned.entries()) {
    if (!row.name) return `Row ${i + 1} needs a name.`;
    if (!isValidRosterEmail(row.email)) return `Row ${i + 1} needs a valid email.`;
    if (!row.phone) return `Row ${i + 1} needs a phone number.`;
  }
  const emails = new Set<string>();
  for (const row of cleaned) {
    if (emails.has(row.email)) return `${row.email} is on the roster twice.`;
    emails.add(row.email);
  }
  return null;
}

export function formatRosterContactLine(row: Pick<TrainingClassRosterRow, "name" | "email" | "phone">): string {
  const phone = row.phone.trim();
  return phone ? `${row.name} · ${row.email} · ${phone}` : `${row.name} · ${row.email}`;
}
