import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleReviewPack, generateReviewText, type PackChangeRow } from "./review-pack.ts";
import type { Decision, QuietSummary } from "./this-week.functions.ts";

const decision: Decision = {
  kind: "decision",
  id: "d1",
  title: "CPR overdue",
  body: "Staff file missing CPR.",
  urgency: "critical",
  dueAt: "2026-09-10T00:00:00.000Z",
  ownerUserId: "admin-1",
  ownerLabel: "admin_level",
  consequence: "Cannot schedule until current.",
  source: "escalation",
};

const quiet: QuietSummary = {
  kind: "quiet_summary",
  id: "q1",
  title: "EVV timesheets need review",
  body: "2 timesheets in scope marked needs_review.",
  count: 2,
  urgency: "normal",
  dueAt: null,
  source: "evv_needs_review",
};

const change: PackChangeRow = {
  change_kind: "added",
  obligation_key: "cpr_first_aid",
  note: "Hire-level CPR",
  pack_version: "UT-2026.07",
  state_code: "UT",
  created_at: "2026-07-01T00:00:00.000Z",
};

describe("review pack", () => {
  it("marks Generate my review as a draft and packs What changed", () => {
    const pack = assembleReviewPack([decision, quiet], [change], "UT-2026.07", "2026-09-11T12:00:00.000Z");
    assert.equal(pack.draft, true);
    assert.equal(pack.decisions, 1);
    assert.equal(pack.quiet, 1);
    assert.equal(pack.changes.length, 1);
    assert.match(pack.text, /This week review \(draft\)/);
    assert.match(pack.text, /CPR overdue/);
    assert.match(pack.text, /EVV timesheets need review/);
    assert.match(pack.text, /added: cpr_first_aid/);
    assert.doesNotMatch(pack.text, /[\u{1F300}-\u{1FAFF}]/u);
  });

  it("writes an empty What changed line when the changelog is missing", () => {
    const text = generateReviewText([], [], "UT-2026.07", "2026-09-11T12:00:00.000Z");
    assert.match(text, /No pack changelog rows/);
    assert.match(text, /Decisions\nNone/);
  });
});
