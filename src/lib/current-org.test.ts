import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TNS_ORGANIZATION_ID,
  isComplimentaryHiveOrg,
  isComplimentaryMembership,
  looksLikeDisposableTestOrg,
  pickDefaultMembership,
  pickUnlockedMembership,
  resolveCurrentMembership,
} from "./current-org.ts";

const TNS = {
  organization_id: TNS_ORGANIZATION_ID,
  is_demo: false,
  role: "admin" as const,
  display_acronym: "TNS",
  organization_name: "True North Supports",
};

const DEMO = {
  organization_id: "aaaaaaaa-demo-org",
  is_demo: true,
  role: "admin" as const,
  display_acronym: "DEMO",
  organization_name: "Demo",
};

const TEST_AGENCY = {
  organization_id: "bbbbbbbb-test-agency",
  is_demo: false,
  role: "admin" as const,
  display_acronym: null,
  organization_name: "Test Agency 1",
};

const SALT_LAKE = {
  organization_id: "cccccccc-slc-care",
  is_demo: false,
  role: "admin" as const,
  display_acronym: null,
  organization_name: "Salt Lake Care Co",
};

const PI_WALK = {
  organization_id: "dddddddd-pi-walk",
  is_demo: false,
  role: "admin" as const,
  display_acronym: null,
  organization_name: "pi20",
};

const PAID_AGENCY = {
  organization_id: "eeeeeeee-paid-org",
  is_demo: false,
  role: "employee" as const,
  display_acronym: "ACME",
  organization_name: "Acme DSPD Agency",
};

describe("looksLikeDisposableTestOrg", () => {
  it("flags signup-walk names and never True North", () => {
    assert.equal(looksLikeDisposableTestOrg("Test Agency 1"), true);
    assert.equal(looksLikeDisposableTestOrg("Walk Test Agency"), true);
    assert.equal(looksLikeDisposableTestOrg("Salt Lake Care Co"), true);
    assert.equal(looksLikeDisposableTestOrg("pi20"), true);
    assert.equal(looksLikeDisposableTestOrg("pi-walk"), true);
    assert.equal(looksLikeDisposableTestOrg("signup walk west"), true);
    assert.equal(looksLikeDisposableTestOrg("True North Supports"), false);
    assert.equal(looksLikeDisposableTestOrg("Acme DSPD Agency"), false);
  });
});

describe("resolveCurrentMembership — blank storage is not no-org", () => {
  it("picks TNS when hive.activeOrgId is empty (sidebar TNS Owner)", () => {
    assert.equal(resolveCurrentMembership([DEMO, TNS], null)?.organization_id, TNS_ORGANIZATION_ID);
    assert.equal(resolveCurrentMembership([DEMO, TNS], "")?.organization_id, TNS_ORGANIZATION_ID);
    assert.equal(pickDefaultMembership([DEMO, TNS])?.organization_id, TNS_ORGANIZATION_ID);
  });

  it("uses a stored id only when it still matches a membership", () => {
    assert.equal(resolveCurrentMembership([TNS, DEMO], DEMO.organization_id)?.organization_id, DEMO.organization_id);
    assert.equal(
      resolveCurrentMembership([TNS], "00000000-gone-org")?.organization_id,
      TNS_ORGANIZATION_ID,
    );
  });

  it("does not let a leftover test-signup org steal the default from True North", () => {
    assert.equal(
      resolveCurrentMembership([TEST_AGENCY, TNS], TEST_AGENCY.organization_id)?.organization_id,
      TNS_ORGANIZATION_ID,
    );
    assert.equal(
      resolveCurrentMembership([SALT_LAKE, PI_WALK, TNS], SALT_LAKE.organization_id)?.organization_id,
      TNS_ORGANIZATION_ID,
    );
    assert.equal(
      pickDefaultMembership([TEST_AGENCY, SALT_LAKE, TNS])?.organization_id,
      TNS_ORGANIZATION_ID,
    );
  });

  it("still honors a stored real agency that is not a disposable test walk", () => {
    assert.equal(
      resolveCurrentMembership([TNS, PAID_AGENCY], PAID_AGENCY.organization_id)?.organization_id,
      PAID_AGENCY.organization_id,
    );
  });

  it("returns null only when there are no memberships", () => {
    assert.equal(resolveCurrentMembership([], null), null);
    assert.equal(resolveCurrentMembership([], TNS_ORGANIZATION_ID), null);
  });
});

describe("pickUnlockedMembership — never trap a TNS member on a locked test org", () => {
  it("lands on True North when the stored org is locked", () => {
    const locked = new Set([TEST_AGENCY.organization_id]);
    const picked = pickUnlockedMembership(
      [TEST_AGENCY, TNS],
      (m) => locked.has(m.organization_id),
      TEST_AGENCY.organization_id,
    );
    assert.equal(picked?.organization_id, TNS_ORGANIZATION_ID);
  });

  it("prefers any unlocked org over a locked one", () => {
    const locked = new Set([TEST_AGENCY.organization_id]);
    const picked = pickUnlockedMembership(
      [TEST_AGENCY, PAID_AGENCY],
      (m) => locked.has(m.organization_id),
      TEST_AGENCY.organization_id,
    );
    assert.equal(picked?.organization_id, PAID_AGENCY.organization_id);
  });

  it("stays on the locked org only when every membership is locked", () => {
    const picked = pickUnlockedMembership(
      [TEST_AGENCY, SALT_LAKE],
      () => true,
      TEST_AGENCY.organization_id,
    );
    assert.equal(picked?.organization_id, TEST_AGENCY.organization_id);
  });
});

describe("isComplimentaryHiveOrg — no pay button for TNS", () => {
  it("treats the TNS org id and TNS acronym as complimentary", () => {
    assert.equal(isComplimentaryHiveOrg(TNS), true);
    assert.equal(isComplimentaryHiveOrg({ organization_id: "other", display_acronym: "TNS" }), true);
    assert.equal(isComplimentaryHiveOrg({ organization_id: "other", display_acronym: "ACME" }), false);
    assert.equal(isComplimentaryHiveOrg(null), false);
    assert.equal(isComplimentaryMembership(TNS), true);
    assert.equal(isComplimentaryMembership(TEST_AGENCY), false);
  });
});
