// Compliance revamp Step 8 — state layer.
// Selects the obligation catalog and audit instrument by organizations.state_code.
// UT is the only built pack. ID and WY are empty shells (no invented duties).

import { allSowCatalogEntries, type SowCatalogEntry } from "./sow-obligation-catalog.ts";

export const CATALOG_STATE_CODES = ["UT", "ID", "WY"] as const;
export type CatalogStateCode = (typeof CATALOG_STATE_CODES)[number];

export const WY_EMPTY_SHELL_MESSAGE =
  "Wyoming does not have a compliance catalog yet. Hive will add Wyoming requirements when that state pack is ready. Utah DSPD obligations do not apply to this organization.";

const EMPTY_CATALOG: SowCatalogEntry[] = [];

export function normalizeStateCode(raw: string | null | undefined): string | null {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function isCatalogStateCode(raw: string | null | undefined): raw is CatalogStateCode {
  const code = normalizeStateCode(raw);
  return code === "UT" || code === "ID" || code === "WY";
}

/** Obligation catalog for a state. UT returns the DHHS91172 pack; ID/WY/unknown return []. */
export function catalogForState(stateCode: string | null | undefined): SowCatalogEntry[] {
  const code = normalizeStateCode(stateCode);
  if (code === "UT") return allSowCatalogEntries();
  return EMPTY_CATALOG;
}

/**
 * Empty-catalog copy for the compliance shell.
 * WY has the named Step 8 message. Other non-UT codes get a generic empty line.
 * UT and unknown/missing codes return null (do not blank a live UT org).
 */
export function emptyCatalogShellMessage(stateCode: string | null | undefined): string | null {
  const code = normalizeStateCode(stateCode);
  if (!code || code === "UT") return null;
  if (code === "WY") return WY_EMPTY_SHELL_MESSAGE;
  return `${code} does not have a compliance catalog yet. Hive will add this state's requirements when that pack is ready.`;
}
