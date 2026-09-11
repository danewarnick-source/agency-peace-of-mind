import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  TNS_ORG_ID,
  consequenceForTrigger,
  evaluateEscalations,
  persistEscalationHits,
  resolveRecipient,
  recurrenceKey,
  renderTemplate,
  isLicenseOrRepaymentCatalog,
  citationIsLicenseOrRepayment,
  pickAdminLevelRecipient,
  pickLowestAdminLevel,
  SEED_ESCALATION_RULES,
  type EscalationHit,
  type EvaluateInput,
  type OrgMemberRow,
} from "./escalation.ts";
import {
  assembleThisWeekFromHits,
  sortThisWeekItems,
  type ThisWeekItem,
} from "./this-week.functions.ts";

const STAFF = "11111111-1111-1111-1111-111111111111";
const MANAGER = "22222222-2222-2222-2222-222222222222";
const MOM = "33333333-3333-3333-3333-333333333333";
const ADMIN = "44444444-4444-4444-4444-444444444444";
const SUPER = "55555555-5555-5555-5555-555555555555";
const MEM_STAFF = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MEM_MGR = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const MEM_MOM = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const MEM_ADMIN = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const MEM_SUPER = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const members: OrgMemberRow[] = [
  { id: MEM_STAFF, user_id: STAFF, role: "employee", manager_id: MEM_MGR, active: true },
  { id: MEM_MGR, user_id: MANAGER, role: "manager", manager_id: MEM_MOM, active: true },
  { id: MEM_MOM, user_id: MOM, role: "program_manager", manager_id: MEM_ADMIN, active: true },
  { id: MEM_ADMIN, user_id: ADMIN, role: "admin", manager_id: MEM_SUPER, active: true },
  { id: MEM_SUPER, user_id: SUPER, role: "super_admin", manager_id: null, active: true },
];

const now = new Date("2026-09-11T12:00:00.000Z");

function personSubject(staffId = STAFF) {
  return {
    organizationId: TNS_ORG_ID,
    kind: "person" as const,
    staffUserId: staffId,
    primaryAssignedStaffId: staffId,
    scopeGroupId: null,
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

describe("resolveRecipient", () => {
  it("manager walks organization_members.manager_id for person-bound staff", () => {
    const id = resolveRecipient({ climbs_to: "manager" }, personSubject(), members);
    assert.equal(id, MANAGER);
  });

  it("manager on org items is the lowest admin-level (admin before super_admin)", () => {
    const id = resolveRecipient({ climbs_to: "manager" }, orgSubject(), members);
    assert.equal(id, ADMIN);
    assert.equal(pickLowestAdminLevel(members), ADMIN);
  });

  it("manager_of_manager walks once", () => {
    const id = resolveRecipient({ climbs_to: "manager_of_manager" }, personSubject(), members);
    assert.equal(id, MOM);
  });

  it("manager_of_manager falls back to admin_level when the walk is null", () => {
    const leaf: OrgMemberRow[] = [
      { id: MEM_STAFF, user_id: STAFF, role: "employee", manager_id: null, active: true },
      { id: MEM_SUPER, user_id: SUPER, role: "super_admin", manager_id: null, active: true },
    ];
    const id = resolveRecipient({ climbs_to: "manager_of_manager" }, personSubject(), leaf);
    assert.equal(id, SUPER);
  });

  it("admin_level is one user for all (super_admin preferred)", () => {
    const a = resolveRecipient({ climbs_to: "admin_level" }, personSubject(), members);
    const b = resolveRecipient({ climbs_to: "admin_level" }, orgSubject(), members);
    assert.equal(a, SUPER);
    assert.equal(b, SUPER);
    assert.equal(pickAdminLevelRecipient(members), SUPER);
  });

  it("admin_level falls back to rank ≥ 4 when no super_admin", () => {
    const noSuper = members.filter((m) => m.role !== "super_admin");
    const id = resolveRecipient({ climbs_to: "admin_level" }, orgSubject(), noSuper);
    assert.equal(id, ADMIN);
  });
});

describe("evaluator fixtures (TNS)", () => {
  const cprOb = {
    id: "ob-cpr",
    title: "CPR/First Aid Certification — Initial",
    key: "cpr_first_aid_initial",
    disposition: "obligation",
    scope: "staff",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const hhsOb = {
    id: "ob-hhs",
    title: "HHS Home Certification — Annual (DSPD Form)",
    key: "hhs_home_cert_annual",
    disposition: "obligation",
    scope: "org",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const standingOb = {
    id: "ob-stand",
    title: "Staff Conflict of Interest Process",
    key: "conflict_of_interest_process",
    disposition: "standing",
    scope: "org",
    created_at: "2026-08-01T00:00:00.000Z",
  };
  const licenseOb = {
    id: "ob-lic",
    title: "Medicaid Provider Enrollment — Current",
    key: "medicaid_enrollment",
    disposition: "standing",
    scope: "org",
    created_at: "2026-01-01T00:00:00.000Z",
    source_policy_section: "DHHS91172 SOW §1.13",
  };

  const baseInput = (): EvaluateInput => ({
    organizationId: TNS_ORG_ID,
    now,
    obligations: [cprOb, hhsOb, standingOb, licenseOb],
    instances: [
      {
        id: "inst-cpr",
        obligation_id: "ob-cpr",
        status: "overdue",
        due_at: "2026-08-01T00:00:00.000Z",
        created_at: "2026-06-01T00:00:00.000Z",
        assignee_staff_id: STAFF,
      },
      {
        id: "inst-hhs",
        obligation_id: "ob-hhs",
        status: "overdue",
        due_at: "2026-07-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        client_name: "Cedar Host Home",
      },
      {
        id: "inst-half",
        obligation_id: "ob-cpr",
        status: "pending",
        due_at: "2026-10-11T00:00:00.000Z",
        created_at: "2026-08-01T00:00:00.000Z",
        assignee_staff_id: STAFF,
      },
    ],
    startedInstanceIds: new Set(),
    members,
    futureShiftCounts: { [STAFF]: 3 },
    obligationHasEvidence: {},
    subjectNames: { [STAFF]: "Ada Staff" },
  });

  it("flags CPR overdue, scheduled-while-lapsed, HHS overdue, standing 30d, license risk", () => {
    const hits = evaluateEscalations(baseInput());
    const triggers = hits.map((h) => `${h.trigger}:${h.obligationKey ?? h.title}`);
    assert.ok(triggers.some((t) => t.startsWith("overdue:cpr_first_aid_initial")));
    assert.ok(
      triggers.some((t) => t.startsWith("would_create_finding_if_scheduled:cpr_first_aid_initial")),
    );
    assert.ok(triggers.some((t) => t.startsWith("overdue:hhs_home_cert_annual")));
    assert.ok(
      triggers.some((t) =>
        t.startsWith("standing_record_missing_30d:conflict_of_interest_process"),
      ),
    );
    assert.ok(triggers.some((t) => t.startsWith("license_or_repayment_risk:medicaid_enrollment")));
    assert.ok(triggers.some((t) => t.startsWith("half_window_not_started:cpr_first_aid_initial")));

    const cprOverdue = hits.find(
      (h) => h.trigger === "overdue" && h.obligationKey === "cpr_first_aid_initial",
    );
    assert.equal(cprOverdue?.recipientUserId, MOM);
    assert.match(cprOverdue?.consequence ?? "", /days overdue/);
    assert.match(cprOverdue?.consequence ?? "", /DSPD review/);
    assert.notEqual(cprOverdue?.consequence, cprOverdue?.message);

    const hhs = hits.find(
      (h) => h.trigger === "overdue" && h.obligationKey === "hhs_home_cert_annual",
    );
    assert.ok(hhs);
    assert.equal(hhs?.recipientUserId, SUPER);
    assert.match(hhs?.message ?? "", /HHS Home Certification/);

    const standing = hits.find((h) => h.trigger === "standing_record_missing_30d");
    assert.equal(standing?.recipientUserId, SUPER);
    assert.match(standing?.consequence ?? "", /missing 30\+ days/);
    assert.match(standing?.consequence ?? "", /nothing to show them/);
    assert.notEqual(standing?.consequence, standing?.message);
  });

  it("writes a distinct consequence per trigger and never restates the message", () => {
    const vars = {
      due: "2026-10-01",
      days_overdue: "12",
      audit_ref: "IV-7",
      citation: "§1.13",
      n_days: "5",
      title: "HHS Inspection",
      subject: "Ada Staff",
      status: "overdue",
      n_shifts: "2",
    };
    assert.equal(
      consequenceForTrigger("half_window_not_started", vars),
      "If this isn't started soon, it becomes overdue on 2026-10-01 and escalates to the next manager up.",
    );
    assert.equal(
      consequenceForTrigger("overdue", vars),
      "12 days overdue. If unresolved, this is a finding on the next DSPD review.",
    );
    assert.equal(
      consequenceForTrigger("would_create_finding_if_scheduled", vars),
      "Each shift scheduled while this is lapsed is a IV-7 finding if the reviewer samples it.",
    );
    assert.equal(
      consequenceForTrigger("license_or_repayment_risk", vars),
      "This is a licensing or repayment item (§1.13). Missing it risks a corrective action plan or repayment demand, not just a note on file.",
    );
    assert.equal(
      consequenceForTrigger("standing_record_missing_30d", vars),
      "This policy has been missing 30+ days. A reviewer will ask for it by name — there is currently nothing to show them.",
    );
    for (const rule of SEED_ESCALATION_RULES) {
      const message = renderTemplate(rule.message_template, vars);
      const consequence = consequenceForTrigger(rule.trigger, vars);
      assert.notEqual(consequence, message);
      assert.notEqual(consequence, vars.title);
    }
  });

  it("getThisWeek for TNS super_admin surfaces CPR, HHS, and missing standing with owner/consequence", () => {
    // TNS live shape: one super_admin; staff manager has no manager_of_manager
    // so overdue climbs to admin_level (this user).
    const tnsMembers: OrgMemberRow[] = [
      { id: MEM_STAFF, user_id: STAFF, role: "employee", manager_id: MEM_MGR, active: true },
      { id: MEM_MGR, user_id: MANAGER, role: "manager", manager_id: null, active: true },
      { id: MEM_SUPER, user_id: SUPER, role: "super_admin", manager_id: null, active: true },
    ];
    const hits = evaluateEscalations({ ...baseInput(), members: tnsMembers });
    const week = assembleThisWeekFromHits(SUPER, hits);
    const decisions = week.filter((i) => i.kind === "decision");
    const titles = decisions.map((i) => i.title);
    assert.ok(titles.some((t) => t.includes("CPR")));
    assert.ok(titles.some((t) => t.includes("HHS Home Certification")));
    assert.ok(titles.some((t) => t.includes("Conflict of Interest")));

    const cpr = decisions.find((i) => i.title.includes("CPR") && i.trigger === "overdue");
    assert.ok(cpr && cpr.kind === "decision");
    assert.equal(cpr.ownerUserId, SUPER);
    assert.match(cpr.consequence, /days overdue/);

    const hhs = decisions.find((i) => i.title.includes("HHS") && i.trigger === "overdue");
    assert.ok(hhs && hhs.kind === "decision");
    assert.equal(hhs.ownerUserId, SUPER);
    assert.ok(hhs.consequence.length > 0);

    const standing = decisions.find((i) => i.source === "standing_missing");
    assert.ok(standing && standing.kind === "decision");
    assert.equal(standing.ownerUserId, SUPER);
    assert.match(standing.consequence, /missing 30\+ days/);
  });

  it("sorts critical → high → normal, then soonest due", () => {
    const items: ThisWeekItem[] = [
      {
        kind: "decision",
        id: "n",
        title: "n",
        body: "",
        urgency: "normal",
        dueAt: "2026-09-01T00:00:00.000Z",
        ownerUserId: SUPER,
        ownerLabel: "manager",
        consequence: "c",
        source: "escalation",
      },
      {
        kind: "decision",
        id: "c-late",
        title: "c-late",
        body: "",
        urgency: "critical",
        dueAt: "2026-10-01T00:00:00.000Z",
        ownerUserId: SUPER,
        ownerLabel: "admin_level",
        consequence: "c",
        source: "escalation",
      },
      {
        kind: "decision",
        id: "c-soon",
        title: "c-soon",
        body: "",
        urgency: "critical",
        dueAt: "2026-09-12T00:00:00.000Z",
        ownerUserId: SUPER,
        ownerLabel: "admin_level",
        consequence: "c",
        source: "escalation",
      },
    ];
    assert.deepEqual(
      sortThisWeekItems(items).map((i) => i.id),
      ["c-soon", "c-late", "n"],
    );
  });

  it("treats licensing category and the four citations as license/repayment", () => {
    assert.equal(isLicenseOrRepaymentCatalog({ category: "licensing", citation: "x" }), true);
    assert.equal(citationIsLicenseOrRepayment("DHHS91172 SOW §1.34"), true);
    assert.equal(citationIsLicenseOrRepayment("SOW §30.5 / extra"), true);
    assert.equal(citationIsLicenseOrRepayment("SOW §11.5"), false);
  });
});

describe("escalation notification idempotency", () => {
  function mockSupabase(existingKeys: string[], store: unknown[]) {
    return {
      from(table: string) {
        if (table !== "notifications") {
          return {
            select: () => ({
              eq: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }),
            }),
          };
        }
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      in: async () => ({
                        data: existingKeys.map((recurrence_key) => ({
                          id: recurrence_key,
                          recurrence_key,
                          resolved_at: null,
                        })),
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
          async insert(rows: unknown[]) {
            store.push(...rows);
            return { data: rows, error: null };
          },
        };
      },
    };
  }

  const hit = (trigger: EscalationHit["trigger"], instanceId: string): EscalationHit => ({
    trigger,
    rule: {
      trigger,
      climbs_to: "admin_level",
      urgency: "high",
      message_template: "{title}",
    },
    instanceId,
    obligationId: "ob-cpr",
    obligationKey: "cpr_first_aid_initial",
    title: "CPR/First Aid Certification — Initial",
    subject: personSubject(),
    recipientUserId: SUPER,
    urgency: "high",
    dueAt: "2026-08-01T00:00:00.000Z",
    message: "Ada Staff: CPR/First Aid Certification — Initial is 41 days overdue.",
    consequence: "Overdue 41 days. Manager of manager owns closure.",
    vars: {},
  });

  it("inserts on first true trigger and inserts zero on the second run", async () => {
    const firstStore: unknown[] = [];
    const first = await persistEscalationHits(mockSupabase([], firstStore), TNS_ORG_ID, [
      hit("overdue", "inst-cpr"),
    ]);
    assert.equal(first.inserted, 1);
    assert.equal(firstStore.length, 1);
    const row = firstStore[0] as { type: string; recurrence_key: string; next_remind_at: null };
    assert.equal(row.type, "escalation");
    assert.equal(row.recurrence_key, recurrenceKey("inst-cpr", "ob-cpr", "overdue"));
    assert.equal(row.next_remind_at, null);

    const secondStore: unknown[] = [];
    const second = await persistEscalationHits(
      mockSupabase([recurrenceKey("inst-cpr", "ob-cpr", "overdue")], secondStore),
      TNS_ORG_ID,
      [hit("overdue", "inst-cpr")],
    );
    assert.equal(second.inserted, 0);
    assert.equal(second.skipped, 1);
    assert.equal(secondStore.length, 0);
  });
});

describe("no dual escalation writers", () => {
  it("type=escalation inserts only from persistEscalationHits", () => {
    const src = readFileSync(new URL("./escalation.ts", import.meta.url), "utf8");
    assert.match(src, /type: "escalation"/);
    assert.match(src, /export async function persistEscalationHits/);
    const obligations = readFileSync(
      new URL("../company-obligations.functions.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(obligations, /type:\s*"escalation"/);
  });

  it("urgent cron is the nightly evaluator and stays no-PHI without the secret", () => {
    const src = readFileSync(
      new URL("../../routes/api/compliance/urgent.ts", import.meta.url),
      "utf8",
    );
    assert.match(src, /verifyCronSecret/);
    assert.match(src, /runNightlyEscalationEvaluator/);
    assert.match(src, /count: 0, items: \[\]/);
  });
});
