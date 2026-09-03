/**
 * Public training-only purchase (no agency workspace).
 *
 * Locked SKUs match signup / PI list: CPR $100, 30-day $75, Mandt $200, Pack $300.
 * Quantities = people on each SKU. Pack is exclusive for that person.
 * True North / office rosters stay on training_classes — this path is outsiders.
 */

import {
  SIGNUP_TRAINING_ADDON_IDS,
  SIGNUP_TRAINING_ADDONS,
  isSignupTrainingAddonId,
  quoteSignupTrainingAddon,
  type SignupTrainingAddonId,
} from "./pi-signup-pricing.ts";
import {
  stripePriceIdForTrainingSku,
  type StripeLineItem,
  type StripePriceEnv,
} from "./stripe-config.ts";
import { formatUsdFromCents } from "./hive-pricing.ts";

export const TRAINING_ONLY_SKUS = SIGNUP_TRAINING_ADDON_IDS;
export type TrainingOnlySku = SignupTrainingAddonId;

export const TRAINING_ONLY_TERMS =
  "Class seats are non-refundable. There is no cash refund after payment. The office places CPR and Mandt seats on a class. The 30-day course is an in-app seat the office sends. This is not a Provider Interface office subscription.";

export type TrainingOnlyPersonRow = {
  name: string;
  sku: TrainingOnlySku;
};

export type TrainingOnlyQuoteLine = {
  sku: TrainingOnlySku;
  name: string;
  quantity: number;
  unitCents: number;
  lineCents: number;
};

export type TrainingOnlyQuote = {
  people: number;
  totalCents: number;
  lines: TrainingOnlyQuoteLine[];
};

export function isTrainingOnlySku(value: string | null | undefined): value is TrainingOnlySku {
  return isSignupTrainingAddonId(value);
}

export function trainingOnlySkuLabel(sku: TrainingOnlySku): string {
  return quoteSignupTrainingAddon(sku).name;
}

export function trainingOnlyIncludesThirtyDay(sku: TrainingOnlySku): boolean {
  return sku === "thirty_day" || sku === "pack";
}

export function trainingOnlyIncludesClassSeat(sku: TrainingOnlySku): boolean {
  return sku === "cpr_first_aid" || sku === "mandt" || sku === "pack";
}

export function trainingOnlyPackCovers(): readonly TrainingOnlySku[] {
  return ["cpr_first_aid", "thirty_day", "mandt"];
}

export function cleanTrainingOnlyPeople(rows: TrainingOnlyPersonRow[]): TrainingOnlyPersonRow[] {
  return rows
    .map((row) => ({
      name: row.name.trim(),
      sku: row.sku,
    }))
    .filter((row) => row.name.length > 0 && isTrainingOnlySku(row.sku));
}

export function validateTrainingOnlyPeople(rows: TrainingOnlyPersonRow[]): string | null {
  const cleaned = cleanTrainingOnlyPeople(rows);
  if (cleaned.length === 0) return "Add at least one person.";
  if (cleaned.length > 200) return "A roster can have at most 200 people.";
  const names = new Map<string, TrainingOnlySku>();
  for (const [i, row] of cleaned.entries()) {
    if (row.name.length < 2) return `Person ${i + 1} needs a name.`;
    if (row.name.length > 120) return `Person ${i + 1} name is too long.`;
    const key = row.name.toLowerCase();
    const existing = names.get(key);
    if (existing && existing !== row.sku) {
      return `${row.name} already has a seat. Each person picks one option (Pack is all three).`;
    }
    if (existing === row.sku) {
      return `${row.name} is on the roster twice.`;
    }
    names.set(key, row.sku);
  }
  return null;
}

export function quoteTrainingOnlyPeople(rows: TrainingOnlyPersonRow[]): TrainingOnlyQuote {
  const cleaned = cleanTrainingOnlyPeople(rows);
  const counts: Record<TrainingOnlySku, number> = {
    cpr_first_aid: 0,
    thirty_day: 0,
    mandt: 0,
    pack: 0,
  };
  for (const row of cleaned) counts[row.sku] += 1;
  const lines: TrainingOnlyQuoteLine[] = [];
  let totalCents = 0;
  for (const addon of SIGNUP_TRAINING_ADDONS) {
    const quantity = counts[addon.id];
    if (quantity <= 0) continue;
    const lineCents = addon.priceCents * quantity;
    totalCents += lineCents;
    lines.push({
      sku: addon.id,
      name: addon.name,
      quantity,
      unitCents: addon.priceCents,
      lineCents,
    });
  }
  return { people: cleaned.length, totalCents, lines };
}

export function trainingOnlyLineItems(
  rows: TrainingOnlyPersonRow[],
  env: StripePriceEnv,
): StripeLineItem[] {
  const quote = quoteTrainingOnlyPeople(rows);
  return quote.lines.map((line) => {
    const priceId = stripePriceIdForTrainingSku(line.sku, null, env);
    if (priceId) {
      return { price: priceId, quantity: line.quantity };
    }
    return {
      quantity: line.quantity,
      price_data: {
        currency: "usd",
        unit_amount: line.unitCents,
        product_data: {
          name: `Training · ${line.name}`,
          metadata: { hive_kind: "training_only", training_sku: line.sku },
        },
      },
    };
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeBuyerEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidBuyerEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeBuyerEmail(email));
}

export function validateTrainingOnlyBuyer(input: {
  email: string;
  agencyName?: string | null;
  termsAccepted: boolean;
}): string | null {
  if (!isValidBuyerEmail(input.email)) return "Enter a valid email for the receipt.";
  const agency = (input.agencyName ?? "").trim();
  if (agency.length > 160) return "Agency name is too long.";
  if (!input.termsAccepted) return "Agree to the training purchase terms to pay.";
  return null;
}

export function formatTrainingOnlyTotal(cents: number): string {
  return formatUsdFromCents(cents);
}
