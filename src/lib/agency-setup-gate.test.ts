import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AGENCY_SETUP_INCOMPLETE_MESSAGE,
  AGENCY_SETUP_PATH,
  AGENCY_SETUP_QUESTIONS,
  EMPTY_AGENCY_SETUP_FACTS,
  SETUP_CREATE_APIS,
  SETUP_GATED_PATHS,
  assertAgencySetupComplete,
  canAccessOrgResource,
  canModifyAgencySetup,
  canSkipAgencySetup,
  canViewAgencySetup,
  computeAgencySetupStatus,
  isolateOrgRecords,
  isDashboardHomePath,
  isQuestionRequired,
  isSetupGatedPath,
  parseNullableTrimmedString,
  reevaluateAgencyRequirements,
  requiredAgencySetupQuestions,
  setupFactsFromOrgRow,
  setupRedirectForPath,
  shouldBlockStaffClientCreate,
  type AgencySetupFacts,
  type OrgAccessActor,
} from "./agency-setup-gate.ts";
import { CORE_RULE_LOGIC_SLICE } from "./obligations/draft-rules/fixtures.ts";
import { canActivate } from "./obligations/draft-rules/publication.ts";

function read(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const BASE_NEW_FACTS = {
  dhhsProviderId: "12345",
  seiAwardDate: null,
  providesRespiteOvernight: false,
  isUsorVendor: false,
  supportsSelfAdministeredMedication: false,
  actsAsRepresentativePayee: false,
  providesTransportation: false,
};

const RESIDENTIAL: AgencySetupFacts = {
  operates_ol_site: true,
  uses_volunteers: false,
  has_governing_board: true,
  servicesOffered: ["HHS", "RHS"],
  approxClientCount: 12,
  serviceArea: "Salt Lake, Davis",
  ...BASE_NEW_FACTS,
};

const EMPLOYMENT: AgencySetupFacts = {
  operates_ol_site: false,
  uses_volunteers: true,
  has_governing_board: false,
  servicesOffered: ["SEI", "DSI"],
  approxClientCount: 8,
  serviceArea: "Utah County",
  ...BASE_NEW_FACTS,
  seiAwardDate: "2026-01-15",
};

const AGENCY_A = {
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  name: "Wasatch Residential",
  actor: {
    userId: "11111111-1111-4111-8111-111111111111",
    organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    role: "admin",
  } satisfies OrgAccessActor,
  facts: RESIDENTIAL,
  staff: [
    {
      staffId: "staff-a-dsp",
      role: "employee",
      assignmentsKnown: true,
      assignedClientIds: ["client-a-1"],
      assignedServiceCodes: ["HHS"],
      transportsKnown: true,
      isTransporter: false,
      abiCaseloadKnown: true,
      hasAbiCaseload: false,
      requiresAbi: false,
      behaviorCaseloadKnown: true,
      hasBehaviorCaseload: false,
      requiresDeescalation: false,
      managerIdKnown: true,
      managerId: "mgr-a",
      hireDate: "2026-07-01",
      acreCertified: null,
      supervisorAcreCertified: null,
    },
  ],
  clients: [{ organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", id: "client-a-1" }],
};

const AGENCY_B = {
  organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  name: "Uintah Employment",
  actor: {
    userId: "22222222-2222-4222-8222-222222222222",
    organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    role: "admin",
  } satisfies OrgAccessActor,
  facts: EMPLOYMENT,
  staff: [
    {
      staffId: "staff-b-sei",
      role: "employee",
      assignmentsKnown: true,
      assignedClientIds: ["client-b-1"],
      assignedServiceCodes: ["SEI"],
      transportsKnown: true,
      isTransporter: true,
      abiCaseloadKnown: true,
      hasAbiCaseload: false,
      requiresAbi: false,
      behaviorCaseloadKnown: true,
      hasBehaviorCaseload: false,
      requiresDeescalation: false,
      managerIdKnown: true,
      managerId: "mgr-b",
      hireDate: "2026-07-01",
      acreCertified: true,
      supervisorAcreCertified: true,
    },
  ],
  clients: [{ organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", id: "client-b-1" }],
};

describe("unit: agency setup gate — registry-driven operating questions", () => {
  it("defines concrete operating questions for every agency fact — never whether a section applies", () => {
    assert.equal(AGENCY_SETUP_QUESTIONS.length, 12);
    const keys = AGENCY_SETUP_QUESTIONS.map((q) => q.factKey)
      .slice()
      .sort();
    assert.deepEqual(
      keys,
      [
        "awarded_service_codes",
        "community_program_total_persons_served",
        "dhhs_provider_id",
        "fact_acts_as_representative_payee",
        "fact_is_usor_vendor",
        "fact_provides_respite_overnight",
        "fact_provides_transportation",
        "fact_supports_self_administered_medication",
        "has_governing_board",
        "operates_ol_site",
        "sei_award_date",
        "uses_volunteers",
      ].sort(),
    );
    for (const q of AGENCY_SETUP_QUESTIONS) {
      assert.doesNotMatch(q.question, /does this (duty|obligation|section|clause|article) apply/i);
      assert.doesNotMatch(q.question, /does\s*§/);
      assert.doesNotMatch(
        q.question,
        /\bFACT-\d{3}\b/,
        `${q.factKey} leaks a workbook fact id into the question text`,
      );
      assert.doesNotMatch(
        q.question,
        /\bREQ-/,
        `${q.factKey} leaks a requirement key into the question text`,
      );
    }
  });

  it("requires the SEI award date only once SEI is an awarded code", () => {
    const withoutSei = requiredAgencySetupQuestions({ awardedCodes: [] });
    const withSei = requiredAgencySetupQuestions({ awardedCodes: ["SEI"] });
    assert.equal(
      withoutSei.some((q) => q.factKey === "sei_award_date"),
      false,
    );
    assert.equal(
      withSei.some((q) => q.factKey === "sei_award_date"),
      true,
    );
    assert.equal(withSei.length, withoutSei.length + 1);

    const seiQuestion = AGENCY_SETUP_QUESTIONS.find((q) => q.factKey === "sei_award_date")!;
    assert.equal(isQuestionRequired(seiQuestion, { awardedCodes: [] }), false);
    assert.equal(isQuestionRequired(seiQuestion, { awardedCodes: ["SEI"] }), true);
  });

  it("treats empty facts as 0 of 10 (SEI not awarded) and incomplete", () => {
    const status = computeAgencySetupStatus(EMPTY_AGENCY_SETUP_FACTS);
    assert.equal(status.complete, false);
    assert.equal(status.answeredCount, 0);
    assert.equal(status.requiredCount, 10);
    assert.equal(status.progressLabel, "0 of 10");
    assert.equal(canSkipAgencySetup(status), false);
    assert.equal(shouldBlockStaffClientCreate(status), true);
    assert.equal(status.createAllowed, false);
    assert.equal(status.createGateExempt, false);
    assert.equal(status.message, AGENCY_SETUP_INCOMPLETE_MESSAGE);
  });

  it("treats a single saved fact as 1 of 10 — banner math is not completion", () => {
    const status = computeAgencySetupStatus({
      ...EMPTY_AGENCY_SETUP_FACTS,
      servicesOffered: ["HHS"],
    });
    assert.equal(status.progressLabel, "1 of 10");
    assert.equal(status.complete, false);
    assert.equal(canSkipAgencySetup(status), false);
    assert.equal(shouldBlockStaffClientCreate(status), true);
  });

  it("is complete only when every currently-applicable required fact is saved", () => {
    const status = computeAgencySetupStatus(RESIDENTIAL);
    assert.equal(status.complete, true);
    assert.equal(status.answeredCount, 10);
    assert.equal(status.progressLabel, "10 of 10");
    assert.equal(canSkipAgencySetup(status), true);
    assert.equal(shouldBlockStaffClientCreate(status), false);
    assert.equal(status.createAllowed, true);
    assert.equal(status.message, null);
  });

  it("is complete for an SEI agency only once the SEI award date is also saved", () => {
    const missingDate = computeAgencySetupStatus({ ...EMPLOYMENT, seiAwardDate: null });
    assert.equal(missingDate.complete, false);
    assert.equal(missingDate.requiredCount, 11);
    assert.ok(missingDate.unanswered.some((q) => q.key === "sei_award_date"));

    const status = computeAgencySetupStatus(EMPLOYMENT);
    assert.equal(status.complete, true);
    assert.equal(status.requiredCount, 11);
  });

  it("does not treat false answers as unanswered", () => {
    const status = computeAgencySetupStatus(EMPLOYMENT);
    assert.equal(status.complete, true);
    assert.ok(status.answeredKeys.includes("operates_ol_site"));
    assert.ok(status.answeredKeys.includes("uses_volunteers"));
    assert.ok(status.answeredKeys.includes("fact_provides_respite_overnight"));
  });

  it("reads service_area from the dedicated column — never specializations", () => {
    assert.equal(parseNullableTrimmedString(null), null);
    assert.equal(parseNullableTrimmedString("   "), null);
    assert.equal(parseNullableTrimmedString("Utah County"), "Utah County");
    const ignored = setupFactsFromOrgRow({
      services_offered: ["HHS"],
      fact_operates_ol_site: true,
      fact_uses_volunteers: false,
      fact_has_governing_board: true,
      approx_client_count: 1,
      service_area: null,
      specializations: "Service area: Salt Lake",
    } as { service_area?: unknown; specializations?: unknown });
    assert.equal(ignored.serviceArea, null);
    assert.equal(computeAgencySetupStatus(ignored).complete, false);
  });

  it("reads completion from a saved org row — not localStorage", () => {
    const incomplete = setupFactsFromOrgRow({
      services_offered: ["HHS"],
      fact_operates_ol_site: null,
      fact_uses_volunteers: null,
      fact_has_governing_board: null,
      approx_client_count: null,
      service_area: null,
    });
    assert.equal(computeAgencySetupStatus(incomplete).progressLabel, "1 of 10");

    const complete = setupFactsFromOrgRow({
      services_offered: ["SEI", "DSI"],
      fact_operates_ol_site: false,
      fact_uses_volunteers: true,
      fact_has_governing_board: false,
      fact_provides_respite_overnight: false,
      fact_is_usor_vendor: false,
      fact_supports_self_administered_medication: false,
      fact_acts_as_representative_payee: false,
      fact_provides_transportation: false,
      approx_client_count: 8,
      service_area: "Utah County",
      dhhs_provider_id: "12345",
      sei_award_date: "2026-01-15",
    });
    assert.equal(computeAgencySetupStatus(complete).complete, true);
  });

  it("lets a grandfathered org create while Skip stays disabled", () => {
    const incomplete = computeAgencySetupStatus(
      { ...EMPTY_AGENCY_SETUP_FACTS, servicesOffered: ["HHS"] },
      { createGateExempt: true },
    );
    assert.equal(incomplete.complete, false);
    assert.equal(incomplete.createGateExempt, true);
    assert.equal(incomplete.createAllowed, true);
    assert.equal(canSkipAgencySetup(incomplete), false);
    assert.equal(shouldBlockStaffClientCreate(incomplete), false);
    assert.equal(setupRedirectForPath("/dashboard/employees", incomplete), null);
  });

  it("changing awarded services changes which questions are required (never erases other answers)", () => {
    const before = computeAgencySetupStatus({ ...RESIDENTIAL, servicesOffered: ["HHS", "RHS"] });
    assert.equal(before.requiredCount, 10);
    const afterAwardingSei = computeAgencySetupStatus({
      ...RESIDENTIAL,
      servicesOffered: ["HHS", "RHS", "SEI"],
    });
    assert.equal(afterAwardingSei.requiredCount, 11);
    assert.equal(afterAwardingSei.complete, false);
    assert.ok(afterAwardingSei.unanswered.some((q) => q.key === "sei_award_date"));
    // Every other already-saved answer is untouched.
    assert.equal(afterAwardingSei.answeredKeys.includes("operates_ol_site"), true);
    assert.equal(afterAwardingSei.answeredKeys.includes("dhhs_provider_id"), true);
  });
});

describe("unit: agency setup gate — skip, create, redirect", () => {
  it("disables skip while required questions are unanswered", () => {
    const incomplete = computeAgencySetupStatus({
      ...EMPTY_AGENCY_SETUP_FACTS,
      servicesOffered: ["HHS"],
    });
    assert.equal(canSkipAgencySetup(incomplete), false);
    const panel = read("../components/onboarding/nectar-onboarding-panel.tsx");
    assert.match(panel, /canSkipAgencySetup/);
    assert.doesNotMatch(panel, /Skip — take me to my dashboard/);
  });

  it("blocks create UI and server create while incomplete", () => {
    const incomplete = computeAgencySetupStatus(EMPTY_AGENCY_SETUP_FACTS);
    assert.equal(shouldBlockStaffClientCreate(incomplete), true);
    assert.throws(() => assertAgencySetupComplete(incomplete), /Agency setup is incomplete/);

    const hire = read("./employees.functions.ts");
    const invites = read("./invitations.functions.ts");
    const clients = read("../routes/dashboard.clients.tsx");
    const importCommit = read("./smart-import-commit.functions.ts");
    assert.match(hire, /assertAgencySetupCompleteForOrg/);
    assert.match(invites, /assertAgencySetupCompleteForOrg/);
    assert.match(clients, /assertAgencySetupCompleteForOrg|shouldBlockStaffClientCreate/);
    assert.match(importCommit, /assertAgencySetupCompleteForOrg/);
    for (const api of SETUP_CREATE_APIS) {
      assert.ok(api.length > 0);
    }
  });

  it("redirects protected staff/client URLs to setup when incomplete", () => {
    const incomplete = computeAgencySetupStatus({
      ...EMPTY_AGENCY_SETUP_FACTS,
      servicesOffered: ["HHS"],
    });
    const complete = computeAgencySetupStatus(RESIDENTIAL);
    for (const path of SETUP_GATED_PATHS) {
      assert.equal(isSetupGatedPath(path), true);
      const redirect = setupRedirectForPath(path, incomplete);
      assert.deepEqual(redirect, {
        to: AGENCY_SETUP_PATH,
        search: { reason: "setup_incomplete" },
      });
      assert.equal(setupRedirectForPath(path, complete), null);
    }
    assert.equal(isDashboardHomePath("/dashboard"), true);
    assert.equal(setupRedirectForPath("/dashboard", incomplete), null);
    assert.equal(isSetupGatedPath("/dashboard"), false);
    assert.equal(isSetupGatedPath("/dashboard/settings/compliance-setup"), false);
  });

  it("setup page derives its conditional sections from live draft state, not a stale query", () => {
    const setupPage = read("../routes/dashboard.settings.compliance-setup.tsx");
    assert.match(setupPage, /const \{ facts, status, isLoading \} = useAgencySetup\(\)/);
    assert.match(setupPage, /agencyAnswerContext\(/);
    assert.doesNotMatch(setupPage, /factsQuery/);
  });

  it("keeps Home available for incomplete-setup guidance", () => {
    const home = read("../components/admin-home/admin-home-dashboard.tsx");
    assert.match(home, /NectarOnboardingPanel/);
    assert.doesNotMatch(home, /RequirePermission/);
  });
});

describe("unit: agency setup helpers on in-memory arrays (not database isolation)", () => {
  it("computes different requirements from different services, roles, and client needs", () => {
    const a = reevaluateAgencyRequirements({
      organizationId: AGENCY_A.organizationId,
      facts: AGENCY_A.facts,
      staff: AGENCY_A.staff,
    });
    const b = reevaluateAgencyRequirements({
      organizationId: AGENCY_B.organizationId,
      facts: AGENCY_B.facts,
      staff: AGENCY_B.staff,
    });

    assert.equal(a.organizationId, AGENCY_A.organizationId);
    assert.equal(b.organizationId, AGENCY_B.organizationId);
    assert.equal(a.activatedRules, false);
    assert.equal(b.activatedRules, false);
    assert.equal(a.canActivateAny, false);
    assert.equal(b.canActivateAny, false);
    assert.equal(a.draft.createdLiveAssignments, false);
    assert.equal(b.draft.createdLiveAssignments, false);

    const aZoning = a.applicability.find((row) => row.obligationKey === "zoning_life_safety");
    const bZoning = b.applicability.find((row) => row.obligationKey === "zoning_life_safety");
    assert.equal(aZoning?.applies, true);
    assert.equal(bZoning?.applies, false);

    const aHousemate = a.applicability.find(
      (row) => row.obligationKey === "housemate_informed_choice",
    );
    const bHousemate = b.applicability.find(
      (row) => row.obligationKey === "housemate_informed_choice",
    );
    assert.equal(aHousemate?.applies, true);
    assert.equal(bHousemate?.applies, false);

    const aKeys = new Set(
      a.applicability.filter((row) => row.applies).map((row) => row.obligationKey),
    );
    const bKeys = new Set(
      b.applicability.filter((row) => row.applies).map((row) => row.obligationKey),
    );
    assert.notDeepEqual([...aKeys].sort(), [...bKeys].sort());
    assert.ok(CORE_RULE_LOGIC_SLICE.every((rule) => canActivate(rule) === false));
  });

  it("prevents one agency from viewing or modifying the other's setup, staff, clients, or requirements", () => {
    assert.equal(
      canViewAgencySetup({ actor: AGENCY_A.actor, organizationId: AGENCY_B.organizationId }),
      false,
    );
    assert.equal(
      canModifyAgencySetup({ actor: AGENCY_A.actor, organizationId: AGENCY_B.organizationId }),
      false,
    );
    assert.equal(
      canAccessOrgResource({
        actor: AGENCY_A.actor,
        resourceOrganizationId: AGENCY_B.organizationId,
      }),
      false,
    );
    assert.equal(
      canViewAgencySetup({ actor: AGENCY_A.actor, organizationId: AGENCY_A.organizationId }),
      true,
    );
    assert.equal(
      canModifyAgencySetup({ actor: AGENCY_B.actor, organizationId: AGENCY_B.organizationId }),
      true,
    );

    const mixedStaff = [
      { organizationId: AGENCY_A.organizationId, id: "staff-a-dsp" },
      { organizationId: AGENCY_B.organizationId, id: "staff-b-sei" },
    ];
    const mixedClients = [...AGENCY_A.clients, ...AGENCY_B.clients];
    const mixedReqs = [
      { organizationId: AGENCY_A.organizationId, key: "zoning_life_safety" },
      { organizationId: AGENCY_B.organizationId, key: "acre_sei" },
    ];
    assert.deepEqual(isolateOrgRecords(AGENCY_A.actor, mixedStaff), [
      { organizationId: AGENCY_A.organizationId, id: "staff-a-dsp" },
    ]);
    assert.deepEqual(isolateOrgRecords(AGENCY_B.actor, mixedClients), AGENCY_B.clients);
    assert.deepEqual(isolateOrgRecords(AGENCY_A.actor, mixedReqs), [
      { organizationId: AGENCY_A.organizationId, key: "zoning_life_safety" },
    ]);
    assert.deepEqual(isolateOrgRecords(null, mixedStaff), []);
  });

  it("does not publish or activate draft catalog rules after re-evaluation", () => {
    const persist = read("./obligations/applicability.ts");
    const gate = read("./agency-setup-persist.ts");
    assert.match(persist, /persistApplicabilityRows/);
    assert.match(gate, /reevaluateAgencyRequirements/);
    assert.match(gate, /canActivate/);
    assert.doesNotMatch(gate, /canActivate\s*=\s*true/);
    assert.doesNotMatch(gate, /execution_status:\s*"published"/);
  });
});

describe("unit: SQL source review (not a live database)", () => {
  it("correlates first-owner EXISTS to the inserted organization_members row (original gate migration, unchanged)", () => {
    const sql = read("../../supabase/migrations/20260914120000_agency_setup_gate.sql");
    assert.match(sql, /om\.organization_id = NEW\.organization_id/);
    assert.match(sql, /existing_member\.organization_id = organization_members\.organization_id/);
    assert.doesNotMatch(sql, /WHERE om\.organization_id = organization_id\s*\n/);
    assert.match(sql, /FOR INSERT/);
    assert.doesNotMatch(sql, /FOR SELECT[\s\S]*requires_setup/);
    assert.match(sql, /REVOKE UPDATE \(setup_create_gate_exempt\)/);
    assert.match(sql, /trg_protect_setup_create_gate_exempt/);
    assert.match(sql, /current_user IN \('service_role', 'postgres', 'supabase_admin'\)/);
    assert.doesNotMatch(sql, /current_user = 'authenticated'/);
    assert.match(
      sql,
      /IF current_user IN \('service_role', 'postgres', 'supabase_admin'\) THEN\s+RETURN NEW;\s+END IF;\s+RAISE EXCEPTION/,
    );
    assert.match(
      sql,
      /SELECT count\(\*\)\s+FROM public\.organization_members om\s+WHERE om\.organization_id = o\.id\s+\) > 1/,
    );
  });

  it("the questionnaire migration matches the TypeScript completion spec exactly", () => {
    const sql = read("../../supabase/migrations/20260915080000_agency_setup_questionnaire.sql");
    assert.match(sql, /service_area IS NOT NULL/);
    assert.match(sql, /length\(trim\(o\.service_area\)\) > 0/);
    assert.doesNotMatch(sql, /o\.specializations ~\*/);
    for (const column of [
      "fact_operates_ol_site",
      "fact_uses_volunteers",
      "fact_has_governing_board",
      "fact_provides_respite_overnight",
      "fact_is_usor_vendor",
      "fact_supports_self_administered_medication",
      "fact_acts_as_representative_payee",
      "fact_provides_transportation",
      "dhhs_provider_id",
    ]) {
      assert.match(
        sql,
        new RegExp(`o\\.${column} IS NOT NULL`),
        `missing completeness check for ${column}`,
      );
    }
    assert.match(sql, /'SEI' = ANY/);
    assert.match(sql, /sei_award_date IS NOT NULL/);
    // Completion audit columns are locked the same way setup_create_gate_exempt is.
    assert.match(
      sql,
      /REVOKE UPDATE \(setup_completed_at, setup_completed_by, setup_questionnaire_version\)/,
    );
    assert.match(sql, /trg_protect_agency_setup_completion_columns/);
    // Real DDL only — the file's own header prose says "No DROP TABLE / DROP
    // COLUMN", which would otherwise false-positive a naive substring check.
    assert.doesNotMatch(sql, /^\s*DROP TABLE\b/m);
    assert.doesNotMatch(sql, /^\s*DROP COLUMN\b/m);
    assert.doesNotMatch(sql, /^\s*ALTER TABLE[^;]*DROP COLUMN/m);
    // The generic deferred-fact table never gates agency setup.
    const gateFnBody = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.org_setup_is_complete"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.org_setup_allows_create"),
    );
    assert.doesNotMatch(gateFnBody, /compliance_fact_answers/);
  });

  it("locks compliance_fact_answers to org members, writes to admins/managers", () => {
    const sql = read("../../supabase/migrations/20260915080000_agency_setup_questionnaire.sql");
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /is_org_member\(organization_id, auth\.uid\(\)\)/);
    assert.match(sql, /is_org_admin_or_manager\(organization_id, auth\.uid\(\)\)/);
  });

  it("does not write service area into specializations", () => {
    const fns = read("./agency-setup-persist.ts");
    const profile = read("../routes/dashboard.nectar-company-profile.tsx");
    assert.doesNotMatch(fns, /Service area:/);
    assert.doesNotMatch(fns, /mergeServiceAreaIntoSpecializations/);
    assert.match(fns, /service_area: nextArea/);
    assert.doesNotMatch(fns, /setup_create_gate_exempt:/);
    assert.doesNotMatch(profile, /Service area: \$\{/);
    assert.doesNotMatch(profile, /localStorage|onboardingLSKey|notifyOnboardingChanged/);
  });
});

describe("unit: persist rollback when a later step fails", () => {
  it("restores the org snapshot if applicability persist throws", async () => {
    const { persistAgencySetupFactsInternal } = await import("./agency-setup-persist.ts");
    const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const snapshot = {
      fact_operates_ol_site: null,
      fact_uses_volunteers: null,
      fact_has_governing_board: null,
      fact_provides_respite_overnight: null,
      fact_is_usor_vendor: null,
      fact_supports_self_administered_medication: null,
      fact_acts_as_representative_payee: null,
      fact_provides_transportation: null,
      services_offered: ["HHS"],
      approx_client_count: null,
      service_area: null,
      dhhs_provider_id: null,
      sei_award_date: null,
      setup_create_gate_exempt: false,
      fact_answers_updated_at: null,
      fact_answers_updated_by: null,
      setup_completed_at: null,
      setup_completed_by: null,
      setup_questionnaire_version: null,
    };
    const updates: unknown[] = [];
    const supabase = {
      from(table: string) {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { ...snapshot }, error: null }),
                };
              },
            };
          },
          update(payload: unknown) {
            updates.push({ table, payload });
            return {
              eq: async () => {
                if (table === "obligation_applicability") {
                  return { error: { message: "simulated applicability failure" } };
                }
                return { error: null };
              },
            };
          },
          upsert() {
            return Promise.resolve({
              error: { message: "simulated applicability failure" },
            });
          },
        };
      },
    };

    await assert.rejects(
      () =>
        persistAgencySetupFactsInternal(supabase, orgId, "11111111-1111-4111-8111-111111111111", {
          operates_ol_site: true,
          uses_volunteers: false,
          has_governing_board: true,
          servicesOffered: ["HHS", "RHS"],
          approxClientCount: 12,
          serviceArea: "Salt Lake",
        }),
      /simulated applicability failure/,
    );
    assert.ok(updates.length >= 2);
    const restore = updates.at(-1) as { payload: Record<string, unknown> };
    assert.equal(restore.payload.service_area, null);
    assert.deepEqual(restore.payload.services_offered, ["HHS"]);
  });
});
