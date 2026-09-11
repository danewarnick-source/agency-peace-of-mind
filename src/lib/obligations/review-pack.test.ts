import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleReviewPack,
  formatReviewDayMeta,
  generateReviewText,
  humanPackChanges,
  reviewPeriodLabel,
  showWhatChangedTab,
  whatChangedTitle,
  type PackChangeRow,
} from "./review-pack.ts";
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
    assert.match(pack.text, /Hire-level CPR/);
    assert.doesNotMatch(pack.text, /added: cpr_first_aid/);
    assert.doesNotMatch(pack.text, /[\u{1F300}-\u{1FAFF}]/u);
  });

  it("writes an empty What changed line when the changelog is missing", () => {
    const text = generateReviewText([], [], "UT-2026.07", "2026-09-11T12:00:00.000Z");
    assert.match(text, /No pack changelog notes/);
    assert.match(text, /Decisions\nNone/);
  });

  it("keeps human notes only and hides the tab when the pack is already applied", () => {
    const keyed: PackChangeRow = { ...change, note: null };
    const snake: PackChangeRow = { ...change, obligation_key: "abi_training", note: "abi_training" };
    assert.equal(humanPackChanges([keyed, snake, change]).length, 1);
    assert.equal(showWhatChangedTab([change], "UT-2026.07"), false);
    assert.equal(showWhatChangedTab([change], null), true);
    assert.equal(showWhatChangedTab([keyed, snake], null), false);
    assert.equal(whatChangedTitle("UT-2026.07"), "What changed — pack UT-2026.07");
    const text = generateReviewText([], [keyed, snake, change], "UT-2026.07", "2026-09-11T12:00:00.000Z");
    assert.match(text, /Hire-level CPR/);
    assert.doesNotMatch(text, /abi_training/);
    assert.doesNotMatch(text, /added: cpr_first_aid/);
  });

  it("formats Review day demo meta without inventing counts", () => {
    assert.equal(reviewPeriodLabel(new Date("2026-09-11T18:00:00.000Z")), "Q3 2026");
    assert.equal(
      formatReviewDayMeta({
        period: "Q3 2026",
        sites: 2,
        samplePeople: 4,
        sampleStaff: 3,
      }),
      "Q3 2026 · 2 sites · 4 people, 3 staff",
    );
    assert.equal(
      formatReviewDayMeta({ period: "Q3 2026", sites: 1, samplePeople: null, sampleStaff: null }),
      "Q3 2026 · 1 site",
    );
    assert.equal(
      formatReviewDayMeta({ period: null, sites: null, samplePeople: null, sampleStaff: null }),
      null,
    );
  });
});
