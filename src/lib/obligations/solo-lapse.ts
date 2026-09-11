// Catalog keys that block working alone when the clock is lapsed.
// Kept out of sow-obligation-catalog.ts so Step 8 (catalogForState) can rebase.

export const BLOCKS_SOLO_WHEN_LAPSED_KEYS = [
  "orientation_30_day",
  "cpr_first_aid_initial",
  "cpr_first_aid_renewal",
  "abi_training",
  "client_specific_training",
  "behavior_intervention_cert",
] as const;

export type BlocksSoloWhenLapsedKey = (typeof BLOCKS_SOLO_WHEN_LAPSED_KEYS)[number];

const BLOCKS_SOLO_SET = new Set<string>(BLOCKS_SOLO_WHEN_LAPSED_KEYS);

export type SoloLapseClientContext = {
  hasAbi?: boolean;
  hasBehaviorPlan?: boolean;
};

export function isBlocksSoloWhenLapsedKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return BLOCKS_SOLO_SET.has(key);
}

/** ABI / Mandt only gate solo when the client (or staff flag) needs that cert. */
export function soloLapseAppliesToClient(
  key: string | null | undefined,
  client?: SoloLapseClientContext | null,
): boolean {
  if (!isBlocksSoloWhenLapsedKey(key)) return false;
  if (key === "abi_training") return client?.hasAbi === true;
  if (key === "behavior_intervention_cert") return client?.hasBehaviorPlan === true;
  return true;
}

export function soloLapseLabel(key: string): string {
  switch (key) {
    case "orientation_30_day":
      return "30-day orientation";
    case "cpr_first_aid_initial":
      return "CPR / First Aid (initial)";
    case "cpr_first_aid_renewal":
      return "CPR / First Aid";
    case "abi_training":
      return "ABI training";
    case "client_specific_training":
      return "Client-specific training";
    case "behavior_intervention_cert":
      return "Behavior intervention certification";
    default:
      return key;
  }
}

export type SoloLapse = {
  obligationKey: string;
  obligationId: string;
  instanceId: string | null;
  title: string;
  dueAt: string | null;
  label: string;
};

export function filterSoloLapsesForClient(
  lapses: SoloLapse[],
  client?: SoloLapseClientContext | null,
): SoloLapse[] {
  return lapses.filter((row) => soloLapseAppliesToClient(row.obligationKey, client));
}

export function overrideIsActive(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return true;
  return t > now.getTime();
}
