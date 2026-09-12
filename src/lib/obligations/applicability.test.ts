import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleThisWeekFromHits } from "./this-week.functions.ts";
import {
  AWARDED_CODES_FACT,
  CHA_HSQ_PBA,
  EMPTY_ORG_FACTS,
  ORG_FACT_DEFINITIONS,
  TNS_ORG_ID,
  awardedCodeDutyStatus,
  computeObligationApplicability,
  housemateStatus,
  humanRightsPlanStatus,
  listUnansweredFacts,
  obligationFactApplicability,
  parseFactAnswer,
  unansweredFactsQuietSummary,
  type OrgFacts,
} from "./applicability.ts";
import { AWARDED_SERVICE_CODES_FACT_KEY } from "./setup-facts.ts";

const TNS_SERVICES = ["HHS", "SLN", "SLH", "SEI", "DSI"];

function tnsUnanswered(): OrgFacts {
  return { ...EMPTY_ORG_FACTS, servicesOffered: TNS_SERVICES };
}

describe("org-profile facts", () => {
  it("treats null / non-boolean as unanswered", () => {
    assert.equal(parseFactAnswer(null), null);
    assert.equal(parseFactAnswer(undefined), null);
    assert.equal(parseFactAnswer("yes"), null);
    assert.equal(parseFactAnswer(true), true);
    assert.equal(parseFactAnswer(false), false);
  });

  it("lists all three setup facts when unanswered", () => {
    const unanswered = listUnansweredFacts(tnsUnanswered());
    assert.equal(unanswered.length, 3);
    assert.deepEqual(
      unanswered.map((d) => d.key),
      ["operates_ol_site", "uses_volunteers", "has_governing_board"],
    );
  });

  it("clears unanswered after every fact is recorded", () => {
    const facts: OrgFacts = {
      operates_ol_site: false,
      uses_volunteers: false,
      has_governing_board: false,
      servicesOffered: TNS_SERVICES,
    };
    assert.equal(listUnansweredFacts(facts).length, 0);
    assert.equal(unansweredFactsQuietSummary(TNS_ORG_ID, facts), null);
  });

  it("treats empty awarded codes as an unanswered setup fact", () => {
    const unanswered = listUnansweredFacts({ ...EMPTY_ORG_FACTS });
    assert.ok(unanswered.some((d) => d.key === AWARDED_SERVICE_CODES_FACT_KEY));
    assert.equal(unanswered[0]?.question, AWARDED_CODES_FACT.question);
  });
});

describe("when_applicable computation", () => {
  it("keeps conditional duties visible while facts are unanswered", () => {
    const rows = computeObligationApplicability(tnsUnanswered());
    for (const key of [
      "zoning_life_safety",
      "volunteer_training_file",
      "governing_board_records",
    ]) {
      const row = rows.find((r) => r.obligationKey === key);
      assert.ok(row, key);
      assert.equal(row?.status, "unanswered");
      assert.equal(row?.applies, true);
      assert.equal(row?.unanswered, true);
    }
  });

  it("hides a duty when the matching fact is no", () => {
    const facts: OrgFacts = {
      operates_ol_site: false,
      uses_volunteers: false,
      has_governing_board: false,
      servicesOffered: TNS_SERVICES,
    };
    const zoning = obligationFactApplicability("zoning_life_safety", facts);
    assert.equal(zoning?.status, "does_not_apply");
    assert.equal(zoning?.applies, false);
    const volunteers = obligationFactApplicability("volunteer_training_file", facts);
    assert.equal(volunteers?.status, "does_not_apply");
    const board = obligationFactApplicability("governing_board_records", facts);
    assert.equal(board?.status, "does_not_apply");
  });

  it("applies a duty when the matching fact is yes", () => {
    const facts: OrgFacts = {
      operates_ol_site: true,
      uses_volunteers: true,
      has_governing_board: true,
      servicesOffered: TNS_SERVICES,
    };
    assert.equal(obligationFactApplicability("zoning_life_safety", facts)?.status, "applies");
    assert.equal(obligationFactApplicability("volunteer_training_file", facts)?.status, "applies");
    assert.equal(obligationFactApplicability("governing_board_records", facts)?.status, "applies");
  });

  it("TNS services require the Human Rights Plan and housemate discussion", () => {
    assert.equal(humanRightsPlanStatus(TNS_SERVICES), "applies");
    assert.equal(housemateStatus(TNS_SERVICES), "applies");
    const rows = computeObligationApplicability(tnsUnanswered());
    assert.equal(rows.find((r) => r.obligationKey === "human_rights_plan")?.status, "applies");
    assert.equal(
      rows.find((r) => r.obligationKey === "housemate_informed_choice")?.status,
      "applies",
    );
  });

  it("Human Rights Plan is N/A only for solely CHA / HSQ / PBA", () => {
    assert.equal(humanRightsPlanStatus([...CHA_HSQ_PBA]), "does_not_apply");
    assert.equal(humanRightsPlanStatus(["CHA", "HSQ"]), "does_not_apply");
    assert.equal(humanRightsPlanStatus(["CHA", "HHS"]), "applies");
    assert.equal(humanRightsPlanStatus([]), "unanswered");
  });

  it("housemate discussion follows HHS / PPS / RHS, not other codes", () => {
    assert.equal(housemateStatus(["SEI", "DSI"]), "does_not_apply");
    assert.equal(housemateStatus(["PPS"]), "applies");
    assert.equal(housemateStatus(["rhs"]), "applies");
    assert.equal(housemateStatus([]), "unanswered");
  });

  it("maps each recorded fact to the catalog keys from the SOW pack", () => {
    assert.deepEqual(
      ORG_FACT_DEFINITIONS.flatMap((d) => d.obligationKeys),
      ["zoning_life_safety", "volunteer_training_file", "governing_board_records"],
    );
  });

  it("cannot silently N/A a code-gated agency duty when awarded codes are unanswered", () => {
    assert.equal(awardedCodeDutyStatus(["SEI"], []), "unanswered");
    assert.equal(awardedCodeDutyStatus(["HHS"], ["HHS", "SEI"]), "applies");
    assert.equal(awardedCodeDutyStatus(["RHS"], TNS_SERVICES), "does_not_apply");

    const empty = computeObligationApplicability({ ...EMPTY_ORG_FACTS });
    const seiMonthly = empty.find((r) => r.obligationKey === "sei_monthly_summary_upi");
    assert.ok(seiMonthly);
    assert.equal(seiMonthly.factKey, AWARDED_SERVICE_CODES_FACT_KEY);
    assert.equal(seiMonthly.status, "unanswered");
    assert.equal(seiMonthly.applies, true);

    const acre = empty.find((r) => r.obligationKey === "acre_sei");
    assert.equal(acre, undefined);

    const tns = computeObligationApplicability(tnsUnanswered());
    assert.equal(
      tns.find((r) => r.obligationKey === "sei_monthly_summary_upi")?.status,
      "applies",
    );
    assert.equal(
      tns.find((r) => r.obligationKey === "rhs_evac_drills_quarterly")?.status,
      "does_not_apply",
    );
  });
});

describe("This Week unanswered-facts card", () => {
  it("builds a high-urgency QuietSummary for TNS while facts are open", () => {
    const card = unansweredFactsQuietSummary(TNS_ORG_ID, tnsUnanswered());
    assert.ok(card);
    assert.equal(card?.kind, "quiet_summary");
    assert.equal(card?.source, "org_profile_facts");
    assert.equal(card?.urgency, "high");
    assert.equal(card?.count, 3);
    assert.equal(card?.id, `org_profile_facts:${TNS_ORG_ID}`);
    assert.match(card?.body ?? "", /3 org-profile facts/);
    assert.match(card?.body ?? "", /OL-licensed/);
  });

  it("assembles into getThisWeek ahead of normal EVV counts", () => {
    const facts = unansweredFactsQuietSummary(TNS_ORG_ID, tnsUnanswered());
    assert.ok(facts);
    const week = assembleThisWeekFromHits(
      "admin",
      [],
      [
        facts,
        {
          kind: "quiet_summary",
          id: "evv",
          title: "EVV",
          body: "1",
          count: 1,
          urgency: "normal",
          dueAt: null,
          source: "evv_needs_review",
        },
      ],
    );
    assert.equal(week[0]?.source, "org_profile_facts");
    assert.equal(week[1]?.source, "evv_needs_review");
  });
});
