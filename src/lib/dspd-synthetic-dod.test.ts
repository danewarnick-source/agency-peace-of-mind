/**
 * Connected DSPD synthetic Definition of Done.
 *
 * Walks the CURRENT catalog through the existing engines (duty applicability,
 * packets, My tasks, This Week, entry readiness, remediation, overrides,
 * evidence / cert review). Not a second checklist. SOW CSV import stays out.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAcceptCertEvidence,
  certReviewAcceptBlockReason,
  certReviewStatus,
  nectarReviewDisposition,
  nextRenewalDueFromRules,
} from "./cert-review.ts";
import { evaluateEntryReadiness } from "./dspd-entry-readiness.ts";
import { completenessFromChecks } from "./nectar-completeness.ts";
import { TNS_ORG_ID } from "./obligations/escalation.ts";
import {
  EMPTY_ORG_FACTS,
  computeObligationApplicability,
  listUnansweredFacts,
  type OrgFacts,
} from "./obligations/applicability.ts";
import {
  ABI_DUTY_KEYS,
  CLIENT_SCOPED_DUTY_KEYS,
  DIRECT_SUPPORT_HIRE_KEYS,
  TRANSPORT_DUTY_KEYS,
  UNKNOWN_STAFF_DUTY_FACTS,
  UNIVERSAL_STAFF_KEYS,
  assignmentGapsForStaff,
  evaluateStaffDuties,
  evaluateStaffDuty,
  evaluationIsCompliant,
  staffDutyFootprint,
  staffReceivesDutyClock,
  staffSeesDuty,
  unansweredDutyQuietSummary,
  type StaffDutyFacts,
} from "./obligations/duty-applicability.ts";
import {
  NONWAIVABLE_REJECT,
  OVERRIDE_STILL_REQUIRED,
  buildOverrideInsert,
  overrideLeavesRequirementOpen,
} from "./obligations/overrides.ts";
import { buildPacket, type PacketClock } from "./obligations/packet.ts";
import {
  applyRemediationPlanOutcomes,
  type RemediationPlanRow,
} from "./obligations/remediation.ts";
import { orgWideResolvedScope } from "./obligations/scope.ts";
import { buildQuietLine, quietLineIsClean, thisWeekStatusLine } from "./obligations/this-week.ts";
import { sowCatalogEntryByKey } from "./sow-obligation-catalog.ts";
import { buildStaffTask } from "./staff-my-tasks.ts";
import {
  hasValidObligationEvidence,
  obligationFileStatus,
  staffFileCycleKind,
} from "./staff-obligation-files.ts";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const STAFF = "11111111-1111-1111-1111-111111111111";
const ADMIN = "44444444-4444-4444-4444-444444444444";
const VIEWER = "55555555-5555-5555-5555-555555555555";

/** Staff-owned CURRENT catalog keys the connected walk exercises. No invented clauses. */
const DOD_DUTY_KEYS = [
  ...DIRECT_SUPPORT_HIRE_KEYS,
  ...UNIVERSAL_STAFF_KEYS,
  ...ABI_DUTY_KEYS,
  ...TRANSPORT_DUTY_KEYS,
  ...CLIENT_SCOPED_DUTY_KEYS,
  "acre_sei",
  "dhhs_code_of_conduct_signed",
] as const;

const TNS_FACTS: OrgFacts = {
  ...EMPTY_ORG_FACTS,
  servicesOffered: ["HHS", "SLN", "SLH", "SEI", "DSI"],
};

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

const NARRATIVE_PASS = completenessFromChecks([
  { key: "word_count", passed: true, message: "ok" },
  { key: "client_referenced", passed: true, message: "ok" },
  { key: "support_provided", passed: true, message: "ok" },
  { key: "client_response", passed: true, message: "ok" },
]);

function applyingKeys(staff: StaffDutyFacts, facts: OrgFacts = TNS_FACTS): string[] {
  return evaluateStaffDuties({
    dutyKeys: [...DOD_DUTY_KEYS],
    staff,
    orgFacts: facts,
  })
    .filter(staffReceivesDutyClock)
    .map((row) => row.dutyKey)
    .sort();
}

function clock(
  partial: Partial<PacketClock> & Pick<PacketClock, "obligationKey" | "title">,
): PacketClock {
  return {
    instanceId: partial.instanceId ?? `inst-${partial.obligationKey}`,
    instanceStatus: partial.instanceStatus ?? "pending",
    dueAt: partial.dueAt ?? "2026-09-20T00:00:00.000Z",
    hasValidEvidence: partial.hasValidEvidence ?? false,
    staffUserId: partial.staffUserId ?? STAFF,
    clientId: partial.clientId ?? null,
    ...partial,
  };
}

function tasksFromApplying(staff: StaffDutyFacts): string[] {
  return applyingKeys(staff).map((key) => {
    const entry = sowCatalogEntryByKey(key);
    assert.ok(entry, key);
    return buildStaffTask({
      instanceId: `inst-${key}`,
      title: entry.title,
      source: "sow",
      evidenceType: entry.title.includes("CPR") ? "upload" : "attestation",
      dueAt: "2026-09-20T00:00:00.000Z",
      instanceStatus: "pending",
      now: NOW,
    }).title;
  });
}

type FakeRow = Record<string, unknown>;

function fakeSupabase(store: { plans: FakeRow[]; instances: FakeRow[] }) {
  const matches = (row: FakeRow, filters: Array<{ col: string; op: string; val: unknown }>) =>
    filters.every((f) => {
      const v = row[f.col];
      if (f.op === "eq") return v === f.val;
      if (f.op === "in") return Array.isArray(f.val) && (f.val as unknown[]).includes(v);
      if (f.op === "is") return v == null;
      return true;
    });

  const table = (name: string) => {
    const rows: FakeRow[] =
      name === "remediation_plans"
        ? store.plans
        : name === "company_obligation_instances"
          ? store.instances
          : [];
    const filters: Array<{ col: string; op: string; val: unknown }> = [];
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push({ col, op: "eq", val });
        return api;
      },
      in: (col: string, val: unknown[]) => {
        filters.push({ col, op: "in", val });
        return api;
      },
      is: (col: string, val: unknown) => {
        filters.push({ col, op: "is", val });
        return api;
      },
      insert: () => Promise.resolve({ data: null, error: null }),
      update: (patch: FakeRow) => {
        const apply = () => {
          for (const r of rows.filter((row) => matches(row, filters))) Object.assign(r, patch);
        };
        const next = {
          in: (col: string, val: unknown[]) => {
            filters.push({ col, op: "in", val });
            return next;
          },
          eq: (col: string, val: unknown) => {
            filters.push({ col, op: "eq", val });
            return next;
          },
          is: (col: string, val: unknown) => {
            filters.push({ col, op: "is", val });
            return next;
          },
          then: (resolve: (v: { error: null }) => unknown) => {
            apply();
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return next;
      },
      then: (resolve: (v: { data: FakeRow[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows.filter((r) => matches(r, filters)), error: null }).then(
          resolve,
        ),
    };
    return api;
  };

  return { from: (name: string) => table(name) };
}

describe("synthetic DoD — current catalog", () => {
  it("resolves every connected duty key on the live pack — no invented SOW clauses", () => {
    for (const key of DOD_DUTY_KEYS) {
      const entry = sowCatalogEntryByKey(key);
      assert.ok(entry, `missing catalog entry: ${key}`);
      assert.equal(entry.key, key);
      assert.equal(entry.state_code, "UT");
    }
  });
});

describe("DoD 1: different duties/assignments → different applicable tasks", () => {
  it("office ≠ DSP on the current catalog; ABI, transport, and client-specific follow assignment", () => {
    assert.equal(staffDutyFootprint(DSP), "direct_support");
    assert.equal(staffDutyFootprint(OFFICE), "office");

    const dspKeys = applyingKeys(DSP);
    const officeKeys = applyingKeys(OFFICE);
    assert.ok(dspKeys.includes("orientation_30_day"));
    assert.ok(dspKeys.includes("cpr_first_aid_initial"));
    assert.ok(dspKeys.includes("client_specific_training"));
    assert.equal(officeKeys.includes("orientation_30_day"), false);
    assert.equal(officeKeys.includes("cpr_first_aid_initial"), false);
    assert.equal(officeKeys.includes("client_specific_training"), false);
    assert.notDeepEqual(dspKeys, officeKeys);

    const dspTasks = tasksFromApplying(DSP);
    const officeTasks = tasksFromApplying(OFFICE);
    assert.ok(dspTasks.some((t) => t.includes("30-Day")));
    assert.equal(
      officeTasks.some((t) => t.includes("30-Day")),
      false,
    );
    assert.notDeepEqual(dspTasks, officeTasks);

    const abiOn = applyingKeys({ ...DSP, hasAbiCaseload: true, requiresAbi: false });
    const abiOff = applyingKeys(DSP);
    assert.ok(abiOn.includes("abi_training"));
    assert.equal(abiOff.includes("abi_training"), false);
    const titledOfficeOnAbi = evaluateStaffDuty({
      dutyKey: "abi_training",
      staff: { ...OFFICE, assignedClientIds: ["c"], hasAbiCaseload: true },
    });
    assert.equal(titledOfficeOnAbi.status, "applies");

    const driver = applyingKeys({ ...DSP, isTransporter: true, assignedServiceCodes: ["MTP"] });
    assert.ok(driver.includes("driving_record_transport"));
    assert.equal(applyingKeys(DSP).includes("driving_record_transport"), false);

    const dspStaffPacket = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "staff",
      subjectId: STAFF,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: TNS_FACTS,
      staffDutyFacts: { ...DSP, staffId: STAFF },
      clocks: [
        clock({
          obligationKey: "orientation_30_day",
          title: sowCatalogEntryByKey("orientation_30_day")!.title,
        }),
      ],
      now: NOW,
    });
    const officeStaffPacket = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "staff",
      subjectId: STAFF,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: TNS_FACTS,
      staffDutyFacts: { ...OFFICE, staffId: STAFF },
      clocks: [
        clock({
          obligationKey: "orientation_30_day",
          title: sowCatalogEntryByKey("orientation_30_day")!.title,
        }),
      ],
      now: NOW,
    });
    assert.ok(dspStaffPacket.items.some((i) => i.obligationKey === "orientation_30_day"));
    assert.ok(officeStaffPacket.hiddenKeys.includes("orientation_30_day"));
    assert.equal(
      officeStaffPacket.items.some((i) => i.obligationKey === "orientation_30_day"),
      false,
    );

    // Client-specific is catalog category client_docs — staff packet hides it;
    // assignment still opens the duty/task, and the client packet keeps the clock.
    assert.equal(sowCatalogEntryByKey("client_specific_training")?.category, "client_docs");
    const clientPacket = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "client",
      subjectId: "client-a",
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: TNS_FACTS,
      clocks: [
        clock({
          obligationKey: "client_specific_training",
          title: sowCatalogEntryByKey("client_specific_training")!.title,
          clientId: "client-a",
        }),
      ],
      now: NOW,
    });
    assert.ok(clientPacket.items.some((i) => i.obligationKey === "client_specific_training"));
  });
});

describe("DoD 2: unknown / unanswered facts stay unresolved", () => {
  it("never auto N/A or treated as clear on clocks, packets, or This Week", () => {
    for (const key of [
      "orientation_30_day",
      "abi_training",
      "driving_record_transport",
      "client_specific_training",
      "acre_sei",
    ]) {
      const row = evaluateStaffDuty({ dutyKey: key, staff: UNKNOWN, orgFacts: TNS_FACTS });
      assert.equal(row.status, "unanswered", key);
      assert.equal(row.applies, true, key);
      assert.equal(staffSeesDuty(row), true, key);
      assert.equal(staffReceivesDutyClock(row), false, key);
    }

    const unansweredOrg = computeObligationApplicability({
      ...EMPTY_ORG_FACTS,
      servicesOffered: TNS_FACTS.servicesOffered,
    });
    for (const key of [
      "zoning_life_safety",
      "volunteer_training_file",
      "governing_board_records",
    ]) {
      const row = unansweredOrg.find((r) => r.obligationKey === key);
      assert.ok(row, key);
      assert.equal(row?.status, "unanswered");
      assert.equal(row?.applies, true);
    }
    assert.equal(listUnansweredFacts(TNS_FACTS).length, 3);

    const packet = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "staff",
      subjectId: STAFF,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: TNS_FACTS,
      staffDutyFacts: { staffId: STAFF, ...UNKNOWN_STAFF_DUTY_FACTS },
      clocks: [],
      now: NOW,
    });
    const unanswered = packet.items.filter((i) => i.status === "unanswered");
    assert.ok(unanswered.length > 0);
    assert.ok(unanswered.every((i) => i.applies === true));
    assert.equal(
      packet.items.some(
        (i) => i.obligationKey === "orientation_30_day" && i.status === "does_not_apply",
      ),
      false,
    );

    const gaps = assignmentGapsForStaff({
      staff: UNKNOWN,
      duties: evaluateStaffDuties({
        dutyKeys: ["orientation_30_day", "abi_training"],
        staff: UNKNOWN,
        orgFacts: TNS_FACTS,
      }),
      assignedDutyKeys: new Set(),
      evaluationComplete: false,
    });
    const quiet = buildQuietLine({
      unansweredFacts: listUnansweredFacts(TNS_FACTS).length,
      evaluationIncomplete: true,
      assignmentGaps: gaps.length,
    });
    assert.equal(quietLineIsClean(quiet), false);
    assert.equal(evaluationIsCompliant({ evaluationComplete: false, gaps, failed: false }), false);
    assert.notEqual(thisWeekStatusLine({ itemCount: 0, quiet }), "Nothing needs you this week.");
    const dutyCard = unansweredDutyQuietSummary(TNS_ORG_ID, gaps);
    assert.ok(dutyCard);
    assert.match(dutyCard.body, /not a clean compliance result/);
  });
});

describe("DoD 3: no false all-clear when any required gap remains", () => {
  it("staff qualification gaps block billing eligibility after a narrative pass; This Week stays unclean", () => {
    const noteComplete = evaluateEntryReadiness({
      serviceCode: "SEI",
      staffId: STAFF,
      note: { completeness: NARRATIVE_PASS, hasNarrative: true },
      authorization: { serviceStartDate: "2026-07-01", serviceEndDate: "2027-06-30" },
      qualifications: {
        configured: true,
        missingLabels: ["external_cert:acre (unexpired)"],
        requirementId: "req-acre",
      },
      signature: { required: true, attested: true },
    });
    assert.equal(noteComplete.note.status, "complete");
    assert.equal(noteComplete.staff.status, "blocked");
    assert.equal(noteComplete.billing.status, "held");
    assert.equal(
      noteComplete.billing.holds.some((h) => h.kind === "qualification"),
      true,
    );

    const uploadedNotAccepted = hasValidObligationEvidence({
      instanceStatus: "pending",
      hasCompletion: true,
      nectarValidationStatus: "needs_review",
    });
    assert.equal(uploadedNotAccepted, false);
    assert.equal(
      obligationFileStatus({
        instanceStatus: "pending",
        dueAt: "2026-12-01T00:00:00.000Z",
        hasValidEvidence: uploadedNotAccepted,
        now: NOW,
      }),
      "missing",
    );

    const packet = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "staff",
      subjectId: STAFF,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: TNS_FACTS,
      staffDutyFacts: { ...DSP, staffId: STAFF, assignedServiceCodes: ["SEI"] },
      clocks: [
        clock({
          obligationKey: "acre_sei",
          title: sowCatalogEntryByKey("acre_sei")!.title,
          instanceStatus: "overdue",
          dueAt: "2026-08-01T00:00:00.000Z",
          hasValidEvidence: false,
        }),
      ],
      now: NOW,
    });
    assert.ok(packet.nextAction);
    assert.equal(packet.nextAction?.obligationKey, "acre_sei");
    assert.equal(packet.counts.missing > 0 || packet.nextAction != null, true);

    const quiet = buildQuietLine({
      unansweredFacts: listUnansweredFacts(TNS_FACTS).length,
      assignmentGaps: 1,
      obligationsSatisfied: 4,
    });
    assert.equal(quietLineIsClean(quiet), false);
    assert.doesNotMatch(thisWeekStatusLine({ itemCount: 0, quiet }), /Nothing needs you/);
    assert.equal(
      evaluationIsCompliant({
        evaluationComplete: true,
        gaps: [{ staffId: STAFF, dutyKey: "acre_sei", kind: "missing_assignment" }],
        failed: false,
      }),
      false,
    );
  });
});

describe("DoD 4: remediation ≠ complete; overrides with authority still don’t mark nonwaivable complete", () => {
  it("an approved plan and an authorized override leave the requirement open; nonwaivable stays rejected", async () => {
    const plan: RemediationPlanRow = {
      id: "p-dod",
      organization_id: TNS_ORG_ID,
      obligation_id: "ob-cpr",
      instance_id: "inst-cpr",
      staff_id: STAFF,
      obligation_key: "cpr_first_aid_renewal",
      title: sowCatalogEntryByKey("cpr_first_aid_renewal")!.title,
      kind: "overdue",
      status: "approved",
      plan_text: "Restore CPR.",
      due_at: "2026-10-01T00:00:00.000Z",
      proposed_by: null,
      reviewed_by: ADMIN,
      reviewed_at: NOW.toISOString(),
      outcome: "approved",
      outcome_note: null,
      outcome_at: NOW.toISOString(),
    };
    const store = {
      plans: [plan as unknown as FakeRow],
      instances: [{ id: "inst-cpr", status: "overdue", completed_at: null }],
    };
    await applyRemediationPlanOutcomes(fakeSupabase(store), TNS_ORG_ID, [], NOW);
    assert.equal(store.instances[0]?.status, "overdue");
    assert.equal(store.instances[0]?.completed_at, null);
    assert.notEqual(store.plans[0]?.status, "completed");
    assert.equal(overrideLeavesRequirementOpen(String(store.instances[0]?.status)), true);

    const insert = buildOverrideInsert({
      organizationId: TNS_ORG_ID,
      staffId: STAFF,
      obligationKey: "cpr_first_aid_renewal",
      obligationId: "ob-cpr",
      instanceId: "inst-cpr",
      scope: "instance",
      reason: "Coverage until the recert class.",
      expiresAt: "2026-09-20T00:00:00.000Z",
      createdBy: ADMIN,
      now: NOW,
    });
    assert.equal(insert.created_by, ADMIN);
    assert.equal(insert.obligation_key, "cpr_first_aid_renewal");

    const overriddenTask = buildStaffTask({
      instanceId: "inst-cpr",
      title: sowCatalogEntryByKey("cpr_first_aid_renewal")!.title,
      evidenceType: "upload",
      dueAt: "2026-09-01T00:00:00.000Z",
      instanceStatus: "overdue",
      overridden: true,
      overrideUntil: "Sep 20, 2026",
      now: NOW,
    });
    assert.equal(overriddenTask.overridden, true);
    assert.equal(overriddenTask.action, "upload_certificate");
    assert.match(OVERRIDE_STILL_REQUIRED, /not complete/);

    assert.throws(
      () =>
        buildOverrideInsert({
          organizationId: TNS_ORG_ID,
          staffId: STAFF,
          obligationKey: "ce_12h_annual",
          scope: "instance",
          reason: "Coverage until the recert class.",
          expiresAt: "2026-09-20T00:00:00.000Z",
          createdBy: ADMIN,
          now: NOW,
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, NONWAIVABLE_REJECT);
        return true;
      },
    );
    assert.throws(
      () =>
        buildOverrideInsert({
          organizationId: TNS_ORG_ID,
          staffId: STAFF,
          obligationKey: "medicaid_enrollment",
          scope: "instance",
          reason: "Coverage until the recert class.",
          expiresAt: "2026-09-20T00:00:00.000Z",
          createdBy: ADMIN,
          now: NOW,
        }),
      /cannot be overridden/,
    );
  });
});

describe("DoD 5: evidence upload ≠ accept; Accept still needs expiration; renewal cycle preserved", () => {
  it("uploaded CPR stays unaccepted until expiration is confirmed; prior cycle stays previous", () => {
    const upload = nectarReviewDisposition({
      evidenceTypeUsed: "upload",
      isManualEntry: false,
      usesCertExpiration: true,
      validationRan: false,
      validationStatus: null,
      expiresOn: null,
      confidence: null,
    });
    assert.equal(upload.holdOpen, true);
    assert.ok(upload.status === "needs_review" || upload.status === "failed");

    assert.equal(
      hasValidObligationEvidence({
        instanceStatus: "pending",
        hasCompletion: true,
        nectarValidationStatus: "needs_review",
      }),
      false,
    );
    assert.equal(
      certReviewStatus({ nectarValidationStatus: "needs_review", instanceStatus: "pending" }),
      "awaiting_review",
    );

    const missingExpiration = {
      usesCertExpiration: true,
      extractedExpiresOn: null,
      confirmedExpiresOn: null,
    };
    assert.equal(canAcceptCertEvidence(missingExpiration), false);
    assert.match(certReviewAcceptBlockReason(missingExpiration) ?? "", /Confirm expiration/);
    assert.equal(
      nextRenewalDueFromRules({
        usesCertExpiration: true,
        extractedExpiresOn: null,
        authoritativeCompletedOn: "2026-09-11",
        everyNMonths: 24,
      }),
      null,
    );

    assert.equal(
      canAcceptCertEvidence({
        usesCertExpiration: true,
        extractedExpiresOn: null,
        confirmedExpiresOn: "2027-06-01",
      }),
      true,
    );
    assert.equal(
      nextRenewalDueFromRules({
        usesCertExpiration: true,
        extractedExpiresOn: "2027-06-01",
        authoritativeCompletedOn: "2026-09-11",
        everyNMonths: 24,
      }),
      "2027-06-01",
    );

    const peers = [
      {
        instanceId: "old",
        instanceStatus: "completed" as const,
        dueAt: "2026-01-01T00:00:00.000Z",
      },
      { instanceId: "next", instanceStatus: "pending" as const, dueAt: "2027-06-01T00:00:00.000Z" },
    ];
    assert.equal(
      staffFileCycleKind({
        instanceId: "old",
        instanceStatus: "completed",
        dueAt: "2026-01-01T00:00:00.000Z",
        peers,
      }),
      "previous",
    );
    assert.equal(
      staffFileCycleKind({
        instanceId: "next",
        instanceStatus: "pending",
        dueAt: "2027-06-01T00:00:00.000Z",
        peers,
      }),
      "current",
    );

    const awaiting = buildStaffTask({
      instanceId: "next",
      title: sowCatalogEntryByKey("cpr_first_aid_renewal")!.title,
      evidenceType: "upload",
      dueAt: "2027-06-01T00:00:00.000Z",
      instanceStatus: "pending",
      nectarValidationStatus: "needs_review",
      now: NOW,
    });
    assert.equal(awaiting.pendingReview, true);
    assert.equal(awaiting.action, "upload_certificate");
  });
});
