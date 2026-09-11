import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { promoteOverlayStatus } from "./obligations/catalog-relation.ts";
import {
  buildSowIndex,
  searchSowIndex,
  sowIndexByKey,
  sowIndexRowCount,
} from "./sow-index.ts";

describe("SOW index", () => {
  it("builds about 300 rows from catalog + perimeters + standing + codes", () => {
    const count = sowIndexRowCount();
    assert.ok(count >= 280, `expected >= 280, got ${count}`);
    assert.ok(count <= 360, `expected <= 360, got ${count}`);
  });

  it("includes perimeter R1–R5 and EVV §1.12", () => {
    const abi = sowIndexByKey("sow_r1_abi");
    assert.ok(abi);
    assert.match(abi!.citation, /R1/);
    const evv = searchSowIndex("SLH");
    assert.ok(evv.some((r) => r.source === "evv" && r.citation.includes("§1.12")));
  });

  it("search is case-insensitive over title and citation", () => {
    const hits = searchSowIndex("cpr");
    assert.ok(hits.length > 0);
    assert.ok(hits.some((r) => /cpr/i.test(r.title) || /cpr/i.test(r.key)));
  });

  it("promote overlay stays on the Step 7 confirm path", () => {
    assert.equal(promoteOverlayStatus(), "confirmed");
    const panel = readFileSync(
      new URL("../components/nectar/agency-sources-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(panel, /setCatalogRelationStatus/);
    assert.match(panel, /Promote overlay/);
    assert.doesNotMatch(panel, /promoteOverlayToCatalog|secondPromote/);
  });

  it("does not introduce UI emoji", () => {
    const src = readFileSync(new URL("./sow-index.ts", import.meta.url), "utf8");
    assert.equal(/\p{Extended_Pictographic}/u.test(src), false);
  });
});
