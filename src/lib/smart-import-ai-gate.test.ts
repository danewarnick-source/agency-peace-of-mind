import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { smartImportNeedsAi } from "./smart-import-ai-gate.ts";

describe("smartImportNeedsAi — Tuesday CSV fallback", () => {
  it("does not need Bedrock for roster-only CSV", () => {
    assert.equal(
      smartImportNeedsAi({ hasPdfOrDocxDocs: false, hasNonRosterText: false }),
      false,
    );
  });

  it("needs Bedrock for PDFs", () => {
    assert.equal(
      smartImportNeedsAi({ hasPdfOrDocxDocs: true, hasNonRosterText: false }),
      true,
    );
  });

  it("needs Bedrock for pasted narrative (not a table)", () => {
    assert.equal(
      smartImportNeedsAi({ hasPdfOrDocxDocs: false, hasNonRosterText: true }),
      true,
    );
  });
});
