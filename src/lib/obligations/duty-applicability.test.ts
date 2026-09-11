import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { EMPTY_ORG_FACTS, type OrgFacts } from "./applicability.ts";
import {
  ABI_DUTY_KEYS,
  DIRECT_SUPPORT_HIRE_KEYS,
  TRANSPORT_DUTY_KEYS,
  UNIVERSAL_STAFF_KEYS,
  UNKNOWN_STAFF_DUTY_FACTS,
  assignmentGapsForStaff,
  dutyKeyForObligation,
  evaluateStaffDuty,
  evaluateStaffDuties,
  evaluationIsCompliant,
  planDutyReevaluation,
  staffDutyFootprint,
  staffReceivesDutyClock,
  staffSeesDuty,
  unansweredDutyQuietSummary,
  type StaffDutyFacts,
} from "./duty-applicability.ts";

const DSP: StaffDutyFacts = {
  staffId: "dsp-1",
  role: "employee",
  assignmentsKnown: true,
  assignedClientIds: ["client-a"],
  assignedServiceCodes: ["HHS", "SLN"],
  transportsKnown: true,
  isTransporter: false,
  abiCaseloadKnown: true,
  hasAbiCaseload: false,
  requiresAbi: false,
  behaviorCaseloadKnown: true,
  hasBehaviorCaseload: false,
  requiresDeescalation: false,
  managerIdKnown: true,
  managerId: "mgr-1",
};

const OFFICE: StaffDutyFacts = {
  ...DSP,
  staffId: "office-1",
  role: "admin",
  assignedClientIds: [],
  assignedServiceCodes: [],
};

const UNKNOWN: StaffDutyFacts = {
  staffId: "unknown-1",
  ...UNKNOWN_STAFF_DUTY_FACTS,
};

const TNS_FACTS: OrgFacts = {
  ...EMPTY_ORG_FACTS,
  servicesOffered: ["HHS", "SLN", "SLH", "SEI", "DSI"],
};

describe("duty keys, not titles", () => {
  it("resolves company_obligations.key first", () => {
    assert.equal(dutyKeyForObligation({ key: "abi_training", title: "Anything" }), "abi_training");
    assert.equal(
      dutyKeyForObligation({ key: null, title: "ABI Training — Before Working Alone" }),
      "abi_training",
    );
  });

  it("assignee rules match keys, not title prefixes", () => {
    const rules = readFileSync(
      fileURLToPath(new URL("../obligation-assignee-rules.ts", import.meta.url)),
      "utf8",
    );
    const engine = readFileSync(
      fileURLToPath(new URL("./duty-applicability.ts", import.meta.url)),
      "utf8",
    );
    assert.match(engine, /driving_record_transport/);
    assert.match(engine, /behavior_intervention_cert/);
    assert.match(engine, /abi_training/);
    assert.doesNotMatch(rules, /title\.startsWith/);
    assert.doesNotMatch(rules, /dutyRequiresTransporter/);
    assert.doesNotMatch(rules, /dutyRequiresBehaviorCaseload/);
    assert.doesNotMatch(rules, /dutyRequiresAbiCaseload/);
  });

  it("generation uses keys, not obligation titles", () => {
    const gen = readFileSync(
      fileURLToPath(new URL("../company-obligations.functions.ts", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(gen, /filterAssigneesByServiceCodesInternal/);
    assert.doesNotMatch(gen, /perHomeServiceCode\(ob\.title\)/);
    assert.match(gen, /obligationDutyKey/);
    assert.match(gen, /staffReceivesDutyClock/);
  });
});

describe("visible vs clock", () => {
  it("unanswered is visible but does not mint a clock", () => {
    const row = evaluateStaffDuty({ dutyKey: "orientation_30_day", staff: UNKNOWN });
    assert.equal(staffSeesDuty(row), true);
    assert.equal(staffReceivesDutyClock(row), false);
  });
});

describe("different duties → different tasks", () => {
  it("HHS assignment gets hire trainings; office admin does not", () => {
    const dsp = evaluateStaffDuties({
      dutyKeys: [...DIRECT_SUPPORT_HIRE_KEYS],
      staff: DSP,
      orgFacts: TNS_FACTS,
    });
    const office = evaluateStaffDuties({
      dutyKeys: [...DIRECT_SUPPORT_HIRE_KEYS],
      staff: OFFICE,
      orgFacts: TNS_FACTS,
    });
    assert.ok(dsp.every((d) => d.status === "applies"));
    assert.ok(office.every((d) => d.status === "does_not_apply"));
    assert.equal(staffDutyFootprint(DSP), "direct_support");
    assert.equal(staffDutyFootprint(OFFICE), "office");
  });

  it("ABI follows the ABI caseload, not the job title", () => {
    const onAbi = evaluateStaffDuty({
      dutyKey: ABI_DUTY_KEYS[0],
      staff: { ...DSP, hasAbiCaseload: true, requiresAbi: false },
    });
    const offAbi = evaluateStaffDuty({
      dutyKey: ABI_DUTY_KEYS[0],
      staff: DSP,
    });
    const titledOfficeOnAbi = evaluateStaffDuty({
      dutyKey: ABI_DUTY_KEYS[0],
      staff: { ...OFFICE, assignedClientIds: ["c"], hasAbiCaseload: true },
    });
    assert.equal(onAbi.status, "applies");
    assert.equal(offAbi.status, "does_not_apply");
    assert.equal(titledOfficeOnAbi.status, "applies");
  });

  it("transport follows MTP / transporter assignment", () => {
    const driver = evaluateStaffDuty({
      dutyKey: TRANSPORT_DUTY_KEYS[0],
      staff: { ...DSP, isTransporter: true, assignedServiceCodes: ["MTP"] },
    });
    const notDriver = evaluateStaffDuty({
      dutyKey: TRANSPORT_DUTY_KEYS[0],
      staff: DSP,
    });
    assert.equal(driver.status, "applies");
    assert.equal(notDriver.status, "does_not_apply");
  });

  it("Code of Conduct follows assigned SLN/HHS codes, not a staff type", () => {
    const hhs = evaluateStaffDuty({
      dutyKey: "dhhs_code_of_conduct_signed",
      staff: DSP,
    });
    const seiOnly = evaluateStaffDuty({
      dutyKey: "dhhs_code_of_conduct_signed",
      staff: { ...DSP, assignedServiceCodes: ["SEI"] },
    });
    assert.equal(hhs.status, "applies");
    assert.equal(seiOnly.status, "does_not_apply");
  });
});

describe("unknown facts stay unanswered, never N/A", () => {
  it("unknown assignments do not become does_not_apply", () => {
    for (const key of [
      "orientation_30_day",
      "abi_training",
      "driving_record_transport",
      "acre_sei",
      "client_specific_training",
    ]) {
      const row = evaluateStaffDuty({ dutyKey: key, staff: UNKNOWN, orgFacts: TNS_FACTS });
      assert.equal(row.status, "unanswered", key);
      assert.equal(row.applies, true, key);
      assert.equal(row.unanswered, true, key);
    }
  });

  it("org OL-site unanswered stays applies=true", () => {
    const row = evaluateStaffDuty({
      dutyKey: "zoning_life_safety",
      staff: OFFICE,
      orgFacts: { ...TNS_FACTS, operates_ol_site: null },
    });
    assert.equal(row.status, "unanswered");
    assert.equal(row.applies, true);
  });

  it("employee with no assignment is a gap, not N/A", () => {
    const unassigned: StaffDutyFacts = {
      ...DSP,
      assignedClientIds: [],
      assignedServiceCodes: [],
    };
    const row = evaluateStaffDuty({ dutyKey: "orientation_30_day", staff: unassigned });
    assert.equal(row.status, "unanswered");
    assert.equal(row.gap, "missing_assignment");
    assert.equal(row.applies, true);
  });

  it("unknown duty keys stay unanswered, never N/A and never invented applies", () => {
    const row = evaluateStaffDuty({ dutyKey: "not_a_real_duty_key", staff: DSP });
    assert.equal(row.status, "unanswered");
    assert.equal(row.applies, true);
    assert.equal(row.unanswered, true);
    assert.equal(staffReceivesDutyClock(row), false);
    assert.equal(staffSeesDuty(row), true);
  });

  it("failed evaluation is not compliant", () => {
    assert.equal(
      evaluationIsCompliant({ evaluationComplete: false, gaps: [], failed: false }),
      false,
    );
    assert.equal(
      evaluationIsCompliant({ evaluationComplete: true, gaps: [], failed: true }),
      false,
    );
    const gaps = assignmentGapsForStaff({
      staff: UNKNOWN,
      duties: [evaluateStaffDuty({ dutyKey: "abi_training", staff: UNKNOWN })],
      assignedDutyKeys: new Set(),
      evaluationComplete: false,
    });
    assert.equal(gaps[0]?.kind, "evaluation_incomplete");
    const card = unansweredDutyQuietSummary("org", gaps);
    assert.ok(card);
    assert.equal(card?.source, "assignment_gaps");
    assert.match(card?.body ?? "", /not a clean compliance result/);
  });
});

describe("assignment change reevaluates without dupes", () => {
  it("opens newly applicable duties and reuses evidence", () => {
    const before = evaluateStaffDuties({
      dutyKeys: ["abi_training", "orientation_30_day"],
      staff: DSP,
    });
    assert.equal(before.find((d) => d.dutyKey === "abi_training")?.status, "does_not_apply");

    const afterStaff: StaffDutyFacts = {
      ...DSP,
      hasAbiCaseload: true,
      assignedClientIds: ["c1", "c2"],
    };
    const after = evaluateStaffDuties({
      dutyKeys: ["abi_training", "orientation_30_day"],
      staff: afterStaff,
    });
    const plan = planDutyReevaluation({
      staff: afterStaff,
      duties: after,
      openDutyKeys: new Set(["orientation_30_day"]),
      evidenceDutyKeys: new Set(["orientation_30_day"]),
      evaluationComplete: true,
    });
    assert.deepEqual(plan.openKeys, ["abi_training"]);
    assert.deepEqual(plan.skipOpenKeys, ["orientation_30_day"]);
    assert.ok(!plan.openKeys.includes("orientation_30_day"));
  });

  it("missing assignment for an applying duty is a detected gap", () => {
    const duties = evaluateStaffDuties({
      dutyKeys: ["orientation_30_day", ...UNIVERSAL_STAFF_KEYS],
      staff: DSP,
    });
    const gaps = assignmentGapsForStaff({
      staff: DSP,
      duties,
      assignedDutyKeys: new Set(UNIVERSAL_STAFF_KEYS),
      evaluationComplete: true,
    });
    assert.ok(
      gaps.some((g) => g.dutyKey === "orientation_30_day" && g.kind === "missing_assignment"),
    );
    assert.equal(evaluationIsCompliant({ evaluationComplete: true, gaps, failed: false }), false);
  });
});

describe("SEI stays on assignment codes, not a fact_key", () => {
  it("acre_sei applies only when the staff assignment carries SEI", () => {
    const sei = evaluateStaffDuty({
      dutyKey: "acre_sei",
      staff: { ...DSP, assignedServiceCodes: ["SEI"] },
    });
    const noSei = evaluateStaffDuty({ dutyKey: "acre_sei", staff: DSP });
    assert.equal(sei.status, "applies");
    assert.equal(noSei.status, "does_not_apply");
  });

  it("SEI staff with no supervisor is a gap, not N/A", () => {
    const row = evaluateStaffDuty({
      dutyKey: "acre_sei",
      staff: {
        ...DSP,
        assignedServiceCodes: ["SEI"],
        managerIdKnown: true,
        managerId: null,
      },
    });
    assert.equal(row.status, "applies");
    assert.equal(row.gap, "missing_supervisor");
  });

  it("does not invent an SEI fact_key on the org-fact module", () => {
    const src = readFileSync(fileURLToPath(new URL("./applicability.ts", import.meta.url)), "utf8");
    assert.doesNotMatch(src, /sei_applicable|fact_sei/);
    const duty = readFileSync(
      fileURLToPath(new URL("./duty-applicability.ts", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(duty, /person_applicability|duty_assignments|sei_applicable/);
  });
});
