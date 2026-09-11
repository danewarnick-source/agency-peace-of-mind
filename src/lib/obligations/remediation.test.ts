import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  applyRemediationPlanOutcomes,
  consequenceForPlanKind,
  initialRemediationPlanStatus,
  kindFromEscalationTrigger,
  pickPlanOwner,
  planOwnerLabel,
  urgencyForPlan,
  type RemediationPlanRow,
} from "./remediation.ts";
import {
  BLOCKS_SOLO_WHEN_LAPSED_KEYS,
  filterSoloLapsesForClient,
  isBlocksSoloWhenLapsedKey,
  overrideIsActive,
  soloLapseAppliesToClient,
  soloLapseLabel,
  type SoloLapse,
} from "./solo-lapse.ts";
import {
  assembleThisWeekFromHits,
  sortThisWeekItems,
  type Decision,
} from "./this-week.functions.ts";
import { sowCatalogEntryByKey } from "../sow-obligation-catalog.ts";
import {
  TNS_ORG_ID,
  type EscalationHit,
  type EscalationRule,
  type OrgMemberRow,
} from "./escalation.ts";

const STAFF = "11111111-1111-1111-1111-111111111111";
const MANAGER = "22222222-2222-2222-2222-222222222222";
const ADMIN = "44444444-4444-4444-4444-444444444444";
const SUPER = "55555555-5555-5555-5555-555555555555";
const MEM_STAFF = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MEM_MGR = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const MEM_ADMIN = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const MEM_SUPER = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const members: OrgMemberRow[] = [
  { id: MEM_STAFF, user_id: STAFF, role: "employee", manager_id: MEM_MGR, active: true },
  { id: MEM_MGR, user_id: MANAGER, role: "manager", manager_id: null, active: true },
  { id: MEM_ADMIN, user_id: ADMIN, role: "admin", manager_id: MEM_SUPER, active: true },
  { id: MEM_SUPER, user_id: SUPER, role: "super_admin", manager_id: null, active: true },
];

const now = new Date("2026-09-11T12:00:00.000Z");

function soloRule(): EscalationRule {
  return {
    trigger: "overdue",
    climbs_to: "manager_of_manager",
    urgency: "high",
    message_template: "{title} is overdue.",
    state_code: "UT",
  };
}

function hit(
  partial: Partial<EscalationHit> & Pick<EscalationHit, "trigger" | "obligationId">,
): EscalationHit {
  return {
    rule: soloRule(),
    instanceId: "inst-cpr",
    obligationKey: "cpr_first_aid_renewal",
    title: "CPR/First Aid Certification — Renewal",
    subject: {
      organizationId: TNS_ORG_ID,
      kind: "person",
      staffUserId: STAFF,
      primaryAssignedStaffId: STAFF,
      displayName: "Staff",
    },
    recipientUserId: MANAGER,
    urgency: "high",
    dueAt: "2026-09-01T00:00:00.000Z",
    message: "CPR is overdue.",
    consequence: "Overdue.",
    vars: {},
    ...partial,
  };
}

describe("blocks_solo_when_lapsed keys", () => {
  it("covers the SOW before-working-alone clocks and they resolve in the catalog", () => {
    for (const key of BLOCKS_SOLO_WHEN_LAPSED_KEYS) {
      assert.equal(isBlocksSoloWhenLapsedKey(key), true);
      assert.ok(sowCatalogEntryByKey(key), `missing catalog entry for ${key}`);
      assert.ok(soloLapseLabel(key).length > 0);
    }
    assert.equal(isBlocksSoloWhenLapsedKey("ce_12h_annual"), false);
  });

  it("ABI and Mandt only apply when the client context matches", () => {
    assert.equal(soloLapseAppliesToClient("orientation_30_day", {}), true);
    assert.equal(soloLapseAppliesToClient("abi_training", { hasAbi: false }), false);
    assert.equal(soloLapseAppliesToClient("abi_training", { hasAbi: true }), true);
    assert.equal(soloLapseAppliesToClient("behavior_intervention_cert", {}), false);
    assert.equal(
      soloLapseAppliesToClient("behavior_intervention_cert", { hasBehaviorPlan: true }),
      true,
    );
  });

  it("filters client-inapplicable lapses", () => {
    const rows: SoloLapse[] = [
      {
        obligationKey: "orientation_30_day",
        obligationId: "o1",
        instanceId: "i1",
        title: "30-Day",
        dueAt: null,
        label: "30-day orientation",
      },
      {
        obligationKey: "abi_training",
        obligationId: "o2",
        instanceId: "i2",
        title: "ABI",
        dueAt: null,
        label: "ABI training",
      },
    ];
    assert.equal(filterSoloLapsesForClient(rows, { hasAbi: false }).length, 1);
    assert.equal(filterSoloLapsesForClient(rows, { hasAbi: true }).length, 2);
  });

  it("treats a missing expires_at as an active override", () => {
    assert.equal(overrideIsActive(null, now), true);
    assert.equal(overrideIsActive("2026-09-10T00:00:00.000Z", now), false);
    assert.equal(overrideIsActive("2026-09-12T00:00:00.000Z", now), true);
  });
});

describe("plan kinds and owners", () => {
  it("maps Step 2 triggers onto getThisWeek plan kinds", () => {
    assert.equal(
      kindFromEscalationTrigger("would_create_finding_if_scheduled", "cpr_first_aid_renewal"),
      "scheduled_while_lapsed",
    );
    assert.equal(kindFromEscalationTrigger("overdue", "cpr_first_aid_renewal"), "solo_lapse");
    assert.equal(kindFromEscalationTrigger("overdue", "hhs_home_cert_annual"), "overdue");
    assert.equal(
      kindFromEscalationTrigger("standing_record_missing_30d", null),
      "standing_missing",
    );
    assert.equal(kindFromEscalationTrigger("license_or_repayment_risk", null), "license_risk");
    assert.equal(kindFromEscalationTrigger("half_window_not_started", "orientation_30_day"), null);
  });

  it("routes solo plans to the staff manager and license plans to admin_level", () => {
    assert.equal(pickPlanOwner("solo_lapse", STAFF, members), MANAGER);
    assert.equal(pickPlanOwner("license_risk", STAFF, members), SUPER);
    assert.equal(planOwnerLabel("solo_lapse"), "manager");
    assert.equal(planOwnerLabel("standing_missing"), "admin_level");
    assert.equal(planOwnerLabel("overdue"), "manager");
    assert.equal(urgencyForPlan("license_risk", false), "critical");
    assert.match(consequenceForPlanKind("solo_lapse"), /work alone/);
    assert.equal(initialRemediationPlanStatus("overdue"), "approved");
    assert.equal(initialRemediationPlanStatus("license_risk"), "awaiting_approval");
    assert.equal(initialRemediationPlanStatus("standing_missing"), "awaiting_approval");
    assert.equal(initialRemediationPlanStatus("solo_lapse"), "awaiting_approval");
  });

  it("labels This Week cards by trigger and never returns Escalation", () => {
    const src = readFileSync(
      new URL("../../components/compliance/this-week-plan-cards.tsx", import.meta.url),
      "utf8",
    );
    const card = readFileSync(
      new URL("../../components/compliance/decision-card.tsx", import.meta.url),
      "utf8",
    );
    const decorate = readFileSync(new URL("./this-week.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /return "Escalation"/);
    assert.doesNotMatch(card, /kindLabel/);
    assert.doesNotMatch(card, /line-clamp|truncate/);
    assert.match(src, /half_window_not_started/);
    assert.match(decorate, /Log a plan/);
    assert.match(decorate, /Log the renewal/);
    assert.match(decorate, /Read and sign/);
    assert.match(src, /DecisionCard/);
    assert.match(src, /LicenseRiskPlanDialog/);
    assert.match(src, /StandingRecordPlanDialog/);
    assert.match(src, /OverdueObligationPlanDialog/);
    assert.match(src, /HOME_CARD_CAP = 3/);
    assert.match(src, /decisionCountLine/);
    assert.match(src, /"Three"/);
  });
});

describe("getThisWeek plan cards", () => {
  it("sorts remediation_plan decisions ahead of quieter items by urgency", () => {
    const plan: Decision = {
      kind: "decision",
      id: "remediation_plan:p1",
      title: "CPR/First Aid Certification — Renewal",
      body: "Restore CPR before this staff works alone.",
      urgency: "high",
      dueAt: "2026-09-01T00:00:00.000Z",
      ownerUserId: MANAGER,
      ownerLabel: "manager",
      consequence: consequenceForPlanKind("solo_lapse"),
      source: "remediation_plan",
      planId: "p1",
      planKind: "solo_lapse",
    };
    const week = assembleThisWeekFromHits(MANAGER, [], [plan]);
    assert.equal(week[0]?.kind, "decision");
    assert.equal(
      week[0] && week[0].kind === "decision" ? week[0].source : null,
      "remediation_plan",
    );
    assert.equal(week[0] && week[0].kind === "decision" ? week[0].planKind : null, "solo_lapse");
    assert.equal(week[0] && week[0].kind === "decision" ? week[0].ownerUserId : null, MANAGER);
  });

  it("scopes getThisWeek plan cards to the owner", () => {
    const plan: Decision = {
      kind: "decision",
      id: "remediation_plan:p2",
      title: "License",
      body: "Close license.",
      urgency: "critical",
      dueAt: null,
      ownerUserId: SUPER,
      ownerLabel: "admin_level",
      consequence: consequenceForPlanKind("license_risk"),
      source: "remediation_plan",
      planId: "p2",
      planKind: "license_risk",
    };
    const forAdmin = assembleThisWeekFromHits(SUPER, [], [plan]);
    const forManager = assembleThisWeekFromHits(MANAGER, [], []);
    assert.equal(forAdmin.length, 1);
    assert.equal(forManager.length, 0);
  });

  it("keeps critical license plans first", () => {
    const items = sortThisWeekItems([
      {
        kind: "decision",
        id: "r-overdue",
        title: "Overdue",
        body: "",
        urgency: "high",
        dueAt: "2026-09-01T00:00:00.000Z",
        ownerUserId: MANAGER,
        ownerLabel: "manager",
        consequence: "c",
        source: "remediation_plan",
        planKind: "overdue",
      },
      {
        kind: "decision",
        id: "r-lic",
        title: "License",
        body: "",
        urgency: "critical",
        dueAt: "2026-10-01T00:00:00.000Z",
        ownerUserId: SUPER,
        ownerLabel: "admin_level",
        consequence: "c",
        source: "remediation_plan",
        planKind: "license_risk",
      },
    ]);
    assert.equal(items[0]?.id, "r-lic");
  });
});

type FakeRow = Record<string, unknown>;

function fakeSupabase(store: {
  plans: FakeRow[];
  instances: FakeRow[];
  notifications: FakeRow[];
  inserts: FakeRow[];
}) {
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
          : name === "notifications"
            ? store.notifications
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
      insert: (row: FakeRow) => {
        store.inserts.push({ ...row, id: `new-${store.inserts.length + 1}` });
        return Promise.resolve({ data: null, error: null });
      },
      update: (patch: FakeRow) => {
        const apply = () => {
          const hitRows = rows.filter((r) => matches(r, filters));
          for (const r of hitRows) Object.assign(r, patch);
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
      then: (resolve: (v: { data: FakeRow[]; error: null }) => unknown) => {
        const data = rows.filter((r) => matches(r, filters));
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return api;
  };

  return { from: (name: string) => table(name) };
}

describe("nightly plan outcomes", () => {
  it("completes a plan when the instance is done and resolves matching escalations", async () => {
    const plan: RemediationPlanRow = {
      id: "p1",
      organization_id: TNS_ORG_ID,
      obligation_id: "ob-cpr",
      instance_id: "inst-cpr",
      staff_id: STAFF,
      obligation_key: "cpr_first_aid_renewal",
      title: "CPR/First Aid Certification — Renewal",
      kind: "solo_lapse",
      status: "awaiting_approval",
      plan_text: "Restore CPR before this staff works alone.",
      due_at: "2026-09-01T00:00:00.000Z",
      proposed_by: null,
      reviewed_by: null,
      reviewed_at: null,
      outcome: null,
      outcome_note: null,
      outcome_at: null,
    };
    const store = {
      plans: [plan as unknown as FakeRow],
      instances: [{ id: "inst-cpr", status: "completed", completed_at: now.toISOString() }],
      notifications: [
        {
          id: "n1",
          organization_id: TNS_ORG_ID,
          type: "escalation",
          related_id: "inst-cpr",
          resolved_at: null,
        },
      ],
      inserts: [] as FakeRow[],
    };
    const summary = await applyRemediationPlanOutcomes(
      fakeSupabase(store),
      TNS_ORG_ID,
      [hit({ trigger: "overdue", obligationId: "ob-cpr" })],
      now,
    );
    assert.equal(summary.completed, 1);
    assert.equal(summary.resolvedNotifications, 1);
    assert.equal(store.plans[0]?.status, "completed");
    assert.equal(store.notifications[0]?.resolved_at != null, true);
  });

  it("does not expire an open solo-lapse plan just because the clock is already overdue", async () => {
    const plan: RemediationPlanRow = {
      id: "p2",
      organization_id: TNS_ORG_ID,
      obligation_id: "ob-cpr",
      instance_id: "inst-cpr",
      staff_id: STAFF,
      obligation_key: "cpr_first_aid_renewal",
      title: "CPR/First Aid Certification — Renewal",
      kind: "solo_lapse",
      status: "awaiting_approval",
      plan_text: "Restore CPR.",
      due_at: "2026-09-01T00:00:00.000Z",
      proposed_by: null,
      reviewed_by: null,
      reviewed_at: null,
      outcome: null,
      outcome_note: null,
      outcome_at: null,
    };
    const store = {
      plans: [plan as unknown as FakeRow],
      instances: [{ id: "inst-cpr", status: "overdue", completed_at: null }],
      notifications: [],
      inserts: [] as FakeRow[],
    };
    const summary = await applyRemediationPlanOutcomes(fakeSupabase(store), TNS_ORG_ID, [], now);
    assert.equal(summary.expired, 0);
    assert.equal(summary.skipped, 1);
    assert.equal(store.plans[0]?.status, "awaiting_approval");
  });

  it("ensures a scheduled-while-lapsed plan from an evaluator hit", async () => {
    const store = {
      plans: [] as FakeRow[],
      instances: [] as FakeRow[],
      notifications: [] as FakeRow[],
      inserts: [] as FakeRow[],
    };
    const summary = await applyRemediationPlanOutcomes(
      fakeSupabase(store),
      TNS_ORG_ID,
      [
        hit({
          trigger: "would_create_finding_if_scheduled",
          obligationId: "ob-cpr",
          obligationKey: "cpr_first_aid_renewal",
        }),
      ],
      now,
    );
    assert.equal(summary.ensured, 1);
    assert.equal(store.inserts[0]?.kind, "scheduled_while_lapsed");
    assert.equal(store.inserts[0]?.status, "awaiting_approval");
    assert.ok(!String(store.inserts[0]?.plan_text ?? "").includes("Ada"));
  });

  it("does not complete the underlying instance when a plan is approved", async () => {
    const plan: RemediationPlanRow = {
      id: "p3",
      organization_id: TNS_ORG_ID,
      obligation_id: "ob-cpr",
      instance_id: "inst-cpr",
      staff_id: STAFF,
      obligation_key: "cpr_first_aid_renewal",
      title: "CPR/First Aid Certification — Renewal",
      kind: "overdue",
      status: "approved",
      plan_text: "Restore CPR.",
      due_at: "2026-10-01T00:00:00.000Z",
      proposed_by: null,
      reviewed_by: ADMIN,
      reviewed_at: now.toISOString(),
      outcome: "approved",
      outcome_note: null,
      outcome_at: now.toISOString(),
    };
    const store = {
      plans: [plan as unknown as FakeRow],
      instances: [{ id: "inst-cpr", status: "overdue", completed_at: null }],
      notifications: [
        {
          id: "n2",
          organization_id: TNS_ORG_ID,
          type: "escalation",
          related_id: "inst-cpr",
          resolved_at: null,
        },
      ],
      inserts: [] as FakeRow[],
    };
    await applyRemediationPlanOutcomes(fakeSupabase(store), TNS_ORG_ID, [], now);
    assert.equal(store.instances[0]?.status, "overdue");
    assert.equal(store.instances[0]?.completed_at, null);
    assert.notEqual(store.plans[0]?.status, "completed");
  });
});

describe("remediation plan does not close the requirement", () => {
  it("review and propose writers never complete company_obligation_instances", () => {
    const src = readFileSync(new URL("./remediation.functions.ts", import.meta.url), "utf8");
    assert.match(src, /export const reviewRemediationPlan/);
    assert.match(src, /export const proposeRemediationPlan/);
    assert.doesNotMatch(
      src,
      /from\("company_obligation_instances"\)[\s\S]{0,800}status:\s*"completed"/,
    );
    assert.doesNotMatch(src, /\.update\(\{[\s\S]{0,200}status:\s*"completed"/);
    const nightly = readFileSync(new URL("./remediation.ts", import.meta.url), "utf8");
    assert.match(nightly, /markPlanOutcome/);
    assert.doesNotMatch(nightly, /from\("company_obligation_instances"\)[\s\S]{0,400}\.update\(/);
  });
});

describe("Soft SQL locks", () => {
  it("ships the 140000 stamp, both tables, and no DROP TABLE", () => {
    const reserved = [
      "20260911100000",
      "20260911101000",
      "20260911110000",
      "20260911120000",
      "20260911130000",
    ];
    for (const stamp of reserved) {
      assert.equal(
        existsSync(`supabase/migrations/${stamp}_remediation_plans.sql`),
        false,
        `Step 4 must not reuse reserved stamp ${stamp}`,
      );
    }
    const path = "supabase/migrations/20260911140000_remediation_plans.sql";
    assert.equal(existsSync(path), true);
    const sql = readFileSync(path, "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.remediation_plans/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.compliance_overrides/);
    assert.match(sql, /is_org_member/);
    assert.match(sql, /is_org_admin_or_manager/);
    assert.doesNotMatch(sql, /^\s*DROP TABLE/im);
  });
});
