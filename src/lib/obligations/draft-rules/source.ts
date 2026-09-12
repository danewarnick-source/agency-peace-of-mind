/**
 * Immutable workbook source identity for Stage 1 draft rules.
 * Hash is of the source version + clause list — not a publish bit.
 */

import type { RuleSourceLink, SourceIndexMeta } from "./types.ts";

export const WORKBOOK_SOURCE_ID = "dhhs91172-workbook";
export const WORKBOOK_SOURCE_TITLE = "DHHS91172 compliance workbook";
export const WORKBOOK_DESIGN_REVISION = "2026-09-12";
/** Dane-finalized workbook hash. Archive identity, not a publish bit. */
export const WORKBOOK_SHA256 = "aba9f6c4debc0b19e207a55f1a2f1fc2b3397d94f8f18a52c6fbc6b0f9d2dbd6";
export const WORKBOOK_CATALOG_PARENT_COUNT = 760;
export const WORKBOOK_REQUIREMENTS_ROW_COUNT = 1367;
export const WORKBOOK_RELEASE_GAPS_OPEN = 12;

export const WORKBOOK_SOURCE_INDEX: SourceIndexMeta = {
  label: "ARCHIVE METADATA",
  isPublicationPermission: false,
};

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Stable FNV-1a hex. Browser-safe; not a cryptographic claim. */
export function fnv1aHex(input: string): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function workbookSourceHash(clauseIds: readonly string[]): string {
  const payload = [WORKBOOK_SOURCE_ID, WORKBOOK_DESIGN_REVISION, ...[...clauseIds].sort()].join(
    "|",
  );
  return fnv1aHex(payload);
}

export function linkWorkbookSource(clauseIds: readonly string[]): RuleSourceLink {
  return {
    sourceId: WORKBOOK_SOURCE_ID,
    sourceVersion: WORKBOOK_DESIGN_REVISION,
    sourceHash: workbookSourceHash(clauseIds),
    clauseIds: [...clauseIds],
  };
}

/** Source_index is archive metadata. Never a publish bit. */
export function sourceIndexGrantsPublication(_meta: SourceIndexMeta): boolean {
  return false;
}
