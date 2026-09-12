import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CORE_RULE_LOGIC_SLICE,
  STAGE1_RULE_IDS,
  STAGE2_RULE_IDS,
  STAGE3_RULE_IDS,
  STAGE4_RULE_IDS,
  USOR_PROOF_DESTINATION_AS_PUBLISHED,
  allDraftRulesAreUnpublished,
  REQ_1_8_4_ORIENTATION,
  REQ_1_12_EVV,
  REQ_30_6_A_USOR,
  REQ_33_5_SJD,
} from "./fixtures.ts";
import {
  activationBlockReasons,
  canActivate,
  canPublish,
  draftRuleAdminRow,
  structuralPublicationGaps,
} from "./publication.ts";
import { sourceIndexGrantsPublication, WORKBOOK_SOURCE_INDEX } from "./source.ts";
import type { DraftRule } from "./types.ts";

function clone(rule: DraftRule): DraftRule {
  return structuredClone(rule);
}

describe("Stage 1 draft fixtures stay unpublished", () => {
  it("marks every Core_Rule_Logic rule draft / not_published with no approval", () => {
    assert.equal(CORE_RULE_LOGIC_SLICE.length, 22);
    assert.equal(allDraftRulesAreUnpublished(), true);
    for (const rule of CORE_RULE_LOGIC_SLICE) {
      assert.equal(rule.lifecycle, "draft");
      assert.equal(rule.publication, "not_published");
      assert.equal(rule.approval, null);
      assert.equal(rule.sourceIndex.label, "ARCHIVE METADATA");
      assert.equal(rule.sourceIndex.isPublicationPermission, false);
      assert.equal(sourceIndexGrantsPublication(rule.sourceIndex), false);
      assert.equal(canActivate(rule), false);
      assert.ok(rule.source.clauseIds.length > 0, rule.id);
      assert.ok(rule.source.sourceHash.length > 0, rule.id);
    }
  });

  it("encodes the required slice ids and group shapes", () => {
    const ids = CORE_RULE_LOGIC_SLICE.map((r) => r.id);
    assert.deepEqual(ids, [
      ...STAGE1_RULE_IDS,
      ...STAGE2_RULE_IDS,
      ...STAGE3_RULE_IDS,
      ...STAGE4_RULE_IDS,
    ]);
    const o = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-1.8.4");
    assert.equal(o?.group.logic, "ALL");
    assert.equal(o?.group.parentAssignment, "one");
    assert.equal(o?.group.members.length, 23);
    const fa = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-1.8.5");
    assert.equal(fa?.group.logic, "ALL");
    assert.equal(fa?.group.members.length, 3);
    const pct = fa?.group.members.find((m) => m.id === "person_centered");
    assert.equal(pct?.timing?.kind, "none");
    const ce = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-1.8.7");
    assert.equal(ce?.timing.kind, "employment_year");
    const b = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-30.6.b");
    assert.equal(b?.group.logic, "ALL");
    const c = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-30.6.c");
    assert.equal(c?.group.logic, "ANY");
    const behavior = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-1.8.6");
    assert.equal(behavior?.group.routeLogic, "ANY");
    assert.ok((behavior?.group.routes?.length ?? 0) >= 6);
    assert.equal(behavior?.timing.kind, "hire_plus_days");
    if (behavior?.timing.kind === "hire_plus_days") assert.equal(behavior.timing.days, 180);
    const periodic = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-1.25");
    assert.equal(periodic?.group.logic, "CONDITIONAL");
    const caregiver = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-32.5");
    assert.deepEqual(caregiver?.completionRoutes, ["EXTERNAL"]);
    const sjd = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-33.5.b-c");
    assert.equal(
      sjd?.group.members.some((m) => /workplace supports|effective job coach/i.test(m.label)),
      false,
    );
    const notes = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-1.10.7");
    assert.equal(notes?.group.logic, "ALL");
    assert.equal(notes?.group.members.filter((m) => !m.condition).length, 5);
    const evv = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-1.12");
    assert.ok(evv?.releaseGaps.some((g) => /needs EVV mapping review/i.test(g)));
    const art2 = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-ART2");
    assert.equal(art2?.group.members.length, 5);
    const cprReuse = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-1.8.5-cpr-current");
    assert.equal(cprReuse?.group.members[0]?.evidenceMatch?.scope, "cpr");
    const pba = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-15.3");
    assert.equal(pba?.group.logic, "ALL");
    assert.equal(pba?.group.members.length, 3);
    const reminders = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-REMINDERS");
    assert.ok(reminders?.releaseGaps.some((g) => /product defaults, not SOW/i.test(g)));
    const audit = CORE_RULE_LOGIC_SLICE.find((r) => r.id === "REQ-AUDIT-EXPORT");
    assert.ok(audit?.releaseGaps.some((g) => /from applicable authority/i.test(g)));
  });
});

describe("publication gate", () => {
  it("canPublish is true for structurally complete rules; Release_Gaps stay unpublished; canActivate stays false", () => {
    for (const rule of CORE_RULE_LOGIC_SLICE) {
      assert.equal(canActivate(rule), false, rule.id);
      const row = draftRuleAdminRow(rule);
      assert.equal(row.canActivate, false);
      assert.ok(row.gaps.some((g) => g.key === "stage1_lock"));
      assert.ok(row.gaps.some((g) => g.key === "not_published_flag"));
      if (rule.releaseGaps.length > 0) {
        assert.equal(canPublish(rule), false, rule.id);
        assert.ok(
          structuralPublicationGaps(rule).some((g) => g.key === "release_gaps"),
          rule.id,
        );
      } else {
        assert.equal(structuralPublicationGaps(rule).length, 0, rule.id);
        assert.equal(canPublish(rule), true, rule.id);
      }
    }
    assert.ok(
      REQ_30_6_A_USOR.releaseGaps.some((g) => g.includes(USOR_PROOF_DESTINATION_AS_PUBLISHED)),
    );
    assert.ok(REQ_33_5_SJD.releaseGaps.some((g) => /SJB/.test(g)));
    assert.ok(REQ_1_12_EVV.releaseGaps.some((g) => /needs EVV mapping review/i.test(g)));
    assert.equal(canPublish(REQ_1_12_EVV), false);
    assert.match(USOR_PROOF_DESTINATION_AS_PUBLISHED, /osrprovider@utah\.gov/);
  });

  it("canPublish is false when predicates, tests, or source are missing", () => {
    const missingPred = clone(REQ_1_8_4_ORIENTATION);
    missingPred.predicates = [];
    assert.equal(canPublish(missingPred), false);
    assert.ok(structuralPublicationGaps(missingPred).some((g) => g.key === "predicates"));

    const missingTests = clone(REQ_1_8_4_ORIENTATION);
    missingTests.tests = missingTests.tests.filter((t) => t.kind !== "boundary");
    assert.equal(canPublish(missingTests), false);

    const missingSource = clone(REQ_1_8_4_ORIENTATION);
    missingSource.source = {
      sourceId: "",
      sourceVersion: "",
      sourceHash: "",
      clauseIds: [],
    };
    assert.equal(canPublish(missingSource), false);
  });

  it("blocks activation when alternatives or renewals are unresolved", () => {
    const unresolved = clone(REQ_1_8_4_ORIENTATION);
    unresolved.unresolvedRenewals = ["screening annual interval not in workbook"];
    unresolved.lifecycle = "reviewed";
    unresolved.approval = {
      actorId: "admin-1",
      actorLabel: "Reviewer",
      approvedAt: "2026-09-12T00:00:00.000Z",
    };
    unresolved.publication = "published";
    assert.equal(canPublish(unresolved), false);
    assert.equal(canActivate(unresolved), false);
    assert.ok(activationBlockReasons(unresolved).some((g) => g.key === "unresolved_renewals"));
  });

  it("canPublish is false when publication_gap is set", () => {
    const gapped = clone(REQ_1_8_4_ORIENTATION);
    gapped.publicationGap = "1.32 transition date unknown";
    assert.equal(canPublish(gapped), false);
    assert.ok(structuralPublicationGaps(gapped).some((g) => g.key === "publication_gap"));
    assert.equal(canActivate(gapped), false);
  });

  it("never treats source_index as publication permission", () => {
    assert.equal(sourceIndexGrantsPublication(WORKBOOK_SOURCE_INDEX), false);
    const reviewed = clone(REQ_1_8_4_ORIENTATION);
    reviewed.lifecycle = "reviewed";
    reviewed.approval = {
      actorId: "admin-1",
      actorLabel: "Reviewer",
      approvedAt: "2026-09-12T00:00:00.000Z",
    };
    assert.equal(canPublish(reviewed), true);
    assert.equal(canActivate(reviewed), false);
  });
});
