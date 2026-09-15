/**
 * Real Postgres integration tests for the agency setup gate.
 * Isolated local database only. Refuses Hive-Platform production.
 *
 * These are not the in-memory array unit tests in agency-setup-gate.test.ts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, before, after } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { computeAgencySetupStatus, setupFactsFromOrgRow } from "./agency-setup-gate.ts";
import { persistAgencySetupFactsInternal } from "./agency-setup-persist.ts";
import { deferredFact } from "./obligations/deferred-setup-facts.ts";

const HIVE_PLATFORM_REF = "dhrrukdcigiiqksibdfb";
const DEFAULT_URL =
  process.env.AGENCY_SETUP_TEST_DATABASE_URL ??
  "postgresql://agency_setup_it:agency_setup_it@127.0.0.1:5432/agency_setup_gate_it";

const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const USER_B = "22222222-2222-4222-8222-222222222222";
const ORG_EXISTING = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5";
const USER_EXISTING = "55555555-5555-4555-8555-555555555555";
const ORG_TNS = "7fabcf5d-f826-487f-8730-8b0c3f1969bb";
const ORG_TWO = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
const USER_TWO = "44444444-4444-4444-8444-444444444444";
const USER_TWO_B = "44444444-4444-4444-8444-444444444445";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_A2 = "11111111-1111-4111-8111-111111111112";
const ORG_C = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const USER_C = "33333333-3333-4333-8333-333333333333";
const USER_C2 = "33333333-3333-4333-8333-333333333334";

function refuseProduction(url: string) {
  if (url.includes(HIVE_PLATFORM_REF)) {
    throw new Error(
      "Refusing Hive-Platform production (dhrrukdcigiiqksibdfb). Use a local or dedicated test database.",
    );
  }
}

function readRel(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

async function asUser(client: pg.Client, userId: string, fn: () => Promise<void>) {
  try {
    await client.query("ROLLBACK");
  } catch {
    /* not in a transaction */
  }
  await client.query("RESET ROLE");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await client.query("SET ROLE authenticated");
  try {
    await fn();
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* not in a transaction */
    }
    await client.query("RESET ROLE");
  }
}

function pgClientToSupabase(client: pg.Client, failApplicability = false) {
  return {
    from(table: string) {
      const state: { filters: Array<[string, string]> } = { filters: [] };
      const api = {
        select() {
          return api;
        },
        eq(col: string, value: string) {
          state.filters.push([col, value]);
          return api;
        },
        async maybeSingle() {
          const orgId = state.filters.find(([col]) => col === "id")?.[1];
          const { rows } = await client.query(
            `SELECT fact_operates_ol_site, fact_uses_volunteers, fact_has_governing_board,
                    services_offered, approx_client_count, service_area, setup_create_gate_exempt,
                    fact_answers_updated_at, fact_answers_updated_by
             FROM public.organizations WHERE id = $1`,
            [orgId],
          );
          return { data: rows[0] ?? null, error: null };
        },
        async update(payload: Record<string, unknown>) {
          const orgId = state.filters.find(([col]) => col === "id")?.[1];
          const keys = Object.keys(payload);
          const sets = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
          await client.query(
            `UPDATE public.organizations SET ${sets} WHERE id = $${keys.length + 1}`,
            [...keys.map((key) => payload[key]), orgId],
          );
          return { error: null };
        },
        eqAfterUpdate: undefined as unknown,
        upsert() {
          if (failApplicability || table === "obligation_applicability") {
            return Promise.resolve({
              error: { message: "simulated applicability failure" },
            });
          }
          return Promise.resolve({ error: null });
        },
      };
      const update = (payload: Record<string, unknown>) => ({
        async eq(col: string, value: string) {
          if (table === "obligation_applicability") {
            return { error: { message: "simulated applicability failure" } };
          }
          const keys = Object.keys(payload);
          const sets = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
          await client.query(
            `UPDATE public.organizations SET ${sets} WHERE ${col} = $${keys.length + 1}`,
            [...keys.map((key) => payload[key]), value],
          );
          return { error: null };
        },
      });
      return {
        select: api.select.bind(api),
        update,
        upsert: api.upsert,
      };
    },
  };
}

describe("integration: agency setup gate on isolated Postgres", { concurrency: false }, () => {
  let client: pg.Client;

  before(async () => {
    refuseProduction(DEFAULT_URL);
    client = new pg.Client({ connectionString: DEFAULT_URL });
    try {
      await client.connect();
    } catch (err) {
      const hint =
        "Start an isolated Postgres (see scripts/agency-setup-gate-preview.md) " +
        "or set AGENCY_SETUP_TEST_DATABASE_URL. Never Hive-Platform production.";
      throw new Error(`Could not connect to isolated test DB: ${(err as Error).message}. ${hint}`);
    }
    const { rows } = await client.query("SELECT current_database() AS db");
    assert.notEqual(rows[0]?.db, "postgres");
    await client.query(readRel("../../supabase/tests/agency-setup-gate/isolated-schema.sql"));
    await client.query("GRANT authenticated TO CURRENT_USER");
    await client.query("GRANT service_role TO CURRENT_USER");
    await client.query("GRANT anon TO CURRENT_USER");
    await client.query("GRANT hive_it_untrusted TO CURRENT_USER");
    await client.query("GRANT USAGE ON SCHEMA public TO anon, hive_it_untrusted");
    await client.query("GRANT SELECT, UPDATE ON public.organizations TO anon, hive_it_untrusted");

    await client.query(
      `INSERT INTO public.organizations (id, name, slug, services_offered)
       VALUES ($1, 'Uintah Employment', 'uintah-employment', ARRAY['SEI'])`,
      [ORG_B],
    );
    await client.query(
      `INSERT INTO public.organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [ORG_B, USER_B],
    );
    await client.query(
      `INSERT INTO public.organizations (id, name, slug)
       VALUES ($1, 'Existing Staffed Home', 'existing-staffed')`,
      [ORG_EXISTING],
    );
    await client.query(
      `INSERT INTO public.organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [ORG_EXISTING, USER_EXISTING],
    );
    await client.query(
      `INSERT INTO public.clients (organization_id, first_name, last_name)
       VALUES ($1, 'Pat', 'Resident')`,
      [ORG_EXISTING],
    );

    await client.query(
      `INSERT INTO public.organizations (id, name, slug)
       VALUES ($1, 'True North Supports LLC', 'true-north-supports')`,
      [ORG_TNS],
    );
    for (let i = 1; i <= 6; i++) {
      await client.query(
        `INSERT INTO public.organization_members (organization_id, user_id, role)
         VALUES ($1, $2, 'employee')`,
        [ORG_TNS, `7fabcf5d-f826-487f-8730-8b0c3f1969b${i}`],
      );
    }
    for (const name of ["Ann", "Bea", "Cal", "Dee"]) {
      await client.query(
        `INSERT INTO public.clients (organization_id, first_name, last_name)
         VALUES ($1, $2, 'Client')`,
        [ORG_TNS, name],
      );
    }

    await client.query(
      `INSERT INTO public.organizations (id, name, slug)
       VALUES ($1, 'Two Staff Home', 'two-staff-home')`,
      [ORG_TWO],
    );
    await client.query(
      `INSERT INTO public.organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'admin'), ($1, $3, 'employee')`,
      [ORG_TWO, USER_TWO, USER_TWO_B],
    );

    await client.query(readRel("../../supabase/migrations/20260914120000_agency_setup_gate.sql"));
    await client.query(
      readRel("../../supabase/migrations/20260915080000_agency_setup_questionnaire.sql"),
    );
  });

  after(async () => {
    await client.end();
  });

  it("grandfathers ≥1 client or members > 1; owner-only orgs stay gated", async () => {
    const existing = await client.query(
      "SELECT setup_create_gate_exempt FROM public.organizations WHERE id = $1",
      [ORG_EXISTING],
    );
    const tns = await client.query(
      "SELECT setup_create_gate_exempt FROM public.organizations WHERE id = $1",
      [ORG_TNS],
    );
    const two = await client.query(
      "SELECT setup_create_gate_exempt FROM public.organizations WHERE id = $1",
      [ORG_TWO],
    );
    const b = await client.query(
      "SELECT setup_create_gate_exempt FROM public.organizations WHERE id = $1",
      [ORG_B],
    );
    assert.equal(existing.rows[0].setup_create_gate_exempt, true);
    assert.equal(tns.rows[0].setup_create_gate_exempt, true);
    assert.equal(two.rows[0].setup_create_gate_exempt, true);
    assert.equal(b.rows[0].setup_create_gate_exempt, false);
    const allowed = await client.query(
      `SELECT
         public.org_setup_allows_create($1) AS tns,
         public.org_setup_allows_create($2) AS owner_only`,
      [ORG_TNS, ORG_B],
    );
    assert.equal(allowed.rows[0].tns, true);
    assert.equal(allowed.rows[0].owner_only, false);

    await client.query(
      `INSERT INTO public.organizations (id, name, slug)
       VALUES ($1, 'Wasatch Residential', 'wasatch-residential')`,
      [ORG_A],
    );
    const a = await client.query(
      "SELECT setup_create_gate_exempt FROM public.organizations WHERE id = $1",
      [ORG_A],
    );
    assert.equal(a.rows[0].setup_create_gate_exempt, false);
  });

  it("creates Agency A first owner while Agency B already has members", async () => {
    await asUser(client, USER_A, async () => {
      await client.query(
        `INSERT INTO public.organization_members (organization_id, user_id, role)
         VALUES ($1, $2, 'admin')`,
        [ORG_A, USER_A],
      );
    });
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM public.organization_members WHERE organization_id = $1",
      [ORG_A],
    );
    assert.equal(rows[0].n, 1);
  });

  it("blocks second staff, client, and invitation while setup is incomplete", async () => {
    await assert.rejects(
      () =>
        asUser(client, USER_A, async () => {
          await client.query(
            `INSERT INTO public.organization_members (organization_id, user_id, role)
             VALUES ($1, $2, 'employee')`,
            [ORG_A, USER_A2],
          );
        }),
      /Agency setup is incomplete/,
    );
    await assert.rejects(
      () =>
        asUser(client, USER_A, async () => {
          await client.query(
            `INSERT INTO public.clients (organization_id, first_name, last_name)
             VALUES ($1, 'Ada', 'Client')`,
            [ORG_A],
          );
        }),
      /Agency setup is incomplete/,
    );
    await assert.rejects(
      () =>
        asUser(client, USER_A, async () => {
          await client.query(
            `INSERT INTO public.invitations (organization_id, email)
             VALUES ($1, 'staff@example.test')`,
            [ORG_A],
          );
        }),
      /Agency setup is incomplete/,
    );
  });

  it("matches TypeScript and SQL completion on the full registry-driven fact set", async () => {
    const before = await client.query("SELECT public.org_setup_is_complete($1) AS complete", [
      ORG_A,
    ]);
    assert.equal(before.rows[0].complete, false);

    await client.query(
      `UPDATE public.organizations SET
         services_offered = ARRAY['HHS','RHS'],
         fact_operates_ol_site = true,
         fact_uses_volunteers = false,
         fact_has_governing_board = true,
         fact_provides_respite_overnight = false,
         fact_is_usor_vendor = false,
         fact_supports_self_administered_medication = false,
         fact_acts_as_representative_payee = false,
         fact_provides_transportation = true,
         approx_client_count = 12,
         service_area = 'Salt Lake, Davis',
         dhhs_provider_id = '1234567890',
         specializations = 'Behavioral support'
       WHERE id = $1`,
      [ORG_A],
    );
    const row = await client.query(
      `SELECT fact_operates_ol_site, fact_uses_volunteers, fact_has_governing_board,
              fact_provides_respite_overnight, fact_is_usor_vendor,
              fact_supports_self_administered_medication, fact_acts_as_representative_payee,
              fact_provides_transportation, services_offered, approx_client_count,
              service_area, dhhs_provider_id, sei_award_date, specializations
       FROM public.organizations WHERE id = $1`,
      [ORG_A],
    );
    const facts = setupFactsFromOrgRow(row.rows[0]);
    assert.equal(facts.serviceArea, "Salt Lake, Davis");
    assert.equal(computeAgencySetupStatus(facts).complete, true);
    const after = await client.query("SELECT public.org_setup_is_complete($1) AS complete", [
      ORG_A,
    ]);
    assert.equal(after.rows[0].complete, true);

    await client.query(`UPDATE public.organizations SET service_area = NULL WHERE id = $1`, [
      ORG_A,
    ]);
    const blank = await client.query("SELECT public.org_setup_is_complete($1) AS complete", [
      ORG_A,
    ]);
    assert.equal(blank.rows[0].complete, false);
    await client.query(
      `UPDATE public.organizations SET service_area = 'Salt Lake, Davis' WHERE id = $1`,
      [ORG_A],
    );
  });

  it("zero is a valid answer for a required number field, on both SQL and TypeScript sides", async () => {
    // approx_client_count = 0 is a real, deliberate answer ("we have no
    // clients yet") — a falsy JS value that a naive `if (value)` check would
    // wrongly treat as missing. isRequiredSetupFactAnswered's number branch
    // is `typeof value === "number" && Number.isFinite(value)`, which is
    // correct for zero; this proves the real column round-trips the same
    // way, on both the TypeScript parser and the SQL completion function.
    await client.query(
      `UPDATE public.organizations SET approx_client_count = 0 WHERE id = $1`,
      [ORG_A],
    );
    const row = await client.query(
      `SELECT fact_operates_ol_site, fact_uses_volunteers, fact_has_governing_board,
              fact_provides_respite_overnight, fact_is_usor_vendor,
              fact_supports_self_administered_medication, fact_acts_as_representative_payee,
              fact_provides_transportation, services_offered, approx_client_count,
              service_area, dhhs_provider_id, sei_award_date, specializations
       FROM public.organizations WHERE id = $1`,
      [ORG_A],
    );
    const facts = setupFactsFromOrgRow(row.rows[0]);
    assert.equal(facts.approxClientCount, 0, "0 must parse as 0, not null");
    assert.equal(
      computeAgencySetupStatus(facts).complete,
      true,
      "0 clients must not be read back as an unanswered required field (TypeScript side)",
    );
    const sql = await client.query("SELECT public.org_setup_is_complete($1) AS complete", [
      ORG_A,
    ]);
    assert.equal(
      sql.rows[0].complete,
      true,
      "0 clients must not be read back as an unanswered required field (SQL side)",
    );
    await client.query(`UPDATE public.organizations SET approx_client_count = 12 WHERE id = $1`, [
      ORG_A,
    ]);
  });

  it("an 'unknown' status on a deferred fact cannot satisfy or affect agency-setup completion", async () => {
    // compliance_fact_answers is scoped to a different record entirely and
    // org_setup_is_complete() never reads it (verified directly in
    // AGENCY_SETUP_COVERAGE_AUDIT.md §1) — this proves it at the database
    // level with an explicit status='unknown' row, not just an absent one.
    const stillComplete = await client.query(
      "SELECT public.org_setup_is_complete($1) AS complete",
      [ORG_A],
    );
    assert.equal(stillComplete.rows[0].complete, true);

    const clientRow = await client.query(
      `INSERT INTO public.clients (organization_id, first_name, last_name)
       VALUES ($1, 'Unknown', 'StatusFact') RETURNING id`,
      [ORG_A],
    );
    const clientId = clientRow.rows[0].id as string;
    await asUser(client, USER_A, async () => {
      await client.query(
        `INSERT INTO public.compliance_fact_answers
           (organization_id, scope, entity_id, fact_key, status, value, source, answered_by, answered_at)
         VALUES ($1, 'client', $2, 'fact_66_unknown_test', 'unknown', NULL, 'manual', $3, now())
         ON CONFLICT (organization_id, scope, entity_id, fact_key)
         DO UPDATE SET status = EXCLUDED.status, answered_at = EXCLUDED.answered_at`,
        [ORG_A, clientId, USER_A],
      );
    });

    const afterUnknown = await client.query(
      "SELECT public.org_setup_is_complete($1) AS complete",
      [ORG_A],
    );
    assert.equal(
      afterUnknown.rows[0].complete,
      true,
      "an explicit 'unknown' deferred-fact status must not silently satisfy or reopen completion",
    );

    // Clean up: this test's own client row must not change ORG_A's client
    // count for later tests in this file that count exact totals (this
    // suite is not given a fresh database per run — see the note on the
    // representative-payee-status test above).
    await client.query(`DELETE FROM public.compliance_fact_answers WHERE entity_id = $1`, [
      clientId,
    ]);
    await client.query(`DELETE FROM public.clients WHERE id = $1`, [clientId]);
  });

  it("requires the SEI award date in SQL only once SEI is awarded — TypeScript and SQL agree", async () => {
    const withoutSei = await client.query("SELECT public.org_setup_is_complete($1) AS complete", [
      ORG_A,
    ]);
    assert.equal(withoutSei.rows[0].complete, true);

    await client.query(
      `UPDATE public.organizations SET services_offered = ARRAY['HHS','RHS','SEI'] WHERE id = $1`,
      [ORG_A],
    );
    const seiNoDate = await client.query("SELECT public.org_setup_is_complete($1) AS complete", [
      ORG_A,
    ]);
    assert.equal(
      seiNoDate.rows[0].complete,
      false,
      "awarding SEI without a date must reopen the gate",
    );

    await client.query(
      `UPDATE public.organizations SET sei_award_date = '2026-01-15' WHERE id = $1`,
      [ORG_A],
    );
    const seiWithDate = await client.query("SELECT public.org_setup_is_complete($1) AS complete", [
      ORG_A,
    ]);
    assert.equal(seiWithDate.rows[0].complete, true);

    // Revert so later tests keep seeing ORG_A as complete under HHS/RHS only.
    await client.query(
      `UPDATE public.organizations SET services_offered = ARRAY['HHS','RHS'], sei_award_date = NULL WHERE id = $1`,
      [ORG_A],
    );
  });

  it("allows staff, client, and invitation after setup is complete", async () => {
    await asUser(client, USER_A, async () => {
      await client.query(
        `INSERT INTO public.organization_members (organization_id, user_id, role)
         VALUES ($1, $2, 'employee')`,
        [ORG_A, USER_A2],
      );
      await client.query(
        `INSERT INTO public.clients (organization_id, first_name, last_name)
         VALUES ($1, 'Ada', 'Client')`,
        [ORG_A],
      );
      await client.query(
        `INSERT INTO public.invitations (organization_id, email)
         VALUES ($1, 'staff@example.test')`,
        [ORG_A],
      );
    });
    const members = await client.query(
      "SELECT count(*)::int AS n FROM public.organization_members WHERE organization_id = $1",
      [ORG_A],
    );
    const clients = await client.query(
      "SELECT count(*)::int AS n FROM public.clients WHERE organization_id = $1",
      [ORG_A],
    );
    const invites = await client.query(
      "SELECT count(*)::int AS n FROM public.invitations WHERE organization_id = $1",
      [ORG_A],
    );
    assert.equal(members.rows[0].n, 2);
    assert.equal(clients.rows[0].n, 1);
    assert.equal(invites.rows[0].n, 1);
  });

  it("keeps existing-org staff readable and lets a grandfathered org hire", async () => {
    const visible = await client.query(
      `SELECT count(*)::int AS n FROM public.organization_members WHERE organization_id = $1`,
      [ORG_EXISTING],
    );
    assert.equal(visible.rows[0].n, 1);
    await asUser(client, USER_EXISTING, async () => {
      const read = await client.query(
        "SELECT user_id FROM public.organization_members WHERE organization_id = $1",
        [ORG_EXISTING],
      );
      assert.equal(read.rows.length, 1);
      await client.query(
        `INSERT INTO public.organization_members (organization_id, user_id, role)
         VALUES ($1, $2, 'employee')`,
        [ORG_EXISTING, "55555555-5555-4555-8555-555555555556"],
      );
      await client.query(
        `UPDATE public.organization_members SET role = 'manager'
         WHERE organization_id = $1 AND user_id = $2`,
        [ORG_EXISTING, USER_EXISTING],
      );
    });
  });

  it("prevents Agency A from reading, updating, or inserting Agency B records", async () => {
    await asUser(client, USER_A, async () => {
      const members = await client.query(
        "SELECT * FROM public.organization_members WHERE organization_id = $1",
        [ORG_B],
      );
      const orgs = await client.query("SELECT * FROM public.organizations WHERE id = $1", [ORG_B]);
      assert.equal(members.rows.length, 0);
      assert.equal(orgs.rows.length, 0);
      const updated = await client.query(
        "UPDATE public.organization_members SET role = 'employee' WHERE organization_id = $1",
        [ORG_B],
      );
      assert.equal(updated.rowCount, 0);
    });
    await assert.rejects(
      () =>
        asUser(client, USER_A, async () => {
          await client.query(
            `INSERT INTO public.organization_members (organization_id, user_id, role)
             VALUES ($1, $2, 'employee')`,
            [ORG_B, USER_A2],
          );
        }),
      /row-level security|violates|incomplete/i,
    );
    await assert.rejects(
      () =>
        asUser(client, USER_A, async () => {
          await client.query(
            `INSERT INTO public.clients (organization_id, first_name, last_name)
             VALUES ($1, 'Eve', 'Other')`,
            [ORG_B],
          );
        }),
      /row-level security|violates|incomplete/i,
    );
  });

  it("service-role writes still hit the trigger", async () => {
    await client.query(
      `INSERT INTO public.organizations (id, name, slug) VALUES ($1, 'Service Role Org', 'service-role-org')`,
      [ORG_C],
    );
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE service_role");
    await client.query(
      `INSERT INTO public.organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [ORG_C, USER_C],
    );
    await assert.rejects(
      () =>
        client.query(
          `INSERT INTO public.organization_members (organization_id, user_id, role)
           VALUES ($1, $2, 'employee')`,
          [ORG_C, USER_C2],
        ),
      /Agency setup is incomplete/,
    );
    await client.query("ROLLBACK");

    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE service_role");
    await client.query(
      `INSERT INTO public.organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [ORG_C, USER_C],
    );
    await client.query("COMMIT");
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE service_role");
    await assert.rejects(
      () =>
        client.query(
          `INSERT INTO public.clients (organization_id, first_name, last_name)
           VALUES ($1, 'Cora', 'Client')`,
          [ORG_C],
        ),
      /Agency setup is incomplete/,
    );
    await client.query("ROLLBACK");
  });

  it("blocks an authenticated admin from flipping setup_create_gate_exempt", async () => {
    const before = await client.query(
      `SELECT setup_create_gate_exempt,
              public.org_setup_is_complete($1) AS complete,
              public.org_setup_allows_create($1) AS allowed
       FROM public.organizations WHERE id = $1`,
      [ORG_C],
    );
    assert.equal(before.rows[0].setup_create_gate_exempt, false);
    assert.equal(before.rows[0].complete, false);
    assert.equal(before.rows[0].allowed, false);

    await assert.rejects(
      () =>
        asUser(client, USER_C, async () => {
          await client.query(
            `UPDATE public.organizations SET setup_create_gate_exempt = true WHERE id = $1`,
            [ORG_C],
          );
        }),
      /locked|privilege|permission denied|42501/i,
    );

    const after = await client.query(
      `SELECT setup_create_gate_exempt, public.org_setup_allows_create($1) AS allowed
       FROM public.organizations WHERE id = $1`,
      [ORG_C],
    );
    assert.equal(after.rows[0].setup_create_gate_exempt, false);
    assert.equal(after.rows[0].allowed, false);

    await assert.rejects(
      () =>
        asUser(client, USER_C, async () => {
          await client.query(
            `INSERT INTO public.clients (organization_id, first_name, last_name)
             VALUES ($1, 'Skip', 'Setup')`,
            [ORG_C],
          );
        }),
      /Agency setup is incomplete/,
    );
  });

  it("fail-closed: untrusted roles cannot flip setup_create_gate_exempt", async () => {
    for (const role of ["anon", "hive_it_untrusted"] as const) {
      await assert.rejects(async () => {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* not in a transaction */
        }
        await client.query("RESET ROLE");
        await client.query(`SET ROLE ${role}`);
        try {
          await client.query(
            `UPDATE public.organizations SET setup_create_gate_exempt = true WHERE id = $1`,
            [ORG_C],
          );
        } finally {
          await client.query("RESET ROLE");
        }
      }, /setup_create_gate_exempt is locked/i);
    }

    const afterUntrusted = await client.query(
      "SELECT setup_create_gate_exempt FROM public.organizations WHERE id = $1",
      [ORG_C],
    );
    assert.equal(afterUntrusted.rows[0].setup_create_gate_exempt, false);

    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE service_role");
    await client.query(
      `UPDATE public.organizations SET setup_create_gate_exempt = true WHERE id = $1`,
      [ORG_C],
    );
    await client.query("COMMIT");

    const flipped = await client.query(
      "SELECT setup_create_gate_exempt FROM public.organizations WHERE id = $1",
      [ORG_C],
    );
    assert.equal(flipped.rows[0].setup_create_gate_exempt, true);

    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE service_role");
    await client.query(
      `UPDATE public.organizations SET setup_create_gate_exempt = false WHERE id = $1`,
      [ORG_C],
    );
    await client.query("COMMIT");
    const reset = await client.query(
      "SELECT setup_create_gate_exempt FROM public.organizations WHERE id = $1",
      [ORG_C],
    );
    assert.equal(reset.rows[0].setup_create_gate_exempt, false);
  });

  it("rolls back org facts when a later setup-save step fails", async () => {
    const before = await client.query(
      `SELECT services_offered, service_area, fact_operates_ol_site
       FROM public.organizations WHERE id = $1`,
      [ORG_C],
    );
    const supabase = pgClientToSupabase(client, true);
    await assert.rejects(
      () =>
        persistAgencySetupFactsInternal(supabase, ORG_C, USER_C, {
          operates_ol_site: true,
          uses_volunteers: false,
          has_governing_board: true,
          servicesOffered: ["SEI"],
          approxClientCount: 4,
          serviceArea: "Uintah Basin",
        }),
      /simulated applicability failure/,
    );
    const after = await client.query(
      `SELECT services_offered, service_area, fact_operates_ol_site
       FROM public.organizations WHERE id = $1`,
      [ORG_C],
    );
    assert.deepEqual(after.rows[0].services_offered, before.rows[0].services_offered);
    assert.equal(after.rows[0].service_area, before.rows[0].service_area);
    assert.equal(after.rows[0].fact_operates_ol_site, before.rows[0].fact_operates_ol_site);
  });

  it("compliance_fact_answers (deferred staff/client/location facts) never gates agency setup and stays org-isolated", async () => {
    const stillComplete = await client.query(
      "SELECT public.org_setup_is_complete($1) AS complete",
      [ORG_A],
    );
    assert.equal(
      stillComplete.rows[0].complete,
      true,
      "a location/staff/client record having no answers must never re-close the gate",
    );

    const clientRow = await client.query(
      `INSERT INTO public.clients (organization_id, first_name, last_name)
       VALUES ($1, 'Deferred', 'Fact') RETURNING id`,
      [ORG_A],
    );
    const clientId = clientRow.rows[0].id as string;

    let insertedId = "";
    await asUser(client, USER_A, async () => {
      const inserted = await client.query(
        `INSERT INTO public.compliance_fact_answers
           (organization_id, scope, entity_id, fact_key, status, value, answered_by, answered_at)
         VALUES ($1, 'client', $2, 'fact_66_aggressive_behavior', 'answered', 'false'::jsonb, $3, now())
         RETURNING id`,
        [ORG_A, clientId, USER_A],
      );
      insertedId = inserted.rows[0].id;
    });
    assert.ok(insertedId);

    // Agency B cannot see or write Agency A's deferred-fact answer.
    // Scoped to this test's own entity_id (not just organization_id): this
    // suite is not given a fresh database per run (there is no TRUNCATE in
    // before()/after()), so a prior run's leftover ORG_A rows for other
    // entity_ids must not make either assertion below flaky.
    await asUser(client, USER_B, async () => {
      const seen = await client.query(
        "SELECT * FROM public.compliance_fact_answers WHERE organization_id = $1 AND entity_id = $2",
        [ORG_A, clientId],
      );
      assert.equal(seen.rows.length, 0);
    });
    await assert.rejects(
      () =>
        asUser(client, USER_B, async () => {
          await client.query(
            `INSERT INTO public.compliance_fact_answers
               (organization_id, scope, entity_id, fact_key, status, answered_by)
             VALUES ($1, 'client', $2, 'sneak-in', 'answered', $3)`,
            [ORG_A, clientId, USER_B],
          );
        }),
      /row-level security|violates|permission denied/i,
    );

    // Agency A can read its own answer back.
    await asUser(client, USER_A, async () => {
      const mine = await client.query(
        "SELECT fact_key, status FROM public.compliance_fact_answers WHERE organization_id = $1 AND entity_id = $2",
        [ORG_A, clientId],
      );
      assert.equal(mine.rows.length, 1);
      assert.equal(mine.rows[0].fact_key, "fact_66_aggressive_behavior");
      assert.equal(mine.rows[0].status, "answered");
    });
  });

  it("an authenticated admin cannot edit their own setup_completed_at / setup_questionnaire_version", async () => {
    const before = await client.query(
      "SELECT setup_completed_at, setup_questionnaire_version FROM public.organizations WHERE id = $1",
      [ORG_A],
    );
    await assert.rejects(
      () =>
        asUser(client, USER_A, async () => {
          await client.query(
            `UPDATE public.organizations SET setup_completed_at = now(), setup_questionnaire_version = 999 WHERE id = $1`,
            [ORG_A],
          );
        }),
      /locked|privilege|permission denied|42501/i,
    );
    const after = await client.query(
      "SELECT setup_completed_at, setup_questionnaire_version FROM public.organizations WHERE id = $1",
      [ORG_A],
    );
    assert.deepEqual(after.rows[0], before.rows[0]);
  });

  it("representative-payee status (FACT-018) distinguishes all four states and never defaults missing to no", async () => {
    const fact018 = deferredFact("FACT-018");
    assert.ok(fact018, "FACT-018 must still exist in the deferred-facts registry");
    assert.equal(fact018!.storage.kind, "generic", "must be a real tracked status, not a stand-in");

    const clientRow = await client.query(
      `INSERT INTO public.clients (organization_id, first_name, last_name)
       VALUES ($1, 'RepPayee', 'Status') RETURNING id`,
      [ORG_A],
    );
    const clientId = clientRow.rows[0].id as string;

    // 1. Genuinely unanswered: no row exists yet. Must read as "unanswered",
    // never silently coerced to a false/"no" answer.
    await asUser(client, USER_A, async () => {
      const none = await client.query(
        `SELECT status FROM public.compliance_fact_answers
         WHERE organization_id = $1 AND scope = 'client' AND entity_id = $2 AND fact_key = $3`,
        [ORG_A, clientId, fact018!.factId],
      );
      assert.equal(none.rows.length, 0, "unanswered is the absence of a row, not a false value");
    });

    // 2. Explicitly answered "no" (value false) — a real, deliberate answer,
    // distinct from state 1, and must survive as false (not null/true).
    await asUser(client, USER_A, async () => {
      await client.query(
        `INSERT INTO public.compliance_fact_answers
           (organization_id, scope, entity_id, fact_key, status, value, source, answered_by, answered_at)
         VALUES ($1, 'client', $2, $3, 'answered', 'false'::jsonb, 'manual', $4, now())
         ON CONFLICT (organization_id, scope, entity_id, fact_key)
         DO UPDATE SET status = EXCLUDED.status, value = EXCLUDED.value, answered_at = EXCLUDED.answered_at`,
        [ORG_A, clientId, fact018!.factId, USER_A],
      );
      const answered = await client.query(
        `SELECT status, value FROM public.compliance_fact_answers
         WHERE organization_id = $1 AND scope = 'client' AND entity_id = $2 AND fact_key = $3`,
        [ORG_A, clientId, fact018!.factId],
      );
      assert.equal(answered.rows.length, 1);
      assert.equal(answered.rows[0].status, "answered");
      assert.equal(answered.rows[0].value, false, "explicit false must persist as false, not null");
    });

    // 3. Changed to "unknown" — must overwrite the prior explicit answer
    // (same upsert target), not create a second competing row.
    await asUser(client, USER_A, async () => {
      await client.query(
        `INSERT INTO public.compliance_fact_answers
           (organization_id, scope, entity_id, fact_key, status, value, source, answered_by, answered_at)
         VALUES ($1, 'client', $2, $3, 'unknown', NULL, 'manual', $4, now())
         ON CONFLICT (organization_id, scope, entity_id, fact_key)
         DO UPDATE SET status = EXCLUDED.status, value = EXCLUDED.value, answered_at = EXCLUDED.answered_at`,
        [ORG_A, clientId, fact018!.factId, USER_A],
      );
      const unknown = await client.query(
        `SELECT status, value FROM public.compliance_fact_answers
         WHERE organization_id = $1 AND scope = 'client' AND entity_id = $2 AND fact_key = $3`,
        [ORG_A, clientId, fact018!.factId],
      );
      assert.equal(unknown.rows.length, 1, "still exactly one row — unknown replaces, not appends");
      assert.equal(unknown.rows[0].status, "unknown");
    });

    // 4. Explicitly answered "yes" (value true) — the fourth state, and the
    // opposite of state 2, proving both booleans round-trip distinctly.
    await asUser(client, USER_A, async () => {
      await client.query(
        `INSERT INTO public.compliance_fact_answers
           (organization_id, scope, entity_id, fact_key, status, value, source, answered_by, answered_at)
         VALUES ($1, 'client', $2, $3, 'answered', 'true'::jsonb, 'manual', $4, now())
         ON CONFLICT (organization_id, scope, entity_id, fact_key)
         DO UPDATE SET status = EXCLUDED.status, value = EXCLUDED.value, answered_at = EXCLUDED.answered_at`,
        [ORG_A, clientId, fact018!.factId, USER_A],
      );
      const yes = await client.query(
        `SELECT status, value FROM public.compliance_fact_answers
         WHERE organization_id = $1 AND scope = 'client' AND entity_id = $2 AND fact_key = $3`,
        [ORG_A, clientId, fact018!.factId],
      );
      assert.equal(yes.rows.length, 1);
      assert.equal(yes.rows[0].status, "answered");
      assert.equal(yes.rows[0].value, true);
    });
  });

  it("ComplianceFactsPanel's real save shape round-trips for an assignment-scope fact (FACT-060)", async () => {
    // Exercises exactly what compliance-facts-panel.tsx sends on save — keyed
    // by the real DeferredFactDefinition.factId, not a hand-typed string —
    // against the real NOT NULL / RLS-protected column. This is the proof a
    // mocked screenshot cannot give: a save through the fixed component
    // (f.factKey -> f.factId) actually persists, and the old bug
    // (fact_key: undefined) would have failed the NOT NULL constraint here.
    const fact060 = deferredFact("FACT-060");
    assert.ok(fact060, "FACT-060 must still exist in the deferred-facts registry");
    assert.equal(fact060!.scope, "assignment");

    // No staff_assignments table in this simplified isolated schema (see
    // isolated-schema.sql's own header note) — compliance_fact_answers.
    // entity_id has no FK, so a fresh id stands in for one real assignment
    // row, same as the live schema would supply from staff_assignments.id.
    const assignmentEntityId = "99999999-9999-4999-8999-999999999901";

    await asUser(client, USER_A, async () => {
      await client.query(
        `INSERT INTO public.compliance_fact_answers
           (organization_id, scope, entity_id, fact_key, status, value, source, answered_by, answered_at)
         VALUES ($1, 'assignment', $2, $3, 'answered', 'false'::jsonb, 'manual', $4, now())
         ON CONFLICT (organization_id, scope, entity_id, fact_key)
         DO UPDATE SET status = EXCLUDED.status, value = EXCLUDED.value, answered_at = EXCLUDED.answered_at`,
        [ORG_A, assignmentEntityId, fact060!.factId, USER_A],
      );
    });

    await asUser(client, USER_A, async () => {
      // Scoped to this fact_key specifically — not just entity_id — so a
      // rerun against the same (non-truncated) database isn't tripped up by
      // the second fact this test also writes below.
      const mine = await client.query(
        `SELECT fact_key, status, value FROM public.compliance_fact_answers
         WHERE organization_id = $1 AND scope = 'assignment' AND entity_id = $2 AND fact_key = $3`,
        [ORG_A, assignmentEntityId, fact060!.factId],
      );
      assert.equal(mine.rows.length, 1, "one row per assignment+fact, not collapsed by a bad key");
      assert.equal(mine.rows[0].status, "answered");
      assert.equal(mine.rows[0].value, false, "false is a real answer, not treated as unanswered");
    });

    // A second, different fact on the SAME assignment must not collide with
    // the first — this is exactly what `fact_key: undefined` broke (every
    // fact on one entity fought over one row because the key was constant).
    await asUser(client, USER_A, async () => {
      await client.query(
        `INSERT INTO public.compliance_fact_answers
           (organization_id, scope, entity_id, fact_key, status, value, source, answered_by, answered_at)
         VALUES ($1, 'assignment', $2, 'FACT-999-test-only', 'unknown', NULL, 'manual', $3, now())
         ON CONFLICT (organization_id, scope, entity_id, fact_key)
         DO UPDATE SET status = EXCLUDED.status, answered_at = EXCLUDED.answered_at`,
        [ORG_A, assignmentEntityId, USER_A],
      );
      const both = await client.query(
        `SELECT fact_key FROM public.compliance_fact_answers
         WHERE organization_id = $1 AND scope = 'assignment' AND entity_id = $2 ORDER BY fact_key`,
        [ORG_A, assignmentEntityId],
      );
      assert.deepEqual(
        both.rows.map((r: { fact_key: string }) => r.fact_key),
        ["FACT-060", "FACT-999-test-only"],
      );
    });
  });
});
