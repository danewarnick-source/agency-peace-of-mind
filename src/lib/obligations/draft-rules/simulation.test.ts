import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { EMPTY_ORG_FACTS, type OrgFacts } from "../applicability.ts";
import { UNKNOWN_STAFF_DUTY_FACTS, type StaffDutyFacts } from "../duty-applicability.ts";
import {
  CORE_RULE_LOGIC_SLICE,
  REQ_1_8_4_ORIENTATION,
  REQ_1_8_5_FA_CPR_PCT,
  REQ_1_8_7_CE12,
  REQ_1_8_8_ABI,
  REQ_SEI_30_6_B,
  REQ_SEI_30_6_C,
} from "./fixtures.ts";
import { canActivate } from "./publication.ts";
import {
  employmentYearDue,
  simulateDraftRules,
  type SimulationInput,
  type SyntheticEvidence,
  type SyntheticStaff,
} from "./simulation.ts";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const TNS_FACTS: OrgFacts = {
  ...EMPTY_ORG_FACTS,
  servicesOffered: ["HHS", "SLN", "SLH", "SEI", "DSI"],
};

function staff(partial: Partial<SyntheticStaff> & Pick<SyntheticStaff, "staffId">): SyntheticStaff {
  const base: StaffDutyFacts = {
    staffId: partial.staffId,
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
  return {
    ...base,
    hireDate: "2024-07-01",
    acreCertified: false,
    supervisorAcreCertified: true,
    ...partial,
  };
}

function run(input: Partial<SimulationInput> & Pick<SimulationInput, "staff">) {
  return simulateDraftRules({
    rules: CORE_RULE_LOGIC_SLICE,
    orgFacts: TNS_FACTS,
    evidence: [],
    now: NOW,
    orgHasAcreCoverage: true,
    ...input,
  });
}

function ruleFor(result: ReturnType<typeof run>, staffId: string, ruleId: string) {
  const person = result.staff.find((s) => s.staffId === staffId);
  assert.ok(person, staffId);
  const row = person.rules.find((r) => r.ruleId === ruleId);
  assert.ok(row, ruleId);
  return row;
}

function topicEvidence(staffId: string, ruleId: string, memberIds: string[]): SyntheticEvidence[] {
  return memberIds.map((memberId) => ({
    staffId,
    ruleId,
    memberId,
    completed: true,
    completedOn: "2026-07-15",
  }));
}

describe("draft simulation writes nothing live", () => {
  it("returns no DB writes, assignments, claim blocks, or activations", () => {
    const dsp = staff({ staffId: "dsp-1" });
    const result = run({ staff: [dsp] });
    assert.equal(result.wroteDatabase, false);
    assert.equal(result.createdLiveAssignments, false);
    assert.equal(result.createdClaimBlocks, false);
    assert.equal(result.activatedRules, false);
    for (const rule of CORE_RULE_LOGIC_SLICE) {
      assert.equal(canActivate(rule), false);
    }
  });

  it("simulation module has no supabase or instance inserts", () => {
    const src = readFileSync(fileURLToPath(new URL("./simulation.ts", import.meta.url)), "utf8");
    assert.doesNotMatch(src, /supabase/);
    assert.doesNotMatch(src, /company_obligation_instances/);
    assert.doesNotMatch(src, /\.from\(/);
    assert.doesNotMatch(src, /insert\(/);
  });
});

describe("duties → tasks on synthetic subjects", () => {
  it("DSP gets orientation / 1.8.5 / 12h; office does not; ABI follows assignment", () => {
    const dsp = staff({ staffId: "dsp-1" });
    const office = staff({
      staffId: "office-1",
      role: "admin",
      assignedClientIds: [],
      assignedServiceCodes: [],
    });
    const abiStaff = staff({ staffId: "abi-1", hasAbiCaseload: true, requiresAbi: true });
    const result = run({ staff: [dsp, office, abiStaff] });

    const dspOri = ruleFor(result, "dsp-1", "REQ-1.8.4");
    assert.equal(dspOri.applicability, "applies");
    assert.equal(dspOri.parentTaskCount, 1);
    assert.ok(dspOri.task);
    assert.match(dspOri.task?.title ?? "", /30-Day/);

    const officeOri = ruleFor(result, "office-1", "REQ-1.8.4");
    assert.equal(officeOri.applicability, "does_not_apply");
    assert.equal(officeOri.parentTaskCount, 0);
    assert.equal(officeOri.task, null);

    assert.equal(ruleFor(result, "dsp-1", "REQ-1.8.8").applicability, "does_not_apply");
    const abi = ruleFor(result, "abi-1", "REQ-1.8.8");
    assert.equal(abi.applicability, "applies");
    assert.equal(abi.parentTaskCount, 1);
  });
});

describe("unknown facts stay missing-information", () => {
  it("never auto N/A or compliant for unanswered assignment / ABI / SEI facts", () => {
    const unknown: SyntheticStaff = {
      staffId: "unknown-1",
      ...UNKNOWN_STAFF_DUTY_FACTS,
      hireDate: null,
      acreCertified: null,
      supervisorAcreCertified: null,
    };
    const result = run({ staff: [unknown], orgHasAcreCoverage: null });
    for (const id of [
      "REQ-1.8.4",
      "REQ-1.8.5",
      "REQ-1.8.7",
      "REQ-1.8.8",
      "REQ-30.6.b",
      "REQ-30.6.c",
    ]) {
      const row = ruleFor(result, "unknown-1", id);
      assert.equal(row.applicability, "unanswered", id);
      assert.equal(row.parentComplete, false, id);
      assert.ok(
        row.issues.some((i) => i.kind === "missing_information"),
        id,
      );
      assert.equal(
        row.issues.some((i) => i.message.includes("auto N/A") || i.message.includes("never auto")),
        true,
        id,
      );
    }
  });
});

describe("ALL groups are incomplete if one member is missing", () => {
  it("orientation is one parent task; missing W leaves ALL incomplete", () => {
    const letters = REQ_1_8_4_ORIENTATION.group.members.map((m) => m.id);
    const withoutW = letters.filter((id) => id !== "topic-W");
    const dsp = staff({ staffId: "dsp-1" });
    const result = run({
      staff: [dsp],
      rules: [REQ_1_8_4_ORIENTATION],
      evidence: topicEvidence("dsp-1", "REQ-1.8.4", withoutW),
    });
    const row = ruleFor(result, "dsp-1", "REQ-1.8.4");
    assert.equal(row.parentTaskCount, 1);
    assert.equal(row.parentComplete, false);
    assert.ok(row.issues.some((i) => i.kind === "group_incomplete"));
    const w = row.members.find((m) => m.memberId === "topic-W");
    assert.equal(w?.complete, false);
  });

  it("orientation ALL completes only when A–W are all present", () => {
    const dsp = staff({ staffId: "dsp-1" });
    const all = REQ_1_8_4_ORIENTATION.group.members.map((m) => m.id);
    const result = run({
      staff: [dsp],
      rules: [REQ_1_8_4_ORIENTATION],
      evidence: topicEvidence("dsp-1", "REQ-1.8.4", all),
    });
    assert.equal(ruleFor(result, "dsp-1", "REQ-1.8.4").parentComplete, true);
  });

  it("1.8.5 ALL fails when CPR is missing; FA and CPR expiries are distinct; PCT has no invented expiry", () => {
    const dsp = staff({ staffId: "dsp-1" });
    const base: SyntheticEvidence[] = [
      {
        staffId: "dsp-1",
        ruleId: "REQ-1.8.5",
        memberId: "first_aid",
        completed: true,
        certExpiresOn: "2027-01-15",
      },
      {
        staffId: "dsp-1",
        ruleId: "REQ-1.8.5",
        memberId: "person_centered",
        completed: true,
        completedOn: "2024-09-01",
      },
    ];
    const missingCpr = run({
      staff: [dsp],
      rules: [REQ_1_8_5_FA_CPR_PCT],
      evidence: base,
    });
    assert.equal(ruleFor(missingCpr, "dsp-1", "REQ-1.8.5").parentComplete, false);

    const both = run({
      staff: [dsp],
      rules: [REQ_1_8_5_FA_CPR_PCT],
      evidence: [
        ...base,
        {
          staffId: "dsp-1",
          ruleId: "REQ-1.8.5",
          memberId: "cpr",
          completed: true,
          certExpiresOn: "2027-06-01",
        },
      ],
    });
    const ok = ruleFor(both, "dsp-1", "REQ-1.8.5");
    assert.equal(ok.parentComplete, true);
    const fa = ok.members.find((m) => m.memberId === "first_aid");
    const cpr = ok.members.find((m) => m.memberId === "cpr");
    const pct = ok.members.find((m) => m.memberId === "person_centered");
    assert.equal(fa?.dueAt?.slice(0, 10), "2027-01-15");
    assert.equal(cpr?.dueAt?.slice(0, 10), "2027-06-01");
    assert.equal(pct?.dueAt, null);

    const expiredFa = run({
      staff: [dsp],
      rules: [REQ_1_8_5_FA_CPR_PCT],
      evidence: [
        {
          staffId: "dsp-1",
          ruleId: "REQ-1.8.5",
          memberId: "first_aid",
          completed: true,
          certExpiresOn: "2026-01-01",
        },
        {
          staffId: "dsp-1",
          ruleId: "REQ-1.8.5",
          memberId: "cpr",
          completed: true,
          certExpiresOn: "2027-06-01",
        },
        {
          staffId: "dsp-1",
          ruleId: "REQ-1.8.5",
          memberId: "person_centered",
          completed: true,
        },
      ],
    });
    const expired = ruleFor(expiredFa, "dsp-1", "REQ-1.8.5");
    assert.equal(expired.parentComplete, false);
    assert.ok(expired.issues.some((i) => i.kind === "expired_certificate"));
  });
});

describe("12h employment-year anniversary does not reset on completion", () => {
  it("early completion leaves the hire-anniversary due in place", () => {
    const hire = "2024-07-01";
    const window = employmentYearDue({ hireDate: hire, startYear: 2, now: NOW });
    assert.equal(window.dueAt?.slice(0, 10), "2027-07-01");
    assert.equal(window.windowStart, "2026-07-01");

    const fromPriorYear = new Date("2025-08-01T00:00:00.000Z");
    const shiftedIfWrong = new Date(
      Date.UTC(
        fromPriorYear.getUTCFullYear() + 1,
        fromPriorYear.getUTCMonth(),
        fromPriorYear.getUTCDate(),
      ),
    );
    assert.notEqual(window.dueAt?.slice(0, 10), shiftedIfWrong.toISOString().slice(0, 10));

    const dsp = staff({ staffId: "dsp-1", hireDate: hire });
    const priorYear = run({
      staff: [dsp],
      rules: [REQ_1_8_7_CE12],
      evidence: [
        {
          staffId: "dsp-1",
          ruleId: "REQ-1.8.7",
          memberId: "hours-12",
          completed: true,
          completedOn: "2025-08-01",
          hours: 12,
        },
      ],
    });
    const prior = ruleFor(priorYear, "dsp-1", "REQ-1.8.7");
    assert.equal(prior.dueAt?.slice(0, 10), "2027-07-01");
    assert.equal(prior.parentComplete, false);

    const earlyInWindow = run({
      staff: [dsp],
      rules: [REQ_1_8_7_CE12],
      evidence: [
        {
          staffId: "dsp-1",
          ruleId: "REQ-1.8.7",
          memberId: "hours-12",
          completed: true,
          completedOn: "2026-08-01",
          hours: 12,
        },
      ],
    });
    const row = ruleFor(earlyInWindow, "dsp-1", "REQ-1.8.7");
    assert.equal(row.dueAt?.slice(0, 10), "2027-07-01");
    assert.notEqual(row.dueAt?.slice(0, 10), "2027-08-01");
    assert.equal(row.parentComplete, true);
  });
});

describe("SEI 30.6(b) BOTH vs 30.6(c) ANY", () => {
  it("30.6(b) needs agency coverage AND supervisor; 30.6(c) ANY is independent", () => {
    const sei = staff({
      staffId: "sei-1",
      assignedServiceCodes: ["SEI"],
      assignedClientIds: ["client-sei"],
      supervisorAcreCertified: true,
    });
    const both = run({
      staff: [sei],
      rules: [REQ_SEI_30_6_B, REQ_SEI_30_6_C],
      orgHasAcreCoverage: true,
      evidence: [
        {
          staffId: "sei-1",
          ruleId: "REQ-30.6.c",
          memberId: "course-usu-workplace",
          completed: true,
          courseName: "USU Workplace Supports",
        },
      ],
    });
    assert.equal(ruleFor(both, "sei-1", "REQ-30.6.b").parentComplete, true);
    assert.equal(ruleFor(both, "sei-1", "REQ-30.6.c").parentComplete, true);

    const noSupervisor = staff({
      staffId: "sei-2",
      assignedServiceCodes: ["SEI"],
      assignedClientIds: ["client-sei"],
      supervisorAcreCertified: false,
    });
    const split = run({
      staff: [noSupervisor],
      rules: [REQ_SEI_30_6_B, REQ_SEI_30_6_C],
      orgHasAcreCoverage: true,
      evidence: [
        {
          staffId: "sei-2",
          ruleId: "REQ-30.6.c",
          memberId: "course-acre",
          completed: true,
          courseName: "ACRE",
        },
      ],
    });
    const b = ruleFor(split, "sei-2", "REQ-30.6.b");
    const c = ruleFor(split, "sei-2", "REQ-30.6.c");
    assert.equal(b.parentComplete, false);
    assert.ok(b.issues.some((i) => i.kind === "group_incomplete"));
    assert.equal(c.parentComplete, true);

    const unknownCoverage = run({
      staff: [sei],
      rules: [REQ_SEI_30_6_B],
      orgHasAcreCoverage: null,
    });
    const unknown = ruleFor(unknownCoverage, "sei-1", "REQ-30.6.b");
    assert.equal(unknown.parentComplete, false);
    assert.ok(unknown.issues.some((i) => i.kind === "missing_information"));
  });
});
