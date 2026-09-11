import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  TNS_ORG_ID,
  pickAdminLevelRecipient,
  resolveRecipient,
  type OrgMemberRow,
} from "./escalation.ts";
import {
  buildScopeIndex,
  evvStaffIdsForScope,
  pickScopeAdminRecipient,
  resolveScope,
  staffInScope,
  type ScopeMemberRow,
} from "./scope.ts";
import { assembleThisWeekFromHits, type ThisWeekItem } from "./this-week.functions.ts";

const STAFF = "11111111-1111-1111-1111-111111111111";
const LEAD = "66666666-6666-6666-6666-666666666666";
const OTHER = "77777777-7777-7777-7777-777777777777";
const ADMIN = "44444444-4444-4444-4444-444444444444";
const SUPER = "55555555-5555-5555-5555-555555555555";
const HOUSE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const HOUSE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
const MEM_STAFF = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MEM_LEAD = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const MEM_ADMIN = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const MEM_SUPER = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const members: OrgMemberRow[] = [
  { id: MEM_STAFF, user_id: STAFF, role: "employee", manager_id: MEM_LEAD, active: true },
  { id: MEM_LEAD, user_id: LEAD, role: "manager", manager_id: MEM_ADMIN, active: true },
  { id: MEM_ADMIN, user_id: ADMIN, role: "admin", manager_id: MEM_SUPER, active: true },
  { id: MEM_SUPER, user_id: SUPER, role: "super_admin", manager_id: null, active: true },
];

const groupMembers: ScopeMemberRow[] = [
  { group_id: HOUSE_A, staff_id: STAFF, is_lead: false },
  { group_id: HOUSE_A, staff_id: LEAD, is_lead: true },
  { group_id: HOUSE_B, staff_id: OTHER, is_lead: false },
];

function personSubject(staffId = STAFF, scopeGroupId: string | null = HOUSE_A) {
  return {
    organizationId: TNS_ORG_ID,
    kind: "person" as const,
    staffUserId: staffId,
    primaryAssignedStaffId: staffId,
    scopeGroupId,
    displayName: "Ada Staff",
  };
}

function orgSubject() {
  return {
    organizationId: TNS_ORG_ID,
    kind: "org" as const,
    staffUserId: null,
    primaryAssignedStaffId: null,
    scopeGroupId: null,
    displayName: "Organization",
  };
}

describe("resolveScope", () => {
  it("missing scope_group_id and no lead is org-wide (Step 2 fallback)", () => {
    const scope = resolveScope({
      organizationId: TNS_ORG_ID,
      userId: SUPER,
      scopeGroupId: null,
      members: groupMembers,
    });
    assert.equal(scope.isOrgWide, true);
    assert.deepEqual(scope.staffUserIds, []);
    assert.equal(evvStaffIdsForScope(scope), null);
    assert.equal(staffInScope(scope, OTHER), true);
  });

  it("scope_group_id limits staff to that group", () => {
    const scope = resolveScope({
      organizationId: TNS_ORG_ID,
      userId: STAFF,
      scopeGroupId: HOUSE_A,
      members: groupMembers,
    });
    assert.equal(scope.isOrgWide, false);
    assert.deepEqual(scope.staffUserIds.sort(), [LEAD, STAFF].sort());
    assert.equal(staffInScope(scope, STAFF), true);
    assert.equal(staffInScope(scope, OTHER), false);
    assert.deepEqual(evvStaffIdsForScope(scope)?.sort(), [LEAD, STAFF].sort());
  });

  it("lead of a group sees that group's members without their own scope_group_id", () => {
    const scope = resolveScope({
      organizationId: TNS_ORG_ID,
      userId: LEAD,
      scopeGroupId: null,
      members: groupMembers,
    });
    assert.equal(scope.isOrgWide, false);
    assert.deepEqual(scope.leadGroupIds, [HOUSE_A]);
    assert.equal(staffInScope(scope, STAFF), true);
    assert.equal(staffInScope(scope, OTHER), false);
  });
});

describe("admin_level uses scope when present", () => {
  const index = buildScopeIndex({ [STAFF]: HOUSE_A, [LEAD]: HOUSE_A }, groupMembers);

  it("admin_level with scope_group_id routes to the group lead", () => {
    const id = resolveRecipient(
      { climbs_to: "admin_level" },
      personSubject(STAFF, HOUSE_A),
      members,
      index,
    );
    assert.equal(id, LEAD);
    assert.equal(pickScopeAdminRecipient(HOUSE_A, index.leadsByGroupId), LEAD);
  });

  it("admin_level without scope_group_id keeps Step 2 super_admin fallback", () => {
    const id = resolveRecipient({ climbs_to: "admin_level" }, orgSubject(), members, index);
    assert.equal(id, SUPER);
    assert.equal(pickAdminLevelRecipient(members), SUPER);
    assert.equal(pickScopeAdminRecipient(null, index.leadsByGroupId), null);
  });

  it("admin_level with unknown scope_group_id falls back to Step 2", () => {
    const id = resolveRecipient(
      { climbs_to: "admin_level" },
      personSubject(STAFF, HOUSE_B),
      members,
      index,
    );
    assert.equal(id, SUPER);
  });
});

describe("getThisWeek scope wiring", () => {
  it("viewer only keeps escalation hits they own; EVV staff filter is scoped", () => {
    const houseA = resolveScope({
      organizationId: TNS_ORG_ID,
      userId: LEAD,
      scopeGroupId: HOUSE_A,
      members: groupMembers,
    });
    const hits = [
      {
        trigger: "overdue" as const,
        rule: {
          trigger: "overdue" as const,
          climbs_to: "admin_level" as const,
          urgency: "high" as const,
          message_template: "{title}",
        },
        instanceId: "inst-cpr",
        obligationId: "ob-cpr",
        obligationKey: "cpr_first_aid_initial",
        title: "CPR/First Aid Certification — Initial",
        subject: personSubject(STAFF, HOUSE_A),
        recipientUserId: LEAD,
        urgency: "high" as const,
        dueAt: "2026-08-01T00:00:00.000Z",
        message: "Ada Staff: CPR overdue.",
        consequence: "Overdue.",
        vars: {},
      },
      {
        trigger: "overdue" as const,
        rule: {
          trigger: "overdue" as const,
          climbs_to: "admin_level" as const,
          urgency: "high" as const,
          message_template: "{title}",
        },
        instanceId: "inst-other",
        obligationId: "ob-other",
        obligationKey: "cpr_first_aid_initial",
        title: "Other house CPR",
        subject: personSubject(OTHER, HOUSE_B),
        recipientUserId: SUPER,
        urgency: "high" as const,
        dueAt: "2026-08-01T00:00:00.000Z",
        message: "Other house.",
        consequence: "Overdue.",
        vars: {},
      },
    ];
    const items = assembleThisWeekFromHits(LEAD, hits);
    assert.deepEqual(
      items
        .filter((i): i is Extract<ThisWeekItem, { kind: "decision" }> => i.kind === "decision")
        .map((i) => i.instanceId),
      ["inst-cpr"],
    );
    assert.deepEqual(evvStaffIdsForScope(houseA)?.sort(), [LEAD, STAFF].sort());
    assert.equal(staffInScope(houseA, OTHER), false);
  });
});

describe("scope lock files", () => {
  it("does not add org-profile facts to this-week (Step 5 stays parallel)", () => {
    const src = readFileSync(new URL("./this-week.functions.ts", import.meta.url), "utf8");
    assert.match(src, /Step 5 not built/);
    assert.doesNotMatch(src, /loadUnansweredOrgProfile/);
    assert.match(src, /evvStaffIdsForScope/);
  });

  it("migration is additive and has no DROP", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20260911101000_obligation_scope.sql", import.meta.url),
      "utf8",
    );
    assert.match(sql, /ADD COLUMN IF NOT EXISTS scope_group_id/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false/);
    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(statements, /\bDROP\b/);
  });
});
