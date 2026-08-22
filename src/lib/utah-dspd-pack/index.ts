// Utah DSPD jurisdiction pack for DHHS91172.
//
// HIVE owns this pack. A tenant cannot edit locked titles, citations, or due
// rules. Nectar may flag a pack gap to HIVE; it must not let a provider
// author the contract. Completing a duty attests that the work was done —
// it does not attest that HIVE encoded the whole SOW.
//
// Three layers can drift and must be checked together:
//   1. This pack (catalog + coverage matrix) — product code
//   2. Seeded company_obligations rows (source = sow, is_locked) — live DB
//   3. Authoritative Sources PDFs — reference / Nectar reading copy only

import { allSowCatalogEntries } from "../sow-obligation-catalog";
import { DSPD_AUDIT_ITEMS } from "../dspd-audit-tool";
import { UTAH_DSPD_COVERAGE, type PackCoverageRow, type PackCoverageStatus } from "./coverage";
import { unsectionedRowIds } from "./sections";

export { UTAH_DSPD_COVERAGE, type PackCoverageRow, type PackCoverageStatus } from "./coverage";
export {
  PACK_SECTIONS,
  packSectionId,
  rowsForSection,
  sectionedCoverage,
  type PackSection,
  type PackSectionId,
} from "./sections";

export const UTAH_DSPD_PACK_ID = "utah-dspd-dhhs91172";

export const UTAH_DSPD_PACK = {
  id: UTAH_DSPD_PACK_ID,
  jurisdiction: "UT",
  agency: "Utah DHHS — Division of Services for People with Disabilities",
  contract: "DHHS91172",
  effective: "2026-07-01",
  version: "2026.08.22",
  sources: [
    {
      kind: "sow" as const,
      title: "DHHS91172 Scope of Work",
      effective: "2026-07-01",
    },
    {
      kind: "review_tool" as const,
      title: "ID.RC / ABI 91172 In-depth Review Tool",
    },
    {
      kind: "cst" as const,
      title: "DHHS Client Service Terms (Attachment A)",
    },
  ],
} as const;

export const PACK_STATUS_LABEL: Record<PackCoverageStatus, string> = {
  encoded: "Encoded duty",
  live_artifact: "Live HIVE artifact",
  when_applicable: "When applicable",
  intentional_omit: "Intentionally omitted",
  gap: "Pack gap",
};

export function coverageCounts(rows: PackCoverageRow[] = UTAH_DSPD_COVERAGE) {
  const counts: Record<PackCoverageStatus, number> = {
    encoded: 0,
    live_artifact: 0,
    when_applicable: 0,
    intentional_omit: 0,
    gap: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return { total: rows.length, ...counts };
}

/** Catalog titles that must exist for every encoded / when_applicable row. */
export function packIntegrityErrors(): string[] {
  const errors: string[] = [];
  const catalogTitles = new Set(allSowCatalogEntries().map((e) => e.title));
  const coveredCatalog = new Set<string>();
  const coveredAudit = new Set<string>();

  for (const row of UTAH_DSPD_COVERAGE) {
    for (const title of row.catalog_titles ?? []) {
      coveredCatalog.add(title);
      if (!catalogTitles.has(title)) {
        errors.push(`${row.id}: catalog title not found — ${title}`);
      }
    }
    if (
      (row.status === "encoded" || row.status === "when_applicable") &&
      !(row.catalog_titles ?? []).length &&
      !(row.audit_item_ids ?? []).length
    ) {
      errors.push(`${row.id}: ${row.status} row has no catalog title or audit item`);
    }
    for (const id of row.audit_item_ids ?? []) coveredAudit.add(id);
  }

  for (const entry of allSowCatalogEntries()) {
    if (!coveredCatalog.has(entry.title)) {
      errors.push(`catalog title has no coverage row: ${entry.title}`);
    }
  }

  for (const item of DSPD_AUDIT_ITEMS) {
    if (!coveredAudit.has(item.id)) {
      errors.push(`review-tool row has no coverage row: ${item.id}`);
    }
  }

  for (const id of unsectionedRowIds()) {
    errors.push(`coverage row has no review section: ${id}`);
  }

  return errors;
}
