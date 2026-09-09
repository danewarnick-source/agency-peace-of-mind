import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowUnseededPermissionFallback,
  permissionsAreLoading,
  queryAwaitingFirstResult,
  resolveCan,
  roleMatrixHasAnyGrant,
  roleMatrixHasPermissionRow,
} from "./permissions-can.ts";

/** Unseeded org — no role_permissions rows for these keys. */
const emptyAdmin = {
  admin: {},
  employee: {},
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

describe("resolveCan when a live org is missing a newer permission key", () => {
  it("lets an owner open employee detail when edit_staff_records was never seeded", () => {
    const seededWithoutEdit = {
      admin: { view_clients: true, view_staff_records: true, view_own_timesheets: true },
    };
    assert.equal(roleMatrixHasPermissionRow(seededWithoutEdit, "admin", "edit_staff_records"), false);
    assert.equal(
      resolveCan({ role: "admin", perm: "view_staff_records", matrix: seededWithoutEdit }),
      true,
    );
    assert.equal(
      resolveCan({ role: "admin", perm: "edit_staff_records", matrix: seededWithoutEdit }),
      true,
    );
  });

  it("still honors an explicit edit_staff_records deny", () => {
    const seededDeniedEdit = {
      admin: { view_staff_records: true, edit_staff_records: false },
    };
    assert.equal(
      resolveCan({ role: "admin", perm: "view_staff_records", matrix: seededDeniedEdit }),
      true,
    );
    assert.equal(
      resolveCan({ role: "admin", perm: "edit_staff_records", matrix: seededDeniedEdit }),
      false,
    );
  });
});

describe("permissionsAreLoading", () => {
  it("waits for auth and the first org result before denying", () => {
    assert.equal(
      permissionsAreLoading({
        authLoading: true,
        hasUser: false,
        org: undefined,
        orgPending: false,
        matrixPending: false,
        overridesPending: false,
      }),
      true,
    );
    assert.equal(
      permissionsAreLoading({
        authLoading: false,
        hasUser: true,
        org: undefined,
        orgPending: true,
        matrixPending: false,
        overridesPending: false,
      }),
      true,
    );
    assert.equal(
      permissionsAreLoading({
        authLoading: false,
        hasUser: true,
        org: { organization_id: "org" },
        orgPending: false,
        matrixPending: false,
        overridesPending: false,
      }),
      false,
    );
  });

  it("does not treat a signed-out user as still loading", () => {
    assert.equal(
      permissionsAreLoading({
        authLoading: false,
        hasUser: false,
        org: undefined,
        orgPending: false,
        matrixPending: false,
        overridesPending: false,
      }),
      false,
    );
  });
});

describe("queryAwaitingFirstResult", () => {
  it("is false for a disabled query (TanStack Query v5 isLoading pitfall)", () => {
    assert.equal(
      queryAwaitingFirstResult({
        enabled: false,
        data: undefined,
        isError: false,
        isPending: true,
        isFetching: false,
      }),
      false,
    );
  });

  it("is true while an enabled query has no data yet", () => {
    assert.equal(
      queryAwaitingFirstResult({
        enabled: true,
        data: undefined,
        isError: false,
        isPending: true,
        isFetching: true,
      }),
      true,
    );
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
    assert.match(hook, /permissionsAreLoading/);
    assert.doesNotMatch(
      hook,
      /No runtime fallback to DEFAULT_MATRIX/,
    );

    const server = readFileSync(new URL("./require-permission.ts", import.meta.url), "utf8");
    assert.match(server, /allowUnseededPermissionFallback|allowIfUnseededOrg/);

    const detail = readFileSync(
      new URL("../routes/dashboard.employees.$staffId.tsx", import.meta.url),
      "utf8",
    );
    assert.match(detail, /RequirePermission perm="view_staff_records"/);
    assert.doesNotMatch(
      detail,
      /component: \(\) => \(\s*<RequirePermission perm="edit_staff_records">/,
    );
  });
});
