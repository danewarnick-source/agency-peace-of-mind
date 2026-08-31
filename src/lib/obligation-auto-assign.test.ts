import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ABI_OBLIGATION_TITLE, THIRTY_DAY_OBLIGATION_TITLE } from "./in-hive-training.ts";
import { PCT_HIRE_COURSE_TITLE } from "./client-form-obligations.ts";
import {
  ABI_OBLIGATION_TITLES,
  CODE_OF_CONDUCT_TITLE,
  CONFLICT_OF_INTEREST_TITLE,
  HIRE_ALWAYS_TITLES,
  assignmentNeedsAbi,
  assignmentNeedsMandt,
  assignmentNeedsSupportStrategies,
  clientFlagsFromExistingSchema,
  hireDueDaysForTitle,
  titleGroupsForHire,
} from "./obligation-auto-assign.ts";

describe("hire auto-assign", () => {
  it("always assigns the locked hire set", () => {
    assert.deepEqual([...HIRE_ALWAYS_TITLES], [
      CODE_OF_CONDUCT_TITLE,
      CONFLICT_OF_INTEREST_TITLE,
      THIRTY_DAY_OBLIGATION_TITLE,
      "CPR/First Aid Certification — Initial",
      PCT_HIRE_COURSE_TITLE,
    ]);
    assert.equal(titleGroupsForHire().length, 5);
  });

  it("uses existing due windows (30 / 90 / 180) instead of a second cadence", () => {
    assert.equal(hireDueDaysForTitle(THIRTY_DAY_OBLIGATION_TITLE), 30);
    assert.equal(hireDueDaysForTitle(CODE_OF_CONDUCT_TITLE), 30);
    assert.equal(hireDueDaysForTitle("CPR/First Aid Certification — Initial"), 90);
    assert.equal(hireDueDaysForTitle(PCT_HIRE_COURSE_TITLE), 90);
    assert.equal(hireDueDaysForTitle(ABI_OBLIGATION_TITLE), 90);
    assert.equal(
      hireDueDaysForTitle("Behavior Intervention Certification (SOAR/MANDT/PART/CPI/Safety Care)"),
      180,
    );
  });
});

describe("assignment auto-assign", () => {
  it("assigns ABI once per staff when the client or staff is ABI", () => {
    assert.equal(assignmentNeedsAbi({ hasAbi: true, hasBehaviorPlan: false, hasLikelyAggression: false, hasPcsp: false }), true);
    assert.equal(
      assignmentNeedsAbi(
        { hasAbi: false, hasBehaviorPlan: false, hasLikelyAggression: false, hasPcsp: false },
        { requiresAbi: true },
      ),
      true,
    );
    assert.equal(
      assignmentNeedsAbi({ hasAbi: false, hasBehaviorPlan: true, hasLikelyAggression: false, hasPcsp: false }),
      false,
    );
    assert.deepEqual([...ABI_OBLIGATION_TITLES], [ABI_OBLIGATION_TITLE]);
  });

  it("assigns Mandt from a behavior plan, likely-aggression flag, or staff de-escalation flag", () => {
    assert.equal(
      assignmentNeedsMandt({ hasAbi: false, hasBehaviorPlan: true, hasLikelyAggression: false, hasPcsp: false }),
      true,
    );
    assert.equal(
      assignmentNeedsMandt({ hasAbi: false, hasBehaviorPlan: false, hasLikelyAggression: true, hasPcsp: false }),
      true,
    );
    assert.equal(
      assignmentNeedsMandt(
        { hasAbi: false, hasBehaviorPlan: false, hasLikelyAggression: false, hasPcsp: false },
        { requiresDeescalation: true },
      ),
      true,
    );
    assert.equal(
      assignmentNeedsMandt({ hasAbi: true, hasBehaviorPlan: false, hasLikelyAggression: false, hasPcsp: false }),
      false,
    );
  });

  it("unlocks support strategies only when the client has a PCSP", () => {
    assert.equal(
      assignmentNeedsSupportStrategies({ hasAbi: false, hasBehaviorPlan: false, hasLikelyAggression: false, hasPcsp: true }),
      true,
    );
    assert.equal(
      assignmentNeedsSupportStrategies({ hasAbi: false, hasBehaviorPlan: false, hasLikelyAggression: false, hasPcsp: false }),
      false,
    );
  });

  it("reads existing client columns instead of inventing new ones", () => {
    const flags = clientFlagsFromExistingSchema({
      has_abi: true,
      pcsp_signed_date: "2026-07-01",
      behaviorPlanEnabled: true,
      hasTargetBehaviors: true,
    });
    assert.deepEqual(flags, {
      hasAbi: true,
      hasBehaviorPlan: true,
      hasLikelyAggression: true,
      hasPcsp: true,
    });
  });
});
