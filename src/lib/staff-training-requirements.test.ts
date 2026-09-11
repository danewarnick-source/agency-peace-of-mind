import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BASELINE_STAFF_TRAININGS, isBaselineApplicable } from "./staff-training-requirements.ts";

const abi = BASELINE_STAFF_TRAININGS.find((t) => t.conditional === "abi");
const behavior = BASELINE_STAFF_TRAININGS.find((t) => t.conditional === "behavior");
const codes = BASELINE_STAFF_TRAININGS.find((t) => t.conditional === "codes");

describe("isBaselineApplicable — unknown is not N/A", () => {
  it("keeps ABI / de-escalation visible when the flag is unanswered", () => {
    assert.ok(abi && behavior);
    const unknown = {
      hireDate: null,
      requiresDeescalation: null,
      requiresAbi: null,
    };
    assert.equal(isBaselineApplicable(abi, unknown), true);
    assert.equal(isBaselineApplicable(behavior, unknown), true);
    assert.equal(isBaselineApplicable(abi, { ...unknown, requiresAbi: false }), false);
  });

  it("does not treat missing assignedCodes as an empty caseload", () => {
    assert.ok(codes);
    const unknownCodes = {
      hireDate: null,
      requiresDeescalation: false,
      requiresAbi: false,
    };
    assert.equal(isBaselineApplicable(codes, unknownCodes), true);
    assert.equal(isBaselineApplicable(codes, { ...unknownCodes, assignedCodes: null }), true);
    assert.equal(isBaselineApplicable(codes, { ...unknownCodes, assignedCodes: [] }), false);
  });

  it("keeps after_year_one visible when hire date is unanswered", () => {
    const after = {
      ...BASELINE_STAFF_TRAININGS[0]!,
      key: "after_year_one_probe",
      conditional: "after_year_one" as const,
    };
    assert.equal(
      isBaselineApplicable(after, {
        hireDate: null,
        requiresDeescalation: false,
        requiresAbi: false,
      }),
      true,
    );
    assert.equal(
      isBaselineApplicable(after, {
        hireDate: new Date("2026-08-01T00:00:00Z"),
        requiresDeescalation: false,
        requiresAbi: false,
        now: new Date("2026-09-01T00:00:00Z"),
      }),
      false,
    );
  });
});
