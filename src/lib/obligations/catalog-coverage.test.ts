import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalogCoverageReport } from "./catalog-coverage.ts";
import { readCommittedCatalog } from "./draft-rules/catalog-fs.ts";

describe("DHHS91172 catalog coverage", () => {
  it("covers every imported parent and treats elements as children, not tasks", () => {
    const report = buildCatalogCoverageReport(readCommittedCatalog());
    assert.equal(report.counts.importedParents, 760);
    assert.equal(report.counts.importedElements, 607);
    assert.equal(report.counts.importedRows, 1367);
    assert.ok(report.counts.executable >= 41);
    assert.equal(report.counts.published, 0);
    assert.equal(report.counts.verified, 0);
    assert.equal(report.counts.wired, 5);
    assert.equal(report.counts.elementOfParent, 607);

    const orientation = report.rows.find((r) => r.requirementKey === "REQ-1.8.4");
    assert.ok(orientation);
    assert.equal(orientation.role, "parent");
    assert.equal(orientation.liveKey, "orientation_30_day");
    assert.equal(orientation.implementationStatus, "live_mapped");
    assert.equal(orientation.mintsStaffTask, false);
    assert.equal(orientation.canPublish, true);
    assert.equal(orientation.canActivate, false);
    assert.equal(orientation.publication, "not_published");

    const elements = report.rows.filter((r) => r.role === "element");
    assert.equal(elements.length, 607);
    assert.ok(elements.every((r) => r.mintsStaffTask === false));
    assert.ok(elements.every((r) => r.implementationStatus === "element_of_parent"));
  });
});
