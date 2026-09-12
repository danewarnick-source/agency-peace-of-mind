/**
 * Stage 5: load the Dane-finalized DHHS91172 catalog as draft simulation data.
 * Every mapped row is rule_status=draft / execution_status=not_published.
 * Source_index is archive metadata. Activation stays locked.
 * Missing legal facts stay missing-information — never invented.
 */

import { linkWorkbookSource, WORKBOOK_SOURCE_INDEX } from "./source.ts";
import type {
  CompletionRoute,
  DraftPredicate,
  DraftRule,
  DraftRuleTest,
  GroupLogic,
  PredicateKind,
  TimingAnchor,
} from "./types.ts";

export const CATALOG_BATCH_IDS = [
  "00",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
] as const;

export type CatalogBatchId = (typeof CATALOG_BATCH_IDS)[number];

export type CatalogManifest = {
  sha256: string;
  dane_declared: string;
  workbook_says: string;
  source_index: string;
  requirements_rows: number;
  catalog_rows: number;
  release_gaps_open: number;
};

export type CatalogSheetRow = {
  id?: string;
  requirement_id?: string;
  parent_id?: string | null;
  row_kind?: "parent" | "element" | string;
  title?: string;
  clause_id?: string;
  clause_ids?: string[];
  group_logic?: string;
  parent_assignment?: string;
  member_count?: number;
  timing_kind?: string;
  timing_days?: number;
  timing_start_year?: number;
  timing_cert_key?: string;
  timing_reason?: string;
  timing_note?: string;
  publication_gap?: string | null;
  release_gaps?: string[];
  source_index?: string;
  rule_status?: string;
  execution_status?: string;
  catalog_keys?: string[];
  predicates?: Array<{ kind?: string; catalogKey?: string | null }>;
  tests?: Array<{ kind?: string; assert?: string }>;
  members?: Array<{
    id?: string;
    label?: string;
    sourceClauseId?: string;
    catalogKey?: string | null;
    completionRoutes?: string[];
  }>;
};

export type CatalogBatchFile = {
  batch?: string;
  ingest_status?: string;
  rows?: CatalogSheetRow[];
};

export type CatalogSheetFile = {
  sheet?: string;
  rows?: CatalogSheetRow[];
  ingest_status?: string;
  expected_parent_count?: number;
  expected_row_count?: number;
  open_count?: number;
};

export type ReleaseGapRow = {
  id: string;
  topic: string;
  clause: string | null;
  gap: string;
};

export type LoadedDraftRule = DraftRule & {
  rule_status: "draft";
  execution_status: "not_published";
};

export type CatalogIngestStatus = "awaiting_batches" | "loaded";

export type LoadedCatalog = {
  manifest: CatalogManifest;
  ingestStatus: CatalogIngestStatus;
  parents: LoadedDraftRule[];
  elements: CatalogSheetRow[];
  requirementRows: CatalogSheetRow[];
  releaseGaps: ReleaseGapRow[];
  coreRuleLogic: LoadedDraftRule[];
};

export type CatalogLoadSummary = {
  workbookSha256: string;
  daneDeclared: string;
  expectedParentCount: number;
  expectedRequirementsCount: number;
  releaseGapsOpen: number;
  loadedParentCount: number;
  loadedRequirementCount: number;
  loadedElementCount: number;
  ingestStatus: CatalogIngestStatus;
  ruleStatus: "draft";
  executionStatus: "not_published";
  canActivate: false;
  sourceIndex: "ARCHIVE METADATA";
};

const PREDICATE_KIND_SET = new Set<string>([
  "direct_support_assignment",
  "abi_caseload",
  "sei_assignment",
  "org_acre_coverage",
  "staff_acre_supervisor",
  "behavior_risk_assignment",
  "designated_benefits_staff",
  "usor_sei_vendor",
  "cmp_cms_assignment",
  "sjd_assignment",
  "periodic_report",
  "service_documentation",
  "payroll_timesheet",
  "evv_mandated",
  "signature_attestation",
  "billing_restriction",
  "pba_assignment",
  "product_default_reminder",
  "change_impact",
  "audit_export",
]);

function rowId(row: CatalogSheetRow): string {
  return (row.id ?? row.requirement_id ?? "").trim();
}

export function isCatalogParentRow(row: CatalogSheetRow): boolean {
  if (row.row_kind === "element") return false;
  if (row.row_kind === "parent") return true;
  if (row.parent_id && String(row.parent_id).trim().length > 0) return false;
  return rowId(row).length > 0;
}

function clauseIdsFor(row: CatalogSheetRow): string[] {
  if (Array.isArray(row.clause_ids) && row.clause_ids.length > 0) {
    return row.clause_ids.filter((c) => typeof c === "string" && c.trim().length > 0);
  }
  if (typeof row.clause_id === "string" && row.clause_id.trim().length > 0) {
    return [row.clause_id.trim()];
  }
  return [];
}

function mapTiming(row: CatalogSheetRow): TimingAnchor {
  const missing =
    row.timing_reason?.trim() ||
    row.timing_note?.trim() ||
    "Timing is missing-information. Do not invent an interval or annual-from-completion.";
  if (row.timing_kind === "hire_plus_days" && Number.isFinite(row.timing_days)) {
    return { kind: "hire_plus_days", days: row.timing_days as number };
  }
  if (row.timing_kind === "employment_year") {
    if (typeof row.timing_start_year === "number" && row.timing_start_year >= 1) {
      return { kind: "employment_year", startYear: row.timing_start_year };
    }
    return {
      kind: "none",
      reason: "Employment-year start is missing-information. Do not invent annual-from-completion.",
    };
  }
  if (
    row.timing_kind === "certificate_expiry" &&
    typeof row.timing_cert_key === "string" &&
    row.timing_cert_key.trim().length > 0
  ) {
    return { kind: "certificate_expiry", certKey: row.timing_cert_key.trim() };
  }
  if (row.timing_kind === "none") {
    return { kind: "none", reason: missing };
  }
  if (!row.timing_kind) {
    return { kind: "none", reason: missing };
  }
  return {
    kind: "none",
    reason: `Unknown timing kind ${row.timing_kind} is missing-information. Do not invent an interval.`,
  };
}

function mapGroupLogic(value: string | undefined): GroupLogic {
  if (value === "ANY" || value === "CONDITIONAL" || value === "ALL") return value;
  return "ALL";
}

function mapPredicates(row: CatalogSheetRow): DraftPredicate[] {
  if (!Array.isArray(row.predicates)) return [];
  const out: DraftPredicate[] = [];
  for (const pred of row.predicates) {
    if (!pred?.kind || !PREDICATE_KIND_SET.has(pred.kind)) continue;
    out.push({
      kind: pred.kind as PredicateKind,
      catalogKey: pred.catalogKey ?? null,
    });
  }
  return out;
}

function mapTests(row: CatalogSheetRow): DraftRuleTest[] {
  if (!Array.isArray(row.tests)) return [];
  return row.tests
    .filter((t) => t?.kind && t.assert && t.assert.trim().length > 0)
    .map((t, i) => ({
      id: `${rowId(row)}-t${i + 1}`,
      kind: t.kind as DraftRuleTest["kind"],
      assert: t.assert!.trim(),
    }));
}

function defaultRoutes(): CompletionRoute[] {
  return ["SYSTEM"];
}

function resolveReleaseGaps(row: CatalogSheetRow, gapIndex: Map<string, ReleaseGapRow>): string[] {
  const ids = Array.isArray(row.release_gaps) ? row.release_gaps : [];
  const resolved = ids.map((id) => gapIndex.get(id)?.gap ?? id).filter((g) => g.trim().length > 0);
  return [...new Set(resolved)];
}

function mapMembers(
  row: CatalogSheetRow,
  childElements: CatalogSheetRow[],
): DraftRule["group"]["members"] {
  if (Array.isArray(row.members) && row.members.length > 0) {
    return row.members.map((m, i) => ({
      id: m.id?.trim() || `member-${i + 1}`,
      label: m.label?.trim() || row.title || rowId(row),
      sourceClauseId: m.sourceClauseId?.trim() || clauseIdsFor(row)[0] || rowId(row),
      catalogKey: m.catalogKey ?? null,
      completionRoutes:
        (m.completionRoutes?.filter(Boolean) as CompletionRoute[]) ?? defaultRoutes(),
    }));
  }
  if (childElements.length > 0) {
    return childElements.map((el, i) => ({
      id: rowId(el) || `element-${i + 1}`,
      label: el.title?.trim() || rowId(el),
      sourceClauseId: clauseIdsFor(el)[0] || clauseIdsFor(row)[0] || rowId(el),
      catalogKey: null,
      completionRoutes: defaultRoutes(),
    }));
  }
  return [];
}

/**
 * Map workbook / batch rows into draft rule records.
 * Forces draft / not_published regardless of source_index or row status flags.
 */
export function mapCatalogRowsToDraftRules(
  rows: readonly CatalogSheetRow[],
  releaseGaps: readonly ReleaseGapRow[] = [],
): LoadedDraftRule[] {
  const gapIndex = new Map(releaseGaps.map((g) => [g.id, g]));
  const parents = rows.filter(isCatalogParentRow);
  const elements = rows.filter((r) => !isCatalogParentRow(r));

  return parents
    .map((row) => {
      const id = rowId(row);
      if (!id) return null;
      const clauses = clauseIdsFor(row);
      const children = elements.filter((el) => String(el.parent_id ?? "").trim() === id);
      const publicationGap =
        typeof row.publication_gap === "string" && row.publication_gap.trim().length > 0
          ? row.publication_gap.trim()
          : null;
      const mapped: LoadedDraftRule = {
        id,
        version: 1,
        title: row.title?.trim() || id,
        catalogKeys: Array.isArray(row.catalog_keys) ? row.catalog_keys : [],
        lifecycle: "draft",
        publication: "not_published",
        rule_status: "draft",
        execution_status: "not_published",
        source: linkWorkbookSource(clauses.length > 0 ? clauses : [id]),
        sourceIndex: WORKBOOK_SOURCE_INDEX,
        predicates: mapPredicates(row),
        group: {
          logic: mapGroupLogic(row.group_logic),
          parentAssignment: row.parent_assignment === "per_member" ? "per_member" : "one",
          members: mapMembers(row, children),
        },
        timing: mapTiming(row),
        evidence: {
          summary: "",
          routes: [],
          defaultHandlingLabel: "",
          automaticEquivalency: false,
        },
        completionRoutes: defaultRoutes(),
        tests: mapTests(row),
        unresolvedAlternatives: [],
        unresolvedRenewals: [],
        releaseGaps: resolveReleaseGaps(row, gapIndex),
        publicationGap,
        approval: null,
      };
      return mapped;
    })
    .filter((rule): rule is LoadedDraftRule => rule !== null);
}

export function rowsFromUnknown(value: unknown): CatalogSheetRow[] {
  if (Array.isArray(value)) return value as CatalogSheetRow[];
  if (value && typeof value === "object" && "rows" in value) {
    const rows = (value as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as CatalogSheetRow[]) : [];
  }
  return [];
}

export function assembleCatalogRows(
  batches: readonly unknown[],
  fallback?: unknown,
): CatalogSheetRow[] {
  const fromBatches = batches.flatMap((batch) => rowsFromUnknown(batch));
  if (fromBatches.length > 0) return fromBatches;
  return rowsFromUnknown(fallback);
}

export function catalogIngestStatus(parentCount: number, expected: number): CatalogIngestStatus {
  return parentCount > 0 && parentCount === expected ? "loaded" : "awaiting_batches";
}

export function catalogLoadSummary(loaded: LoadedCatalog): CatalogLoadSummary {
  return {
    workbookSha256: loaded.manifest.sha256,
    daneDeclared: loaded.manifest.dane_declared,
    expectedParentCount: loaded.manifest.catalog_rows,
    expectedRequirementsCount: loaded.manifest.requirements_rows,
    releaseGapsOpen: loaded.manifest.release_gaps_open,
    loadedParentCount: loaded.parents.length,
    loadedRequirementCount: loaded.requirementRows.length,
    loadedElementCount: loaded.elements.length,
    ingestStatus: loaded.ingestStatus,
    ruleStatus: "draft",
    executionStatus: "not_published",
    canActivate: false,
    sourceIndex: "ARCHIVE METADATA",
  };
}

export function buildLoadedCatalog(input: {
  manifest: CatalogManifest;
  batchFiles?: readonly unknown[];
  requirementCatalog?: unknown;
  requirements?: unknown;
  releaseGaps?: readonly ReleaseGapRow[];
  coreRuleLogic?: unknown;
}): LoadedCatalog {
  const assembled = assembleCatalogRows(input.batchFiles ?? [], input.requirementCatalog);
  const releaseGaps = input.releaseGaps ?? [];
  const parents = mapCatalogRowsToDraftRules(assembled, releaseGaps);
  const elements = assembled.filter((r) => !isCatalogParentRow(r));
  const requirementRows = rowsFromUnknown(input.requirements);
  const coreRows = rowsFromUnknown(input.coreRuleLogic);
  const coreRuleLogic = mapCatalogRowsToDraftRules(coreRows, releaseGaps);
  const ingestStatus = catalogIngestStatus(parents.length, input.manifest.catalog_rows);
  return {
    manifest: input.manifest,
    ingestStatus,
    parents,
    elements,
    requirementRows,
    releaseGaps: [...releaseGaps],
    coreRuleLogic,
  };
}
