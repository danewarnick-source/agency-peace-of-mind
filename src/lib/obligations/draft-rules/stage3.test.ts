import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_ORG_FACTS, type OrgFacts } from "../applicability.ts";
import { type StaffDutyFacts } from "../duty-applicability.ts";
import { evaluateClaimRestrictions, encodedOverlapException } from "./billing-restrictions.ts";
import {
  evidenceChangesCompliance,
  lifecycleAfterUpload,
  matchReusableEvidence,
  type ReusableEvidenceRecord,
} from "./evidence-reuse.ts";
import {
  CORE_RULE_LOGIC_SLICE,
  REQ_1_8_4_ORIENTATION,
  REQ_1_8_5_CPR_CURRENT,
  REQ_1_8_5_FA_CPR_PCT,
  REQ_1_10_7_NOTES,
  REQ_1_10_7_TIMESHEET,
  REQ_1_10_SIGNATURE,
  REQ_1_12_EVV,
  REQ_1_25_PERIODIC,
  REQ_ART2_BILLING,
} from "./fixtures.ts";
import {
  GENERAL_NOTE_TEMPLATE,
  HHS_NOTE_TEMPLATE,
  evaluateNoteCompleteness,
  selectNoteTemplate,
} from "./notes.ts";
import { canActivate } from "./publication.ts";
import {
  simulateDraftRules,
  type SimulationInput,
  type SyntheticEvidence,
  type SyntheticStaff,
} from "./simulation.ts";
import { EVIDENCE_LIFECYCLES, STAGE1_ACTIVATION_LOCKED } from "./types.ts";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const ORG = "org-tns";
const OTHER_ORG = "org-other";
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
    organizationId: ORG,
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

const GENERAL_FIELDS = {
  person: "Alex Client",
  date: "2026-09-12",
  service_code: "SLN",
  staff: "Dana DSP",
  summary_note: "Supported grocery shopping and documented the Person's choices.",
  start_end_time: "09:00–11:00",
};

describe("Stage 3 fixtures stay draft and activation-locked", () => {
  it("keeps every Stage 3 rule draft / not_published / canActivate false", () => {
    for (const id of [
      "REQ-1.10.7",
      "REQ-1.10.7-timesheet",
      "REQ-1.12",
      "REQ-1.10-signature",
      "REQ-ART2",
      "REQ-1.8.5-cpr-current",
    ]) {
      const rule = CORE_RULE_LOGIC_SLICE.find((r) => r.id === id);
      assert.ok(rule, id);
      assert.equal(rule.lifecycle, "draft");
      assert.equal(rule.publication, "not_published");
      assert.equal(canActivate(rule), false);
    }
    assert.equal(STAGE1_ACTIVATION_LOCKED, true);
  });
});

describe("REQ-1.10(7) notes / service articles", () => {
  it("selects general vs HHS override by actual service code and service date", () => {
    assert.equal(selectNoteTemplate("SLN", "2026-09-12")?.id, GENERAL_NOTE_TEMPLATE.id);
    assert.equal(selectNoteTemplate("DSI", "2026-09-12")?.id, GENERAL_NOTE_TEMPLATE.id);
    assert.equal(selectNoteTemplate("HHS", "2026-09-12")?.id, HHS_NOTE_TEMPLATE.id);
    assert.equal(selectNoteTemplate("SLN", "2026-06-01"), null);
  });

  it("wrong code uses the wrong template; missing required field is incomplete", () => {
    const sln = staff({ staffId: "dsp-1", assignedServiceCodes: ["SLN"] });
    const result = run({
      staff: [sln],
      rules: [REQ_1_10_7_NOTES],
      notes: [
        {
          noteId: "n-wrong",
          organizationId: ORG,
          staffId: "dsp-1",
          clientId: "client-a",
          serviceCode: "SLN",
          serviceDate: "2026-09-12",
          submittedTemplateId: HHS_NOTE_TEMPLATE.id,
          fields: {
            person: "Alex",
            date: "2026-09-12",
            attendance: "Present",
            daily_note: "Host-home summary",
            overnight_confirmation: true,
          },
        },
        {
          noteId: "n-missing",
          organizationId: ORG,
          staffId: "dsp-1",
          clientId: "client-a",
          serviceCode: "SLN",
          serviceDate: "2026-09-12",
          submittedTemplateId: GENERAL_NOTE_TEMPLATE.id,
          fields: { person: "Alex", date: "2026-09-12", service_code: "SLN", staff: "Dana" },
        },
      ],
    });
    const wrong = result.notes.find((n) => n.noteId === "n-wrong");
    assert.equal(wrong?.selectedTemplateId, GENERAL_NOTE_TEMPLATE.id);
    assert.equal(wrong?.templateMatch, false);
    assert.equal(wrong?.noteComplete, false);
    assert.ok(wrong?.issues.some((i) => i.kind === "wrong_template"));

    const missing = result.notes.find((n) => n.noteId === "n-missing");
    assert.equal(missing?.noteComplete, false);
    assert.ok(missing?.missingFieldIds.includes("summary_note"));
    assert.ok(missing?.issues.some((i) => i.kind === "note_incomplete"));
  });

  it("a complete five-field note does not absorb EVV, timesheet, signature, or reporting", () => {
    const sln = staff({ staffId: "dsp-1", assignedServiceCodes: ["SLN"] });
    const noteEvidence: SyntheticEvidence[] = REQ_1_10_7_NOTES.group.members
      .filter((m) => m.id !== "note-start-end" || true)
      .map((m) => ({
        staffId: "dsp-1",
        ruleId: "REQ-1.10.7",
        memberId: m.id,
        completed: true,
      }));
    const result = run({
      staff: [sln],
      rules: [
        REQ_1_10_7_NOTES,
        REQ_1_10_7_TIMESHEET,
        REQ_1_12_EVV,
        REQ_1_10_SIGNATURE,
        REQ_1_25_PERIODIC,
      ],
      evidence: noteEvidence,
      notes: [
        {
          noteId: "n-ok",
          organizationId: ORG,
          staffId: "dsp-1",
          clientId: "client-a",
          serviceCode: "SLN",
          serviceDate: "2026-09-12",
          submittedTemplateId: GENERAL_NOTE_TEMPLATE.id,
          fields: GENERAL_FIELDS,
          evvSatisfied: false,
          timesheetSatisfied: false,
          signatureSatisfied: false,
          reportingSatisfied: false,
        },
      ],
    });
    const note = result.notes[0];
    assert.equal(note?.noteComplete, true);
    assert.equal(note?.independent.evv, "separate_incomplete");
    assert.equal(note?.independent.payroll_timesheet, "separate_incomplete");
    assert.equal(note?.independent.signature, "separate_incomplete");
    assert.equal(note?.independent.reporting, "separate_incomplete");
    assert.equal(ruleFor(result, "dsp-1", "REQ-1.10.7").parentComplete, true);
    assert.equal(ruleFor(result, "dsp-1", "REQ-1.10.7-timesheet").parentComplete, false);
    assert.equal(ruleFor(result, "dsp-1", "REQ-1.12").parentComplete, false);
    assert.equal(ruleFor(result, "dsp-1", "REQ-1.10-signature").parentComplete, false);
    assert.equal(ruleFor(result, "dsp-1", "REQ-1.25").parentComplete, false);
  });

  it("HHS override requires daily note + overnight; general fields do not substitute", () => {
    const evaled = evaluateNoteCompleteness({
      serviceCode: "HHS",
      serviceDate: "2026-09-12",
      submittedTemplateId: GENERAL_NOTE_TEMPLATE.id,
      fields: GENERAL_FIELDS,
    });
    assert.equal("missingTemplate" in evaled, false);
    if ("missingTemplate" in evaled) return;
    assert.equal(evaled.templateId, HHS_NOTE_TEMPLATE.id);
    assert.equal(evaled.wrongTemplate, true);
    assert.equal(evaled.complete, false);
  });
});

describe("Article 2 general billing restrictions", () => {
  it("raises review holds with claim-specific explanation + resolution link; never rejects when locked", () => {
    const dsp = staff({ staffId: "dsp-1" });
    const result = run({
      staff: [dsp],
      rules: [REQ_ART2_BILLING],
      claims: [
        {
          claimId: "c-no-auth",
          organizationId: ORG,
          clientId: "client-a",
          staffId: "dsp-1",
          serviceCode: "SLN",
          serviceDate: "2026-09-12",
          authorization: { authorizationPending: true },
          hospitalized: false,
          incarcerated: false,
        },
      ],
    });
    assert.equal(result.rejectedClaims, false);
    assert.equal(result.createdClaimBlocks, false);
    const claim = result.claims[0];
    assert.ok(claim);
    assert.equal(claim.rejected, false);
    assert.equal(claim.createdClaimBlock, false);
    assert.equal(claim.eligibility, "review_hold");
    const authHold = claim.holds.find((h) => h.kind === "authorization");
    assert.ok(authHold);
    assert.equal(authHold.lane, "billing");
    assert.ok(authHold.clear.to);
    assert.ok(authHold.reason.length > 0);
    assert.equal(authHold.requirementId, "REQ-ART2");
    assert.equal(canActivate(REQ_ART2_BILLING), false);
  });

  it("does not invent a denial for unencoded overlap; encoded exceptions are not conflicts", () => {
    const backToBack = encodedOverlapException({
      otherServiceCode: "DSI",
      thisStart: "2026-09-12T12:00:00.000Z",
      thisEnd: "2026-09-12T16:00:00.000Z",
      otherStart: "2026-09-12T16:00:00.000Z",
      otherEnd: "2026-09-12T18:00:00.000Z",
      sameClient: true,
      sameStaff: true,
    });
    assert.equal(backToBack, "back_to_back");

    const segment = encodedOverlapException({
      otherServiceCode: "DSI",
      thisStart: "2026-09-12T08:00:00.000Z",
      thisEnd: "2026-09-12T20:00:00.000Z",
      otherStart: "2026-09-12T10:00:00.000Z",
      otherEnd: "2026-09-12T12:00:00.000Z",
      parentShiftId: "parent-1",
      otherParentShiftId: "parent-1",
      sameClient: true,
      sameStaff: true,
    });
    assert.equal(segment, "segment_within_parent");

    const unencoded = evaluateClaimRestrictions({
      claimId: "c-overlap",
      organizationId: ORG,
      clientId: "client-a",
      staffId: "dsp-1",
      serviceCode: "SLN",
      serviceDate: "2026-09-12",
      authorization: { serviceStartDate: "2026-07-01", serviceEndDate: "2027-06-30" },
      hospitalized: false,
      incarcerated: false,
      overlaps: [
        {
          otherServiceCode: "HHS",
          thisStart: "2026-09-12T08:00:00.000Z",
          thisEnd: "2026-09-12T16:00:00.000Z",
          otherStart: "2026-09-12T10:00:00.000Z",
          otherEnd: "2026-09-12T14:00:00.000Z",
          sameClient: true,
          sameStaff: false,
        },
      ],
    });
    assert.equal(unencoded.rejected, false);
    assert.equal(unencoded.eligibility, "missing_information");
    assert.ok(unencoded.holds.some((h) => h.kind === "overlapping_services"));
    assert.ok(unencoded.holds.some((h) => /not automatically prohibited/i.test(h.reason)));
    assert.equal(
      unencoded.holds.some((h) => /denied|reject/i.test(h.reason) && !/never/.test(h.reason)),
      false,
    );
  });

  it("unknown hospitalization / incarceration is missing-information, never an invented denial", () => {
    const claim = evaluateClaimRestrictions({
      claimId: "c-unknown",
      organizationId: ORG,
      clientId: "client-a",
      staffId: "dsp-1",
      serviceCode: "SLN",
      serviceDate: "2026-09-12",
      authorization: { serviceStartDate: "2026-07-01", serviceEndDate: "2027-06-30" },
      hospitalized: null,
      incarcerated: null,
    });
    assert.equal(claim.eligibility, "missing_information");
    assert.ok(
      claim.holds.some((h) => h.kind === "hospitalization" && h.outcome === "missing_information"),
    );
    assert.ok(
      claim.holds.some((h) => h.kind === "incarceration" && h.outcome === "missing_information"),
    );
    assert.equal(claim.rejected, false);
  });
});

describe("evidence reuse", () => {
  it("a certificate with insufficient topic coverage does not complete orientation", () => {
    const dsp = staff({ staffId: "dsp-1" });
    const partial: ReusableEvidenceRecord = {
      id: "ev-orient-partial",
      organizationId: ORG,
      subjectId: "dsp-1",
      issuer: "DSPD",
      scope: "orientation",
      coverage: ["A", "B", "C"],
      issuedOn: "2026-07-15",
      expiresOn: null,
      version: "1",
      lifecycle: "accepted",
    };
    const result = run({
      staff: [dsp],
      rules: [REQ_1_8_4_ORIENTATION],
      reusableEvidence: [partial],
    });
    const row = ruleFor(result, "dsp-1", "REQ-1.8.4");
    assert.equal(row.parentComplete, false);
    const topicA = row.members.find((m) => m.memberId === "topic-A");
    const topicW = row.members.find((m) => m.memberId === "topic-W");
    assert.equal(topicA?.complete, true);
    assert.equal(topicW?.complete, false);
    assert.ok(row.issues.some((i) => i.kind === "group_incomplete"));
  });

  it("one accepted CPR covers multiple CPR-linked reqs for the same subject; no cross-tenant reuse", () => {
    const dsp = staff({ staffId: "dsp-1" });
    const cpr: ReusableEvidenceRecord = {
      id: "ev-cpr",
      organizationId: ORG,
      subjectId: "dsp-1",
      issuer: "Red Cross",
      scope: "cpr",
      coverage: ["cpr"],
      issuedOn: "2026-01-01",
      expiresOn: "2027-06-01",
      version: "card-1",
      lifecycle: "accepted",
    };
    const faPct: SyntheticEvidence[] = [
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
    const sameTenant = run({
      staff: [dsp],
      rules: [REQ_1_8_5_FA_CPR_PCT, REQ_1_8_5_CPR_CURRENT],
      evidence: faPct,
      reusableEvidence: [cpr],
      organizationId: ORG,
    });
    assert.equal(ruleFor(sameTenant, "dsp-1", "REQ-1.8.5").parentComplete, true);
    assert.equal(ruleFor(sameTenant, "dsp-1", "REQ-1.8.5-cpr-current").parentComplete, true);

    const stolen = matchReusableEvidence(
      { ...cpr, organizationId: OTHER_ORG },
      {
        organizationId: ORG,
        subjectId: "dsp-1",
        asOf: "2026-09-12",
        requirementId: "REQ-1.8.5",
        memberId: "cpr",
        match: { scope: "cpr" },
      },
    );
    assert.equal(stolen.matched, false);
    assert.match(stolen.reason, /cross-tenant/i);

    const otherSubject = run({
      staff: [staff({ staffId: "dsp-2" })],
      rules: [REQ_1_8_5_CPR_CURRENT],
      reusableEvidence: [cpr],
      organizationId: ORG,
    });
    assert.equal(ruleFor(otherSubject, "dsp-2", "REQ-1.8.5-cpr-current").parentComplete, false);
  });
});

describe("evidence lifecycle labels", () => {
  it("encodes the draft model and treats upload as submitted; only accepted changes compliance", () => {
    assert.deepEqual(
      [...EVIDENCE_LIFECYCLES],
      [
        "not_started",
        "in_progress",
        "submitted",
        "needs_correction",
        "accepted",
        "expired",
        "superseded",
      ],
    );
    assert.equal(lifecycleAfterUpload("not_started"), "submitted");
    assert.equal(lifecycleAfterUpload("in_progress"), "submitted");
    assert.equal(evidenceChangesCompliance("submitted"), false);
    assert.equal(evidenceChangesCompliance("needs_correction"), false);
    assert.equal(evidenceChangesCompliance("accepted"), true);
    assert.equal(evidenceChangesCompliance("expired"), false);
    assert.equal(evidenceChangesCompliance("superseded"), false);

    const dsp = staff({ staffId: "dsp-1" });
    const uploaded: SyntheticEvidence[] = [
      {
        staffId: "dsp-1",
        ruleId: "REQ-1.8.5-cpr-current",
        memberId: "cpr",
        completed: true,
        certExpiresOn: "2027-06-01",
        lifecycle: "submitted",
      },
    ];
    const submitted = run({
      staff: [dsp],
      rules: [REQ_1_8_5_CPR_CURRENT],
      evidence: uploaded,
    });
    const row = ruleFor(submitted, "dsp-1", "REQ-1.8.5-cpr-current");
    assert.equal(row.parentComplete, false);
    assert.ok(row.issues.some((i) => i.kind === "lifecycle_not_accepted"));

    const accepted = run({
      staff: [dsp],
      rules: [REQ_1_8_5_CPR_CURRENT],
      evidence: [{ ...uploaded[0]!, lifecycle: "accepted" }],
    });
    assert.equal(ruleFor(accepted, "dsp-1", "REQ-1.8.5-cpr-current").parentComplete, true);
  });
});
