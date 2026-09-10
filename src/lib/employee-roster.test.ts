import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  countEmployeesOnRosterTab,
  filterEmployeesByRosterTab,
  isEmployeeOnActiveRoster,
  uniqueHireEmails,
} from "./employee-roster.ts";

const active = { active: true, profile: { account_status: "active", is_active: true } };
const deactivated = { active: false, profile: { account_status: "active", is_active: true } };
const archived = { active: false, profile: { account_status: "archived", is_active: false } };
const archivedStillFlaggedActive = { active: true, profile: { account_status: "archived", is_active: true } };
const profileInactive = { active: true, profile: { account_status: "active", is_active: false } };

describe("isEmployeeOnActiveRoster", () => {
  it("keeps only operational active members on Active", () => {
    assert.equal(isEmployeeOnActiveRoster(active), true);
    assert.equal(isEmployeeOnActiveRoster({ active: true, profile: null }), true);
    assert.equal(isEmployeeOnActiveRoster(deactivated), false);
    assert.equal(isEmployeeOnActiveRoster(archived), false);
    assert.equal(isEmployeeOnActiveRoster(archivedStillFlaggedActive), false);
    assert.equal(isEmployeeOnActiveRoster(profileInactive), false);
  });

  it("never mixes deactivated or archived into the Active list", () => {
    const roster = [active, deactivated, archived, archivedStillFlaggedActive, profileInactive];
    assert.deepEqual(filterEmployeesByRosterTab(roster, "active"), [active]);
    assert.equal(countEmployeesOnRosterTab(roster, "active"), 1);
    assert.equal(countEmployeesOnRosterTab(roster, "inactive"), 4);
    for (const m of filterEmployeesByRosterTab(roster, "inactive")) {
      assert.equal(isEmployeeOnActiveRoster(m), false);
    }
  });
});

describe("uniqueHireEmails", () => {
  it("returns the first duplicate, ignoring case and blanks", () => {
    assert.equal(uniqueHireEmails(["a@agency.org", "b@agency.org"]), null);
    assert.equal(uniqueHireEmails(["a@agency.org", "A@agency.org"]), "a@agency.org");
    assert.equal(uniqueHireEmails(["", "a@agency.org", ""]), null);
  });
});

describe("Add employee wizard source lock", () => {
  it("drops hire-time behavior pickers, training tracks, and end date", () => {
    const src = readFileSync(new URL("../components/employees/add-employee-wizard.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(src, /Behavior-related training/);
    assert.doesNotMatch(src, /TrainingRequirementField/);
    assert.doesNotMatch(src, /Assigned training tracks/);
    assert.doesNotMatch(src, /name=["']track_ids["']/);
    assert.doesNotMatch(src, /End date/);
    assert.doesNotMatch(src, /name=["']end_date["']/);
    assert.match(src, /requiresDeescalation: false/);
    assert.match(src, /requiresAbi: false/);
    assert.match(src, /Add another employee/);
    assert.match(src, /createInvitation/);
    assert.match(src, /interpretInviteSendResult/);
    assert.match(src, /invite yet/);
    assert.match(src, /Checkbox/);
    assert.doesNotMatch(src, /inviteStaffMembers\(/);
    assert.doesNotMatch(src, /Hive Platform/);
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe("Employees list source lock", () => {
  it("splits Active / Inactive and uses existing archive/restore/delete RPCs", () => {
    const src = readFileSync(new URL("../routes/dashboard.employees.index.tsx", import.meta.url), "utf8");
    assert.match(src, /filterEmployeesByRosterTab/);
    assert.match(src, /archiveEntity/);
    assert.match(src, /restoreEntity/);
    assert.match(src, /deleteEntity/);
    assert.match(src, /Inactive/);
    assert.match(src, /EmployeeRosterUploadWizard/);
    assert.doesNotMatch(src, /Smart Import/);
    assert.doesNotMatch(src, /Import CSV/);
    assert.doesNotMatch(src, /mode: ["']employee["']/);
    assert.doesNotMatch(src, /Hive Platform/);
    assert.doesNotMatch(src, /toggleActiveMutation/);
  });
});
