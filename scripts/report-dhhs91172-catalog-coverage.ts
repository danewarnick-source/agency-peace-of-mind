/**
 * Write the DHHS91172 catalog coverage artifact.
 * Usage: node --experimental-strip-types scripts/report-dhhs91172-catalog-coverage.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCatalogCoverageReport,
  formatCatalogCoverageMarkdown,
} from "../src/lib/obligations/catalog-coverage.ts";
import { readCommittedCatalog } from "../src/lib/obligations/draft-rules/catalog-fs.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../docs/compliance/dhhs91172");

function main(): void {
  const report = buildCatalogCoverageReport(readCommittedCatalog());
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "COVERAGE_REPORT.md"), formatCatalogCoverageMarkdown(report));
  writeFileSync(
    join(outDir, "COVERAGE_REPORT.json"),
    `${JSON.stringify(
      {
        workbookSha256: report.workbookSha256,
        counts: report.counts,
        parents: report.rows
          .filter((r) => r.role === "parent")
          .map((r) => ({
            requirementKey: r.requirementKey,
            sourceClauseId: r.sourceClauseId,
            sectionRef: r.sectionRef,
            title: r.title,
            owner: r.owner,
            completionMethod: r.completionMethod,
            timing: r.timing,
            renewal: r.renewal,
            liveKey: r.liveKey,
            implementationStatus: r.implementationStatus,
            publication: r.publication,
            canPublish: r.canPublish,
            canActivate: r.canActivate,
            mintsStaffTask: r.mintsStaffTask,
            applicabilityFactIds: r.applicabilityFacts.map((f) => f.factId),
            unansweredFacts: r.applicabilityFacts
              .filter((f) => f.status === "unanswered")
              .map((f) => f.question),
            blockers: r.blockers,
          })),
        elements: report.counts.importedElements,
      },
      null,
      2,
    )}\n`,
  );
  const c = report.counts;
  process.stdout.write(
    `DHHS91172 coverage: parents=${c.importedParents} elements=${c.importedElements} executable=${c.executable} wired=${c.wired} verified=${c.verified} published=${c.published} blocked=${c.blocked} unwired=${c.draftUnwired}\n`,
  );
}

main();
