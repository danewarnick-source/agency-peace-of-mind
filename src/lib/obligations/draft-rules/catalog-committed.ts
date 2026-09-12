/**
 * Browser-safe committed catalog imports for the read-only Admin list.
 * Batch files stay placeholders until Tony lands the JSON payloads.
 */

import applicabilityFacts from "../../../../docs/compliance/dhhs91172/Applicability_Facts.json" with { type: "json" };
import coreRuleLogic from "../../../../docs/compliance/dhhs91172/Core_Rule_Logic.json" with { type: "json" };
import instructions from "../../../../docs/compliance/dhhs91172/Instructions.json" with { type: "json" };
import manifest from "../../../../docs/compliance/dhhs91172/MANIFEST.json" with { type: "json" };
import releaseGapsFile from "../../../../docs/compliance/dhhs91172/Release_Gaps.json" with { type: "json" };
import requirementCatalog from "../../../../docs/compliance/dhhs91172/Requirement_Catalog.json" with { type: "json" };
import requirements from "../../../../docs/compliance/dhhs91172/Requirements.json" with { type: "json" };
import catalog00 from "../../../../docs/compliance/dhhs91172/catalog_batches/catalog_00.json" with { type: "json" };
import catalog01 from "../../../../docs/compliance/dhhs91172/catalog_batches/catalog_01.json" with { type: "json" };
import catalog02 from "../../../../docs/compliance/dhhs91172/catalog_batches/catalog_02.json" with { type: "json" };
import catalog03 from "../../../../docs/compliance/dhhs91172/catalog_batches/catalog_03.json" with { type: "json" };
import catalog04 from "../../../../docs/compliance/dhhs91172/catalog_batches/catalog_04.json" with { type: "json" };
import catalog05 from "../../../../docs/compliance/dhhs91172/catalog_batches/catalog_05.json" with { type: "json" };
import catalog06 from "../../../../docs/compliance/dhhs91172/catalog_batches/catalog_06.json" with { type: "json" };
import catalog07 from "../../../../docs/compliance/dhhs91172/catalog_batches/catalog_07.json" with { type: "json" };
import catalog08 from "../../../../docs/compliance/dhhs91172/catalog_batches/catalog_08.json" with { type: "json" };
import catalog09 from "../../../../docs/compliance/dhhs91172/catalog_batches/catalog_09.json" with { type: "json" };
import {
  buildLoadedCatalog,
  catalogLoadSummary,
  type CatalogManifest,
  type LoadedCatalog,
  type ReleaseGapRow,
} from "./catalog-loader.ts";

const BATCHES = [
  catalog00,
  catalog01,
  catalog02,
  catalog03,
  catalog04,
  catalog05,
  catalog06,
  catalog07,
  catalog08,
  catalog09,
];

export function loadCommittedCatalog(): LoadedCatalog {
  return buildLoadedCatalog({
    manifest: manifest as CatalogManifest,
    batchFiles: BATCHES,
    requirementCatalog,
    requirements,
    releaseGaps: (releaseGapsFile.rows ?? []) as ReleaseGapRow[],
    coreRuleLogic,
  });
}

export function loadCommittedCatalogSummary() {
  return catalogLoadSummary(loadCommittedCatalog());
}

export const COMMITTED_INSTRUCTIONS = instructions;
export const COMMITTED_APPLICABILITY_FACTS = applicabilityFacts;
