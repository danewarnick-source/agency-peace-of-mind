import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TNS_ORGANIZATION_ID,
  isComplimentaryHiveOrg,
  pickDefaultMembership,
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

  it("returns null only when there are no memberships", () => {
    assert.equal(resolveCurrentMembership([], null), null);
    assert.equal(resolveCurrentMembership([], TNS_ORGANIZATION_ID), null);
  });
});

describe("isComplimentaryHiveOrg — no pay button for TNS", () => {
  it("treats the TNS org id and TNS acronym as complimentary", () => {
    assert.equal(isComplimentaryHiveOrg(TNS), true);
    assert.equal(isComplimentaryHiveOrg({ organization_id: "other", display_acronym: "TNS" }), true);
    assert.equal(isComplimentaryHiveOrg({ organization_id: "other", display_acronym: "ACME" }), false);
    assert.equal(isComplimentaryHiveOrg(null), false);
  });
});
