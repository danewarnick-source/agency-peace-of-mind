import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_HOME_STAFF_STATUS_KEY,
  adminHomeQueriesStarted,
  adminHomeStaffStatusQueryKey,
  isAdminHomePath,
  layoutQueriesMayRun,
} from "./yield-to-admin-home.ts";

describe("isAdminHomePath", () => {
  it("matches the dashboard index only", () => {
    assert.equal(isAdminHomePath("/dashboard"), true);
    assert.equal(isAdminHomePath("/dashboard/"), true);
    assert.equal(isAdminHomePath("/dashboard/company-obligations"), false);
    assert.equal(isAdminHomePath("/dashboard/hub/clients"), false);
  });
});

describe("layoutQueriesMayRun", () => {
  it("runs immediately off Admin Home", () => {
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: false,
        instancesStatus: undefined,
        clientsStatus: undefined,
        gaveUp: false,
      }),
      true,
    );
  });

  it("waits on Admin Home until both home queries settle", () => {
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        instancesStatus: undefined,
        clientsStatus: undefined,
        gaveUp: false,
      }),
      false,
    );
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        instancesStatus: "success",
        clientsStatus: undefined,
        gaveUp: false,
      }),
      false,
    );
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        instancesStatus: "success",
        clientsStatus: "success",
        gaveUp: false,
      }),
      true,
    );
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        instancesStatus: "error",
        clientsStatus: "success",
        gaveUp: false,
      }),
      true,
    );
  });

  it("gives up if Admin Home never starts its queries", () => {
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        instancesStatus: undefined,
        clientsStatus: undefined,
        gaveUp: true,
      }),
      true,
    );
  });
});

describe("adminHomeQueriesStarted", () => {
  it("is true once either query exists in cache", () => {
    assert.equal(adminHomeQueriesStarted(undefined, undefined), false);
    assert.equal(adminHomeQueriesStarted("pending", undefined), true);
    assert.equal(adminHomeQueriesStarted(undefined, "pending"), true);
  });
});

describe("admin-home-staff-status selector key", () => {
  it("is a dedicated query key for per-staff overdue counts", () => {
    assert.equal(ADMIN_HOME_STAFF_STATUS_KEY, "admin-home-staff-status");
    assert.deepEqual(adminHomeStaffStatusQueryKey("org-1"), [
      "admin-home-staff-status",
      "org-1",
    ]);
  });
});
