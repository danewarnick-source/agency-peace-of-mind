/**
 * Public list quote for new-provider signup.
 *
 * Dollars come from pi-landing.ts. Training cents come from hive-pricing.ts.
 * Do not invent amounts. Signup checkout is monthly list only — no founding.
 */

import {
  PI_LIST_MINIMUM_DOLLARS,
  PI_LIST_PER_CLIENT_DOLLARS,
  PI_TRAINING_ADDONS,
} from "./pi-landing.ts";
import {
  TRAINING_PRICE_CENTS,
  clampClientCount,
  formatUsdFromCents,
  type BillingInterval,
} from "./hive-pricing.ts";

export const PI_LIST_PER_CLIENT_CENTS = PI_LIST_PER_CLIENT_DOLLARS * 100;
export const PI_LIST_MINIMUM_CENTS = PI_LIST_MINIMUM_DOLLARS * 100;

export const SIGNUP_AGENCY_PLACEHOLDER = "Your agency name";

export type PiListQuote = {
  clientCount: number;
  interval: BillingInterval;
  perClientCents: number;
  rawMonthlyCents: number;
  monthlyCents: number;
  minimumCents: number;
  minimumApplied: boolean;
  billedCents: number;
  label: string;
  productName: string;
  summaryLine: string;
};

export function quotePiListSubscription(input: {
  clientCount: number;
  interval?: BillingInterval | string | null;
}): PiListQuote {
  const clientCount = clampClientCount(input.clientCount);
  const interval: BillingInterval = input.interval === "annual" ? "annual" : "monthly";
  const perClientCents = PI_LIST_PER_CLIENT_CENTS;
  const rawMonthlyCents = clientCount * perClientCents;
  const minimumCents = PI_LIST_MINIMUM_CENTS;
  const monthlyCents = Math.max(rawMonthlyCents, minimumCents);
  const minimumApplied = monthlyCents > rawMonthlyCents;
  const billedCents = monthlyCents;
  const clientsWord = clientCount === 1 ? "client" : "clients";
  const productName = `Provider Interface · ${clientCount} ${clientsWord} · $69/client ($350 min)`;
  const summaryLine = minimumApplied
    ? `${clientCount} ${clientsWord} × $69 = ${formatUsdFromCents(rawMonthlyCents)} → ${formatUsdFromCents(monthlyCents)} / month minimum`
    : `${clientCount} ${clientsWord} × $69 = ${formatUsdFromCents(monthlyCents)} / month`;
  return {
    clientCount,
    interval,
    perClientCents,
    rawMonthlyCents,
    monthlyCents,
    minimumCents,
    minimumApplied,
    billedCents,
    label: "List · $69 per client / month ($350 minimum)",
    productName,
    summaryLine,
  };
}

export const SIGNUP_TRAINING_ADDON_IDS = ["cpr_first_aid", "thirty_day", "mandt", "pack"] as const;
export type SignupTrainingAddonId = (typeof SIGNUP_TRAINING_ADDON_IDS)[number];

export type SignupTrainingAddon = {
  id: SignupTrainingAddonId;
  name: string;
  priceCents: number;
  savingsHint: string | null;
};

/** Locked signup add-ons. Pack is the $300 bundle (saves $75 vs $375). */
export const SIGNUP_TRAINING_ADDONS: readonly SignupTrainingAddon[] = [
  {
    id: "cpr_first_aid",
    name: "CPR / First Aid",
    priceCents: TRAINING_PRICE_CENTS.cpr_first_aid,
    savingsHint: null,
  },
  {
    id: "thirty_day",
    name: "30-day",
    priceCents: TRAINING_PRICE_CENTS.thirty_day,
    savingsHint: null,
  },
  {
    id: "mandt",
    name: "Mandt",
    priceCents: TRAINING_PRICE_CENTS.mandt,
    savingsHint: null,
  },
  {
    id: "pack",
    name: "Pack",
    priceCents: TRAINING_PRICE_CENTS.full_program,
    savingsHint: "saves $75 vs all three",
  },
];

export type SignupTrainingQuote = {
  id: SignupTrainingAddonId | "none";
  name: string;
  priceCents: number;
};

export function isSignupTrainingAddonId(value: string | null | undefined): value is SignupTrainingAddonId {
  return SIGNUP_TRAINING_ADDON_IDS.includes(value as SignupTrainingAddonId);
}

export function quoteSignupTrainingAddon(
  id: SignupTrainingAddonId | "none" | null | undefined,
): SignupTrainingQuote {
  if (!id || id === "none" || !isSignupTrainingAddonId(id)) {
    return { id: "none", name: "None", priceCents: 0 };
  }
  const row = SIGNUP_TRAINING_ADDONS.find((addon) => addon.id === id);
  if (!row) return { id: "none", name: "None", priceCents: 0 };
  return { id: row.id, name: row.name, priceCents: row.priceCents };
}

/** Sanity: marketing copy and locked cents stay on the same four amounts. */
export function signupTrainingMatchesPublicCopy(): boolean {
  const byName = new Map(PI_TRAINING_ADDONS.map((row) => [row.name, row.price]));
  return SIGNUP_TRAINING_ADDONS.every((addon) => byName.get(addon.name) === formatUsdFromCents(addon.priceCents));
}
