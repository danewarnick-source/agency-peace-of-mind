import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_ORG_FACTS, type OrgFacts } from "../applicability.ts";
import { type StaffDutyFacts } from "../duty-applicability.ts";
import {
  AUDIT_PACKET_FIELDS,
  AUDIT_RETENTION,
  auditPacketHasOnlyFilteredFields,
  buildAuditExportPacket,
} from "./audit-export.ts";
import {
  CORE_RULE_LOGIC_SLICE,
  REQ_ART15_PBA,
  REQ_AUDIT_EXPORT,
  REQ_OFFBOARD,
  REQ_REMINDERS,
  STAGE4_RULE_IDS,
} from "./fixtures.ts";
import {
  CHANGE_TRIGGERS,
  simulateChangeImpact,
  type ChangeSnapshot,
  type SyntheticChangeEvent,
} from "./offboarding.ts";
import {
  PBA_REVIEW_SPECS,
  evaluatePbaReviews,
  periodKeyForCadence,
  reviewsAreScheduleSeparated,
  type SyntheticPbaReview,
} from "./pba-reviews.ts";
import { canActivate, canPublish } from "./publication.ts";
import {
  PRODUCT_REMINDER_AUTHORITY,
  PRODUCT_REMINDER_OFFSETS_DAYS,
  reminderTargetForLifecycle,
  simulateReminders,
} from "./reminders.ts";
import { simulateDraftRules, type SimulationInput, type SyntheticStaff } from "./simulation.ts";
import { STAGE1_ACTIVATION_LOCKED } from "./types.ts";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const ORG = "org-tns";
const TNS_FACTS: OrgFacts = {
  ...EMPTY_ORG_FACTS,
  servicesOffered: ["HHS", "SLN", "SLH", "SEI", "DSI", "PBA"],
};

function staff(partial: Partial<SyntheticStaff> & Pick<SyntheticStaff, "staffId">): SyntheticStaff {
  const base: StaffDutyFacts = {
    staffId: partial.staffId,
    role: "employee",
    assignmentsKnown: true,
    assignedClientIds: ["client-a"],
    assignedServiceCodes: ["PBA"],
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

const ITEMIZED = [
  { id: "stmt-1", kind: "itemized_financial_statement" as const },
  { id: "bank-1", kind: "bank_statement" as const },
  { id: "rcpt-1", kind: "distribution_receipt" as const },
];

function review(
  partial: Partial<SyntheticPbaReview> &
    Pick<
      SyntheticPbaReview,
      "reviewId" | "reviewKind" | "periodKey" | "reviewerId" | "reviewerRole"
    >,
): SyntheticPbaReview {
  return {
    organizationId: ORG,
    clientId: "client-a",
    accountId: "acct-1",
    accountOwnerId: "owner-1",
    linkedEvidence: ITEMIZED,
    lifecycle: "accepted",
    ...partial,
  };
}

const GOOD_REVIEWS: SyntheticPbaReview[] = [
  review({
    reviewId: "r-person",
    reviewKind: "monthly_person",
    periodKey: "2026-09",
    reviewerId: "person-alex",
    reviewerRole: "person",
    attestationId: "att-person",
  }),
  review({
    reviewId: "r-admin",
    reviewKind: "monthly_administrator",
    periodKey: "2026-09",
    reviewerId: "admin-pat",
    reviewerRole: "administrator",
    attestationId: "att-admin",
  }),
  review({
    reviewId: "r-third",
    reviewKind: "quarterly_third_person",
    periodKey: "2026-Q3",
    reviewerId: "auditor-lee",
    reviewerRole: "third_person",
    attestationId: "att-third",
  }),
];

function snapshot(
  partial: Partial<ChangeSnapshot> & Pick<ChangeSnapshot, "staffId">,
): ChangeSnapshot {
  return {
    role: "employee",
    assignedClientIds: ["client-a"],
    assignedServiceCodes: ["SEI"],
    clientNeedFlags: ["job_coach"],
    credentialKeys: ["acre"],
    supervisorId: "acre-sup",
    supervisorAcreCertified: true,
    ...partial,
  };
}

describe("Stage 4 fixtures stay draft and activation-locked", () => {
  it("keeps every Stage 4 rule draft / not_published / canActivate false", () => {
    for (const id of STAGE4_RULE_IDS) {
      const rule = CORE_RULE_LOGIC_SLICE.find((r) => r.id === id);
      assert.ok(rule, id);
      assert.equal(rule.lifecycle, "draft");
      assert.equal(rule.publication, "not_published");
      assert.equal(canActivate(rule), false);
    }
    assert.equal(STAGE1_ACTIVATION_LOCKED, true);
    assert.equal(canPublish(REQ_REMINDERS), false);
    assert.equal(canPublish(REQ_AUDIT_EXPORT), false);
    assert.equal(canPublish(REQ_ART15_PBA), true);
    assert.equal(canPublish(REQ_OFFBOARD), true);
    assert.equal(canActivate(REQ_ART15_PBA), false);
  });
});

describe("REQ-15.3 Article 15 PBA financial reviews", () => {
  it("separates monthly person / monthly administrator calendars from the quarterly sample", () => {
    assert.equal(periodKeyForCadence("monthly", NOW), "2026-09");
    assert.equal(periodKeyForCadence("quarterly", NOW), "2026-Q3");
    assert.equal(reviewsAreScheduleSeparated(PBA_REVIEW_SPECS[0], PBA_REVIEW_SPECS[2], NOW), true);
    assert.equal(reviewsAreScheduleSeparated(PBA_REVIEW_SPECS[0], PBA_REVIEW_SPECS[1], NOW), false);

    const monthlyAsQuarter = evaluatePbaReviews({
      organizationId: ORG,
      asOf: NOW,
      reviews: [
        review({
          reviewId: "wrong-period",
          reviewKind: "quarterly_third_person",
          periodKey: "2026-09",
          reviewerId: "auditor-lee",
          reviewerRole: "third_person",
        }),
      ],
    });
    const quarterly = monthlyAsQuarter[0]?.reviews.find(
      (r) => r.reviewKind === "quarterly_third_person",
    );
    assert.equal(quarterly?.complete, false);
    assert.ok(
      quarterly?.issues.some((i) => i.kind === "missing_review" || i.kind === "schedule_mismatch"),
    );
  });

  it("rejects the wrong reviewer and a shared reviewer across the three reviews", () => {
    const wrongRole = evaluatePbaReviews({
      organizationId: ORG,
      asOf: NOW,
      reviews: [
        review({
          reviewId: "admin-as-person",
          reviewKind: "monthly_person",
          periodKey: "2026-09",
          reviewerId: "admin-pat",
          reviewerRole: "administrator",
        }),
      ],
    });
    const person = wrongRole[0]?.reviews.find((r) => r.reviewKind === "monthly_person");
    assert.equal(person?.complete, false);
    assert.ok(person?.issues.some((i) => i.kind === "wrong_reviewer"));

    const ownerAsThird = evaluatePbaReviews({
      organizationId: ORG,
      asOf: NOW,
      reviews: [
        review({
          reviewId: "owner-sample",
          reviewKind: "quarterly_third_person",
          periodKey: "2026-Q3",
          reviewerId: "owner-1",
          reviewerRole: "third_person",
          accountOwnerId: "owner-1",
        }),
      ],
    });
    const third = ownerAsThird[0]?.reviews.find((r) => r.reviewKind === "quarterly_third_person");
    assert.ok(third?.issues.some((i) => i.kind === "wrong_reviewer"));

    const shared = evaluatePbaReviews({
      organizationId: ORG,
      asOf: NOW,
      reviews: GOOD_REVIEWS.map((row, i) =>
        i === 1 ? { ...row, reviewerId: "person-alex" } : row,
      ),
    });
    assert.equal(shared[0]?.allComplete, false);
    assert.ok(
      shared[0]?.reviews.some((r) => r.issues.some((issue) => issue.kind === "reviewer_collision")),
    );
  });

  it("does not let one generic attestation satisfy all three reviews", () => {
    const generic = evaluatePbaReviews({
      organizationId: ORG,
      asOf: NOW,
      reviews: GOOD_REVIEWS.map((row) => ({
        ...row,
        genericAttestation: true,
        attestationId: "one-attestation",
        linkedEvidence: [],
      })),
    });
    assert.equal(generic[0]?.allComplete, false);
    for (const row of generic[0]?.reviews ?? []) {
      assert.ok(row.issues.some((i) => i.kind === "generic_attestation"));
      assert.ok(row.issues.some((i) => i.kind === "missing_itemized_evidence"));
    }
  });

  it("completes the parent only with distinct reviewers, matching periods, and linked itemized evidence", () => {
    const worker = staff({ staffId: "pba-1" });
    const result = run({
      staff: [worker],
      rules: [REQ_ART15_PBA],
      pbaReviews: GOOD_REVIEWS,
    });
    const row = ruleFor(result, "pba-1", "REQ-15.3");
    assert.equal(row.applicability, "applies");
    assert.equal(row.parentComplete, true);
    assert.equal(result.pbaReviews[0]?.allComplete, true);
    assert.equal(result.wroteDatabase, false);
    assert.equal(result.activatedRules, false);

    const office = staff({
      staffId: "office-1",
      assignedClientIds: [],
      assignedServiceCodes: [],
      role: "admin",
    });
    const officeRow = ruleFor(
      run({ staff: [office], rules: [REQ_ART15_PBA] }),
      "office-1",
      "REQ-15.3",
    );
    assert.equal(officeRow.applicability, "does_not_apply");
  });
});

describe("product-default reminders / escalation", () => {
  it("labels 30/14/7/1 as product defaults, not SOW mandates", () => {
    assert.deepEqual([...PRODUCT_REMINDER_OFFSETS_DAYS], [30, 14, 7, 1]);
    assert.equal(PRODUCT_REMINDER_AUTHORITY.isSowMandate, false);
    assert.equal(PRODUCT_REMINDER_AUTHORITY.label, "product_default");
    assert.match(PRODUCT_REMINDER_AUTHORITY.summary, /not DHHS91172 SOW-mandated/i);
    assert.equal(reminderTargetForLifecycle("submitted"), "reviewer");
    assert.equal(reminderTargetForLifecycle("needs_correction"), "reviewer");
    assert.equal(reminderTargetForLifecycle("in_progress"), "staff");
  });

  it("dedupes identical pending rows and reminds the reviewer, not a repeated staff upload", () => {
    const dueAt = "2026-09-20T23:59:59.000Z";
    const result = simulateReminders({
      asOf: NOW,
      subjects: [
        {
          assignmentId: "asg-1",
          ruleId: "REQ-1.8.5",
          staffId: "dsp-1",
          reviewerId: "mgr-1",
          dueAt,
          lifecycle: "submitted",
        },
      ],
      events: [
        {
          assignmentId: "asg-1",
          ruleId: "REQ-1.8.5",
          target: "staff",
          targetId: "dsp-1",
          offsetDays: 7,
          dueAt,
          asOf: NOW.toISOString(),
        },
        {
          assignmentId: "asg-1",
          ruleId: "REQ-1.8.5",
          target: "staff",
          targetId: "dsp-1",
          offsetDays: 7,
          dueAt,
          asOf: NOW.toISOString(),
        },
      ],
    });
    assert.ok(result.dedupedCount >= 1);
    assert.ok(result.pending.length > 0);
    assert.ok(result.pending.every((row) => row.target === "reviewer"));
    assert.ok(result.pending.every((row) => row.targetId === "mgr-1"));
    assert.ok(result.pending.every((row) => row.isSowMandate === false));
    assert.ok(result.pending.every((row) => row.authority === "product_default"));
    assert.equal(
      result.pending.some((row) => row.target === "staff"),
      false,
    );
  });

  it("resolves reminders on verified acceptance", () => {
    const accepted = simulateReminders({
      asOf: NOW,
      subjects: [
        {
          assignmentId: "asg-2",
          ruleId: "REQ-1.8.5",
          staffId: "dsp-1",
          reviewerId: "mgr-1",
          dueAt: "2026-09-20T23:59:59.000Z",
          lifecycle: "accepted",
        },
      ],
    });
    assert.deepEqual(accepted.pending, []);
    assert.deepEqual(accepted.resolvedAssignmentIds, ["asg-2"]);
  });
});

describe("offboarding / change impact", () => {
  it("recalculates on each encoded trigger and lists ACRE supervisor reassignment for SEI staff", () => {
    const events: SyntheticChangeEvent[] = CHANGE_TRIGGERS.map((trigger) => {
      const before = snapshot({ staffId: "sei-1" });
      const after = snapshot({
        staffId: "sei-1",
        role: trigger === "role" ? "supervisor" : before.role,
        assignedClientIds: trigger === "assignment" ? ["client-b"] : before.assignedClientIds,
        clientNeedFlags: trigger === "client_needs" ? ["community"] : before.clientNeedFlags,
        credentialKeys: trigger === "credential" ? ["cpr"] : before.credentialKeys,
        supervisorId: trigger === "supervisor" ? "new-sup" : before.supervisorId,
        supervisorAcreCertified: trigger === "supervisor" ? false : before.supervisorAcreCertified,
      });
      return {
        staffId: "sei-1",
        trigger,
        before,
        after,
        historicalEvidence: [
          { evidenceId: "ev-acre", ruleId: "REQ-30.6.b", lifecycle: "accepted" },
        ],
      };
    });
    const result = simulateChangeImpact(events);
    assert.equal(result.wroteDatabase, false);
    assert.equal(result.deletedHistoricalEvidence, false);
    assert.deepEqual(result.preservedEvidenceIds, ["ev-acre"]);
    for (const trigger of CHANGE_TRIGGERS) {
      assert.ok(
        result.impacts.some((i) => i.kind === "recalculate" && i.trigger === trigger),
        trigger,
      );
    }
    const reassignment = result.impacts.filter((i) => i.kind === "reassignment_review");
    assert.equal(reassignment.length, 1);
    assert.equal(reassignment[0]?.staffId, "sei-1");
    assert.match(reassignment[0]?.reason ?? "", /ACRE supervisor/i);
    assert.ok(result.impacts.every((i) => i.preserveEvidenceIds.includes("ev-acre")));

    const slnOnly = simulateChangeImpact([
      {
        staffId: "sln-1",
        trigger: "supervisor",
        before: snapshot({ staffId: "sln-1", assignedServiceCodes: ["SLN"] }),
        after: snapshot({
          staffId: "sln-1",
          assignedServiceCodes: ["SLN"],
          supervisorId: "new-sup",
          supervisorAcreCertified: false,
        }),
        historicalEvidence: [{ evidenceId: "ev-cpr", ruleId: "REQ-1.8.5", lifecycle: "accepted" }],
      },
    ]);
    assert.equal(
      slnOnly.impacts.some((i) => i.kind === "reassignment_review"),
      false,
    );
    assert.deepEqual(slnOnly.preservedEvidenceIds, ["ev-cpr"]);
  });
});

describe("audit export packet shape", () => {
  it("exports only the filtered fields and does not invent a universal retention period", () => {
    const packet = buildAuditExportPacket({
      exportedAt: NOW.toISOString(),
      rows: [
        {
          ruleId: "REQ-15.3",
          ruleVersion: 1,
          sourceClauseIds: ["SOW Article 15", "SOW §15.3"],
          assignment: {
            assignmentId: "asg-pba",
            staffId: "pba-1",
            clientId: "client-a",
            ruleId: "REQ-15.3",
          },
          evidence: [{ evidenceId: "stmt-1", scope: "pba_person_review", lifecycle: "accepted" }],
          acceptance: {
            accepted: true,
            acceptedAt: "2026-09-10T00:00:00.000Z",
            acceptedBy: "mgr-1",
          },
          timestamps: {
            assignedAt: "2026-09-01T00:00:00.000Z",
            submittedAt: "2026-09-08T00:00:00.000Z",
            acceptedAt: "2026-09-10T00:00:00.000Z",
          },
          exceptions: [{ key: "none", reason: "No exception recorded." }],
          amendments: [
            {
              amendmentId: "amd-1",
              summary: "Corrected receipt date",
              recordedAt: "2026-09-11T00:00:00.000Z",
            },
          ],
        },
      ],
    });
    assert.deepEqual([...packet.fields], [...AUDIT_PACKET_FIELDS]);
    assert.equal(auditPacketHasOnlyFilteredFields(packet), true);
    assert.equal(packet.retention.value, "from_applicable_authority");
    assert.equal(packet.retention.knownUniversalPeriod, null);
    assert.match(packet.retention.publicationGap, /Do not invent/i);
    assert.equal(packet.inventedUniversalRetention, false);
    assert.equal(packet.wroteDatabase, false);
    const row = packet.rows[0];
    assert.ok(row);
    assert.equal(row.rule_version.version, 1);
    assert.deepEqual(row.source_clause, ["SOW Article 15", "SOW §15.3"]);
    assert.equal(row.assignment.assignmentId, "asg-pba");
    assert.equal(row.evidence[0]?.evidenceId, "stmt-1");
    assert.equal(row.acceptance.accepted, true);
    assert.equal(row.timestamps.exportedAt, NOW.toISOString());
    assert.equal(row.exceptions.length, 1);
    assert.equal(row.amendments.length, 1);
    assert.equal(AUDIT_RETENTION.knownUniversalPeriod, null);
  });
});
