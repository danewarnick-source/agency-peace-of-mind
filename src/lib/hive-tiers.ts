/**
 * HIVE subscription tier catalog.
 *
 * Single source of truth for tier → NECTAR Infusion / add-on entitlements.
 * Tier assignment is functional today; payment collection is skeletoned and
 * fills in later (see Plans & Billing).
 */

export type TierId = "starter" | "pro" | "enterprise" | "custom";

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
  monthlyPriceCents: number | null; // null = "contact us" / custom
  addons: AddonId[];
  highlights: string[];
}

export const ADDON_CATALOG: Record<AddonId, AddonDef> = {
  nectar_infusion: {
    id: "nectar_infusion",
    name: "NECTAR Infusion",
    blurb: "Guided Mode, plain-language answers, and NECTAR-accelerated controls across HIVE.",
  },
  internal_audit: {
    id: "internal_audit",
    name: "Internal Audit",
    blurb: "QA / audit-prep engine that scores readiness and surfaces fixable findings.",
  },
  requirements_engine: {
    id: "requirements_engine",
    name: "Requirements Engine",
    blurb: "NECTAR extracts requirements from authoritative sources; HIVE Exec approves.",
  },
  priority_support: {
    id: "priority_support",
    name: "Priority Support",
    blurb: "Faster SLAs in the HIVE Support Queue.",
  },
};

export const TIER_CATALOG: TierDef[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Baseline HIVE — daily ops, documentation, billing.",
    monthlyPriceCents: 0,
    addons: [],
    highlights: ["Clients & staff", "Daily logs & EVV", "Manual billing exports"],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Adds NECTAR Infusion across the platform.",
    monthlyPriceCents: 49900,
    addons: ["nectar_infusion"],
    highlights: ["Everything in Starter", "NECTAR Infusion", "Guided Mode"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Audit-prep, requirements automation, and priority support.",
    monthlyPriceCents: 129900,
    addons: ["nectar_infusion", "internal_audit", "requirements_engine", "priority_support"],
    highlights: [
      "Everything in Pro",
      "Internal Audit / QA",
      "Requirements Engine",
      "Priority Support",
    ],
  },
  {
    id: "custom",
    name: "Custom",
    tagline: "Bespoke entitlement set — negotiated per company.",
    monthlyPriceCents: null,
    addons: ["nectar_infusion", "internal_audit", "requirements_engine", "priority_support"],
    highlights: ["Custom pricing", "Configurable add-on bundle"],
  },
];

export function getTier(id: string): TierDef {
  return TIER_CATALOG.find((t) => t.id === id) ?? TIER_CATALOG[0];
}

export function addonsForTier(id: string): AddonId[] {
  return getTier(id).addons;
}

export function formatTierPrice(t: TierDef): string {
  if (t.monthlyPriceCents === null) return "Contact us";
  if (t.monthlyPriceCents === 0) return "Included";
  return `$${(t.monthlyPriceCents / 100).toLocaleString()}/mo`;
}
