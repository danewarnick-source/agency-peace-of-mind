// Behavior Support — single source of truth keyed by code.
// HIVE tracks; it does NOT define. Always confirm against current Utah DSPD SOW.

export type BcCode = "BC1" | "BC2" | "BC3";

export const TIER_RANK: Record<BcCode, number> = { BC1: 1, BC2: 2, BC3: 3 };

export interface BcCodeSpec {
  code: BcCode;
  severity: string;
  requiredTier: BcCode;          // minimum behaviorist credential
  oversight: string;
  reviewCadence: string;
  /** Tile color tokens (Tailwind classes), teal -> amber -> rose. */
  tile: { ring: string; bg: string; fg: string };
  /** SOW deliverables — identical set across BC1-BC3 per Utah DSPD SOW. */
  requiredItems: string[];
  deadlines: string[];
  sowSource: string;
}

export const REQUIRED_ITEMS = [
  "Functional Behavior Assessment (FBA) on file",
  "Behavior Support Plan (BSP) on file",
  "Ongoing data collection by DSP staff",
  "Monthly effectiveness review",
  "Graphed data at least every 3 months",
  "Annual report submitted by August 30",
];

export const DEADLINES = [
  "Monthly effectiveness review — every calendar month",
  "Quarterly graphed data — at least every 3 months",
  "Annual report — due August 30 each year",
];

export const BC_CONFIG: Record<BcCode, BcCodeSpec> = {
  BC1: {
    code: "BC1",
    severity: "Mild",
    requiredTier: "BC1",
    oversight: "Standard",
    reviewCadence: "Monthly",
    tile: { ring: "ring-teal-500", bg: "bg-teal-50", fg: "text-teal-900" },
    requiredItems: REQUIRED_ITEMS,
    deadlines: DEADLINES,
    sowSource: "Utah DSPD SOW — Behavior Support, Tier 1",
  },
  BC2: {
    code: "BC2",
    severity: "Serious, non-life-threatening",
    requiredTier: "BC2",
    oversight: "Heightened",
    reviewCadence: "Monthly + supervisory sign-off",
    tile: { ring: "ring-amber-500", bg: "bg-amber-50", fg: "text-amber-900" },
    requiredItems: REQUIRED_ITEMS,
    deadlines: DEADLINES,
    sowSource: "Utah DSPD SOW — Behavior Support, Tier 2",
  },
  BC3: {
    code: "BC3",
    severity: "Extremely complex / dangerous (life-threatening)",
    requiredTier: "BC3",
    oversight: "Most rigorous",
    reviewCadence: "Monthly + close supervisory oversight",
    tile: { ring: "ring-rose-500", bg: "bg-rose-50", fg: "text-rose-900" },
    requiredItems: REQUIRED_ITEMS,
    deadlines: DEADLINES,
    sowSource: "Utah DSPD SOW — Behavior Support, Tier 3",
  },
};

export type CredentialMatch =
  | { ok: true; reason: string }
  | { ok: false; reason: string };

export function evaluateCredentialMatch(
  clientCode: BcCode,
  behavioristRole: BcCode | null,
): CredentialMatch {
  const required = TIER_RANK[BC_CONFIG[clientCode].requiredTier];
  if (!behavioristRole) {
    return { ok: false, reason: `Required tier ${BC_CONFIG[clientCode].requiredTier}+ (rank ${required}); no behaviorist assigned.` };
  }
  const have = TIER_RANK[behavioristRole];
  if (have >= required) {
    return { ok: true, reason: `Assigned behaviorist (${behavioristRole}, rank ${have}) meets required tier ${BC_CONFIG[clientCode].requiredTier}+ (rank ${required}).` };
  }
  return { ok: false, reason: `Assigned behaviorist (${behavioristRole}, rank ${have}) is BELOW required tier ${BC_CONFIG[clientCode].requiredTier}+ (rank ${required}).` };
}
