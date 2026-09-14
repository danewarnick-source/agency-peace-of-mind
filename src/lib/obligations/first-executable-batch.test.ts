import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inHiveCourseIdForTitle } from "../in-hive-training.ts";
import { staffTasksWithoutElementDuplicates } from "../staff-my-tasks.ts";
import { sowCatalogEntryByKey } from "../sow-obligation-catalog.ts";
import { UNKNOWN_STAFF_DUTY_FACTS, type StaffDutyFacts } from "./duty-applicability.ts";
import { readCommittedCatalog } from "./draft-rules/catalog-fs.ts";
import { canActivate, canPublish } from "./draft-rules/publication.ts";
import { simulateDraftRules } from "./draft-rules/simulation.ts";
import { VERIFIED_PUBLICATIONS } from "./draft-rules/verified-publication.ts";
import { EMPTY_ORG_FACTS } from "./applicability.ts";
import {
  FIRST_BATCH_ENGINE_BINDINGS,
  FIRST_EXECUTABLE_BATCH_LIVE_KEYS,
  FIRST_EXECUTABLE_BATCH_RULE_IDS,
  applyFirstExecutableBatchOverlay,
  firstBatchAssignmentOpensClock,
  firstBatchDutySetsIncludeLiveKeys,
  firstBatchHireDueDays,
  firstBatchIsOnHireAutoAssign,
  firstBatchLiveEngineReady,
  firstBatchLiveFactsForRule,
  firstBatchParentIsWired,
  firstBatchPublicationStaysDeliberate,
  firstExecutableBatchParents,
} from "./first-executable-batch.ts";
import { evaluateCatalogFact } from "./catalog-fact-questions.ts";
import { liveObligationKeyForRule, staffTaskPolicy } from "./catalog-live-bridge.ts";

const DSP: StaffDutyFacts = {
  ...UNKNOWN_STAFF_DUTY_FACTS,
  staffId: "dsp-1",
  role: "employee",
  assignmentsKnown: true,
  assignedClientIds: ["c1"],
  assignedServiceCodes: ["HHS"],
  transportsKnown: true,
  isTransporter: false,
  abiCaseloadKnown: true,
  hasAbiCaseload: true,
  requiresAbi: true,
  behaviorCaseloadKnown: true,
  hasBehaviorCaseload: true,
  requiresDeescalation: true,
  managerIdKnown: true,
  managerId: "mgr-1",
};

const OFFICE: StaffDutyFacts = {
  ...DSP,
  staffId: "office-1",
  role: "admin",
  assignedClientIds: [],
  assignedServiceCodes: [],
  hasAbiCaseload: false,
  requiresAbi: false,
  hasBehaviorCaseload: false,
  requiresDeescalation: false,
};

describe("first executable batch — hire training clocks", () => {
  it("overlays fixture logic onto the five imported §1.8 parents without publishing", () => {
    const loaded = readCommittedCatalog();
    const batch = firstExecutableBatchParents(loaded.parents);
    assert.equal(batch.length, FIRST_EXECUTABLE_BATCH_RULE_IDS.length);
    assert.equal(VERIFIED_PUBLICATIONS.length, 0);
    for (const rule of batch) {
      assert.equal(rule.lifecycle, "draft", rule.id);
      assert.equal(rule.publication, "not_published", rule.id);
      assert.ok(canPublish(rule), rule.id);
      assert.equal(canActivate(rule), false, rule.id);
      assert.ok(firstBatchPublicationStaysDeliberate(rule), rule.id);
      assert.ok(firstBatchParentIsWired(rule), rule.id);
      assert.equal(rule.group.parentAssignment, "one", rule.id);
      assert.ok(liveObligationKeyForRule(rule), rule.id);
    }
    const raw = loaded.parents.find((r) => r.id === "REQ-1.8.4");
    assert.ok(raw);
    assert.equal(canPublish(raw), false);
    assert.equal(raw.predicates.length, 0);
  });

  it("does not overlay REQ-1.9 — that parent is not this shared-behavior slice", () => {
    const loaded = readCommittedCatalog();
    const umbrella = loaded.parents.find((r) => r.id === "REQ-1.9");
    assert.ok(umbrella);
    const next = applyFirstExecutableBatchOverlay(umbrella);
    assert.equal(next.predicates.length, 0);
    assert.equal(firstBatchParentIsWired(next), false);
  });

  it("keeps child elements off the staff-task queue", () => {
    const child = staffTaskPolicy({
      role: "element",
      parentKey: "REQ-1.8.4",
      createsUserTask: "yes",
      parentAssignment: "one",
    });
    assert.equal(child.mintsStaffTask, false);
    const filtered = staffTasksWithoutElementDuplicates([
      { requirementRole: "parent", parentRequirementKey: null, id: "p" },
      { requirementRole: "element", parentRequirementKey: "REQ-1.8.4", id: "e" },
    ]);
    assert.deepEqual(
      filtered.map((t) => t.id),
      ["p"],
    );
  });

  it("wires each live key through the existing engine surfaces", () => {
    assert.equal(firstBatchDutySetsIncludeLiveKeys(), true);
    assert.equal(firstBatchIsOnHireAutoAssign(), true);
    const hireDays = firstBatchHireDueDays();
    assert.equal(hireDays["30-Day New Hire Orientation Training"], 30);
    assert.equal(hireDays["Person-Centered Thinking and Practices Training"], 90);
    for (const binding of FIRST_BATCH_ENGINE_BINDINGS) {
      const ready = firstBatchLiveEngineReady(binding);
      assert.equal(ready.ready, true, `${binding.ruleId}: ${ready.reasons.join("; ")}`);
      assert.equal(binding.formTitle, null, binding.ruleId);
      assert.equal(binding.parentAssignment, "one", binding.ruleId);
      assert.equal(binding.mintsElementTasks, false, binding.ruleId);
      for (const key of binding.liveKeys) {
        const entry = sowCatalogEntryByKey(key);
        assert.ok(entry, key);
        assert.equal(entry.disposition, "obligation", key);
      }
    }
    for (const key of FIRST_EXECUTABLE_BATCH_LIVE_KEYS) {
      assert.equal(
        firstBatchAssignmentOpensClock(key, {
          ...UNKNOWN_STAFF_DUTY_FACTS,
          staffId: "unknown",
        }),
        false,
        key,
      );
    }
    assert.equal(firstBatchAssignmentOpensClock("orientation_30_day", DSP), true);
    assert.equal(firstBatchAssignmentOpensClock("orientation_30_day", OFFICE), false);
    assert.equal(firstBatchAssignmentOpensClock("abi_training", DSP), true);
    assert.equal(firstBatchAssignmentOpensClock("abi_training", OFFICE), false);
    assert.equal(firstBatchAssignmentOpensClock("behavior_intervention_cert", DSP), true);
    assert.equal(firstBatchAssignmentOpensClock("behavior_intervention_cert", OFFICE), false);
    assert.ok(inHiveCourseIdForTitle("30-Day New Hire Orientation Training"));
    assert.ok(inHiveCourseIdForTitle("ABI Training — Before Working Alone"));
    assert.ok(inHiveCourseIdForTitle("Person-Centered Thinking and Practices Training"));
  });

  it("missing assignment facts stay questions — never silent N/A", () => {
    const facts = firstBatchLiveFactsForRule("REQ-1.8.4");
    assert.equal(facts[0]?.fact_id, "LIVE-direct_support_assignment");
    const unanswered = evaluateCatalogFact(facts[0]!, EMPTY_ORG_FACTS);
    assert.equal(unanswered.status, "unanswered");
    assert.match(unanswered.prompt, /direct-support|assignment/i);
    const abi = evaluateCatalogFact(firstBatchLiveFactsForRule("REQ-1.8.8")[0]!, EMPTY_ORG_FACTS);
    assert.equal(abi.status, "unanswered");
    assert.equal(abi.source, "abi_caseload");
  });

  it("overlaid catalog parents simulate as one parent task on the live key", () => {
    const loaded = readCommittedCatalog();
    const orientation = firstExecutableBatchParents(loaded.parents).find(
      (r) => r.id === "REQ-1.8.4",
    );
    assert.ok(orientation);
    const result = simulateDraftRules({
      rules: [orientation],
      staff: [
        {
          ...DSP,
          hireDate: "2026-07-01",
          acreCertified: false,
          supervisorAcreCertified: true,
        },
        {
          ...OFFICE,
          hireDate: "2026-07-01",
          acreCertified: false,
          supervisorAcreCertified: true,
        },
      ],
      orgFacts: EMPTY_ORG_FACTS,
      evidence: [],
      now: new Date("2026-09-14T12:00:00.000Z"),
      orgHasAcreCoverage: true,
    });
    assert.equal(result.wroteDatabase, false);
    assert.equal(result.createdLiveAssignments, false);
    assert.equal(result.activatedRules, false);
    const dsp = result.staff.find((s) => s.staffId === "dsp-1")?.rules[0];
    const office = result.staff.find((s) => s.staffId === "office-1")?.rules[0];
    assert.equal(dsp?.applicability, "applies");
    assert.equal(dsp?.parentTaskCount, 1);
    assert.ok(dsp?.task);
    assert.equal(office?.applicability, "does_not_apply");
    assert.equal(office?.parentTaskCount, 0);
  });
});
