import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  decorateDecision,
  FORBIDDEN_DECISION_STRINGS,
  hasForbiddenDecisionCopy,
  HEADLINE_VERB_RE,
  humanDue,
  rollupDecisions,
  wordCount,
  type Decision,
} from "./this-week.ts";

const NOW = new Date("2026-09-11T18:00:00.000Z");

function decision(partial: Partial<Decision> & Pick<Decision, "id" | "title">): Decision {
  return {
    kind: "decision",
    body: "",
    urgency: "high",
    dueAt: null,
    ownerUserId: "admin-1",
    ownerLabel: "admin_level",
    consequence: "This is a licensing or repayment item (§1.13). Missing it risks a corrective action plan or repayment demand, not just a note on file.",
    source: "escalation",
    ...partial,
  };
}

describe("humanDue", () => {
  it("returns Today / Yesterday / N days overdue / Mon D / Before next review — never ISO", () => {
    assert.equal(humanDue("2026-09-11T12:00:00.000Z", NOW), "Today");
    assert.equal(humanDue("2026-09-10T12:00:00.000Z", NOW), "Yesterday");
    assert.equal(humanDue("2026-09-01T18:00:00.000Z", NOW), "10 days overdue");
    assert.equal(humanDue("2026-10-15T18:00:00.000Z", NOW), "Oct 15");
    assert.equal(humanDue(null, NOW), "Before next review");
    assert.equal(humanDue(undefined, NOW), "Before next review");
    for (const value of [
      humanDue("2026-09-11T12:00:00.000Z", NOW),
      humanDue("2026-09-01T00:00:00.000Z", NOW),
      humanDue("2026-10-15T00:00:00.000Z", NOW),
      humanDue(null, NOW),
    ]) {
      assert.doesNotMatch(value, /\d{4}-\d{2}-\d{2}/);
    }
  });
});

describe("decorateDecision", () => {
  it("starts headlines with a verb and keeps ifMissed to eight words", () => {
    const cases: Decision[] = [
      decision({
        id: "lic",
        title: "HHS Inspection",
        trigger: "license_or_repayment_risk",
        obligationKey: "hhs_home_cert_annual",
        dueAt: "2026-10-15T00:00:00.000Z",
      }),
      decision({
        id: "stand",
        title: "Person Discharge Process",
        trigger: "standing_record_missing_30d",
        source: "standing_missing",
        obligationKey: "person_discharge_process",
      }),
      decision({
        id: "cpr",
        title: "CPR/First Aid Certification — Renewal",
        trigger: "overdue",
        obligationKey: "cpr_first_aid_renewal",
        subjectName: "Harvey Cole",
        planId: "p1",
        planKind: "solo_lapse",
        source: "remediation_plan",
      }),
      decision({
        id: "ce",
        title: "Annual Continuing Education",
        trigger: "overdue",
        obligationKey: "ce_12h_annual",
        dueAt: "2026-08-30T00:00:00.000Z",
      }),
      decision({
        id: "half",
        title: "Utah Medicaid Provider Manuals — Annual Memo",
        trigger: "half_window_not_started",
        obligationKey: "medicaid_manuals_memo",
        urgency: "normal",
        dueAt: "2026-10-01T00:00:00.000Z",
      }),
      decision({
        id: "facts",
        title: "Unanswered compliance setup facts",
        source: "standing_missing",
      }),
    ];
    for (const raw of cases) {
      const d = decorateDecision(raw, { now: NOW, viewerUserId: "admin-1" });
      assert.match(d.headline ?? "", HEADLINE_VERB_RE, d.headline);
      assert.ok((d.ifMissed ?? "").length > 0);
      assert.ok(wordCount(d.ifMissed ?? "") <= 8, d.ifMissed);
      const fields = [d.headline, d.why, d.ownerText, d.dueText, d.ifMissed, d.action?.label]
        .filter(Boolean)
        .join("\n");
      for (const forbidden of FORBIDDEN_DECISION_STRINGS) {
        assert.equal(hasForbiddenDecisionCopy(fields), false, `${d.id} leaked ${forbidden}`);
      }
      assert.doesNotMatch(fields, /\d{4}-\d{2}-\d{2}/);
    }
  });
});

describe("rollupDecisions", () => {
  it("merges overdue + license_risk on one instance and keeps mergedTriggers", () => {
    const overdue = decision({
      id: "overdue:inst-1",
      title: "HHS Inspection",
      trigger: "overdue",
      instanceId: "inst-1",
      obligationId: "ob-hhs",
      obligationKey: "hhs_home_cert_annual",
    });
    const license = decision({
      id: "license:inst-1",
      title: "HHS Inspection",
      trigger: "license_or_repayment_risk",
      instanceId: "inst-1",
      obligationId: "ob-hhs",
      obligationKey: "hhs_home_cert_annual",
      urgency: "critical",
    });
    const rolled = rollupDecisions([overdue, license]);
    assert.equal(rolled.length, 1);
    assert.deepEqual(new Set(rolled[0]?.mergedTriggers), new Set(["overdue", "license_or_repayment_risk"]));
  });

  it("lets a remediation plan win over the raw escalation", () => {
    const hit = decision({
      id: "overdue:inst-cpr",
      title: "CPR/First Aid Certification — Renewal",
      trigger: "overdue",
      instanceId: "inst-cpr",
      obligationKey: "cpr_first_aid_renewal",
      body: "Raw escalation body",
    });
    const plan = decision({
      id: "remediation_plan:p1",
      title: "CPR/First Aid Certification — Renewal",
      source: "remediation_plan",
      planId: "p1",
      planKind: "solo_lapse",
      instanceId: "inst-cpr",
      obligationKey: "cpr_first_aid_renewal",
      body: "Jake already re-paired the solo shifts.",
    });
    const rolled = rollupDecisions([hit, plan]);
    assert.equal(rolled.length, 1);
    assert.equal(rolled[0]?.source, "remediation_plan");
    assert.equal(rolled[0]?.planId, "p1");
    assert.equal(rolled[0]?.body, "Jake already re-paired the solo shifts.");
  });

  it("rolls same-key summaries up with count 3", () => {
    const rows = [1, 2, 3].map((n) =>
      decision({
        id: `nectar:${n}`,
        title: "Quarterly summary",
        source: "nectar_proposed",
        obligationKey: "quarterly_summary",
        urgency: "normal",
      }),
    );
    const rolled = rollupDecisions(rows);
    assert.equal(rolled.length, 1);
    assert.equal(rolled[0]?.count, 3);
    const decorated = decorateDecision(rolled[0]!, { now: NOW });
    assert.match(decorated.headline ?? "", HEADLINE_VERB_RE);
  });
});

describe("QuietLine I/O lock", () => {
  it("counts notes from live ai_compliance_status with head-only selects", () => {
    const src = readFileSync(new URL("./this-week.functions.ts", import.meta.url), "utf8");
    assert.match(src, /ai_compliance_status/);
    assert.match(src, /count: "exact"/);
    assert.match(src, /head: true/);
    assert.match(src, /log_date/);
    assert.doesNotMatch(src, /nectar_validation_status/);
  });
});

describe("headline verb lock", () => {
  it("accepts the locked verb list and rejects a category eyebrow", () => {
    assert.match("Renew HHS Inspection", HEADLINE_VERB_RE);
    assert.match("Sign off: Harvey off solo shifts until CPR renews", HEADLINE_VERB_RE);
    assert.match("Read and sign the discharge process", HEADLINE_VERB_RE);
    assert.match("Approve three quarterly summaries", HEADLINE_VERB_RE);
    assert.doesNotMatch("License / repayment", HEADLINE_VERB_RE);
    assert.doesNotMatch("Escalation", HEADLINE_VERB_RE);
  });
});
