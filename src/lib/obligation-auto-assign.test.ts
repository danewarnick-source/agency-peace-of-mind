import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ABI_OBLIGATION_TITLE, THIRTY_DAY_OBLIGATION_TITLE } from "./in-hive-training.ts";
import { PCT_HIRE_COURSE_TITLE } from "./client-form-obligations.ts";
import {
  CODE_OF_CONDUCT_TITLE,
  CONFLICT_OF_INTEREST_TITLE,
  HIRE_ALWAYS_TITLES,
  hireDueDaysForTitle,
} from "./obligation-auto-assign.ts";

describe("hire auto-assign", () => {
  it("always assigns the locked hire set", () => {
    assert.deepEqual(
      [...HIRE_ALWAYS_TITLES],
      [
        CODE_OF_CONDUCT_TITLE,
        THIRTY_DAY_OBLIGATION_TITLE,
        "CPR/First Aid Certification — Initial",
        PCT_HIRE_COURSE_TITLE,
      ],
    );
    assert.equal(HIRE_ALWAYS_TITLES.length, 4);
    assert.equal(
      HIRE_ALWAYS_TITLES.some((title) => title === CONFLICT_OF_INTEREST_TITLE),
      false,
    );
    assert.ok([...HIRE_ALWAYS_TITLES].includes(PCT_HIRE_COURSE_TITLE));
    const hireSet = readFileSync(
      fileURLToPath(new URL("./obligation-auto-assign.ts", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(hireSet, /titleGroupsForHire/);
    const hireHook = readFileSync(
      fileURLToPath(new URL("./staff-assignment-hooks.functions.ts", import.meta.url)),
      "utf8",
    );
    assert.match(hireHook, /reevaluateStaffDutiesInternal/);
    assert.match(hireHook, /reevaluateStaffAssignedToClientInternal/);
    assert.doesNotMatch(hireHook, /titleGroupsForHire\(\)/);
    assert.doesNotMatch(hireHook, /PCT_HIRE_COURSE_TITLE/);
    assert.doesNotMatch(hireHook, /assignmentNeedsAbi/);
    assert.doesNotMatch(hireHook, /assignmentNeedsMandt/);
    assert.doesNotMatch(hireHook, /ensureOpenStaffObligationInternal\(/);
    const roleWriter = readFileSync(
      fileURLToPath(new URL("./team-access.functions.ts", import.meta.url)),
      "utf8",
    );
    assert.match(roleWriter, /reevaluateStaffDutiesInternal/);
    const empCaseload = readFileSync(
      fileURLToPath(new URL("../routes/dashboard.employees.index.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(empCaseload, /onStaffAssignmentRemoved/);
    const nightly = readFileSync(
      fileURLToPath(new URL("./obligations/remediation.ts", import.meta.url)),
      "utf8",
    );
    assert.match(nightly, /persistAutomationHeartbeat/);
    const pcspWriter = readFileSync(
      fileURLToPath(new URL("./company-obligations.functions.ts", import.meta.url)),
      "utf8",
    );
    assert.match(pcspWriter, /reevaluateStaffAssignedToClientInternal/);
    const importWriter = readFileSync(
      fileURLToPath(new URL("./smart-import-commit.functions.ts", import.meta.url)),
      "utf8",
    );
    assert.match(importWriter, /reevaluateStaffAssignedToClientInternal/);
    assert.match(hireHook, /onClientDutyFactsChanged/);
    const profileTab = readFileSync(
      fileURLToPath(new URL("../components/clients/profile-tab.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(profileTab, /onClientDutyFactsChanged/);
    const faceSheet = readFileSync(
      fileURLToPath(new URL("../components/clients/face-sheet-info-card.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(faceSheet, /onClientDutyFactsChanged/);
    const bsConfig = readFileSync(
      fileURLToPath(new URL("../components/behavior-support/bs-config-card.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(bsConfig, /onClientDutyFactsChanged/);
  });

  it("uses existing due windows (30 / 90 / 180) instead of a second cadence", () => {
    assert.equal(hireDueDaysForTitle(THIRTY_DAY_OBLIGATION_TITLE), 30);
    assert.equal(hireDueDaysForTitle(CODE_OF_CONDUCT_TITLE), 30);
    assert.equal(hireDueDaysForTitle("CPR/First Aid Certification — Initial"), 90);
    assert.equal(hireDueDaysForTitle(PCT_HIRE_COURSE_TITLE), 90);
    assert.equal(hireDueDaysForTitle(ABI_OBLIGATION_TITLE), 90);
    assert.equal(
      hireDueDaysForTitle("Behavior Intervention Certification (SOAR/MANDT/PART/CPI/Safety Care)"),
      180,
    );
  });
});

describe("assignment auto-assign", () => {
  it("does not keep a parallel title/flag matcher beside duty-applicability", () => {
    const src = readFileSync(
      fileURLToPath(new URL("./obligation-auto-assign.ts", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(src, /assignmentNeedsMandt/);
    assert.doesNotMatch(src, /assignmentNeedsAbi/);
    assert.doesNotMatch(src, /assignmentNeedsSupportStrategies/);
    assert.doesNotMatch(src, /clientFlagsFromExistingSchema/);
    assert.doesNotMatch(src, /ABI_OBLIGATION_TITLES/);
  });
});
