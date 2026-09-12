/**
 * Node-only reader for the committed DHHS91172 catalog JSON.
 * Used by unit tests. The browser admin page uses catalog-committed.ts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLoadedCatalog,
  CATALOG_BATCH_IDS,
  type CatalogManifest,
  type ReleaseGapRow,
} from "./catalog-loader.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const DHHS91172_CATALOG_DIR = join(REPO_ROOT, "docs/compliance/dhhs91172");

function readJson(relPath: string): unknown {
  const raw = readFileSync(join(DHHS91172_CATALOG_DIR, relPath), "utf8");
  return JSON.parse(raw) as unknown;
}

export function readCommittedManifest(): CatalogManifest {
  return readJson("MANIFEST.json") as CatalogManifest;
}

export function readCommittedCatalog() {
  const manifest = readCommittedManifest();
  const releaseFile = readJson("Release_Gaps.json") as { rows?: ReleaseGapRow[] };
  const batchFiles = CATALOG_BATCH_IDS.map((id) => readJson(`catalog_batches/catalog_${id}.json`));
  return buildLoadedCatalog({
    manifest,
    batchFiles,
    requirementCatalog: readJson("Requirement_Catalog.json"),
    requirements: readJson("Requirements.json"),
    releaseGaps: releaseFile.rows ?? [],
    coreRuleLogic: readJson("Core_Rule_Logic.json"),
  });
}

export function readTinyCatalogFixture() {
  return readJson("fixtures/tiny-catalog.json");
}

export function readInstructions() {
  return readJson("Instructions.json");
}

export function readApplicabilityFacts() {
  return readJson("Applicability_Facts.json");
}
