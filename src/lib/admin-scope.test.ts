import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminScopeIsLockedWholeOrg,
  adminScopeSummary,
  buildAdminScopeRows,
  decodeStaffScopeRef,
  encodeStaffScopeRef,
  isAdminScopeRole,
  parseAdminScope,
  STAFF_SCOPE_REF_PREFIX,
} from "./admin-scope.ts";

describe("admin scope persist", () => {
  it("writes whole-org as a single all row", () => {
    assert.deepEqual(buildAdminScopeRows({ mode: "all", clientIds: ["c1"], staffIds: ["s1"] }), [
      { scope_type: "all", scope_ref_id: null },
    ]);
  });

  it("persists selected clients and staff together on existing types", () => {
    const rows = buildAdminScopeRows({
      mode: "selected",
      clientIds: ["c-1", "c-1", " c-2 "],
      staffIds: ["s-1", "s-2"],
    });
    assert.deepEqual(rows, [
      { scope_type: "client", scope_ref_id: "c-1" },
      { scope_type: "client", scope_ref_id: "c-2" },
      { scope_type: "staff_group", scope_ref_id: `${STAFF_SCOPE_REF_PREFIX}s-1` },
      { scope_type: "staff_group", scope_ref_id: `${STAFF_SCOPE_REF_PREFIX}s-2` },
    ]);
    const parsed = parseAdminScope(rows);
    assert.equal(parsed.mode, "selected");
    assert.deepEqual(parsed.clientIds, ["c-1", "c-2"]);
    assert.deepEqual(parsed.staffIds, ["s-1", "s-2"]);
  });

  it("reads a future scope_type=staff row without a prefix", () => {
    const parsed = parseAdminScope([
      { scope_type: "client", scope_ref_id: "c-1" },
      { scope_type: "staff", scope_ref_id: "s-9" },
    ]);
    assert.equal(parsed.mode, "selected");
    assert.deepEqual(parsed.staffIds, ["s-9"]);
  });

  it("keeps service-code mode on service_code rows", () => {
    const rows = buildAdminScopeRows({ mode: "service_code", serviceCodes: ["HHS", "SLH"] });
    assert.deepEqual(
      rows.map((r) => r.scope_ref_id),
      ["HHS", "SLH"],
    );
    assert.equal(parseAdminScope(rows).mode, "service_code");
  });

  it("summarizes and locks Owner to whole-org", () => {
    assert.equal(adminScopeSummary({ mode: "all", clientIds: [], staffIds: [], serviceCodes: [], legacyStaffGroupIds: [] }), "Whole organization");
    assert.equal(
      adminScopeSummary({
        mode: "selected",
        clientIds: ["a", "b"],
        staffIds: ["s"],
        serviceCodes: [],
        legacyStaffGroupIds: [],
      }),
      "Selected clients and staff: 2 clients, 1 staff",
    );
    assert.equal(isAdminScopeRole("manager"), true);
    assert.equal(isAdminScopeRole("program_manager"), true);
    assert.equal(isAdminScopeRole("employee"), false);
    assert.equal(adminScopeIsLockedWholeOrg("admin"), true);
    assert.equal(adminScopeIsLockedWholeOrg("manager"), false);
    assert.equal(decodeStaffScopeRef(encodeStaffScopeRef("u-1")), "u-1");
  });
});
