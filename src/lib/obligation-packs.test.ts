import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENCY_POLICY_SOURCE_SECTION } from "./agency-policies.ts";
import {
  ABI_OBLIGATION_TITLE,
  THIRTY_DAY_OBLIGATION_TITLE,
} from "./in-hive-training.ts";
import { PCT_HIRE_COURSE_TITLE } from "./client-form-obligations.ts";
import { CODE_OF_CONDUCT_TITLE } from "./obligation-auto-assign.ts";
import {
  cellIncrementsRed,
  isPackSentinel,
  obligationIsRequired,
  packCellStatus,
  packColumnForObligation,
} from "./obligation-packs.ts";

describe("obligation pack mapping", () => {
  it("maps hire / policy items to Onboarding", () => {
    const code = packColumnForObligation({
      id: "1",
      title: CODE_OF_CONDUCT_TITLE,
      scope: "staff",
    });
    assert.equal(code?.packKey, "onboarding");
    assert.equal(code?.required, true);

    const policy = packColumnForObligation({
      id: "2",
      title: "True North handbook",
      source: "provider",
      scope: "staff",
      source_policy_section: AGENCY_POLICY_SOURCE_SECTION,
    });
    assert.equal(policy?.packKey, "onboarding");
    assert.equal(policy?.columnKey, "policy:2");
  });

  it("maps 30-day, CPR, Mandt, ABI, CE into Credentials", () => {
    assert.equal(
      packColumnForObligation({ id: "a", title: THIRTY_DAY_OBLIGATION_TITLE, scope: "staff" })
        ?.columnKey,
      "thirty-day",
    );
    assert.equal(
      packColumnForObligation({
        id: "b",
        title: "CPR/First Aid Certification — Initial",
        scope: "staff",
      })?.columnKey,
      "cpr",
    );
    assert.equal(
      packColumnForObligation({
        id: "c",
        title: "CPR/First Aid Certification — Renewal",
        scope: "staff",
      })?.columnKey,
      "cpr",
    );
    assert.equal(
      packColumnForObligation({
        id: "d",
        title: "Behavior Intervention Certification (SOAR/MANDT/PART/CPI/Safety Care)",
        scope: "staff",
      })?.columnKey,
      "mandt",
    );
    assert.equal(
      packColumnForObligation({ id: "e", title: ABI_OBLIGATION_TITLE, scope: "staff" })?.columnKey,
      "abi",
    );
    assert.equal(
      packColumnForObligation({
        id: "f",
        title: "Annual 12-Hour Continuing Education",
        scope: "staff",
      })?.columnKey,
      "annual-ce",
    );
    assert.equal(
      packColumnForObligation({ id: "g", title: PCT_HIRE_COURSE_TITLE, scope: "staff" })?.columnKey,
      "pct-hire",
    );
  });

  it("maps client-specific / PCT / support strategies to Client", () => {
    assert.equal(
      packColumnForObligation({
        id: "1",
        title: "Client-Specific Training — [Client Name]",
        scope: "staff_per_client",
      })?.packKey,
      "client",
    );
    assert.equal(
      packColumnForObligation({
        id: "2",
        title: "Support Strategies — [Client Name]",
        scope: "staff_per_client",
      })?.columnKey,
      "support-strategies",
    );
    assert.equal(
      packColumnForObligation({
        id: "3",
        title: "Person-Centered Thinking — [Client Name]",
        scope: "staff_per_client",
      })?.columnKey,
      "pct-client",
    );
  });

  it("keeps W-9 / I-9 optional when an admin adds them", () => {
    const w9 = packColumnForObligation({
      id: "w9",
      title: "W-9",
      scope: "staff",
      source: "provider",
    });
    assert.equal(w9?.packKey, "onboarding");
    assert.equal(w9?.required, false);
    assert.equal(obligationIsRequired({ id: "w9", title: "W-9", is_required: false }), false);
  });

  it("does not put org-level contractor filings on the staff matrix", () => {
    assert.equal(
      packColumnForObligation({
        id: "org",
        title: "Emergency Management and Business Continuity Plan",
        scope: "org",
      }),
      null,
    );
  });

  it("never paints optional empties red", () => {
    assert.equal(
      packCellStatus({ assigned: true, complete: false, required: false }),
      "optional_empty",
    );
    assert.equal(cellIncrementsRed("optional_empty"), false);
    assert.equal(cellIncrementsRed("unassigned"), false);
    assert.equal(cellIncrementsRed("complete"), false);
    assert.equal(cellIncrementsRed("incomplete"), true);
  });

  it("hides pack sentinel rows from columns", () => {
    assert.equal(
      isPackSentinel({
        id: "s",
        title: "House documents",
        due_day_config: { hive_pack_sentinel: true, hive_pack_key: "custom-1" },
      }),
      true,
    );
    assert.equal(
      packColumnForObligation({
        id: "s",
        title: "House documents",
        due_day_config: { hive_pack_sentinel: true, hive_pack_key: "custom-1" },
      }),
      null,
    );
  });
});
