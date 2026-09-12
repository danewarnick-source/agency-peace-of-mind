// Exception flags on the CURRENT catalog records the engine already uses.
// No second table. No invented SOW clauses. SOW CSV import stays out.

import {
  CATALOG_EXCEPTIONS_BY_KEY,
  sowCatalogEntryByKey,
  type CatalogExceptions,
  type SowCatalogEntry,
} from "../sow-obligation-catalog.ts";
import { isBlocksSoloWhenLapsedKey } from "./solo-lapse.ts";

export type { CatalogExceptions };

const ASSIGNMENT_GATED_WITHOUT_CODES = new Set([
  "orientation_30_day",
  "cpr_first_aid_initial",
  "cpr_first_aid_renewal",
  "pct_hire_practices",
  "ce_12h_annual",
  "em_bcp_training_annual",
  "client_specific_training",
  "support_strategies",
  "abi_training",
  "behavior_intervention_cert",
  "driving_record_transport",
]);

export function inferCatalogExceptions(
  key: string,
  entry: Pick<SowCatalogEntry, "owner" | "service_codes"> | null,
): CatalogExceptions {
  const codes = entry?.service_codes ?? [];
  return {
    nonwaivable: !isBlocksSoloWhenLapsedKey(key),
    sei_only: codes.length === 1 && codes[0] === "SEI",
    assignment_gated:
      ASSIGNMENT_GATED_WITHOUT_CODES.has(key) ||
      (entry?.owner === "staff" && codes.length > 0),
  };
}

export function resolveCatalogExceptions(
  keyOrEntry: string | SowCatalogEntry | null | undefined,
): CatalogExceptions {
  const key =
    typeof keyOrEntry === "string" ? keyOrEntry : (keyOrEntry?.key ?? "");
  const entry =
    typeof keyOrEntry === "string"
      ? sowCatalogEntryByKey(keyOrEntry)
      : (keyOrEntry ?? (key ? sowCatalogEntryByKey(key) : null));
  const explicit = entry?.exceptions ?? (key ? CATALOG_EXCEPTIONS_BY_KEY[key] : undefined);
  if (explicit) return explicit;
  return inferCatalogExceptions(key, entry);
}

export function catalogIsNonwaivable(key: string | null | undefined): boolean {
  if (!key) return true;
  return resolveCatalogExceptions(key).nonwaivable;
}

export function catalogIsSeiOnly(key: string | null | undefined): boolean {
  if (!key) return false;
  return resolveCatalogExceptions(key).sei_only;
}

export function catalogIsAssignmentGated(key: string | null | undefined): boolean {
  if (!key) return false;
  return resolveCatalogExceptions(key).assignment_gated;
}
