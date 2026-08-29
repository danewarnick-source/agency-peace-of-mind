/**
 * Confirmed Hive list / founding / training prices.
 *
 * List (public /pricing): $125 / staff (1–19 clients), $109 (20–49), $99 (50+),
 * $500 / month minimum, annual 20% off. Enterprise is contact-us — no dollar amount.
 *
 * Founding (first 5 paying orgs, 12 months, then list): $79 / staff, $299 minimum.
 *
 * Training is one-time per staff (Mandt name stays). True North / billing-exempt skip it.
 */

export type PricingSchedule = "list" | "founding";
export type BillingInterval = "monthly" | "annual";

export const FOUNDING_ORG_CAP = 5;
export const FOUNDING_MONTHS = 12;
export const ANNUAL_DISCOUNT = 0.2;

export const LIST_PER_STAFF_CENTS_1_19 = 12_500;
export const LIST_PER_STAFF_CENTS_20_49 = 10_900;
export const LIST_PER_STAFF_CENTS_50_PLUS = 9_900;
/** $125 × 4 seats = $500 list minimum. */
export const LIST_MIN_SEATS = 4;
export const LIST_MINIMUM_CENTS = LIST_PER_STAFF_CENTS_1_19 * LIST_MIN_SEATS;

export const FOUNDING_PER_STAFF_CENTS = 7_900;
export const FOUNDING_MINIMUM_CENTS = 29_900;

export const TRAINING_PRICE_CENTS = {
  full_program: 30_000,
  cpr_first_aid: 7_500,
  mandt: 20_000,
  dspd_required: 10_000,
} as const;

/** Same include list the public /pricing training card already shows. */
export const PUBLIC_TRAINING_FULL_PROGRAM_INCLUDES = [
  "CPR & First Aid",
  "Mandt behavioral intervention",
  "30-day DSPD required training",
  "Hands-on Hive platform walkthrough",
  "Competency verification & sign-off",
  "12 hrs custom ongoing training content / year",
] as const;

export type PublicTrainingAlaCarteItem = {
  sku: "cpr_first_aid" | "mandt" | "dspd_required";
  name: string;
  priceCents: number;
  sub?: string;
};

/** Same three à la carte rows the public /pricing page already shows. */
export const PUBLIC_TRAINING_ALA_CARTE: readonly PublicTrainingAlaCarteItem[] = [
  { sku: "cpr_first_aid", name: "CPR / First Aid", priceCents: TRAINING_PRICE_CENTS.cpr_first_aid },
  { sku: "mandt", name: "Mandt", priceCents: TRAINING_PRICE_CENTS.mandt },
  {
    sku: "dspd_required",
    name: "DSPD required training",
    priceCents: TRAINING_PRICE_CENTS.dspd_required,
    sub: "Includes 12 hrs ongoing content / year",
  },
];

export function publicTrainingAlaCarteTotalCents(): number {
  return PUBLIC_TRAINING_ALA_CARTE.reduce((sum, row) => sum + row.priceCents, 0);
}

export function publicTrainingBundleSavingsCents(): number {
  return Math.max(0, publicTrainingAlaCarteTotalCents() - TRAINING_PRICE_CENTS.full_program);
}

export const LIST_VOLUME_TIERS = [
  { maxClients: 19, perStaffCents: LIST_PER_STAFF_CENTS_1_19, label: "1–19 clients" },
  { maxClients: 49, perStaffCents: LIST_PER_STAFF_CENTS_20_49, label: "20–49 clients" },
  { maxClients: Infinity, perStaffCents: LIST_PER_STAFF_CENTS_50_PLUS, label: "50+ clients" },
] as const;

export function listPerStaffCents(clientCount: number): number {
  const n = Math.max(0, Math.floor(Number(clientCount) || 0));
  if (n <= 19) return LIST_PER_STAFF_CENTS_1_19;
  if (n <= 49) return LIST_PER_STAFF_CENTS_20_49;
  return LIST_PER_STAFF_CENTS_50_PLUS;
}

export function listVolumeLabel(clientCount: number): string {
  const n = Math.max(0, Math.floor(Number(clientCount) || 0));
  if (n <= 19) return "1–19 clients";
  if (n <= 49) return "20–49 clients";
  return "50+ clients";
}

export function clampStaffCount(n: number | null | undefined): number {
  const v = Math.floor(Number(n) || 0);
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(500, v);
}

export function clampClientCount(n: number | null | undefined): number {
  const v = Math.floor(Number(n) || 0);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(5000, v);
}

export function foundingEndsAtFrom(start: Date = new Date()): string {
  const d = new Date(start.getTime());
  d.setUTCMonth(d.getUTCMonth() + FOUNDING_MONTHS);
  return d.toISOString();
}

export function effectivePricingSchedule(opts: {
  schedule: PricingSchedule | string | null | undefined;
  foundingEndsAt?: string | Date | null;
  now?: Date;
}): PricingSchedule {
  if (opts.schedule !== "founding") return "list";
  if (!opts.foundingEndsAt) return "founding";
  const end =
    typeof opts.foundingEndsAt === "string" ? new Date(opts.foundingEndsAt) : opts.foundingEndsAt;
  if (Number.isNaN(end.getTime())) return "founding";
  const now = opts.now ?? new Date();
  return end.getTime() > now.getTime() ? "founding" : "list";
}

export function signupScheduleFromPayingCount(payingOrgCount: number): PricingSchedule {
  const n = Math.max(0, Math.floor(Number(payingOrgCount) || 0));
  return n < FOUNDING_ORG_CAP ? "founding" : "list";
}

export type HiveQuoteInput = {
  staffCount: number;
  clientCount: number;
  schedule: PricingSchedule | string | null | undefined;
  interval: BillingInterval | string | null | undefined;
  foundingEndsAt?: string | Date | null;
  now?: Date;
};

export type HiveQuote = {
  schedule: PricingSchedule;
  interval: BillingInterval;
  staffCount: number;
  clientCount: number;
  perStaffCents: number;
  rawMonthlyCents: number;
  monthlyCents: number;
  minimumCents: number;
  minimumApplied: boolean;
  billedCents: number;
  annualSavingsCents: number;
  volumeLabel: string;
  label: string;
};

export function quoteHiveSubscription(input: HiveQuoteInput): HiveQuote {
  const staffCount = clampStaffCount(input.staffCount);
  const clientCount = clampClientCount(input.clientCount);
  const schedule = effectivePricingSchedule({
    schedule: input.schedule,
    foundingEndsAt: input.foundingEndsAt ?? null,
    now: input.now,
  });
  const interval: BillingInterval = input.interval === "annual" ? "annual" : "monthly";
  const perStaffCents = schedule === "founding" ? FOUNDING_PER_STAFF_CENTS : listPerStaffCents(clientCount);
  const minimumCents = schedule === "founding" ? FOUNDING_MINIMUM_CENTS : LIST_MINIMUM_CENTS;
  const rawMonthlyCents = staffCount * perStaffCents;
  const monthlyCents = Math.max(rawMonthlyCents, minimumCents);
  const minimumApplied = monthlyCents > rawMonthlyCents;
  const billedCents =
    interval === "annual" ? Math.round(monthlyCents * 12 * (1 - ANNUAL_DISCOUNT)) : monthlyCents;
  const annualFull = monthlyCents * 12;
  const annualSavingsCents = annualFull - Math.round(annualFull * (1 - ANNUAL_DISCOUNT));
  const volumeLabel = schedule === "founding" ? "founding (flat $79 / staff)" : listVolumeLabel(clientCount);
  const label = schedule === "founding" ? "Founding" : `List · ${volumeLabel}`;
  return {
    schedule,
    interval,
    staffCount,
    clientCount,
    perStaffCents,
    rawMonthlyCents,
    monthlyCents,
    minimumCents,
    minimumApplied,
    billedCents,
    annualSavingsCents,
    volumeLabel,
    label,
  };
}

export function formatUsdFromCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function trainingPriceCentsForSku(sku: string, catalogPriceCents?: number | null): number {
  const key = sku.trim().toLowerCase();
  if (key === "full_program" || key === "full") return TRAINING_PRICE_CENTS.full_program;
  if (key === "cpr_first_aid" || key === "cpr") return TRAINING_PRICE_CENTS.cpr_first_aid;
  if (key === "mandt") return TRAINING_PRICE_CENTS.mandt;
  if (key === "dspd_required" || key === "dspd") return TRAINING_PRICE_CENTS.dspd_required;
  const fallback = Math.floor(Number(catalogPriceCents) || 0);
  return fallback > 0 ? fallback : 0;
}
