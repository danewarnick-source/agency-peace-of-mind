import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_PERMISSIONS, DEFAULT_MATRIX } from "./rbac.ts";
import { profilePermissionGroups } from "./profile-permission-groups.ts";

describe("profile permission groups", () => {
  it("uses the approved labels and order", () => {
    const groups = profilePermissionGroups();
    assert.deepEqual(
      groups.map((g) => g.label),
      ["people & files", "schedule & money", "Staff phone permissions"],
    );
  });

  it("places every permission exactly once and keeps staff-phone on employee defaults", () => {
    const groups = profilePermissionGroups();
    const flat = groups.flatMap((g) => g.permissions);
    assert.equal(flat.length, ALL_PERMISSIONS.length);
    assert.equal(new Set(flat).size, ALL_PERMISSIONS.length);
    const phone = groups.find((g) => g.key === "staff_phone");
    assert.ok(phone);
    for (const perm of DEFAULT_MATRIX.employee) {
      assert.ok(phone.permissions.includes(perm), perm);
    }
    assert.ok(groups[0]?.permissions.includes("invite_staff"));
    assert.ok(groups[1]?.permissions.includes("create_shifts"));
  });
});
