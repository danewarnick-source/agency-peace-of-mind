/**
 * DHHS91172 catalog coverage: each imported requirement against the live
 * engine. Parents and elements are distinct rows. Children do not duplicate
 * parent staff tasks.
 */

import {
  catalogFactPrompts,
  evaluateCatalogFact,
  type CatalogFactQuestion,
} from "./catalog-fact-questions.ts";
import {
  implementationStatusForRule,
  liveObligationKeyForRule,
  staffTaskPolicyForRule,
  type LiveImplementationStatus,
} from "./catalog-live-bridge.ts";
import { EMPTY_ORG_FACTS, type OrgFacts } from "./applicability.ts";
import type {
  CatalogSheetRow,
  LoadedCatalog,
  LoadedDraftRule,
} from "./draft-rules/catalog-loader.ts";
import { canActivate, canPublish, structuralPublicationGaps } from "./draft-rules/publication.ts";
import { applyVerifiedPublicationOverlay } from "./draft-rules/verified-publication.ts";
import {
  applyFirstExecutableBatchOverlay,
  applyFirstExecutableBatchOverlayAll,
  firstBatchParentIsWired,
} from "./first-executable-batch.ts";

export type CatalogCoverageRow = {
  requirementKey: string;
  role: "parent" | "element";
  parentKey: string | null;
  title: string;
  sourceClauseId: string;
  sectionRef: string;
  applicabilityFacts: CatalogFactQuestion[];
  owner: string;
  completionMethod: string;
  timing: string;
  renewal: string;
  liveKey: string | null;
  implementationStatus: LiveImplementationStatus;
  publication: "not_published" | "published";
  canPublish: boolean;
  canActivate: boolean;
  mintsStaffTask: boolean;
  blockers: string[];
};

export type CatalogCoverageCounts = {
  importedParents: number;
  importedElements: number;
  importedRows: number;
  executable: number;
  verified: number;
  published: number;
  blocked: number;
  liveMapped: number;
  systemBehavior: number;
  draftUnwired: number;
  elementOfParent: number;
  /** First shared-behavior batch: live key + fixture overlay, still unpublished. */
  wired: number;
};

export type CatalogCoverageReport = {
  workbookSha256: string;
  counts: CatalogCoverageCounts;
  rows: CatalogCoverageRow[];
};

function cell(row: CatalogSheetRow | undefined, key: string): string {
  if (!row) return "";
  const value = row[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function timingLabel(rule: LoadedDraftRule): string {
  const deadline = cell(rule.workbookRow, "deadline");
  const trigger = cell(rule.workbookRow, "deadline_trigger");
  const recurrence = cell(rule.workbookRow, "recurrence");
  if (rule.timing.kind === "hire_plus_days") return `hire + ${rule.timing.days} days`;
  if (rule.timing.kind === "employment_year") return `employment year ${rule.timing.startYear}`;
  if (rule.timing.kind === "certificate_expiry")
    return `certificate expiry (${rule.timing.certKey})`;
  if (rule.timing.kind === "calendar_period") return rule.timing.cadence;
  const narrative = [deadline, trigger, recurrence].filter(Boolean).join(" / ");
  return narrative || rule.timing.reason;
}

function elementRow(el: CatalogSheetRow, parent: LoadedDraftRule | undefined): CatalogCoverageRow {
  const parentKey = cell(el, "requirement_key") || cell(el, "parent_id") || parent?.id || "";
  return {
    requirementKey: cell(el, "clause_id") || cell(el, "requirement_key"),
    role: "element",
    parentKey: parentKey || null,
    title: cell(el, "clause_text") || cell(el, "requirement_name") || cell(el, "title"),
    sourceClauseId: cell(el, "clause_id") || cell(el, "source_clause_id"),
    sectionRef: cell(el, "section_ref"),
    applicabilityFacts:
      parent?.applicabilityFacts.map((f) => evaluateCatalogFact(f, EMPTY_ORG_FACTS)) ?? [],
    owner:
      cell(el, "default_owner_role") ||
      cell(parent?.workbookRow, "default_owner_role") ||
      "Administrator",
    completionMethod: "Element of parent — checklist / form field, not a staff task",
    timing: cell(parent?.workbookRow, "deadline") || "Follows parent",
    renewal: cell(parent?.workbookRow, "renewal_rule") || "Follows parent",
    liveKey: parent ? liveObligationKeyForRule(parent) : null,
    implementationStatus: "element_of_parent",
    publication: "not_published",
    canPublish: false,
    canActivate: false,
    mintsStaffTask: false,
    blockers: ["Child element — do not mint a duplicate staff task."],
  };
}

function parentRow(rule: LoadedDraftRule, orgFacts: OrgFacts): CatalogCoverageRow {
  const executable = applyFirstExecutableBatchOverlay(rule);
  const published = applyVerifiedPublicationOverlay([executable])[0] ?? executable;
  const gaps = structuralPublicationGaps(published);
  const policy = staffTaskPolicyForRule(published);
  const liveKey = liveObligationKeyForRule(published);
  const blocked = gaps.length > 0 && !liveKey;
  const status = implementationStatusForRule(
    published,
    gaps.some((g) => g.key === "publication_gap" || g.key === "release_gaps") && !liveKey,
  );
  const factQuestions = published.applicabilityFacts.map((f) => evaluateCatalogFact(f, orgFacts));
  const factPrompts = catalogFactPrompts(published.applicabilityFacts, orgFacts);
  const blockers = [
    ...gaps.map((g) => g.reason),
    ...(!liveKey && status === "draft_unwired"
      ? [
          "No live company_obligations key mapped yet — reuse the existing engine, do not fork a second checklist.",
        ]
      : []),
    ...factPrompts.map((q) => `Unanswered applicability fact: ${q}`),
  ];
  return {
    requirementKey: published.id,
    role: "parent",
    parentKey: null,
    title: published.title,
    sourceClauseId:
      published.source.clauseIds[0] ?? cell(published.workbookRow, "source_clause_id"),
    sectionRef: cell(published.workbookRow, "section_ref"),
    applicabilityFacts: factQuestions,
    owner: cell(published.workbookRow, "default_owner_role") || "Administrator",
    completionMethod:
      cell(published.workbookRow, "completion_method") ||
      published.evidence.summary ||
      published.completionRoutes.join(", "),
    timing: timingLabel(published),
    renewal: cell(published.workbookRow, "renewal_rule") || "None stated",
    liveKey,
    implementationStatus: status,
    publication: published.publication,
    canPublish: canPublish(published),
    canActivate: canActivate(published),
    mintsStaffTask: policy.mintsStaffTask && !liveKey && canActivate(published),
    blockers:
      blocked || status === "draft_unwired" || factPrompts.length > 0
        ? blockers
        : gaps.map((g) => g.reason),
  };
}

export function buildCatalogCoverageReport(
  loaded: LoadedCatalog,
  orgFacts: OrgFacts = EMPTY_ORG_FACTS,
): CatalogCoverageReport {
  const parents = applyVerifiedPublicationOverlay(
    applyFirstExecutableBatchOverlayAll(loaded.parents),
  );
  const byId = new Map(parents.map((p) => [p.id, p]));
  const parentRows = parents.map((rule) => parentRow(rule, orgFacts));
  const elementRows = loaded.elements.map((el) =>
    elementRow(el, byId.get(cell(el, "requirement_key") || cell(el, "parent_id"))),
  );
  const rows = [...parentRows, ...elementRows];
  const parentOnly = parentRows;
  const counts: CatalogCoverageCounts = {
    importedParents: parentOnly.length,
    importedElements: elementRows.length,
    importedRows: rows.length,
    executable: parentOnly.filter((r) => r.liveKey != null).length,
    verified: parentOnly.filter((r) => r.canActivate || r.publication === "published").length,
    published: parentOnly.filter((r) => r.publication === "published" && r.canActivate).length,
    blocked: parentOnly.filter((r) => r.implementationStatus === "blocked").length,
    liveMapped: parentOnly.filter((r) => r.implementationStatus === "live_mapped").length,
    systemBehavior: parentOnly.filter((r) => r.implementationStatus === "system_behavior").length,
    draftUnwired: parentOnly.filter((r) => r.implementationStatus === "draft_unwired").length,
    elementOfParent: elementRows.length,
    wired: parents.filter((rule) => firstBatchParentIsWired(rule)).length,
  };
  return {
    workbookSha256: loaded.manifest.sha256,
    counts,
    rows,
  };
}

export function formatCatalogCoverageMarkdown(report: CatalogCoverageReport): string {
  const c = report.counts;
  const lines = [
    "# DHHS91172 catalog coverage",
    "",
    `Workbook sha256 \`${report.workbookSha256}\`.`,
    "",
    "Parents connect to the existing live obligation engine. Child elements are checklist fields of the parent and do not mint staff tasks. Missing applicability facts stay questions — never silent N/A. Unrelated Release_Gaps do not block a verified rule.",
    "",
    "## Counts",
    "",
    `| Measure | Count |`,
    `| --- | ---: |`,
    `| Imported parents | ${c.importedParents} |`,
    `| Imported elements | ${c.importedElements} |`,
    `| Imported rows | ${c.importedRows} |`,
    `| Executable (live key mapped) | ${c.executable} |`,
    `| Verified / activatable | ${c.verified} |`,
    `| Published | ${c.published} |`,
    `| Blocked (rule-specific gap, no live key) | ${c.blocked} |`,
    `| Live mapped (clock) | ${c.liveMapped} |`,
    `| System / standing behavior | ${c.systemBehavior} |`,
    `| Draft unwired | ${c.draftUnwired} |`,
    `| Element of parent | ${c.elementOfParent} |`,
    `| Wired first batch (unpublished) | ${c.wired} |`,
    "",
    "## Parents",
    "",
    "| Key | Source | Owner | Completion | Timing | Live key | Status | Blocker |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of report.rows.filter((r) => r.role === "parent")) {
    const blocker = row.blockers[0]?.replace(/\|/g, "/") ?? "";
    lines.push(
      `| ${row.requirementKey} | ${row.sourceClauseId || row.sectionRef} | ${row.owner} | ${row.completionMethod.replace(/\|/g, "/")} | ${row.timing.replace(/\|/g, "/")} | ${row.liveKey ?? ""} | ${row.implementationStatus} | ${blocker} |`,
    );
  }
  lines.push("", "## Elements (no staff task)", "");
  lines.push(
    `${c.importedElements} child elements attach to a parent requirement. They are not listed individually here to avoid a duplicate task register.`,
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}
