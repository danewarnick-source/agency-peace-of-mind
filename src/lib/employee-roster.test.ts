import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  countEmployeesOnRosterTab,
  filterEmployeesByRosterTab,
  formatLastLogin,
  formatRosterDate,
  isEmployeeOnActiveRoster,
  lastLoginByUserId,
  uniqueHireEmails,
} from "./employee-roster.ts";

const active = { active: true, profile: { account_status: "active", is_active: true } };
const deactivated = { active: false, profile: { account_status: "active", is_active: true } };
const archived = { active: false, profile: { account_status: "archived", is_active: false } };
const archivedStillFlaggedActive = {
  active: true,
  profile: { account_status: "archived", is_active: true },
};
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
    const src = readFileSync(
      new URL("../components/employees/add-employee-wizard.tsx", import.meta.url),
      "utf8",
    );
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
    const src = readFileSync(
      new URL("../routes/dashboard.employees.index.tsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /filterEmployeesByRosterTab/);
    assert.match(src, /archiveEntity/);
    assert.match(src, /restoreEntity/);
    assert.match(src, /deleteEntity/);
    assert.match(src, /Inactive/);
    assert.match(src, /EmployeeRosterUploadWizard/);
    assert.match(src, /upload/);
    assert.match(src, /Last Login/);
    assert.match(src, /org_member_last_sign_ins/);
    assert.match(src, /Caseload/);
    assert.match(src, /MoreHorizontal/);
    assert.doesNotMatch(src, /Staff file/);
    assert.doesNotMatch(src, /Personnel file/);
    assert.doesNotMatch(src, /ExternalLink/);
    assert.doesNotMatch(src, /Smart Import/);
    assert.doesNotMatch(src, /Import CSV/);
    assert.doesNotMatch(src, /mode: ["']employee["']/);
    assert.doesNotMatch(src, /Hive Platform/);
    assert.doesNotMatch(src, /toggleActiveMutation/);
    assert.doesNotMatch(src, /\(supabase as any\)/);
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe("formatRosterDate / formatLastLogin", () => {
  it("matches Start date style and distinguishes Never from unknown", () => {
    assert.equal(formatRosterDate(null), "—");
    assert.equal(formatRosterDate("not-a-date"), "—");
    assert.equal(formatRosterDate("2024-02-05T12:00:00.000Z"), "Feb 5, 2024");
    assert.equal(formatLastLogin(undefined, false), "—");
    assert.equal(formatLastLogin(null, true), "Never");
    assert.equal(formatLastLogin("2026-08-27T12:00:00.000Z", true), "Aug 27, 2026");
  });
});

describe("lastLoginByUserId", () => {
  it("maps Core RPC rows and ignores junk", () => {
    const map = lastLoginByUserId([
      { user_id: "u1", last_sign_in_at: "2026-08-27T00:00:00.000Z" },
      { user_id: "u2", last_sign_in_at: null },
      { user_id: "", last_sign_in_at: "2026-01-01T00:00:00.000Z" },
      { last_sign_in_at: "2026-01-01T00:00:00.000Z" },
      null,
    ]);
    assert.equal(map.get("u1"), "2026-08-27T00:00:00.000Z");
    assert.equal(map.get("u2"), null);
    assert.equal(map.has("u2"), true);
    assert.equal(map.size, 2);
    assert.equal(lastLoginByUserId(null).size, 0);
    assert.equal(lastLoginByUserId("nope").size, 0);
  });
});
