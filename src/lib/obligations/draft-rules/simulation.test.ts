import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { EMPTY_ORG_FACTS, type OrgFacts } from "../applicability.ts";
import { UNKNOWN_STAFF_DUTY_FACTS, type StaffDutyFacts } from "../duty-applicability.ts";
import {
  CORE_RULE_LOGIC_SLICE,
  PERIODIC_MONTHLY_CODES,
  REQ_1_8_4_ORIENTATION,
  REQ_1_8_5_FA_CPR_PCT,
  REQ_1_8_6_BEHAVIOR,
  REQ_1_8_7_CE12,
  REQ_1_8_8_ABI,
  REQ_1_25_PERIODIC,
  REQ_30_5_SEI_BENEFITS,
  REQ_30_6_A_USOR,
  REQ_32_5_CAREGIVER,
  REQ_33_5_SJD,
  REQ_SEI_30_6_B,
  REQ_SEI_30_6_C,
  STAGE2_RULE_IDS,
  STAGE3_RULE_IDS,
  USOR_EXISTING_PROVIDER_DEADLINE,
  USOR_PROOF_DESTINATION_AS_PUBLISHED,
} from "./fixtures.ts";
import { canActivate, canPublish } from "./publication.ts";
import {
  countQualifiedDesignatedBenefits,
  employmentYearDue,
  simulateDraftRules,
  usorCohortDue,
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
    isBenefitsDesignated: false,
    benefitsQualified: false,
    behaviorRiskNewlyArisen: false,
    sjdPerformsDiscovery: false,
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
    assert.equal(result.rejectedClaims, false);
    assert.deepEqual(result.notes, []);
    assert.deepEqual(result.claims, []);
    for (const rule of CORE_RULE_LOGIC_SLICE) {
      assert.equal(canActivate(rule), false);
    }
  });

  it("simulation module has no supabase or instance inserts", () => {
    for (const file of [
      "./simulation.ts",
      "./notes.ts",
      "./billing-restrictions.ts",
      "./evidence-reuse.ts",
      "./pba-reviews.ts",
      "./reminders.ts",
      "./offboarding.ts",
      "./audit-export.ts",
    ]) {
      const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      assert.doesNotMatch(src, /supabase/, file);
      assert.doesNotMatch(src, /company_obligation_instances/, file);
      assert.doesNotMatch(src, /\.from\(/, file);
      assert.doesNotMatch(src, /insert\(/, file);
    }
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
      ...STAGE2_RULE_IDS,
      ...STAGE3_RULE_IDS,
      "REQ-15.3",
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

describe("REQ-1.8.6 behavior certification nested ANY routes", () => {
  it("applies on risk assignment; official named route completes; alternative needs written DSPD approval", () => {
    const assigned = staff({
      staffId: "beh-1",
      hasBehaviorCaseload: true,
      requiresDeescalation: true,
      behaviorRiskNewlyArisen: false,
    });
    const none = staff({
      staffId: "safe-1",
      hasBehaviorCaseload: false,
      requiresDeescalation: false,
    });
    const official = run({
      staff: [assigned, none],
      rules: [REQ_1_8_6_BEHAVIOR],
      evidence: [
        {
          staffId: "beh-1",
          ruleId: "REQ-1.8.6",
          memberId: "route-soar",
          completed: true,
          isOfficialProgram: true,
          courseName: "SOAR",
          selectedRouteId: "route-soar",
        },
      ],
    });
    const ok = ruleFor(official, "beh-1", "REQ-1.8.6");
    assert.equal(ok.applicability, "applies");
    assert.equal(ok.parentComplete, true);
    assert.equal(ok.dueAt?.slice(0, 10), "2024-12-28");
    assert.equal(ruleFor(official, "safe-1", "REQ-1.8.6").applicability, "does_not_apply");

    const altMissingApproval = run({
      staff: [assigned],
      rules: [REQ_1_8_6_BEHAVIOR],
      evidence: [
        {
          staffId: "beh-1",
          ruleId: "REQ-1.8.6",
          memberId: "route-alternative",
          completed: true,
          isOfficialProgram: true,
          courseName: "Other program",
          selectedRouteId: "route-alternative",
          writtenDspdApproval: false,
        },
      ],
    });
    const alt = ruleFor(altMissingApproval, "beh-1", "REQ-1.8.6");
    assert.equal(alt.parentComplete, false);
    assert.ok(alt.issues.some((i) => /written DSPD approval/i.test(i.message)));

    const newRisk = run({
      staff: [{ ...assigned, behaviorRiskNewlyArisen: true }],
      rules: [REQ_1_8_6_BEHAVIOR],
      evidence: [
        {
          staffId: "beh-1",
          ruleId: "REQ-1.8.6",
          memberId: "route-soar",
          completed: true,
          isOfficialProgram: true,
          courseName: "SOAR",
          selectedRouteId: "route-soar",
        },
      ],
    });
    const review = ruleFor(newRisk, "beh-1", "REQ-1.8.6");
    assert.equal(review.parentComplete, false);
    assert.ok(review.issues.some((i) => /newly arising risk requires review/i.test(i.message)));
  });
});

describe("REQ-30.5 designated benefits COUNT>=1", () => {
  it("does not apply to every SEI or office staff; COUNT needs one qualified designated person", () => {
    const designated = staff({
      staffId: "des-1",
      assignedServiceCodes: ["SEI"],
      assignedClientIds: ["client-sei"],
      isBenefitsDesignated: true,
      benefitsQualified: true,
    });
    const seiOther = staff({
      staffId: "sei-other",
      assignedServiceCodes: ["SEI"],
      assignedClientIds: ["client-sei"],
      isBenefitsDesignated: false,
    });
    const office = staff({
      staffId: "office-1",
      role: "admin",
      assignedClientIds: [],
      assignedServiceCodes: [],
      isBenefitsDesignated: false,
    });
    const result = run({
      staff: [designated, seiOther, office],
      rules: [REQ_30_5_SEI_BENEFITS],
    });
    assert.equal(ruleFor(result, "des-1", "REQ-30.5").applicability, "applies");
    assert.equal(ruleFor(result, "des-1", "REQ-30.5").parentComplete, true);
    assert.equal(ruleFor(result, "sei-other", "REQ-30.5").applicability, "does_not_apply");
    assert.equal(ruleFor(result, "office-1", "REQ-30.5").applicability, "does_not_apply");
    assert.equal(countQualifiedDesignatedBenefits([designated, seiOther, office]).satisfies, true);

    const none = countQualifiedDesignatedBenefits([seiOther, office]);
    assert.equal(none.satisfies, false);
    assert.equal(none.qualified, 0);
  });
});

describe("REQ-30.6.a USOR cohort branches", () => {
  it("uses 2027-01-31 before cutover and award+6 months on/after; unknown award is missing-information", () => {
    const existing = usorCohortDue({
      awardDate: "2026-06-30",
      cutover: "2026-07-01",
      existingDeadline: USOR_EXISTING_PROVIDER_DEADLINE,
      awardPlusMonths: 6,
    });
    assert.equal(existing.cohort, "existing");
    assert.equal(existing.dueAt?.slice(0, 10), "2027-01-31");

    const next = usorCohortDue({
      awardDate: "2026-07-01",
      cutover: "2026-07-01",
      existingDeadline: USOR_EXISTING_PROVIDER_DEADLINE,
      awardPlusMonths: 6,
    });
    assert.equal(next.cohort, "new_award");
    assert.equal(next.dueAt?.slice(0, 10), "2027-01-01");

    assert.equal(
      usorCohortDue({
        awardDate: null,
        cutover: "2026-07-01",
        existingDeadline: USOR_EXISTING_PROVIDER_DEADLINE,
        awardPlusMonths: 6,
      }).cohort,
      null,
    );

    const admin = staff({ staffId: "admin-1", role: "admin" });
    const unknownAward = run({
      staff: [admin],
      rules: [REQ_30_6_A_USOR],
      seiAwardDate: null,
    });
    const unanswered = ruleFor(unknownAward, "admin-1", "REQ-30.6.a");
    assert.equal(unanswered.applicability, "unanswered");
    assert.ok(unanswered.issues.some((i) => i.kind === "missing_information"));

    const proof = run({
      staff: [admin],
      rules: [REQ_30_6_A_USOR],
      seiAwardDate: "2025-01-01",
      usorOfficialProofOnFile: true,
    });
    const ok = ruleFor(proof, "admin-1", "REQ-30.6.a");
    assert.equal(ok.applicability, "applies");
    assert.equal(ok.parentComplete, true);
    assert.equal(ok.dueAt?.slice(0, 10), "2027-01-31");
    assert.equal(canPublish(REQ_30_6_A_USOR), false);
    assert.match(USOR_PROOF_DESTINATION_AS_PUBLISHED, /osrprovider@utah\.gov/);
  });
});

describe("REQ-32.5 caregiver training CMP/CMS only", () => {
  it("SLN alone does not trigger; official EXTERNAL course required", () => {
    const cmp = staff({
      staffId: "cmp-1",
      assignedServiceCodes: ["CMP"],
      assignedClientIds: ["client-cmp"],
    });
    const sln = staff({
      staffId: "sln-1",
      assignedServiceCodes: ["SLN"],
      assignedClientIds: ["client-sln"],
    });
    const result = run({
      staff: [cmp, sln],
      rules: [REQ_32_5_CAREGIVER],
      evidence: [
        {
          staffId: "cmp-1",
          ruleId: "REQ-32.5",
          memberId: "official-dspd-course",
          completed: true,
          isOfficialProgram: true,
          courseName: "DSPD New Caregiver Compensation",
          route: "EXTERNAL",
        },
      ],
    });
    assert.equal(ruleFor(result, "cmp-1", "REQ-32.5").applicability, "applies");
    assert.equal(ruleFor(result, "cmp-1", "REQ-32.5").parentComplete, true);
    assert.equal(ruleFor(result, "sln-1", "REQ-32.5").applicability, "does_not_apply");
    assert.deepEqual(REQ_32_5_CAREGIVER.completionRoutes, ["EXTERNAL"]);
  });
});

describe("REQ-33.5.b-c SJD ACRE + Discovery CE", () => {
  it("ACRE hire+60 with supervision pending; CE only if Discovery; no SEI alternatives", () => {
    const sjd = staff({
      staffId: "sjd-1",
      hireDate: "2026-08-01",
      assignedServiceCodes: ["SJD"],
      assignedClientIds: ["client-sjd"],
      supervisorAcreCertified: true,
      acreCertified: false,
      sjdPerformsDiscovery: false,
    });
    const pending = run({
      staff: [sjd],
      rules: [REQ_33_5_SJD],
    });
    const row = ruleFor(pending, "sjd-1", "REQ-33.5.b-c");
    assert.equal(row.applicability, "applies");
    assert.equal(row.parentComplete, false);
    assert.equal(row.members.find((m) => m.memberId === "sjd-supervision-pending")?.complete, true);
    assert.equal(
      row.members.find((m) => m.memberId === "sjd-customized-employment")?.applicable,
      false,
    );

    const discovery = run({
      staff: [{ ...sjd, sjdPerformsDiscovery: true, acreCertified: true }],
      rules: [REQ_33_5_SJD],
      evidence: [
        {
          staffId: "sjd-1",
          ruleId: "REQ-33.5.b-c",
          memberId: "sjd-acre",
          completed: true,
          isOfficialProgram: true,
          courseName: "ACRE",
        },
        {
          staffId: "sjd-1",
          ruleId: "REQ-33.5.b-c",
          memberId: "sjd-customized-employment",
          completed: true,
          isOfficialProgram: true,
          courseName: "USU Customized Employment",
        },
      ],
    });
    assert.equal(ruleFor(discovery, "sjd-1", "REQ-33.5.b-c").parentComplete, true);

    const labels = REQ_33_5_SJD.group.members.map((m) => m.label).join(" ");
    assert.doesNotMatch(labels, /Workplace Supports|Effective Job Coach/);
    assert.equal(canPublish(REQ_33_5_SJD), false);
    assert.ok(REQ_33_5_SJD.releaseGaps.some((g) => /SJB/.test(g)));
  });
});

describe("REQ-1.25 periodic reports monthly substitutes", () => {
  it("one applicable report per code — never monthly+quarterly on the same code", () => {
    const hhs = staff({
      staffId: "hhs-1",
      assignedServiceCodes: ["HHS"],
    });
    const sei = staff({
      staffId: "sei-1",
      assignedServiceCodes: ["SEI"],
    });
    const mixed = staff({
      staffId: "mix-1",
      assignedServiceCodes: ["CMP", "SLN"],
    });
    const office = staff({
      staffId: "office-1",
      role: "admin",
      assignedClientIds: [],
      assignedServiceCodes: [],
    });
    const evidence: SyntheticEvidence[] = [
      {
        staffId: "hhs-1",
        ruleId: "REQ-1.25",
        memberId: "quarterly-report",
        completed: true,
      },
      {
        staffId: "sei-1",
        ruleId: "REQ-1.25",
        memberId: "monthly-report",
        completed: true,
      },
      {
        staffId: "mix-1",
        ruleId: "REQ-1.25",
        memberId: "monthly-report",
        completed: true,
      },
      {
        staffId: "mix-1",
        ruleId: "REQ-1.25",
        memberId: "quarterly-report",
        completed: true,
      },
    ];
    const result = run({
      staff: [hhs, sei, mixed, office],
      rules: [REQ_1_25_PERIODIC],
      evidence,
    });
    const h = ruleFor(result, "hhs-1", "REQ-1.25");
    assert.equal(h.members.find((m) => m.memberId === "quarterly-report")?.applicable, true);
    assert.equal(h.members.find((m) => m.memberId === "monthly-report")?.applicable, false);
    assert.equal(h.parentComplete, true);

    const s = ruleFor(result, "sei-1", "REQ-1.25");
    assert.equal(s.members.find((m) => m.memberId === "monthly-report")?.applicable, true);
    assert.equal(s.members.find((m) => m.memberId === "quarterly-report")?.applicable, false);
    assert.equal(s.parentComplete, true);

    const mix = ruleFor(result, "mix-1", "REQ-1.25");
    assert.equal(mix.members.find((m) => m.memberId === "monthly-report")?.applicable, true);
    assert.equal(mix.members.find((m) => m.memberId === "quarterly-report")?.applicable, true);
    assert.equal(mix.parentComplete, true);

    assert.equal(ruleFor(result, "office-1", "REQ-1.25").applicability, "does_not_apply");
    assert.ok(PERIODIC_MONTHLY_CODES.includes("PN1"));
  });
});

describe("completion routes vs equivalency", () => {
  it("generic quiz cannot replace official DSPD course or CPR credential", () => {
    for (const rule of CORE_RULE_LOGIC_SLICE) {
      assert.ok(rule.completionRoutes.length > 0, rule.id);
      assert.equal(rule.evidence.automaticEquivalency, false, rule.id);
      assert.ok(rule.evidence.defaultHandlingLabel.length > 0, rule.id);
    }

    const dsp = staff({ staffId: "dsp-1" });
    const quizCpr = run({
      staff: [dsp],
      rules: [REQ_1_8_5_FA_CPR_PCT],
      evidence: [
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
          memberId: "cpr",
          completed: true,
          isGenericQuiz: true,
          courseName: "Generic quiz",
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
    const cpr = ruleFor(quizCpr, "dsp-1", "REQ-1.8.5");
    assert.equal(cpr.parentComplete, false);
    assert.ok(cpr.issues.some((i) => /generic quiz cannot replace/i.test(i.message)));

    const cmp = staff({
      staffId: "cmp-1",
      assignedServiceCodes: ["CMP"],
      assignedClientIds: ["client-cmp"],
    });
    const quizCourse = run({
      staff: [cmp],
      rules: [REQ_32_5_CAREGIVER],
      evidence: [
        {
          staffId: "cmp-1",
          ruleId: "REQ-32.5",
          memberId: "official-dspd-course",
          completed: true,
          isGenericQuiz: true,
          courseName: "Generic quiz",
        },
      ],
    });
    const course = ruleFor(quizCourse, "cmp-1", "REQ-32.5");
    assert.equal(course.parentComplete, false);
    assert.ok(course.issues.some((i) => /generic quiz cannot replace/i.test(i.message)));
  });
});
