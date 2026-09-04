import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminHomeQueriesStarted,
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
  it("runs immediately, including on Admin Home", () => {
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: false,
        instancesStatus: undefined,
        clientsStatus: undefined,
        gaveUp: false,
      }),
      true,
    );
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        instancesStatus: undefined,
        clientsStatus: undefined,
        gaveUp: false,
      }),
      true,
    );
    assert.equal(
      layoutQueriesMayRun({
        onAdminHome: true,
        instancesStatus: "pending",
        clientsStatus: "pending",
        gaveUp: false,
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
