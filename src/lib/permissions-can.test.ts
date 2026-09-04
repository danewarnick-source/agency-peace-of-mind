import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowUnseededPermissionFallback,
  resolveCan,
  roleMatrixHasAnyGrant,
} from "./permissions-can.ts";

const emptyAdmin = {
  admin: { view_clients: false, view_staff_records: false, view_own_timesheets: false },
  employee: { view_clients: false, view_staff_records: false, view_own_timesheets: false },
};

const seededAdmin = {
  admin: { view_clients: true, view_staff_records: true, view_own_timesheets: true },
  employee: { view_clients: false, view_staff_records: false, view_own_timesheets: true },
};

const seededAdminDeniedClients = {
  admin: { view_clients: false, view_staff_records: true, view_own_timesheets: true },
};

describe("roleMatrixHasAnyGrant", () => {
  it("is false for an unseeded all-false matrix", () => {
    assert.equal(roleMatrixHasAnyGrant(emptyAdmin, "admin"), false);
    assert.equal(roleMatrixHasAnyGrant(undefined, "admin"), false);
  });

  it("is true when the role has any enabled grant", () => {
    assert.equal(roleMatrixHasAnyGrant(seededAdmin, "admin"), true);
    assert.equal(roleMatrixHasAnyGrant(seededAdmin, "employee"), true);
  });
});

describe("resolveCan for a fresh paid org admin (unseeded role_permissions)", () => {
  it("lets the owner open Add client and Add staff", () => {
    assert.equal(
      resolveCan({ role: "admin", perm: "view_clients", matrix: emptyAdmin }),
      true,
    );
    assert.equal(
      resolveCan({ role: "admin", perm: "view_staff_records", matrix: emptyAdmin }),
      true,
    );
  });

  it("does not invent staff directory access for an employee", () => {
    assert.equal(
      resolveCan({ role: "employee", perm: "view_clients", matrix: emptyAdmin }),
      false,
    );
    assert.equal(
      resolveCan({ role: "employee", perm: "view_staff_records", matrix: emptyAdmin }),
      false,
    );
    assert.equal(
      resolveCan({ role: "employee", perm: "view_own_timesheets", matrix: emptyAdmin }),
      true,
    );
  });

  it("returns false with no membership role", () => {
    assert.equal(resolveCan({ role: null, perm: "view_clients", matrix: emptyAdmin }), false);
  });
});

describe("resolveCan when the org matrix is seeded", () => {
  it("honors a deliberate admin deny", () => {
    assert.equal(
      resolveCan({ role: "admin", perm: "view_clients", matrix: seededAdminDeniedClients }),
      false,
    );
    assert.equal(
      resolveCan({ role: "admin", perm: "view_staff_records", matrix: seededAdminDeniedClients }),
      true,
    );
  });

  it("lets an individual grant win over the matrix", () => {
    assert.equal(
      resolveCan({
        role: "employee",
        perm: "view_clients",
        matrix: seededAdmin,
        overrides: [{ permission: "view_clients", granted: true }],
      }),
      true,
    );
  });

  it("lets an individual deny win over DEFAULT_MATRIX", () => {
    assert.equal(
      resolveCan({
        role: "admin",
        perm: "view_clients",
        matrix: emptyAdmin,
        overrides: [{ permission: "view_clients", granted: false }],
      }),
      false,
    );
  });
});

describe("allowUnseededPermissionFallback", () => {
  it("only uses DEFAULT_MATRIX when the org has zero role_permissions rows", () => {
    assert.equal(allowUnseededPermissionFallback(true, 0, "admin", "view_clients"), true);
    assert.equal(allowUnseededPermissionFallback(false, 0, "admin", "invite_staff"), true);
    assert.equal(allowUnseededPermissionFallback(false, 0, "employee", "view_clients"), false);
    assert.equal(allowUnseededPermissionFallback(false, 40, "admin", "view_clients"), false);
  });
});

describe("wiring", () => {
  it("usePermissions and requirePermission use the unseeded fallback", () => {
    const hook = readFileSync(new URL("../hooks/use-permissions.tsx", import.meta.url), "utf8");
    assert.match(hook, /resolveCan/);
    assert.doesNotMatch(
      hook,
      /No runtime fallback to DEFAULT_MATRIX/,
    );

    const server = readFileSync(new URL("./require-permission.ts", import.meta.url), "utf8");
    assert.match(server, /allowUnseededPermissionFallback|allowIfUnseededOrg/);
  });
});
