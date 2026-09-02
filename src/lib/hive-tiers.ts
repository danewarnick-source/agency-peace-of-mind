/**
 * HIVE subscription tier catalog.
 *
 * Entitlements (what features a company gets) live here.
 * Dollar amounts for self-serve Hive do NOT live here — public list is
 * $69 / client ($350 min) in src/lib/pi-landing.ts. Leftover staff math in
 * hive-pricing.ts is unused for checkout. Do not put $499 / $1,299 on these rows.
 *
 * Public checkout is PI list (hive_standard / pro). Enterprise is
 * contact-us — Hive Exec assigns it. Starter is comped / not self-serve.
 */

export type TierId = "starter" | "pro" | "enterprise" | "custom";

/** Plans a new agency can pay for at /signup. Enterprise is contact-us, not Checkout. */
export const PUBLIC_SELF_SERVE_TIERS: TierId[] = ["pro"];

export type AddonId =
  | "nectar_infusion" // Guided Mode, plain-language answers, NECTAR-accelerated controls
  | "internal_audit" // Internal Audit / QA audit-prep tool
  | "requirements_engine" // Requirements proposals + extraction approvals
  | "priority_support" // Faster SLA on Support Queue
  | "hive_training"; // DSPD-aligned course library, competency sign-off, verifiable certs

export interface AddonDef {
  id: AddonId;
  name: string;
  blurb: string;
}

export interface TierDef {
  id: TierId;
  name: string;
  tagline: string;
  /** Flat monthly cents, or null when the price is per-staff / contact-us / included. */
  monthlyPriceCents: number | null;
  priceKind: "per_client" | "per_staff" | "contact" | "included" | "custom";
  addons: AddonId[];
  highlights: string[];
}

export const ADDON_CATALOG: Record<AddonId, AddonDef> = {
  nectar_infusion: {
    id: "nectar_infusion",
    name: "NECTAR Infusion",
    blurb: "Guided Mode, plain-language answers, and NECTAR-accelerated controls across Provider Interface.",
  },
  internal_audit: {
    id: "internal_audit",
    name: "Internal Audit",
    blurb: "QA / audit-prep engine that scores readiness and surfaces fixable findings.",
  },
  requirements_engine: {
    id: "requirements_engine",
    name: "Requirements Engine",
    blurb: "NECTAR extracts requirements from authoritative sources; Exec approves.",
  },
  priority_support: {
    id: "priority_support",
    name: "Priority Support",
    blurb: "Faster SLAs in the Support Queue.",
  },
  hive_training: {
    id: "hive_training",
    name: "Training",
    blurb: "Course library with competency sign-off and verifiable certificates.",
  },
};

export const TIER_CATALOG: TierDef[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Baseline — daily ops, documentation, and time.",
    monthlyPriceCents: 0,
    priceKind: "included",
    addons: [],
    highlights: ["Clients & staff", "Daily logs & EVV", "Manual billing exports"],
  },
  {
    id: "pro",
    name: "Provider Interface",
    tagline: "Full platform, billed $69 per client / month ($350 minimum).",
    monthlyPriceCents: null,
    priceKind: "per_client",
    addons: ["nectar_infusion", "hive_training"],
    highlights: [
      "Everything in Starter",
      "NECTAR Infusion",
      "Training hub (courses billed separately)",
      "$69 per client / month ($350 minimum)",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Custom-built features, integrations, and white-glove onboarding.",
    monthlyPriceCents: null,
    priceKind: "contact",
    addons: ["nectar_infusion", "internal_audit", "requirements_engine", "priority_support", "hive_training"],
    highlights: [
      "Everything in Provider Interface",
      "Internal Audit / QA",
      "Requirements Engine",
      "Priority Support",
      "Contact us for a quote — no public dollar amount",
    ],
  },
  {
    id: "custom",
    name: "Custom",
    tagline: "Bespoke entitlement set — negotiated per company.",
    monthlyPriceCents: null,
    priceKind: "custom",
    addons: ["nectar_infusion", "internal_audit", "requirements_engine", "priority_support", "hive_training"],
    highlights: ["Custom pricing", "Configurable add-on bundle"],
  },
];

/** hive_standard is the live per-staff plan (same entitlements as Hive / pro). */
export function normalizeTierId(id: string | null | undefined): TierId {
  if (id === "hive_standard") return "pro";
  if (id === "starter" || id === "pro" || id === "enterprise" || id === "custom") return id;
  return "starter";
}

export function getTier(id: string): TierDef {
  const normalized = normalizeTierId(id);
  return TIER_CATALOG.find((t) => t.id === normalized) ?? TIER_CATALOG[0];
}

export function addonsForTier(id: string): AddonId[] {
  return getTier(id).addons;
}

export function isPublicSelfServeTier(id: string | null | undefined): boolean {
  return id === "pro" || id === "hive_standard";
}

export function formatTierPrice(t: TierDef): string {
  if (t.priceKind === "per_client") return "$69 / client";
  if (t.priceKind === "per_staff") return "$69 / client";
  if (t.priceKind === "contact" || t.priceKind === "custom") return "Contact us";
  if (t.priceKind === "included" || t.monthlyPriceCents === 0) return "Included";
  if (t.monthlyPriceCents == null) return "Contact us";
  return `$${(t.monthlyPriceCents / 100).toLocaleString()}/mo`;
}
